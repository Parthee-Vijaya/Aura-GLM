"""OpenEnv adapter for the unchanged native Aura Workbench, not a direct model client."""
import asyncio
import json
import os
from openenv.core.harness.adapter import AgenticHarnessAdapter, HarnessError
from openenv.core.harness.events import HarnessEvent, HarnessEventType


class AuraAdapter(AgenticHarnessAdapter):
    def __init__(self, config):
        super().__init__(config)
        self.process = None
        self.identity = None
        self.last_result = None

    async def start(self, working_directory):
        env = {key: os.environ[key] for key in ["PATH", "HOME", "TMPDIR", "LANG", "USER"] if key in os.environ}
        # Disable optional library telemetry; no raw credentials in env/arguments.
        env.update(HF_HUB_DISABLE_TELEMETRY="1", GRADIO_ANALYTICS_ENABLED="False")
        self.process = await asyncio.create_subprocess_exec(*self.config.command, cwd=working_directory, env=env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            limit=8 * 1024 * 1024)
        async with asyncio.timeout(self.config.startup_timeout_s):
            while True:
                item = await self._read()
                if "startupError" in item:
                    raise HarnessError(item["startupError"])
                if "ready" in item:
                    self.identity = item["ready"]
                    return

    async def _read(self):
        while True:
            line = await self.process.stdout.readline()
            if not line:
                raise HarnessError("Aura pilot worker exited before a terminal result")
            if line.startswith(b"AURA_OPENENV "):
                return json.loads(line[len(b"AURA_OPENENV "):])

    async def stop(self):
        if self.process is None:
            return
        process, self.process = self.process, None
        if process.returncode is None:
            try:
                process.stdin.write(b'{"stop":true}\n')
                await process.stdin.drain()
                await asyncio.wait_for(process.wait(), 8)
            except (TimeoutError, BrokenPipeError, ConnectionResetError):
                if process.returncode is None:
                    process.terminate()
                try:
                    await asyncio.wait_for(process.wait(), 5)
                except TimeoutError:
                    process.kill()
                    await process.wait()

    async def inject_tools(self, tools, bridge_url=None):
        if tools or bridge_url:
            raise HarnessError("Pilot must use Aura's existing tools and approval policy")

    async def is_alive(self):
        return self.process is not None and self.process.returncode is None

    async def send_message_streaming(self, message):
        action = json.loads(message)
        if not await self.is_alive():
            raise HarnessError("Aura is not running")
        self.process.stdin.write((json.dumps(action) + "\n").encode())
        await self.process.stdin.drain()
        async with asyncio.timeout(self.config.session_timeout_s):
            while True:
                item = await self._read()
                if "error" in item:
                    raise HarnessError(item["error"])
                if "result" in item:
                    self.last_result = item["result"]
                    yield HarnessEvent(type=HarnessEventType.TURN_COMPLETE,
                        data={"response": json.dumps(self.last_result, ensure_ascii=False), "done": action["stage"] == "revision-build"})
                    return
                if item.get("event") == "approval":
                    yield HarnessEvent(type=HarnessEventType.TOOL_RESULT, data=item)
