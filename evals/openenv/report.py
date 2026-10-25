"""Build a shareable, allowlisted report from the six reviewed pilot episodes.

Copies screenshots and aggregate metrics only; never settings, raw sessions,
engine configuration, credentials or project source into the gallery.
"""
import argparse
import csv
import html
import json
from pathlib import Path
import shutil

NOTES = {
    "mistral-meetings-1": "Enkel blå kortoversigt. Tilmelding virker, men første udkast mangler markering af eksempler og feedback ved tom søgning. Mindre visuelt særpræg end den ønskede reference.",
    "mistral-time-1": "Overskuelig arbejdsflade med timer, formular og tabel. Den smalle udgave har vandret afskæring. Tilføjelse af opgave nulstiller projektvalget, så det skal vælges igen.",
    "mistral-rooms-1": "Tydelige lokalevalg, men store flader med gentaget lokalenavn fungerer som pladsholdere. Eksempelmærkning mangler. Reservation og skærmfilter virker.",
    "corti-meetings-1": "Mere sammenhængende farver, introduktion og tydelige demomærker. Fungerende formularer og tomme tilstande. Stadig enklere og mere teksttungt end den ønskede reference.",
    "corti-time-1": "Rolig typografi med en tydelig timer som hovedhandling. Start, stop, gemning og sletning virker. CSV-eksport blokeres i Aura-previewet.",
    "corti-rooms-1": "Ensartede kort, forståelige kapacitetsmærker og tydelig demotekst. Reservation, genindlæsning, annullering og filtrering virker i prøven.",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    output = root / "gallery"
    output.mkdir(exist_ok=True)
    rows, cards = [], []
    escape = html.escape
    for group, provider in [("qualified", "Mistral · standard"), ("corti-low", "Corti · lav tænkeindsats")]:
        for case in ["meetings", "time", "rooms"]:
            episode = f"{'mistral' if group == 'qualified' else 'corti'}-{case}-1"
            trial = root / group / episode
            result = json.loads((trial / "result.json").read_text())
            scenario = json.loads((trial / "case.json").read_text())
            stages = result["stages"]
            build = next(stage for stage in stages if stage["stage"] == "build")
            latest = stages[-1]
            checks, views, pictures = [], [], []
            for stage in ["build", "revision-build"]:
                checks += json.loads((trial / stage / "functional.json").read_text())["checks"]
                views += json.loads((trial / stage / "browser.json").read_text())["views"]
                for view in ["desktop", "mobile"]:
                    source = trial / stage / "evidence" / f"{view}.png"
                    filename = f"{episode}-{stage}-{view}.png"
                    shutil.copyfile(source, output / filename)
                    pictures.append((stage, view, filename))
            row = {
                "episode": episode, "provider": provider, "model": result["identity"]["model"],
                "status": result["status"], "first_build_seconds": round(build["seconds"], 1),
                "episode_seconds": round(result["seconds"], 1),
                "plan_clarifications": sum(s["stage"].endswith("repair") for s in stages),
                "same_conversation": result["conversationPreserved"],
                "browser_checks_passed": sum(c["passed"] for c in checks), "browser_checks_total": len(checks),
                "horizontal_overflow_views": sum(v["horizontalOverflow"] for v in views),
                "estimated_usd": round(latest["usage"]["cost"], 4), "model_calls": latest["usage"]["calls"],
                "active_skills": len(result["identity"]["skills"]),
                "approved_writes": sum(a["kind"] == "tool" and a["allow"] for a in latest["audit"]),
                "denied_tools": sum(a["kind"] == "tool" and not a["allow"] for a in latest["audit"]),
                "visual_assessment": NOTES[episode],
            }
            rows.append(row)
            images = "".join(f'<a class="shot" data-stage="{stage}" data-view="{view}" href="{filename}" target="_blank" {"hidden" if stage != "build" or view != "desktop" else ""}><img loading="lazy" src="{filename}" alt="{escape(scenario["name"])} · {stage} · {view}"></a>' for stage, view, filename in pictures)
            cards.append(f'''<article><div class="cardhead"><span>{escape(provider)}</span><h2>{escape(scenario["name"])}</h2><p>{row["first_build_seconds"]} sek. første bygning · {row["browser_checks_passed"]}/{row["browser_checks_total"]} browserkontroller består</p></div>
<div class="switches"><label>Version <select data-control="stage"><option value="build">Første udkast</option><option value="revision-build">Efter ændringsønske</option></select></label><label>Visning <select data-control="view"><option value="desktop">Desktop</option><option value="mobile">Mobil</option></select></label></div>
{images}<div class="note"><p>{escape(NOTES[episode])}</p><details><summary>Opgave og prøve</summary><p>{escape(scenario['brief'])}</p><p><strong>Ændring:</strong> {escape(scenario['revision'])}</p><p>{row['plan_clarifications']} ekstra planpræciseringer · {row['approved_writes']} engangsgodkendelser · {row['denied_tools']} afviste værktøjskald · {row['model_calls']} modelkald · anslået ${row['estimated_usd']:.2f} for hele forløbet.</p></details></div></article>''')
    (output / "resultater.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    with (output / "resultater.csv").open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    template = '''<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aura 1 · OpenEnv-pilot</title>
<style>*{box-sizing:border-box}body{margin:0;background:#10151c;color:#e9eef5;font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1500px;margin:auto;padding:48px 32px}h1{font-size:clamp(32px,4vw,54px);line-height:1.1;letter-spacing:-.04em;margin:12px 0 24px}h2{font-size:28px;letter-spacing:-.02em;margin:4px 0}p{margin:0 0 16px}header{max-width:1000px}header>p{color:#b4c1d1;font-size:18px}.tag{color:#94bfff;letter-spacing:.12em;font-size:12px;font-weight:700}.findings{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:32px 0}.finding{padding:24px;background:#1a2330;border:1px solid #334155;border-radius:16px}.finding strong{display:block;font-size:20px;margin-bottom:8px}.finding p{color:#bcc9da;margin:0}a{color:#a8cdff}nav{display:flex;gap:24px;margin:32px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#19212c;border:1px solid #344052;border-radius:18px;overflow:hidden}.cardhead{padding:24px 24px 12px}.cardhead>span{color:#a8cdff;font-size:13px}.cardhead>p{color:#bcc9da;font-size:14px}.switches{display:flex;gap:16px;padding:0 24px 20px;flex-wrap:wrap}label{font-size:13px;color:#b8c6d8;display:flex;gap:8px;align-items:center}select{font:inherit;background:#0e1622;color:white;border:1px solid #57667b;padding:8px;border-radius:7px}.shot{display:block;height:390px;background:#e8e9ea;overflow:auto}.shot[hidden]{display:none}.shot img{display:block;width:100%;height:auto}.shot[data-view="mobile"] img{width:min(100%,390px);margin:auto}.note{padding:24px}.note p{color:#ced8e5}details{font-size:14px}summary{cursor:pointer;color:#a8cdff;padding:8px 0}footer{color:#b0bfd1;padding-top:32px;border-top:1px solid #344052;margin-top:32px;font-size:14px}.method{max-width:1000px;margin:40px 0;color:#c1cddd}.method h2{color:white;font-size:24px}@media(max-width:850px){main{padding:28px 16px}.grid,.findings{grid-template-columns:1fr}.shot{height:320px}nav{flex-wrap:wrap}}
</style><main><header><span class="tag">AURA 1 / OPENENV 0.10.0 / 25. OKTOBER 2026</span><h1>Det her byggede modellerne.</h1><p>Seks rigtige forløb med Auras eksisterende skills: borgermøder, tidsregistrering og lokalebooking. Her er de urørte første udkast og de efterfølgende ændringer.</p></header>
<div class="findings"><section class="finding"><strong>6/6 gennemførte forløb</strong><p>Alle seks fik en plan, byggede og gennemførte en ændring. Mistral krævede to ekstra planpræciseringer. Gennemført er ikke det samme som fejlfrit.</p></section><section class="finding"><strong>Kvaliteten er ujævn</strong><p>Corti leverede mere sammenhængende udkast i denne prøve. Mistral havde mangler i tomme tilstande, eksempelmærkning og mobilvisning.</p></section><section class="finding"><strong>En konkret fælles fejl</strong><p>Begge CSV-eksporter bruger download, som Auras preview blokerer. De øvrige centrale gemme- og sletteforløb blev gennemført.</p></section></div>
<nav><a href="resultater.csv">Hent resultater som CSV</a><a href="resultater.json">Se strukturerede resultater</a><a href="rapport.md">Læs den fulde rapport</a></nav>
<div class="grid">__CARDS__</div>
<section class="method"><h2>Hvad prøven faktisk viser</h2><p>Realistiske opgaver med fiktive eksempeldata, men rigtige modelkald, filændringer og browserhandlinger. OpenEnv styrer episoderne gennem den uændrede Aura-motor. Planer og filændringer bliver godkendt gennem Auras eksisterende mekanismer. Nøgler bliver i den native proces.</p><p>Konfiguration: Mistral Medium 3.5 med standardindsats og Corti S1 med lav tænkeindsats. Højst 64 færdigrapporterede modelkald pr. episode og otte minutter pr. trin. Cortis standardindstilling gav to tidsoverskridelser i en separat indledende prøve; den tredje blev stoppet og indgår ikke i de seks.</p><p>Én gentagelse pr. opgave. Ingen statistisk modelrangliste og ingen dokumenteret forbedring i forhold til en version uden skills. Screenshots er vurderet visuelt; browserkontroller er konkrete stikprøver, ikke en fuld sikkerheds- eller tilgængelighedscertificering.</p></section>
<footer>Appens UI, onboarding, skills, planer og godkendelsesregler er uændrede. Ingen DMG, commit, push eller udgivelse indgår i piloten. Klik på et screenshot for at se det i fuld størrelse.</footer></main>
<script>for(const card of document.querySelectorAll('article')){card.addEventListener('change',()=>{const stage=card.querySelector('[data-control=stage]').value,view=card.querySelector('[data-control=view]').value;for(const shot of card.querySelectorAll('.shot'))shot.hidden=shot.dataset.stage!==stage||shot.dataset.view!==view})}</script></html>'''
    (output / "index.html").write_text(template.replace("__CARDS__", "".join(cards)))
    print(output)


if __name__ == "__main__":
    main()
