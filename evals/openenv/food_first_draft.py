"""Real food-app build after Aura's idea refinement; no handwritten source repairs.

With --quality-loop, the product's automatic inspector/repair path is enabled.
The harness still sends only the reviewed plan and one user build request.
"""
import argparse
import asyncio
import hashlib
import json
import subprocess
import time
from pathlib import Path

from run import HERE, REPO, AuraAdapter, HarnessAction, HarnessConfig, HarnessEnvironment, save, tree_hash


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--connections", required=True, type=Path)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--refined-answer", type=Path, help="Exact output from real Aura idea refinement")
    source.add_argument("--raw-brief", type=Path, help="Exact original user request; no inherited design suggestions")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--provider", required=True, choices=["mistral", "corti", "openrouter", "codex"])
    parser.add_argument("--worker", type=Path, default=HERE / "worker.cjs", help="Explicit alternate transport worker; never silently substituted")
    parser.add_argument("--project-name", default="Madklar", help="Identical neutral project name across comparison arms")
    parser.add_argument("--quality-loop", action="store_true",
                        help="Enable Aura's product quality inspector; no eval-only model repair loop")
    args = parser.parse_args()
    args.output = args.output.resolve()
    args.connections = args.connections.resolve()
    input_file = (args.refined_answer or args.raw_brief).resolve()
    args.output.mkdir(parents=True, exist_ok=False)
    input_hash = hashlib.sha256(input_file.read_bytes()).hexdigest()
    refined = json.loads(input_file.read_text()) if args.refined_answer else {"description": input_file.read_text().strip(), "plan": ""}
    assert isinstance(refined["description"], str) and refined["description"].strip()
    assert isinstance(refined["plan"], str)
    if args.refined_answer:
        assert refined["plan"].strip()
    # Exact onboarding handoff, plus test constraints. Visual decisions remain the model's.
    constraints = (
        "Ramme for denne lokale prøve: Det er en demo med fiktive restauranter og retter. "
        "Ingen rigtig bestilling, betaling eller kontakt til spisesteder. Ingen login. "
        "Ordrer gemmes kun lokalt. Vis tydeligt demo i brugerfladen. "
        "Lav en selvstændig lokal HTML/CSS/JavaScript-app i public/. "
        "Ingen backend, CDN, netværk, pakkeinstallationer, Git eller shellkommandoer. "
        "Brug kun lokale eller selvskabte illustrationer/SVG; der er ingen billedgenerator "
        "eller leverede fotos tilgængelige i denne prøve. "
        "Disse begrænsninger er testens ramme, ikke en påstand om Auras generelle muligheder. "
        "Lav en konkret plan først; byg kun efter godkendelsen."
    )
    case = {"id": "food", "name": args.project_name, "brief": refined["description"],
            "answers": constraints, "revision": "Ingen revision i denne førsteudkastprøve.",
            "refinedPlan": refined["plan"], "refinementSHA256": input_hash if args.refined_answer else None,
            "inputKind": "aura-refined-answer" if args.refined_answer else "original-user-brief", "inputSHA256": input_hash,
            "productQualityControl": args.quality_loop}
    save(args.output / "case.json", case)
    config = json.loads(args.connections.read_text())
    electron = REPO / "desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    adapter = AuraAdapter(HarnessConfig(name="aura", command=[str(electron), str(args.worker.resolve()),
        str(args.connections), args.provider, str(args.output), str(args.output / "case.json")],
        working_directory=str(REPO), startup_timeout_s=180, session_timeout_s=config["turnTimeoutSeconds"] + 40))
    env = HarnessEnvironment(adapter)
    result = {"episode": args.output.name, "provider": args.provider, "case": "food", "openenv": "0.10.0",
              "sourceCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
              "workingDiffSHA256": hashlib.sha256(subprocess.check_output(["git", "diff"], cwd=REPO)).hexdigest(),
              "runnerSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "worker": str(args.worker.resolve()), "workerSHA256": hashlib.sha256(args.worker.read_bytes()).hexdigest(),
              "refinementSHA256": case["refinementSHA256"], "status": "running", "stages": [], "startedAt": time.time(),
              "inputKind": case["inputKind"], "inputSHA256": input_hash,
              "productQualityControl": args.quality_loop,
              "limits": ["One user build request; product-owned automatic quality checks/repairs only" if args.quality_loop else "Single first build; no design repair or follow-up iteration", "Real models; fictional food and local orders only",
                         "No image-generation tool or supplied photography; model may create local SVG", "Not an installed-DMG end-to-end test"]}
    save(args.output / "result.json", result)
    print(f"START {args.provider} food {'product quality loop' if args.quality_loop else 'first draft'}", flush=True)
    try:
        await env.reset_async(episode_id=args.output.name)
        result["identity"] = adapter.identity
        print(f"CONNECTED {args.provider}: {adapter.identity['model']}", flush=True)
        project = Path(adapter.identity["project"])

        async def turn(stage, text, approved=None):
            action = {"stage": stage, "text": text}
            if approved:
                action["approvedPlanHash"] = approved
            adapter.last_result = None
            observation = await env.step_async(HarnessAction(message=json.dumps(action, ensure_ascii=False)))
            save(args.output / f"{stage}-observation.json", observation.model_dump(mode="json"))
            outcome = adapter.last_result
            if outcome is None:
                raise RuntimeError(f"OpenEnv did not complete {stage}")
            result["stages"].append(outcome)
            save(args.output / "result.json", result)
            print(f"TURN {args.provider} {stage}: {outcome['seconds']:.1f}s", flush=True)
            if outcome["faults"] or not outcome["reviews"] or outcome["reviews"][-1]["status"] != "idle":
                raise RuntimeError(f"Aura reported an unsuccessful {stage}")
            return outcome

        before = tree_hash(project / "public")
        idea_suggestion = "\n\nForslag fra idéhjælpen (ikke en godkendt byggeplan):\n" + refined["plan"] if refined["plan"] else ""
        plan = await turn("plan", refined["description"] + idea_suggestion +
                          "\n\nAfklar eventuelle mangler, og lav en plan til min gennemgang, før der bygges.\n\n" + constraints)
        if before != tree_hash(project / "public"):
            raise RuntimeError("Planning changed project files")
        if not plan.get("plan"):
            plan = await turn("plan-repair", "Bevar indholdet i dit forslag. Giv mig en konkret plan under præcis de fire overskrifter: Det bygger vi; Sådan skal det se ud; Teknik og data; Det skal du prøve. Ingen filændringer endnu.")
            if before != tree_hash(project / "public"):
                raise RuntimeError("Plan clarification changed project files")
        if not plan.get("plan"):
            raise RuntimeError("No concrete plan to approve; no build authorized")
        await turn("build", "Planen er gennemgået og godkendt til denne lokale prøve. Byg den nu. Brug dine aktive skills; bevar projektets afgrænsning.", plan["plan"]["sha256"])
        if before == tree_hash(project / "public"):
            raise RuntimeError("Build completed without requested file changes")
        result["status"] = "completed"
        result["conversationPreserved"] = len({item["conversationID"] for item in result["stages"]}) == 1
    except Exception as error:
        result["status"] = "failed"
        result["error"] = str(error)
        print(f"FAIL {args.provider}: {error}", flush=True)
    finally:
        await adapter.stop()
        if result["status"] == "running":
            result["status"] = "interrupted"
        result["endedAt"] = time.time()
        save(args.output / "result.json", result)
    if result["status"] != "completed":
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
