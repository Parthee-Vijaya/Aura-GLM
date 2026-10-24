// Oversætter det fælles bibliotek til filplaceringer for de valgte værktøjer.
// Resultatet er en liste af filer og afsnit, som installer.cjs kan gennemgå og skrive.

function tools(library, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('Vælg mindst ét værktøj.');
  const unique = [...new Set(ids)];
  return unique.map(id => {
    const tool = library.tools.find(item => item.id === id);
    if (!tool) throw new Error(`Ukendt værktøj: ${id}`);
    if (!tool.rules) throw new Error(`${tool.name} installeres ikke i en projektmappe. Brug teksten til platformens egne felter.`);
    return tool;
  });
}

// Vælger så få skillmapper som muligt, så alle valgte værktøjer kan se skillsene. Ved lige dækning vinder den
// mappe, flest af værktøjerne selv foretrækker (første i deres liste), og derefter katalogets rækkefølge.
function chooseSkillDirs(library, selected) {
  const remaining = selected.filter(tool => tool.skills);
  const chosen = [];
  while (remaining.length) {
    const candidates = library.skillDirs.map(dir => ({ dir, covers: remaining.filter(tool => tool.skills.dirs.includes(dir)).length, preferred: remaining.filter(tool => tool.skills.dirs[0] === dir).length })).filter(item => item.covers);
    const best = candidates.reduce((a, b) => b.covers > a.covers || (b.covers === a.covers && b.preferred > a.preferred) ? b : a);
    chosen.push(best.dir);
    for (let i = remaining.length - 1; i >= 0; i--) if (remaining[i].skills.dirs.includes(best.dir)) remaining.splice(i, 1);
  }
  if (!chosen.length) chosen.push(library.neutralSkillDir);
  return chosen;
}

function rulesBody(library, dirs, skills = library.skills) {
  const intro = [
    `Dette afsnit vedligeholdes af Aura Harness, version ${library.version}. Skriv projektets egne regler uden for afsnittet; ændringer herinde bliver ikke overskrevet, men stopper automatiske opdateringer.`,
    '',
    library.rules.trim()
  ];
  if (!skills.length) return intro.join('\n');
  const where = dirs.map(dir => `\`${dir}/\``).join(' og ');
  return [
    ...intro,
    '',
    '## Skills fra Aura Harness',
    '',
    `Skillsene ligger i ${where}. Mange kodeværktøjer finder dem selv. Hvis dit værktøj ikke gør, så læs \`<mappe>/<navn>/SKILL.md\`, før du løser en opgave, der passer til beskrivelsen.`,
    ...(skills.some(skill => skill.name === 'harness-aura-design') ? ['', 'Ved planlægning og bygning af apps, hjemmesider og andre produkter: læs først harness-aura-design/SKILL.md i den valgte skillmappe. Den er hovedskill for sammenhængende design og fungerende brugerforløb. Øvrige skills supplerer efter behov. Projektets regler og godkendelser gælder fortsat.'] : []),
    '',
    skills.map(skill => `- \`${skill.name}\`: ${skill.summary}`).join('\n')
  ].join('\n');
}

// Udvalget af skills. Ukendte navne afvises.
function selectSkills(library, names) {
  // Uden et udvalg følger alle skills med undtagen integrationer, som man vælger til for de systemer, man bruger.
  if (names === undefined) return library.skills.filter(skill => !skill.integration);
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) throw new Error('Vælg skills fra listen.');
  const unknown = names.filter(name => !library.skills.some(skill => skill.name === name));
  if (unknown.length) throw new Error(`Ukendt skill: ${unknown.join(', ')}`);
  return library.skills.filter(skill => names.includes(skill.name));
}

function importBody(file) {
  return `Aura Harness' fælles grundregler og oversigten over skills står i ${file}:\n\n@${file}`;
}

function readme(library, selected, dirs, skills) {
  // Integrationer vælges til og er ikke fravalgt, når de mangler. De tælles derfor for sig.
  const base = library.skills.filter(skill => !skill.integration);
  const left = base.filter(skill => !skills.includes(skill));
  const integrations = skills.filter(skill => skill.integration);
  const offered = library.skills.filter(skill => skill.integration && !skills.includes(skill));
  return [
    '# Aura Harness i dette projekt',
    '',
    `Projektet bruger Aura Harness ${library.version} til ${selected.map(tool => tool.name).join(', ')}. Aura Harness giver kodeagenten fælles grundregler og ${skills.length - integrations.length} af ${base.length} skills til arbejdet fra idé til drift${integrations.length ? ` samt ${integrations.length === 1 ? 'integrationen' : 'integrationerne'} ${integrations.map(skill => skill.title).join(', ')}` : ''}.`,
    '',
    `- Grundreglerne står i et afgrænset afsnit i ${[...new Set(selected.map(tool => tool.rules.import || tool.rules.file))].join(' og ')}.`,
    skills.length ? `- Skillsene ligger i ${dirs.map(dir => `\`${dir}/\``).join(' og ')}.` : '- Der er ikke valgt nogen skills.',
    '- `installation.json` registrerer version og kontrolsummer, så en opdatering eller fjernelse kun rører uændrede filer.',
    '',
    'Skriv projektets egne regler uden for Aura Harness-afsnittet. Hvis du ændrer en installeret skill, bevarer Aura Harness din ændring og springer filen over ved opdatering.',
    '',
    '## Skills',
    '',
    ...(skills.length ? skills.map(skill => `- **${skill.title}** (\`${skill.name}\`): ${skill.summary}`) : ['Ingen skills er valgt.']),
    ...(left.length ? ['', `Fravalgt: ${left.map(skill => skill.title).join(', ')}. De kan vælges igen i Aura-appen.`] : []),
    ...(offered.length ? ['', `Integrationer, der kan vælges til i Aura-appen: ${offered.map(skill => skill.title).join(', ')}.`] : []),
    '',
    'Instruktionerne er vejledning til kodeagenten. De er ikke adgangskontrol, en sikkerhedsgodkendelse eller en vurdering efter databeskyttelsesreglerne.'
  ].join('\n') + '\n';
}

function layoutFor(library, ids, { skills: names } = {}) {
  if (typeof library.license !== 'string' || !library.license.trim()) throw new Error('Bibliotekets licenstekst mangler. Pakken kan ikke installeres uden licensmeddelelser.');
  const selected = tools(library, ids);
  const skills = selectSkills(library, names);
  const dirs = skills.length ? chooseSkillDirs(library, selected) : [];
  const body = rulesBody(library, dirs, skills);
  const entries = new Map();
  const add = entry => {
    const existing = entries.get(entry.path);
    if (existing && existing.content !== entry.content) throw new Error(`To værktøjer vil skrive forskelligt indhold til ${entry.path}.`);
    entries.set(entry.path, entry);
  };
  for (const tool of selected) {
    const rules = tool.rules;
    if (rules.mode === 'fil') add({ kind: 'fil', path: rules.file, content: `${rules.header || ''}${body}\n` });
    else if (rules.import) { add({ kind: 'blok', path: rules.import, content: body }); add({ kind: 'blok', path: rules.file, content: importBody(rules.import) }); }
    else add({ kind: 'blok', path: rules.file, content: body });
  }
  for (const dir of dirs) for (const skill of skills) for (const file of skill.files) add({ kind: 'fil', path: `${dir}/${skill.name}/${file.path}`, content: file.content, group: `${dir}/${skill.name}` });
  add({ kind: 'blok', path: '.gitignore', content: library.gitignore.trim() });
  add({ kind: 'fil', path: '.harness/LICENSE', content: library.license });
  add({ kind: 'fil', path: '.harness/NOTICE.md', content: 'Aura Harness · AI Alliancen\n\nDistribueres under EUPL-1.2. Licensteksten findes i LICENSE i denne mappe.\nKildekode: https://github.com/ai-alliancen-org/ai-harness\nBevar ophavs- og licensmeddelelser ved videre distribution.\n' });
  add({ kind: 'fil', path: '.harness/LAES-MIG.md', content: readme(library, selected, dirs, skills) });
  const seen = tool => dirs.filter(dir => tool.skills.dirs.includes(dir));
  const warnings = selected.filter(tool => tool.skills && seen(tool).length > 1)
    .map(tool => `${tool.name} kan læse skills fra både ${seen(tool).join(' og ')}. ${tool.skills.duplicates || 'Kontrollér, at hver skill kun vises én gang.'}`);
  const withoutSkills = skills.length ? selected.filter(tool => !tool.skills).map(tool => `${tool.name} indlæser ikke skills selv. Grundreglerne henviser til skillfilerne, så agenten kan læse dem ved behov.`) : [];
  return { entries: [...entries.values()], tools: selected.map(tool => tool.id), skills: skills.map(skill => skill.name), dirs, warnings: [...(skills.length ? warnings : []), ...withoutSkills] };
}

// Tekst til webplatforme, hvor reglerne indsættes i platformens egne felter.
function knowledgeFor(library) {
  return [
    `Aura Harness ${library.version} · fælles grundregler`,
    '',
    library.rules.trim(),
    '',
    '## Arbejdsgange fra Aura Harness',
    '',
    'Platformen indlæser ikke Aura Harness-skills som filer. Brug disse arbejdsgange, når opgaven passer:',
    '',
    // Integrationer kræver skillens fulde tekst og vælges til for sig, så de står ikke i den korte tekst.
    ...library.skills.filter(skill => !skill.integration).map(skill => `- ${skill.title}: ${skill.summary}`)
  ].join('\n') + '\n';
}

module.exports = { layoutFor, chooseSkillDirs, knowledgeFor, rulesBody };
