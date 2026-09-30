const fs = require('node:fs/promises');
const path = require('node:path');

// Det fælles bibliotek er læsbare filer i profiles/. Kataloget beskriver skills for mennesker og
// værktøjernes filplaceringer; SKILL.md-filerne er instruktionerne til agenten.
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_FILE = /^(SKILL\.md|references\/[a-z0-9-]+\.md)$/;
const FAQ_FIELDS = ['hvad', 'hvornaar', 'resultat', 'ikke'];
const MAX_SKILL_LINES = 300;

function parseFrontmatter(text, where) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) throw new Error(`${where}: SKILL.md skal begynde med et YAML-felt afgrænset af ---.`);
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = /^([a-z-]+): (.+)$/.exec(line);
    if (!field) throw new Error(`${where}: YAML-feltet må kun indeholde enkle linjer med navn: værdi.`);
    if (fields[field[1]] !== undefined) throw new Error(`${where}: ${field[1]} står flere gange.`);
    fields[field[1]] = field[2].trim();
  }
  for (const key of Object.keys(fields)) if (!['name', 'description'].includes(key)) throw new Error(`${where}: Feltet ${key} er ikke tilladt i biblioteket. Brug kun name og description.`);
  return { fields, body: text.slice(match[0].length) };
}

// Kontrollerer selve SKILL.md. Bruges af biblioteket og af appen, når en skill tilpasses i et projekt.
function validateSkillText(name, content, where = `Skill ${name}`) {
  const { fields, body } = parseFrontmatter(content, where);
  if (fields.name !== name) throw new Error(`${where}: name i SKILL.md skal være det samme som mappens navn.`);
  if (!fields.description || fields.description.length > 1024) throw new Error(`${where}: description skal findes og højst have 1.024 tegn.`);
  // Beskrivelsen står uden anførselstegn, så den skal være gyldig YAML i alle værktøjers parsere.
  if (/: | #|[<>]|^[-?:,[\]{}#&*!|'"%@`]/.test(fields.description)) throw new Error(`${where}: description må ikke indeholde ": ", " #", < eller > og må ikke begynde med et YAML-tegn.`);
  if (body.split('\n').length > MAX_SKILL_LINES) throw new Error(`${where}: SKILL.md er for lang. Flyt detaljer til references/.`);
  return { fields, body };
}

function validateSkill(entry, files) {
  const where = `Skill ${entry.name}`;
  if (!NAME.test(entry.name) || entry.name.length > 64) throw new Error(`${where}: Navnet skal bestå af små bogstaver, tal og bindestreger og højst have 64 tegn.`);
  if (!entry.name.startsWith('harness-')) throw new Error(`${where}: Navnet skal begynde med harness-, så det ikke forveksles med projektets egne skills.`);
  const skill = files.find(file => file.path === 'SKILL.md');
  if (!skill) throw new Error(`${where}: SKILL.md mangler.`);
  const { fields, body } = validateSkillText(entry.name, skill.content, where);
  for (const file of files) {
    if (!SKILL_FILE.test(file.path)) throw new Error(`${where}: ${file.path} er ikke tilladt. Biblioteket indeholder kun Markdown og ingen scripts.`);
    if (file.path !== 'SKILL.md' && !body.includes(file.path)) throw new Error(`${where}: ${file.path} bruges ikke fra SKILL.md.`);
  }
  for (const reference of body.match(/references\/[a-z0-9-]+\.md/g) || []) if (!files.some(file => file.path === reference)) throw new Error(`${where}: ${reference} nævnes, men findes ikke.`);
  if (typeof entry.title !== 'string' || !entry.title || typeof entry.summary !== 'string' || !entry.summary) throw new Error(`${where}: Titel og kort beskrivelse mangler i kataloget.`);
  for (const field of FAQ_FIELDS) if (typeof entry.faq?.[field] !== 'string' || !entry.faq[field].trim()) throw new Error(`${where}: FAQ-feltet ${field} mangler i kataloget.`);
  if (!Array.isArray(entry.sources)) throw new Error(`${where}: Kilder skal være en liste.`);
  for (const source of entry.sources) if (!/^https:\/\//.test(source.url || '') || !source.title) throw new Error(`${where}: Hver kilde skal have titel og https-adresse.`);
  return { description: fields.description };
}

function validateTool(tool, skillDirs) {
  const where = `Værktøj ${tool.id}`;
  if (!NAME.test(tool.id || '')) throw new Error(`${where}: Ugyldigt id.`);
  for (const key of ['name', 'vendor', 'summary', 'verification', 'caveat']) if (typeof tool[key] !== 'string' || !tool[key].trim()) throw new Error(`${where}: ${key} mangler.`);
  if (!['agent', 'editor', 'web'].includes(tool.category)) throw new Error(`${where}: Ukendt kategori.`);
  if (!['afproevet', 'dokumenteret', 'manuel'].includes(tool.status)) throw new Error(`${where}: Ukendt status.`);
  if ((tool.status === 'afproevet') !== (typeof tool.testedWith === 'string' && tool.testedWith.length > 20)) throw new Error(`${where}: Status afprøvet kræver en beskrivelse af version, dato og metode i testedWith, og kun den.`);
  if (!Array.isArray(tool.sources) || !tool.sources.length || tool.sources.some(source => !/^https:\/\//.test(source.url || '') || !source.title)) throw new Error(`${where}: Mindst én officiel kilde med titel og https-adresse er påkrævet.`);
  // En webplatform uden filer i projektet får tekst til sine egne felter i stedet for en installation.
  if (tool.category === 'web' && !tool.rules) {
    if (tool.skills || tool.status !== 'manuel') throw new Error(`${where}: En webplatform uden projektfiler skal have status manuel og ingen skills.`);
    return;
  }
  const rules = tool.rules;
  if (!rules || !safeRelative(rules.file) || !['blok', 'fil'].includes(rules.mode)) throw new Error(`${where}: Reglernes fil og form skal angives.`);
  if (rules.import !== undefined && (rules.mode !== 'blok' || !safeRelative(rules.import))) throw new Error(`${where}: Import kræver en blok og en gyldig fil.`);
  if (rules.mode === 'fil' && rules.header !== undefined && typeof rules.header !== 'string') throw new Error(`${where}: Ugyldig filstart.`);
  if (tool.skills !== null) {
    if (!Array.isArray(tool.skills?.dirs) || !tool.skills.dirs.length || tool.skills.dirs.some(dir => !skillDirs.includes(dir))) throw new Error(`${where}: Skills skal pege på kendte mapper eller være null.`);
  }
}

function safeRelative(file) {
  return typeof file === 'string' && file.length < 200 && !path.isAbsolute(file) && !file.includes('\\') && !file.split('/').some(part => !part || part === '.' || part === '..');
}

async function readSkillFiles(dir) {
  const files = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isFile()) files.push(entry.name);
    else if (entry.isDirectory() && entry.name === 'references') for (const inner of await fs.readdir(path.join(dir, 'references'), { withFileTypes: true })) {
      if (!inner.isFile()) throw new Error(`Skillmappen ${dir} indeholder en ugyldig post.`);
      files.push(`references/${inner.name}`);
    }
    else throw new Error(`Skillmappen ${dir} indeholder en ugyldig post: ${entry.name}.`);
  }
  return Promise.all(files.sort().map(async file => ({ path: file, content: await fs.readFile(path.join(dir, file), 'utf8') })));
}

async function loadLibrary(profileRoot) {
  const catalog = JSON.parse(await fs.readFile(path.join(profileRoot, 'catalog.json'), 'utf8'));
  if (catalog.schemaVersion !== 2 || !/^\d+\.\d+\.\d+$/.test(catalog.version) || !/^\d{4}-\d{2}-\d{2}$/.test(catalog.checkedAt) || typeof catalog.controlWord !== 'string') throw new Error('Katalogets version, kontroldato eller kontrolord er ugyldigt.');
  if (!Array.isArray(catalog.skillDirs) || !catalog.skillDirs.length || catalog.skillDirs.some(dir => !safeRelative(dir))) throw new Error('Kataloget skal angive gyldige skillmapper.');
  if (!catalog.skillDirs.includes(catalog.neutralSkillDir)) throw new Error('Den neutrale skillmappe skal være en af de kendte mapper.');
  const rules = await fs.readFile(path.join(profileRoot, 'grundregler.md'), 'utf8');
  if (!rules.includes(catalog.controlWord) || !rules.includes(`Version: ${catalog.version}`)) throw new Error('Grundreglerne skal have samme version og kontrolord som kataloget.');
  const gitignore = await fs.readFile(path.join(profileRoot, 'gitignore.txt'), 'utf8');
  const names = new Set();
  const skills = [];
  for (const entry of catalog.skills) {
    if (names.has(entry.name)) throw new Error(`Skill ${entry.name} står flere gange i kataloget.`);
    names.add(entry.name);
    const files = await readSkillFiles(path.join(profileRoot, 'skills', entry.name));
    skills.push({ ...entry, ...validateSkill(entry, files), files });
  }
  // En skill kan fravælges. Henvisninger til andre skills skal derfor pege på en kendt skill og tåle, at den mangler.
  for (const skill of skills) for (const file of skill.files) for (const line of file.content.split('\n')) for (const [, name] of line.matchAll(/`(harness-[a-z0-9-]+)`/g)) {
    if (!names.has(name)) throw new Error(`Skill ${skill.name}: ${file.path} henviser til en ukendt skill, ${name}.`);
    if (!/hvis (den|de) er installeret/.test(line)) throw new Error(`Skill ${skill.name}: Henvisningen til ${name} skal tåle, at skillen er fravalgt. Skriv fx "hvis den er installeret".`);
  }
  const onDisk = (await fs.readdir(path.join(profileRoot, 'skills'))).filter(name => !name.startsWith('.'));
  for (const name of onDisk) if (!names.has(name)) throw new Error(`Mappen profiles/skills/${name} står ikke i kataloget.`);
  const ids = new Set();
  for (const tool of catalog.tools) {
    if (ids.has(tool.id)) throw new Error(`Værktøjet ${tool.id} står flere gange i kataloget.`);
    ids.add(tool.id);
    validateTool(tool, catalog.skillDirs);
  }
  if (!Array.isArray(catalog.featuredTools) || !catalog.featuredTools.length || catalog.featuredTools.length > 4 || new Set(catalog.featuredTools).size !== catalog.featuredTools.length || catalog.featuredTools.some(id => !catalog.tools.find(tool => tool.id === id)?.rules)) throw new Error('Kataloget skal fremhæve ét til fire installerbare værktøjer.');
  // Hver skill hører til præcis én kategori, så udvælgelsen i appen altid dækker hele biblioteket.
  if (!Array.isArray(catalog.categories) || !catalog.categories.length) throw new Error('Kataloget skal inddele skills i kategorier.');
  const placed = catalog.categories.flatMap(category => {
    if (!NAME.test(category.id || '') || typeof category.title !== 'string' || !category.title || typeof category.summary !== 'string' || !category.summary || !Array.isArray(category.skills) || !category.skills.length) throw new Error(`Kategorien ${category.id || '(uden id)'} mangler id, titel, beskrivelse eller skills.`);
    return category.skills;
  });
  if (new Set(catalog.categories.map(category => category.id)).size !== catalog.categories.length || placed.length !== names.size || placed.some(name => !names.has(name)) || new Set(placed).size !== placed.length) throw new Error('Hver skill skal stå i præcis én kategori.');
  if (!Array.isArray(catalog.questions) || catalog.questions.some(item => typeof item.q !== 'string' || !item.q || typeof item.a !== 'string' || !item.a)) throw new Error('Spørgsmål og svar i kataloget skal have tekst.');
  validateFeatures(catalog.features, names);
  return { version: catalog.version, checkedAt: catalog.checkedAt, controlWord: catalog.controlWord, skillDirs: catalog.skillDirs, neutralSkillDir: catalog.neutralSkillDir, rules, gitignore, questions: catalog.questions, featuredTools: catalog.featuredTools, categories: catalog.categories, features: catalog.features, skills, tools: catalog.tools };
}

// Funktionerne i appen. Hver skill hører til præcis én funktion, så et fravalg altid fjerner hele skillen.
function validateFeatures(features, names) {
  if (!Array.isArray(features) || !features.length) throw new Error('Kataloget skal beskrive appens funktioner.');
  const ids = new Set(features.map(feature => feature.id));
  if (ids.size !== features.length) throw new Error('En funktion står flere gange i kataloget.');
  for (const feature of features) {
    if (!NAME.test(feature.id || '') || typeof feature.title !== 'string' || !feature.title || typeof feature.summary !== 'string' || !feature.summary || !Array.isArray(feature.skills) || !feature.skills.length) throw new Error(`Funktionen ${feature.id || '(uden id)'} mangler id, titel, beskrivelse eller skills.`);
    if (feature.requires !== undefined && (!Array.isArray(feature.requires) || feature.requires.some(id => id === feature.id || !ids.has(id)))) throw new Error(`Funktionen ${feature.id} bygger på en ukendt funktion.`);
  }
  const placed = features.flatMap(feature => feature.skills);
  if (placed.length !== names.size || placed.some(name => !names.has(name)) || new Set(placed).size !== placed.length) throw new Error('Hver skill skal høre til præcis én funktion.');
}

module.exports = { loadLibrary, parseFrontmatter, validateSkillText, safeRelative };
