# Aura Prime 0.6.0 beta 5

Teknisk version: `0.6.0-beta.5`, tag `v0.6.0-beta.5`. DMG og opdaterings-ZIP er bygget fra `7ede24c` med Electron 45.0.0 og den låste Node 22.23.3-runtime. Det er en prerelease til afprøvning på macOS med Apple Silicon. Brug et separat testprojekt med opdigtede data.

## Nyt

- **Flere AI-udbydere.** Under Indstillinger › AI-forbindelser har Tilføj forbindelse stadig kortene med logoer for de kendte udbydere: Corti, Alexandra, Mistral, OpenAI, Claude, Azure, OpenRouter, OpenCode Zen, Ollama og Egen server. Under kortene ligger *Flere udbydere* som dropdown: Google Gemini, Groq, Together, Fireworks, Cerebras, xAI, Perplexity, Hugging Face, NVIDIA, Moonshot (Kimi), Cloudflare Workers AI, LM Studio og vLLM. Adressen er udfyldt på forhånd, og der er et link til udbyderens nøgleside. Vilkår vises kort. Har Aura ikke kontrolleret dem, står der "Ikke kontrolleret af Aura".
- **Egen server** kan nu bruge protokollen OpenAI Chat Completions, OpenAI Responses eller Anthropic Messages og have et udbyder-ID. Nøglen indtastes fortsat kun i det sikre nøglevindue.
- **Plugins** under Indstillinger og i sidepanelets menu. *Hent websider* kan sættes til Spørg først eller Slået fra, og *Kontekstvisning* kan slås til. Subagenter, websøgning, terminalgrænser, sprogservere og MCP-servere står under *Venter på sikker tilkobling* med en begrundelse. De kan ikke slås til, før de er dækket af godkendelser, sandbox og Privacy Gate. MCP-servere kan gemmes, men startes ikke.
- **Samtalen.** Statuslinjen under skrivefeltet har ikoner for kontekst, hastighed, tokens og pris. Modelchippen har en vælgerpil, og arbejdsmåden står kun i topbjælken under en samtale. Pladsholderen nævner `/` for kommandoer.

Funktioner, onboarding, Samtale/Planlæg/Byg, planer, godkendelser, Privacy Gate, datadeling og YOLO-grænser er bevaret. Se [CHANGELOG](../../CHANGELOG.md).

## Installation

Åbn DMG'en, og træk **Aura Prime** til Programmer. Appen er ad hoc-signeret og **ikke Apple-notariseret**. Første gang skal den derfor åbnes med højreklik → Åbn. Har du 0.6.0 beta 3 eller beta 4, tilbyder appen opdateringen via feedet. Aura GLM 1.0.0-beta.x kræver manuel installation.

## Kvalifikation

- Samlet lokal kontrol (`scripts/check.cjs`, Node 22.23.3) på kildecommit: **2.688 pass, 34 skips, 0 fail**.
- Backend er bygget af to Codex-stationer under en fælles kontrakt og frontend af Claude. Et uafhængigt review fandt ingen sikkerhedsregressioner. De fire mindre fund er rettet før commit.
- Den native kildeprøve brugte isolerede profiler og en lokal syntetisk modelserver på 127.0.0.1. Den dækkede datagennemgang før afsendelse, en samtale med svar, statuslinje, modelchip, udbyderkort og dropdown, Egen server, Plugins i lyst og mørkt tema og 980×720.
- Den pakkede app er startet i en separat profil. Mærket viser **0.6.0 beta 5**, de 10 kort og 13 dropdown-udbydere vises, og Plugins viser webhentning og kontekstvisning som aktive og fem plugins som ventende.
- `codesign --verify --deep --strict` består (ad hoc, hardened runtime).
- Ikke udført: rigtige nøgler mod de nye udbydere, Apple-notarisering, GitHub CI, Windows og Intel-Mac.

| Artefakt | SHA-256 |
|---|---|
| `Aura-Prime-0.6.0-beta.5-mac-arm64.dmg` | `7c311e6c898893beae1e2927df3d274607892a04c80b01d1b7d63baba34dee42` |
| `Aura-Prime-0.6.0-beta.5-mac-arm64.zip` | `d413fc420eb790fdb2a0e2d809bd1815811a580694c6e4e875452f180b6e682b` |
| `beta-mac.yml` | `6bb778a5192da1828583805ae4040907706960d126440bc6e9eff30993c30989` |

[Release, DMG og kontrolsummer](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.5)
