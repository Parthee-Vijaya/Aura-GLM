# Ændringslog

## 0.6.0-beta.5 · 4. november 2026

- **Flere AI-udbydere under Indstillinger › AI-forbindelser.** Tilføj forbindelse har stadig kortene med logoer for Corti, Alexandra, Mistral, OpenAI, Claude, Azure, OpenRouter, Zen, Ollama og Egen server. Under kortene ligger en dropdown med de nye udbydere: Google Gemini, Groq, Together, Fireworks, Cerebras, xAI, Perplexity, Hugging Face, NVIDIA, Moonshot (Kimi), Cloudflare Workers AI, LM Studio og vLLM. Adressen er udfyldt på forhånd, og der er et link til udbyderens nøgleside. Ukontrollerede vilkår vises som "Ikke kontrolleret af Aura".
- **Egen server** tager nu også et udbyder-ID og en protokol (OpenAI Chat Completions, OpenAI Responses eller Anthropic Messages). Nøglen indtastes fortsat kun i det sikre nøglevindue.
- **Plugins under Indstillinger.** Hent websider kan sættes til *Spørg først* eller *Slået fra*, og kontekstvisning kan slås til. Subagenter, websøgning, terminalgrænser, sprogservere og MCP-servere vises under *Venter på sikker tilkobling* med en begrundelse. De kan ikke slås til, før de er dækket af godkendelser, sandbox og Privacy Gate. MCP-servere kan gemmes, men startes ikke.
- **Samtalen ligner referencen mere.** Statuslinjen under skrivefeltet har ikoner for kontekst, hastighed, tokens og pris. Modelchippen har en vælgerpil, og arbejdsmåden står kun i topbjælken under en samtale. Pladsholderen nævner `/` for kommandoer.

## 0.6.0-beta.4 · 4. november 2026

- Versionsmærket i appen viser nu hele versionen på samme form som releasen, fx **0.6.0 beta 4** (tidligere "beta 0.6.0").

## 0.6.0-beta.3 · 4. november 2026

Rettelser efter en selvstændig UX/UI-gennemgang af beta.2.

- Idékladden i Nyt projekt bevares, når man går tilbage til arbejdsfladen og åbner formularen igen.
- Opsætningstrinnenes handlinger (fx Gem og fortsæt) bliver synlige i bunden, mens lange trin ruller.
- Opsætningens trinliste vises kun i det guidede førstegangsforløb, ikke ved Nyt projekt fra et projekt eller efter Fortsæt uden profil.
- Forfin idéen uden AI-forbindelse åbner forbindelsesopsætningen og bevarer kladden.
- Fokus går til sidepanelknappen, når sidepanelet åbnes igen, og til skrivefeltet efter Tilbage til arbejdsfladen.
- Indstillingen for arbejdsfladen ved opstart har fået en retvisende tekst.
- Aura-logoet viser sin midterprik i lyst tema. Tilstandstegn, infoknapper, fokusramme, Send uden valgt AI og opsætningens links er justeret.

## 0.6.0-beta.2 · 4. november 2026

- Nyt projekt viser standardfelter, placering og Opret uden scroll ved 980×720 og normal tekststørrelse.
- Opret-handlingen har en fast bundrække. Udvidede tilvalg og længere indhold ruller separat, og tilbagehandlingen ligger i headeren.
- Flade-, felt-, primærtekst-, sekundærtekst- og accentfarver er samlet i en neutral palette med blå accent. Lyse felter er hvide.
- Oprindelig formularvalidering og oprettelse er afprøvet i den native app. README viser nye faktiske screenshots.

## 0.6.0-beta.1 · 4. november 2026

Udviklingsversion af desktopappen med fuldt UI/UX-redesign.

- Kompakt native førstestart, integreret Aura-logo og valgfri lokal profil uden kontologin.
- Helt skjulbar sidebar, centreret samtalestart og samlede indstillinger i lyst og mørkt tema.
- Bevarede projekt-, onboarding-, AI-, godkendelses- og datakontrolfunktioner.
- Rettet panelpræference ved projekt-/samtaleopdatering, eksplicit Arbejdsspor og profilikonernes centrering.
- README med syv faktiske native screenshots og dokumenteret visuel kontrol.

Dette er en kildekodeopdatering. Historiske udgivelser og deres egne testgrundlag findes under [docs/releases](docs/releases/).
