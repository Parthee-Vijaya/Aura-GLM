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

function rulesBody(library, dirs) {
  const where = dirs.map(dir => `\`${dir}/\``).join(' og ');
  const index = library.skills.map(skill => `- \`${skill.name}\`: ${skill.summary}`).join('\n');
  return [
    `Dette afsnit vedligeholdes af AI Harness, version ${library.version}. Skriv projektets egne regler uden for afsnittet; ændringer herinde bliver ikke overskrevet, men stopper automatiske opdateringer.`,
    '',
    library.rules.trim(),
    '',
    '## Skills fra AI Harness',
    '',
    `Skillsene ligger i ${where}. Mange kodeværktøjer finder dem selv. Hvis dit værktøj ikke gør, så læs \`<mappe>/<navn>/SKILL.md\`, før du løser en opgave, der passer til beskrivelsen.`,
    '',
    index
  ].join('\n');
}

function importBody(file) {
  return `AI Harness' fælles grundregler og oversigten over skills står i ${file}:\n\n@${file}`;
}

function readme(library, selected, dirs) {
  return [
    '# AI Harness i dette projekt',
    '',
    `Projektet bruger AI Harness ${library.version} til ${selected.map(tool => tool.name).join(', ')}. Harness giver kodeagenten fælles grundregler og ${library.skills.length} skills til arbejdet fra idé til drift.`,
    '',
    `- Grundreglerne står i et afgrænset afsnit i ${[...new Set(selected.map(tool => tool.rules.import || tool.rules.file))].join(' og ')}.`,
    `- Skillsene ligger i ${dirs.map(dir => `\`${dir}/\``).join(' og ')}.`,
    '- `installation.json` registrerer version og kontrolsummer, så en opdatering eller fjernelse kun rører uændrede filer.',
    '',
    'Skriv projektets egne regler uden for AI Harness-afsnittet. Hvis du ændrer en installeret skill, bevarer Harness din ændring og springer filen over ved opdatering.',
    '',
    '## Skills',
    '',
    ...library.skills.map(skill => `- **${skill.title}** (\`${skill.name}\`): ${skill.summary}`),
    '',
    'Instruktionerne er vejledning til kodeagenten. De er ikke adgangskontrol, en sikkerhedsgodkendelse eller en vurdering efter databeskyttelsesreglerne.'
  ].join('\n') + '\n';
}

function layoutFor(library, ids) {
  const selected = tools(library, ids);
  const dirs = chooseSkillDirs(library, selected);
  const body = rulesBody(library, dirs);
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
  for (const dir of dirs) for (const skill of library.skills) for (const file of skill.files) add({ kind: 'fil', path: `${dir}/${skill.name}/${file.path}`, content: file.content, group: `${dir}/${skill.name}` });
  add({ kind: 'blok', path: '.gitignore', content: library.gitignore.trim() });
  add({ kind: 'fil', path: '.harness/LAES-MIG.md', content: readme(library, selected, dirs) });
  const seen = tool => dirs.filter(dir => tool.skills.dirs.includes(dir));
  const warnings = selected.filter(tool => tool.skills && seen(tool).length > 1)
    .map(tool => `${tool.name} kan læse skills fra både ${seen(tool).join(' og ')}. ${tool.skills.duplicates || 'Kontrollér, at hver skill kun vises én gang.'}`);
  const withoutSkills = selected.filter(tool => !tool.skills).map(tool => `${tool.name} indlæser ikke skills selv. Grundreglerne henviser til skillfilerne, så agenten kan læse dem ved behov.`);
  return { entries: [...entries.values()], tools: selected.map(tool => tool.id), dirs, warnings: [...warnings, ...withoutSkills] };
}

// Tekst til webplatforme, hvor reglerne indsættes i platformens egne felter.
function knowledgeFor(library) {
  return [
    `AI Harness ${library.version} · fælles grundregler`,
    '',
    library.rules.trim(),
    '',
    '## Arbejdsgange fra AI Harness',
    '',
    'Platformen indlæser ikke Harness-skills som filer. Brug disse arbejdsgange, når opgaven passer:',
    '',
    ...library.skills.map(skill => `- ${skill.title}: ${skill.summary}`)
  ].join('\n') + '\n';
}

module.exports = { layoutFor, chooseSkillDirs, knowledgeFor, rulesBody };
