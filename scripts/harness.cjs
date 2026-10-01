#!/usr/bin/env node
const path = require('node:path');
const readline = require('node:readline/promises');
const { loadLibrary } = require('../desktop/core/library.cjs');
const { layoutFor } = require('../desktop/core/adapters.cjs');
const installer = require('../desktop/core/installer.cjs');

const help = `Aura Harness i dit eget kodeværktøj

Brug:
  node scripts/harness.cjs tools
  node scripts/harness.cjs install --tools claude-code,cursor --project ../mit-projekt [--yes] [--skip-conflicts]
  node scripts/harness.cjs status --project ../mit-projekt
  node scripts/harness.cjs remove --project ../mit-projekt [--yes]

install viser først de præcise ændringer. Intet skrives uden --yes eller en bekræftelse.
Et tidligere udvalg af skills og integrationer fra appen bevares. Ellers følger alle skills med undtagen integrationer.
Eksisterende filer overskrives aldrig; Aura Harness tilføjer et afgrænset afsnit eller springer filen over.`;

const labels = { opret: 'opret', tilfoej: 'tilføj afsnit', opdater: 'opdatér', uaendret: 'uændret', konflikt: 'KONFLIKT', fjern: 'fjern', 'fjern-afsnit': 'fjern afsnit', bevar: 'bevar' };

function options(argv) {
  const result = { command: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--yes') result.yes = true;
    else if (argv[i] === '--skip-conflicts') result.skipConflicts = true;
    else if (['--tools', '--project'].includes(argv[i]) && argv[i + 1]) result[argv[i].slice(2)] = argv[++i];
    else throw new Error(`Ukendt argument: ${argv[i]}\n\n${help}`);
  }
  return result;
}

function print(plan, warnings = []) {
  console.log(`Projekt: ${plan.root}`);
  if (plan.manifest) console.log(`Installeret nu: version ${plan.manifest.version} til ${plan.manifest.tools.join(', ')}`);
  for (const op of plan.operations) console.log(`  ${labels[op.action].padEnd(14)} ${op.path}${op.reason ? `  (${op.reason})` : ''}`);
  for (const warning of warnings) console.log(`Bemærk: ${warning}`);
  if (plan.conflicts.length) console.log(`\n${plan.conflicts.length} konflikt(er). Filerne skrives ikke. Brug --skip-conflicts for at installere resten.`);
}

async function confirm(question, yes) {
  if (yes) return true;
  if (!process.stdin.isTTY) { console.log('\nIntet er skrevet. Kør igen med --yes for at gennemføre.'); return false; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return /^(j|ja|y|yes)$/i.test((await rl.question(`${question} (j/N) `)).trim()); } finally { rl.close(); }
}

async function main() {
  const args = options(process.argv.slice(2));
  const library = await loadLibrary(path.join(__dirname, '..', 'profiles'));
  if (args.command === 'tools') {
    for (const tool of library.tools) console.log(`${tool.id.padEnd(16)} ${tool.name}${tool.category === 'web' ? ' (webplatform, kopiér tekst fra webguiden)' : ''}`);
    return;
  }
  if (!args.project) throw new Error(help);
  if (args.command === 'status') {
    const { root, manifest } = await installer.status(args.project);
    console.log(manifest ? `${root}: Aura Harness ${manifest.version} til ${manifest.tools.join(', ')}. Installeret ${manifest.installedAt || 'manuelt'} (${manifest.timeSource}).` : `${root}: ingen Aura Harness-installation.`);
    return;
  }
  if (args.command === 'install') {
    if (!args.tools) throw new Error(help);
    // Et tidligere udvalg bevares, også integrationer valgt i appen. Skills, der ikke længere findes, springes over.
    const { manifest } = await installer.status(args.project);
    const chosen = Array.isArray(manifest?.skills) ? manifest.skills.filter(name => library.skills.some(skill => skill.name === name)) : undefined;
    const layout = layoutFor(library, args.tools.split(',').map(tool => tool.trim()).filter(Boolean), { skills: chosen });
    const settings = { version: library.version, tools: layout.tools, skills: layout.skills };
    const plan = await installer.plan(args.project, layout.entries, settings);
    print(plan, layout.warnings);
    if (plan.conflicts.length && !args.skipConflicts) { process.exitCode = 2; return; }
    if (!(await confirm('\nInstaller disse ændringer?', args.yes))) return;
    const result = await installer.apply(args.project, layout.entries, settings, plan.token, { skipConflicts: args.skipConflicts });
    console.log(`\nAura Harness ${result.manifest.version} er installeret. Gennemgå ændringerne i Git, før du gemmer en version.`);
    return;
  }
  if (args.command === 'remove') {
    const plan = await installer.planRemoval(args.project);
    print(plan);
    if (!(await confirm('\nFjern Aura Harness fra projektet?', args.yes))) return;
    const result = await installer.remove(args.project, plan.token);
    console.log(`\nAura Harness er fjernet.${result.kept.length ? ` Disse ændrede filer er bevaret: ${result.kept.join(', ')}` : ''}`);
    return;
  }
  throw new Error(help);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
