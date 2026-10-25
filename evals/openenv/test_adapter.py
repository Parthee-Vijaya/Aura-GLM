"""Protocol tests use a small fixture; live benchmark outcomes are recorded separately."""
import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from adapter import AuraAdapter
from openenv.core.harness.config import HarnessConfig
from openenv.core.harness.environment import HarnessAction, HarnessEnvironment


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_openenv_reset_step_and_explicit_episode_boundary(self):
        script = '''import json,sys
print('AURA_OPENENV '+json.dumps({'ready': {'model':'protocol-fixture'}}),flush=True)
for line in sys.stdin:
 r=json.loads(line)
 if r.get('stop'): break
 print('AURA_OPENENV '+json.dumps({'result':{'stage':r['stage'],'response':'fixture'}}),flush=True)
'''
        adapter = AuraAdapter(HarnessConfig(name="fixture", command=[sys.executable, "-u", "-c", script], working_directory="/tmp", session_timeout_s=2))
        env = HarnessEnvironment(adapter)
        try:
            observation = await env.reset_async(episode_id="first")
            self.assertFalse(observation.done)
            observation = await env.step_async(HarnessAction(message=json.dumps({"stage":"plan"})))
            self.assertFalse(observation.done)
            self.assertEqual(adapter.last_result["stage"], "plan")
            observation = await env.step_async(HarnessAction(message=json.dumps({"stage":"revision-build"})))
            self.assertTrue(observation.done)
            self.assertEqual(env.state.step_count, 2)
            await env.reset_async(episode_id="second")
            self.assertEqual(env.state.step_count, 0)
        finally:
            await adapter.stop()
            await adapter.stop()
        self.assertFalse(await adapter.is_alive())

    async def test_injected_tools_cannot_bypass_aura(self):
        adapter = AuraAdapter(HarnessConfig(name="fixture", command=[sys.executable]))
        with self.assertRaisesRegex(Exception, "existing tools"):
            await adapter.inject_tools([object()])

    async def test_timeout_is_a_failed_episode_not_an_automatic_replay(self):
        script = "import time; print('AURA_OPENENV {\"ready\": {}}',flush=True); time.sleep(60)"
        adapter = AuraAdapter(HarnessConfig(name="fixture", command=[sys.executable, "-u", "-c", script], working_directory="/tmp", session_timeout_s=0.1))
        env = HarnessEnvironment(adapter)
        try:
            await env.reset_async()
            observation = await env.step_async(HarnessAction(message='{"stage":"plan"}'))
            self.assertTrue(observation.done)
            self.assertIsNone(adapter.last_result)
            self.assertEqual(observation.metadata["error_type"], "turn_timeout")
        finally:
            await adapter.stop()


if __name__ == "__main__":
    unittest.main()
