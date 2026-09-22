"""Byg danske downloadpakker fra ét fælles profilgrundlag. Kun standardbiblioteket."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "dist"


def guide(tool, version):
    return f"""# AI Harness til {tool['name']}

Version {version}. Til et kodeprojekt på Windows eller Mac.

## Før du begynder

Du skal selv have {tool['name']} installeret og adgang til en model gennem værktøjet.
Pakken indeholder ikke en model, API-nøgle eller et abonnement. Følg din organisations regler for værktøjer og data.

## 1. Pak ud et separat sted

Pak ZIP-filen ud i en midlertidig mappe. Pak den ikke direkte ud oven i dit projekt.
Windows: højreklik på ZIP-filen og vælg at udpakke alle filer. Mac: dobbeltklik på ZIP-filen.

## 2. Placér reglerne i projektet

Projektets rodmappe er den øverste mappe, du åbner i dit kodeværktøj; ofte ligger README.md og .git her.
Kopiér {tool['file']} til denne mappe. Hvis filen allerede findes, skal du tage en kopi og sammenflette reglerne manuelt. Overskriv ikke eksisterende instruktioner.
Åbn .gitignore fra pakken i en teksteditor og tilføj relevante regler til projektets eksisterende .gitignore. På Mac kan skjulte filer vises med Cmd+Shift+punktum; på Windows kan skjulte elementer slås til i Stifinder.
manifest.json er pakkens versions- og indholdsoversigt og skal ikke indlæses som instruktion.

## 3. Genstart og undersøg indlæsningen

{tool['verification']}
{tool['caveat']}

Du kan skrive:

> Hvilke projektinstruktioner har du indlæst? Hvad er kontrolordet i AI Harness-profilen? Opsummér reglerne for hemmeligheder, Git og afprøvning. Ændr ingen filer.

Forvent kontrolordet FÆLLES-GRUNDLAG-01 og en relevant opsummering. Svaret er en indikation, ikke bevis for teknisk håndhævelse. Hvis profilen ikke genkendes, kontrollér filnavn, placering, modstridende instruktioner og en ny session.

## 4. Afprøv med ufarligt materiale

Brug et tomt prøveprojekt og en opdigtet nøgle som IKKE_EN_RIGTIG_NOEGLE. Bed agenten forklare, hvor den bør opbevares, uden at skrive filer. Den bør foreslå beskyttet konfiguration og fraråde at lægge nøglen i kode eller commits.
Bed også agenten foreslå en lille ændring og forklare, hvordan den vil teste den og lade dig gennemgå et commit. Notér værktøjsversion, model, dato og afvigelser. Brug aldrig en rigtig hemmelighed til testen.

## 5. Bevar og opdatér

Gennemgå ændringerne i Git. Brug versionsstyring til at dele og gendanne projektets instruktioner. Hvis Git ikke er sat op, få hjælp til at oprette et repository før større ændringer.
Ved en ny profilversion: sammenlign med din nuværende fil, bevar lokale tilpasninger og afprøv igen. Pakken installerer eller overskriver ikke noget automatisk.

## Begrænsninger og kilder

Dette er vejledende instruktioner, ikke en sandbox eller en garanti mod datalæk. .gitignore påvirker ikke filer, som allerede er sporet, og hindrer ikke en agent i at læse dem.
Filformatet er sammenholdt med officiel dokumentation den 22. september 2026. Agenternes adfærd er ikke certificeret eller afprøvet på tværs af modeller og versioner.
Dokumentation: {tool['source']}
"""


def build():
    catalog = json.loads((ROOT / "profiles/catalog.json").read_text())
    rules = (ROOT / "profiles/grundregler.md").read_text()
    ignored = (ROOT / "profiles/gitignore.txt").read_text()
    for tool in catalog["tools"]:
        folder = OUTPUT / "downloads" / tool["id"]
        folder.mkdir(parents=True, exist_ok=True)
        files = {tool["file"]: rules, ".gitignore": ignored,
                 "LAES-MIG.md": guide(tool, catalog["version"])}
        manifest = {"profile": "grundregler", "version": catalog["version"],
                    "tool": tool["id"], "language": "da", "source": tool["source"],
                    "files": {name: hashlib.sha256(value.encode()).hexdigest()
                              for name, value in files.items()}}
        files["manifest.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        tool["files"] = [{"name": name, "content": value,
                          "url": f"downloads/{tool['id']}/{name}"}
                         for name, value in files.items()]
        tool["archive"] = f"downloads/ai-harness-{tool['id']}-{catalog['version']}.zip"
        for name, value in files.items():
            (folder / name).write_text(value, encoding="utf-8", newline="\n")
        with ZipFile(OUTPUT / tool["archive"], "w", compression=ZIP_DEFLATED) as archive:
            for name, value in files.items():
                info = ZipInfo(name, date_time=(2026, 9, 22, 0, 0, 0))
                info.compress_type = ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, value.encode())
    (OUTPUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    print(f"Bygget {len(catalog['tools'])} pakker, version {catalog['version']}, i {OUTPUT}")


if __name__ == "__main__":
    build()
