#!/usr/bin/env node
// Bygger webguidens pakker, det offentlige katalog og FAQ-siden fra det fælles bibliotek i profiles/.
// Pakkerne indeholder præcis de filer, som installationen i appen og scripts/harness.cjs ville skrive.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadLibrary } = require('../desktop/core/library.cjs');
const { layoutFor, knowledgeFor } = require('../desktop/core/adapters.cjs');
const { withBlock, MANIFEST } = require('../desktop/core/installer.cjs');
const { zip } = require('./zip.cjs');

const root = path.resolve(__dirname, '..');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusText = { afproevet: 'Afprøvet med Aura Harness', dokumenteret: 'Efter værktøjets dokumentation', manuel: 'Tekst til platformens egne felter' };
const categoryText = { agent: 'Kodeagenter', editor: 'Editorer og udviklingsmiljøer', web: 'Webplatforme' };
// Integrationer følger ikke med pakkerne; de vælges til for de systemer, man bruger. Tallene i teksterne regnes derfor ud her.
const baseSkills = library => library.skills.filter(skill => !skill.integration);
const integrationSkills = library => library.skills.filter(skill => skill.integration);
const numberWord = count => ['nul', 'én', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti'][count] || String(count);
const listText = items => items.length > 1 ? `${items.slice(0, -1).join(', ')} og ${items.at(-1)}` : items.join('');
const integrationCount = count => `${numberWord(count)} ${count === 1 ? 'integration' : 'integrationer'}`;
const integrationFacts = info => [['System', info.system], ['Ejer', info.owner], ['Adgang', info.access], ['Data', info.data], ['Dataflow', info.dataFlow], ['Pris', info.cost], ['IT-afdelingen', info.itRoute ? 'Adgangen kræver hjælp fra IT-afdelingen.' : 'Kræver ikke hjælp fra IT-afdelingen.'], ...(info.sensitive ? [['Følsomme data', 'Omfatter følsomme personoplysninger.']] : [])];
const integrationNote = info => `Skillen vedligeholdes af ${info.maintainer} og er kontrolleret mod kilderne ${info.checkedAt}.`;

function agentPrompt(library) {
  return `Jeg har pakket Aura Harness ${library.version} ud i mappen <STI TIL DEN UDPAKKEDE MAPPE>. Læs LAES-MIG.md i den mappe, og installer filerne fra undermappen projekt i dette projekt efter afsnittet "Til kodeagenten". Overskriv ingen eksisterende filer. Vis mig alle ændringer, før du skriver, og lav ingen commit.`;
}

function guide(library, tool, layout, files) {
  const blocks = layout.entries.filter(entry => entry.kind === 'blok').map(entry => entry.path);
  return `# Aura Harness ${library.version} til ${tool.name}

Pakken giver ${tool.name} Aura Harness' fælles grundregler og ${layout.skills.length} skills til arbejdet fra idé til drift. Filerne er på dansk og kan læses og tilpasses. Pakken indeholder ingen model, nøgle eller abonnement, og intet installeres eller køres automatisk.

Status: ${statusText[tool.status]}.${tool.testedWith ? ` ${tool.testedWith}` : ''} ${tool.caveat}

## Indhold

Mappen \`projekt\` indeholder filerne, som de skal ligge i dit projekts øverste mappe:

${files.map(file => `- \`${file.path}\``).join('\n')}

Skillsene er beskrevet i ${layout.dirs.map(dir => `\`${dir}/\``).join(' og ')}. Læs om hver skill på webguidens side om skills eller i \`.harness/LAES-MIG.md\`.

## Tre måder at installere

### 1. Med Aura-appen

Vælg "Brug Aura Harness i mit kodeværktøj", vælg ${tool.name} og din projektmappe. Appen viser de præcise ændringer, før noget skrives, og kan fjerne installationen igen.

### 2. Bed din egen kodeagent om det

Åbn dit projekt i ${tool.name}, og skriv:

> ${agentPrompt(library)}

### 3. Manuelt

1. Pak ZIP-filen ud i en separat mappe, ikke oven i dit projekt.
2. Mapper, der begynder med punktum, er skjulte. På Mac vises de med Cmd+Shift+punktum i Finder. På Windows slås skjulte elementer til under Vis i Stifinder.
3. Kopiér de skjulte mapper fra \`projekt\` til dit projekts øverste mappe. Findes en skill med samme navn allerede, så stop og sammenlign.
4. ${blocks.map(file => `\`${file}\``).join(', ')}: Hvis filen ikke findes i dit projekt, så kopiér den. Hvis den findes, så overskriv den ikke. Kopiér i stedet afsnittet fra markøren \`aura-harness:start\` til \`aura-harness:slut\`, og indsæt det nederst i din egen fil. Har filen allerede et afsnit mellem de tidligere markører \`ai-harness:start\` og \`ai-harness:slut\`, så erstat det.
5. Kopiér \`.harness/installation.json\` med. Den gør det muligt senere at opdatere eller fjerne Aura Harness uden at røre dine egne ændringer.

Vil du kun bruge nogle af skillsene, så brug Aura-appen. Den lader dig slå kategorier og enkelte skills til og fra og husker valget ved opdatering.${integrationSkills(library).length ? ` Integrationerne til bestemte systemer (${listText(integrationSkills(library).map(skill => skill.title))}) er ikke med i pakken. Dem vælger du til i appen.` : ''}

## Kontrollér, at det virker

${tool.verification}

Start en ny samtale, og skriv:

> Hvilke projektinstruktioner og skills fra Aura Harness har du adgang til? Hvad er kontrolordet i Aura Harness-profilen? Ændr ingen filer.

Forvent kontrolordet ${library.controlWord} og en liste med skills, der begynder med harness-. Et korrekt svar viser, at filerne kan læses. Det viser ikke, at agenten følger dem i praksis.

## Opdatering og fjernelse

Installér en ny version på samme måde. Appen og scripts/harness.cjs opdaterer kun filer, der er uændrede siden installationen, og viser konflikter for resten. Ved manuel opdatering: sammenlign med dine filer, og bevar dine egne ændringer.

## Til kodeagenten

Følg disse regler, når du installerer pakken for brugeren:

1. Vis brugeren listen over filer, du vil oprette eller ændre, og vent på et ja.
2. Kopiér hver fil fra \`projekt/\` til samme relative sti i projektet. Opret manglende mapper.
3. Findes filen allerede med præcis samme indhold, så gør intet.
4. For ${blocks.map(file => `\`${file}\``).join(', ')}: Findes filen, så overskriv den ikke. Tilføj afsnittet mellem \`aura-harness:start\` og \`aura-harness:slut\` nederst med en tom linje foran. Findes afsnittet allerede, også med de tidligere markører \`ai-harness:start\` og \`ai-harness:slut\`, så spørg brugeren, før du erstatter det.
5. Findes en anden fil på en af stierne, eller en skillmappe med samme navn, så stop og spørg brugeren.
6. Rør ingen andre filer. Kør ingen scripts. Lav ingen commit, push eller branch.
7. Vis til sidst \`git status\` eller en liste over ændrede filer.

## Begrænsninger og kilder

Instruktionerne er vejledning til kodeagenten, ikke en sandbox, adgangskontrol eller garanti mod datalæk. \`.gitignore\` påvirker ikke filer, der allerede er sporet i Git. Filplaceringen er kontrolleret mod værktøjets dokumentation ${library.checkedAt}. Modellers adfærd er ikke certificeret.

${tool.sources.map(source => `- ${source.title}: ${source.url}`).join('\n')}
`;
}

function packageFiles(library, tool) {
  const layout = layoutFor(library, [tool.id]);
  const files = layout.entries.map(entry => ({ path: entry.path, kind: entry.kind, content: entry.kind === 'blok' ? withBlock('', entry.path, entry.content) : entry.content, entry }));
  const manifest = { schemaVersion: 1, version: library.version, tools: layout.tools, skills: layout.skills, installedAt: null, timeSource: 'manuel kopi fra ZIP-pakke', files: {}, blocks: {}, skipped: [] };
  for (const file of files) {
    if (file.kind === 'fil') manifest.files[file.path] = sha(file.content);
    else manifest.blocks[file.path] = { hash: sha(file.entry.content.replace(/\s+$/, '')), created: true };
  }
  files.push({ path: MANIFEST, kind: 'fil', content: JSON.stringify(manifest, null, 2) + '\n' });
  return { layout, files: files.map(({ entry, ...file }) => file) };
}

// Skillfiler står én gang under skills; andre filer gemmes én gang pr. indhold i contents.
function publicFile(library, file, contents) {
  for (const skill of library.skills) {
    const match = skill.files.find(item => file.path.endsWith(`/${skill.name}/${item.path}`));
    if (match && match.content === file.content) return { path: file.path, skill: skill.name, file: match.path };
  }
  // Manifestet består af kontrolsummer; webguiden viser en forklaring, og selve filen ligger i ZIP-pakken.
  if (file.path === MANIFEST) { contents.manifest = 'Registrerer version, værktøjer og kontrolsummer for de installerede filer, så en senere opdatering eller fjernelse kun rører uændrede filer. Filen ligger i ZIP-pakken og skal med i Git.'; return { path: file.path, ref: 'manifest' }; }
  const ref = sha(file.content).slice(0, 16);
  contents[ref] = file.content;
  return { path: file.path, ref };
}

function skillsMarkdown(library) {
  return `# Skills i Aura Harness ${library.version}

Genereret fra \`profiles/catalog.json\` af \`scripts/build-packages.cjs\`. Ret kataloget eller skillfilerne, ikke denne fil.

Aura Harness indeholder fælles grundregler og ${baseSkills(library).length} skills${integrationSkills(library).length ? ` samt ${integrationCount(integrationSkills(library).length)}` : ''}. Grundreglerne gælder altid. En skill er en kort vejledning til kodeagenten om én arbejdsopgave, som bruges, når opgaven passer.${integrationSkills(library).length ? ' En integration er en skill om ét bestemt system, fx et offentligt register. Integrationerne følger ikke med pakkerne til kodeværktøjerne; de vælges til for de systemer, man bruger.' : ''} I Aura-appen kan kategorier, enkelte skills og integrationer slås til og fra.

## Grundregler · altid med

Grundreglerne gælder i hele projektet og kan ikke fravælges. De står i [grundregler.md](grundregler.md).

${library.categories.map(category => `## ${category.title}

${category.summary}

${category.skills.map(name => library.skills.find(skill => skill.name === name)).map(skill => `### ${skill.title}

\`${skill.name}\` · [SKILL.md](skills/${skill.name}/SKILL.md)

**Hvad gør den?** ${skill.faq.hvad}

**Hvornår bruges den?** ${skill.faq.hvornaar}

**Hvad får du?** ${skill.faq.resultat}

**Hvad gør den ikke?** ${skill.faq.ikke}
${skill.integration ? `\n${integrationFacts(skill.integration).map(([label, text]) => `- **${label}:** ${text}`).join('\n')}\n\n${integrationNote(skill.integration)}\n` : ''}${skill.sources.length ? `\nKilder: ${skill.sources.map(source => `[${source.title}](${source.url})`).join(', ')}\n` : ''}`).join('\n')}`).join('\n')}
## Spørgsmål og svar

${library.questions.map(item => `### ${item.q}\n\n${item.a}\n`).join('\n')}`;
}

function skillsPage(library) {
  const nav = library.categories.map(category => `<a href="#${category.id}">${escape(category.title)}</a>`).join('');
  const number = name => library.skills.findIndex(skill => skill.name === name);
  const entry = (skill, index) => `
      <article class="tool-entry skill-entry" id="${skill.name}">
        <p class="tool-type">${String(index + 1).padStart(2, '0')} · <code>${skill.name}</code></p>
        <h3>${escape(skill.title)}</h3>
        <p>${escape(skill.summary)}</p>
        <dl class="faq">
          <dt>Hvad gør den?</dt><dd>${escape(skill.faq.hvad)}</dd>
          <dt>Hvornår bruges den?</dt><dd>${escape(skill.faq.hvornaar)}</dd>
          <dt>Hvad får du?</dt><dd>${escape(skill.faq.resultat)}</dd>
          <dt>Hvad gør den ikke?</dt><dd>${escape(skill.faq.ikke)}</dd>
        </dl>${skill.integration ? `
        <dl class="faq integration-facts">${integrationFacts(skill.integration).map(([label, text]) => `
          <dt>${escape(label)}</dt><dd>${escape(text)}</dd>`).join('')}
        </dl>
        <p class="review-date">${escape(integrationNote(skill.integration))}</p>` : ''}
        <details><summary>Se instruktionen til agenten</summary><pre>${escape(skill.files.find(file => file.path === 'SKILL.md').content)}</pre>${skill.files.filter(file => file.path !== 'SKILL.md').map(file => `<p class="tool-type"><code>${escape(file.path)}</code></p><pre>${escape(file.content)}</pre>`).join('')}</details>
        ${skill.sources.length ? `<p class="sources">Kilder: ${skill.sources.map(source => `<a href="${escape(source.url)}">${escape(source.title)} ↗</a>`).join(' · ')}</p>` : ''}
      </article>`;
  const entries = `
      <section class="note" id="grundregler" aria-labelledby="grundregler-title"><h2 id="grundregler-title">Grundregler · altid med</h2><p>Grundreglerne gælder i hele projektet og kan ikke fravælges: hemmeligheder holdes ude af kode og Git, brugeren styrer Git, ændringer afprøves, og agenten rapporterer ærligt, hvad der er kontrolleret.</p></section>` + library.categories.map(category => `
      <section class="note" id="${category.id}" aria-labelledby="${category.id}-title">
        <h2 id="${category.id}-title">${escape(category.title)}</h2>
        <p>${escape(category.summary)}</p>${category.skills.some(name => library.skills[number(name)].integration) ? `
        <p>Integrationerne følger ikke med pakkerne til kodeværktøjerne. Vælg dem til i Aura-appen: under Indstillinger › Funktioner eller under Tilpas, når du bruger Aura Harness i dit eget kodeværktøj.</p>` : ''}${category.skills.map(name => entry(library.skills[number(name)], number(name))).join('')}
      </section>`).join('');
  const questions = library.questions.map(item => `<details><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('\n        ');
  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Skills i Aura Harness</title>
  <meta name="description" content="Se hvilke skills der følger med Aura Harness: hvad hver skill gør, hvornår den bruges, og hvad den ikke gør.">
  <link rel="icon" type="image/png" href="images/aura-icon.png">
  <link rel="apple-touch-icon" href="images/aura-icon.png">
  <link rel="stylesheet" href="overview.css">
</head>
<body>
  <a class="skip" href="#skills">Gå til skillsene</a>
  <header><a class="brand" href="./"><img src="images/aura-icon.png" width="36" height="36" alt="">Aura Harness</a><a href="pakker.html">Webguide og pakker →</a></header>
  <main class="tool-index">
    <p class="eyebrow">DET FØLGER MED</p>
    <h1>Skills i Aura Harness.</h1>
    <p class="lead">Aura Harness ${library.version} indeholder fælles grundregler og ${baseSkills(library).length} skills${integrationSkills(library).length ? ` samt ${integrationCount(integrationSkills(library).length)}` : ''}. Grundreglerne gælder altid. En skill er en kort vejledning til kodeagenten om én arbejdsopgave, som bruges, når opgaven passer.</p>
    <p>Skillsene er delt i ${numberWord(library.categories.filter(category => category.skills.every(name => !library.skills[number(name)].integration)).length)} kategorier. Pakkerne til kodeværktøjerne indeholder dem alle.${integrationSkills(library).length ? ' En integration er en skill om ét bestemt system, fx et offentligt register. Integrationerne følger ikke med pakkerne; du vælger dem til for de systemer, dit projekt bruger.' : ''} I Aura-appen kan du slå kategorier, enkelte skills og integrationer til og fra, ligesom i en cookie-dialog; grundreglerne er altid med. Filerne er almindelige tekstfiler på dansk, som du kan læse og tilpasse.</p>
    <nav class="tool-nav" aria-label="Skills">${nav}</nav>
    <section id="skills" aria-label="Skills">${entries}
    </section>
    <section class="note" aria-labelledby="spoergsmaal">
      <h2 id="spoergsmaal">Spørgsmål og svar</h2>
      <div class="faq-list">
        ${questions}
      </div>
    </section>
    <p class="note">Skillsene er vejledning til kodeagenten. De er ikke adgangskontrol, en sikkerhedsgodkendelse eller en vurdering efter databeskyttelsesreglerne. Kilderne er kontrolleret ${library.checkedAt}.</p>
  </main>
</body>
</html>
`;
}

function toolsPage(library, publicTools) {
  const sections = Object.entries(categoryText).map(([category, label]) => {
    const tools = library.tools.filter(tool => tool.category === category);
    const entries = tools.map(tool => {
      const published = publicTools.find(item => item.id === tool.id);
      const rules = !tool.rules ? 'Indsættes i platformens egne felter. Pakken følger ikke med.' : tool.rules.import ? `<code>${escape(tool.rules.file)}</code>, som importerer <code>${escape(tool.rules.import)}</code>` : `Et afsnit i <code>${escape(tool.rules.file)}</code>`;
      const skills = !tool.rules ? 'Følger ikke med teksten.' : tool.skills ? published.dirs.map(dir => `<code>${escape(dir)}</code>`).join(' og ') : `Indlæses ikke af værktøjet selv. Grundreglerne henviser til filerne i <code>${escape(published.dirs[0])}</code>.`;
      const action = tool.rules ? `<a href="pakker.html?vaerktoej=${tool.id}">Hent pakken til ${escape(tool.name)} →</a>` : `<a href="pakker.html?vaerktoej=${tool.id}">Kopiér teksten i webguiden →</a>`;
      return `
          <article class="tool-entry" id="${tool.id}">
            <h3>${escape(tool.name)}</h3>
            <p class="tool-type">${escape(tool.vendor)} · ${escape(statusText[tool.status])}</p>
            <p>${escape(tool.summary)}</p>
            <p><strong>Grundregler:</strong> ${rules}</p>
            <p><strong>Skills:</strong> ${skills}</p>
            <p><strong>Kontrollér:</strong> ${escape(tool.verification)}</p>
            ${tool.testedWith ? `<p><strong>Afprøvet:</strong> ${escape(tool.testedWith)}</p>` : ''}
            <p class="caveat">${escape(tool.caveat)}</p>
            <p>${tool.sources.map(source => `<a href="${escape(source.url)}">${escape(source.title)} ↗</a>`).join(' · ')}</p>
            <p>${action}</p>
          </article>`;
    }).join('');
    return `
      <section id="${category}" class="note" aria-labelledby="${category}-title">
        <h2 id="${category}-title">${escape(label)}</h2>
        <div class="tool-list">${entries}
        </div>
      </section>`;
  }).join('');
  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Kodeværktøjer · Aura Harness</title>
  <meta name="description" content="Brug Aura Harness' grundregler og skills i ${library.tools.length} kodeværktøjer og webplatforme, fx Claude Code, Codex, Cursor, GitHub Copilot og Gemini CLI.">
  <link rel="icon" type="image/png" href="images/aura-icon.png">
  <link rel="apple-touch-icon" href="images/aura-icon.png">
  <link rel="stylesheet" href="overview.css">
</head>
<body>
  <a class="skip" href="#oversigt">Gå til værktøjerne</a>
  <header><a class="brand" href="./"><img src="images/aura-icon.png" width="36" height="36" alt="">Aura Harness</a><a href="pakker.html">Webguide og pakker →</a></header>
  <main class="tool-index">
    <p class="eyebrow">BRUG DIT EGET VÆRKTØJ</p>
    <h1>Aura Harness i dit<br>eget kodeværktøj.</h1>
    <p class="lead">Aura Harness' grundregler og ${baseSkills(library).length} <a href="skills.html">skills</a> kan bruges i ${library.tools.length} kodeværktøjer og webplatforme. Her kan du se, hvor filerne lægges, hvordan du kontrollerer, at de er indlæst, og hvad du skal være opmærksom på.</p>
    <p><strong>${escape(statusText.afproevet)}</strong> betyder, at vi har set værktøjet indlæse grundregler og skills og sende dem til modellen. <strong>${escape(statusText.dokumenteret)}</strong> betyder, at filplaceringen følger værktøjets officielle dokumentation, men endnu ikke er afprøvet af os. <strong>${escape(statusText.manuel)}</strong> betyder, at platformen ikke læser filer fra en pakke.</p>
    <p class="review-date">Filplaceringerne er kontrolleret mod værktøjernes dokumentation ${library.checkedAt}.</p>
    <nav class="tool-nav" aria-label="Typer af kodeværktøjer">${Object.entries(categoryText).map(([category, label]) => `<a href="#${category}">${escape(label)}</a>`).join('')}</nav>
    <div id="oversigt">${sections}
    </div>
    <section class="note" aria-labelledby="udgaaet-title">
      <h2 id="udgaaet-title">Udgåede værktøjer</h2>
      <p>Continue blev købt af Cursor i juni 2026 og udvikles ikke længere. Roo Code lukkede i maj 2026 og henviser til Cline. Vi laver derfor ikke pakker til dem. <a href="https://www.continue.dev/">Continue ↗</a> · <a href="https://roocodeinc.github.io/Roo-Code/">Roo Code ↗</a></p>
    </section>
    <section class="note" aria-labelledby="valg-title">
      <h2 id="valg-title">Samme filer, forskellig adfærd</h2>
      <p>Et fælles filformat giver ikke samme adfærd eller adgangskontrol overalt. Værktøjerne læser regler og skills forskelligt, og modellen afgør, hvor godt instruktionerne følges. Kontrollér indlæsningen i dit eget værktøj, og gennemgå agentens arbejde. Oversigten er ikke en vurdering af leverandørernes datavilkår.</p>
      <p><a href="https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/teknisk-grundlag.md">Læs om vores nuværende motor og vurderingen af Pi ↗</a></p>
    </section>
  </main>
  <footer><a href="./">Til forsiden</a><a href="pakker.html">Hent grundregler og skills</a></footer>
</body>
</html>
`;
}

function fallbackList(publicTools) {
  return publicTools.filter(tool => tool.archive).map(tool => `<li><a href="${tool.archive}" download>Hent pakken til ${escape(tool.name)}</a></li>`).join('');
}

async function build({ profiles = path.join(root, 'profiles'), output = path.join(root, 'site/dist'), markdown = path.join(profiles, 'SKILLS.md') } = {}) {
  const library = await loadLibrary(profiles);
  await fs.mkdir(path.join(output, 'images'), { recursive: true });
  await fs.copyFile(path.join(root, 'docs/images/aura-icon.png'), path.join(output, 'images/aura-icon.png'));
  const downloads = path.join(output, 'downloads');
  await fs.rm(downloads, { recursive: true, force: true });
  await fs.mkdir(downloads, { recursive: true });
  const publicTools = [];
  const contents = {};
  for (const tool of library.tools) {
    const base = { id: tool.id, name: tool.name, vendor: tool.vendor, category: tool.category, status: tool.status, testedWith: tool.testedWith, summary: tool.summary, verification: tool.verification, caveat: tool.caveat, sources: tool.sources };
    if (!tool.rules) { publicTools.push({ ...base, installable: false, knowledge: knowledgeFor(library) }); continue; }
    const { layout, files } = packageFiles(library, tool);
    const archive = `downloads/aura-harness-${tool.id}-${library.version}.zip`;
    const readme = guide(library, tool, layout, files);
    await fs.writeFile(path.join(output, archive), zip([{ name: 'LAES-MIG.md', data: readme }, ...files.map(file => ({ name: `projekt/${file.path}`, data: file.content }))], library.checkedAt));
    publicTools.push({ ...base, installable: true, archive, dirs: layout.dirs, warnings: layout.warnings, files: files.map(file => publicFile(library, file, contents)) });
  }
  const catalog = { version: library.version, checkedAt: library.checkedAt, controlWord: library.controlWord, featuredTools: library.featuredTools, skillCategories: library.categories, agentPrompt: agentPrompt(library), categories: categoryText, statuses: statusText, questions: library.questions, skills: library.skills.map(({ files, ...skill }) => ({ ...skill, files })), tools: publicTools, contents };
  await fs.writeFile(path.join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  await fs.writeFile(path.join(output, 'skills.html'), skillsPage(library));
  await fs.writeFile(path.join(output, 'vaerktoejer.html'), toolsPage(library, publicTools));
  await fs.writeFile(markdown, skillsMarkdown(library));
  const index = path.join(output, 'index.html');
  const html = await fs.readFile(index, 'utf8');
  if (!/<!-- pakker -->[\s\S]*?<!-- \/pakker -->/.test(html)) throw new Error('index.html mangler markørerne til direkte downloads.');
  await fs.writeFile(index, html.replace(/<!-- pakker -->[\s\S]*?<!-- \/pakker -->/, `<!-- pakker -->${fallbackList(publicTools)}<!-- /pakker -->`));
  return { library, catalog };
}

if (require.main === module) build()
  .then(({ library, catalog }) => console.log(`Bygget ${catalog.tools.filter(tool => tool.archive).length} pakker med ${baseSkills(library).length} skills og ${integrationCount(integrationSkills(library).length)} til at vælge til, version ${library.version}.`))
  .catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { build, guide, packageFiles, agentPrompt };
