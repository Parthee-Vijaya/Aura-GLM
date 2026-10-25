"""Run real model episodes; never turn a failed run into a successful retry."""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")
from openenv.core.harness.config import HarnessConfig
from openenv.core.harness.environment import HarnessAction, HarnessEnvironment
from adapter import AuraAdapter

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def tree_hash(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file()}


async def episode(args, case, provider, repetition):
    name = f"{provider}-{case['id']}-{repetition}"
    trial = args.output / name
    trial.mkdir(parents=True, exist_ok=False)
    save(trial / "case.json", case)
    config = json.loads(args.connections.read_text())
    electron = REPO / "desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    adapter = AuraAdapter(HarnessConfig(name="aura", command=[str(electron), str(HERE / "worker.cjs"),
        str(args.connections), provider, str(trial), str(trial / "case.json")], working_directory=str(REPO),
        startup_timeout_s=180, session_timeout_s=config["turnTimeoutSeconds"] + 40))
    env = HarnessEnvironment(adapter)
    result = {"episode": name, "provider": provider, "case": case["id"], "repetition": repetition,
              "openenv": "0.10.0", "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
              "status": "running", "stages": [], "startedAt": time.time()}
    save(trial / "result.json", result)
    print(f"START {name}", flush=True)
    try:
        await env.reset_async(episode_id=name)
        result["identity"] = adapter.identity
        print(f"CONNECTED {name}: {adapter.identity['model']}", flush=True)
        project = Path(adapter.identity["project"])
        previous = None
        for stage in ["plan", "build", "revision-plan", "revision-build"]:
            if stage.endswith("build") and previous and not previous.get("plan"):
                # One explicit clarification in the same conversation; never fabricate
                # a plan or bypass Aura's requirement using free/YOLO mode.
                repair_stage = "plan-repair" if stage == "build" else "revision-plan-repair"
                before_repair = tree_hash(project / "public")
                repair = {"stage": repair_stage, "text": "Bevar indholdet i dit forslag. Giv mig en konkret plan under præcis de fire overskrifter: Det bygger vi; Sådan skal det se ud; Teknik og data; Det skal du prøve. Ingen filændringer endnu."}
                adapter.last_result = None
                observation = await env.step_async(HarnessAction(message=json.dumps(repair, ensure_ascii=False)))
                save(trial / f"{repair_stage}-observation.json", observation.model_dump(mode="json"))
                previous = adapter.last_result
                if previous:
                    result["stages"].append(previous)
                if (not previous or previous["faults"] or not previous["reviews"] or previous["reviews"][-1]["status"] != "idle"
                    or before_repair != tree_hash(project / "public")):
                    raise RuntimeError("Plan clarification failed; no build authorized")
                print(f"CLARIFICATION {name}: {repair_stage}", flush=True)
            before = tree_hash(project / "public")
            text = case["brief"] + "\n\n" + case["answers"] if stage == "plan" else case["revision"] if stage == "revision-plan" else "Planen er gennemgået og godkendt til denne lokale prøve. Byg den nu. Brug dine aktive skills; bevar projektets afgrænsning."
            action = {"stage": stage, "text": text}
            if stage.endswith("build"):
                if not previous or not previous.get("plan"):
                    raise RuntimeError("No concrete plan to approve; build not started")
                action["approvedPlanHash"] = previous["plan"]["sha256"]
            adapter.last_result = None
            observation = await env.step_async(HarnessAction(message=json.dumps(action, ensure_ascii=False)))
            previous = adapter.last_result
            save(trial / f"{stage}-observation.json", observation.model_dump(mode="json"))
            if previous is None:
                raise RuntimeError(f"OpenEnv terminal error: {observation.metadata.get('error_type', 'no completed turn')}")
            result["stages"].append(previous)
            save(trial / "result.json", result)
            print(f"TURN {name} {stage}: {previous['seconds']:.1f}s", flush=True)
            if previous["faults"] or not previous["reviews"] or previous["reviews"][-1]["status"] != "idle":
                raise RuntimeError(f"Aura reported an unsuccessful {stage}")
            if stage.endswith("plan") and before != tree_hash(project / "public"):
                raise RuntimeError("Planning changed project files")
            if stage.endswith("build") and before == tree_hash(project / "public"):
                raise RuntimeError("Build completed without the requested file changes")
        result["status"] = "completed"
        result["conversationPreserved"] = len({s["conversationID"] for s in result["stages"]}) == 1
        result["engineSessionIDs"] = list(dict.fromkeys(s["sessionID"] for s in result["stages"]))
    except Exception as error:
        result["status"] = "failed"
        result["error"] = str(error)
        print(f"FAIL {name}: {error}", flush=True)
    finally:
        await adapter.stop()
        if result["status"] == "running":
            result["status"] = "interrupted"
            result["error"] = "Pilot runner interrupted; not a completed model evaluation"
        result["endedAt"] = time.time()
        result["seconds"] = result["endedAt"] - result["startedAt"]
        save(trial / "result.json", result)
    return result


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--connections", required=True, type=Path, help="Local metadata-only credential references; never keys")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--provider", choices=["mistral", "corti"], required=True)
    parser.add_argument("--cases", nargs="*")
    parser.add_argument("--repetitions", type=int, default=1, choices=range(1, 4))
    args = parser.parse_args()
    args.connections = args.connections.resolve()
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    cases = json.loads((HERE / "cases.json").read_text())
    selected = [case for case in cases if not args.cases or case["id"] in args.cases]
    if not selected:
        parser.error("No matching cases")
    outcomes = []
    for repetition in range(1, args.repetitions + 1):
        for case in selected:
            outcomes.append(await episode(args, case, args.provider, repetition))
            # Missing credentials are a blocker, not an excuse for repeated prompts.
            if "identity" not in outcomes[-1]:
                break
        if outcomes and "identity" not in outcomes[-1]:
            break
    save(args.output / f"{args.provider}-summary.json", outcomes)
    if any(result["status"] != "completed" for result in outcomes):
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
