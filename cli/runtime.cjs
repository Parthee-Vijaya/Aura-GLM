const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { VERSION, findExecutable } = require('../desktop/core/engine.cjs');
function packageName(platform, arch, musl = false) {
  if (!['linux', 'darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Aura CLI understøtter Linux, macOS og Windows på x64 og arm64.');
  return `opencode-${platform === 'win32' ? 'windows' : platform}-${arch}${arch === 'x64' ? '-baseline' : ''}${platform === 'linux' && musl ? '-musl' : ''}`;
}
function configure() {
  // En eksplicit sti har forrang. Der ændres ikke i brugerens OpenCode-installation.
  if (process.env.HARNESS_OPENCODE_PATH) return;
  const musl = process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime;
  try {
    const name = packageName(process.platform, process.arch, musl);
    process.env.HARNESS_OPENCODE_PATH = require.resolve(`${name}/bin/opencode${process.platform === 'win32' ? '.exe' : ''}`);
  } catch { /* doctor forklarer, hvis hverken pakkens eller brugerens låste motor findes. */ }
}
async function doctor(ui) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const nodeOK = major > 22 || major === 22 && minor >= 12;
  ui.line(`Node: ${process.versions.node}${nodeOK ? '' : ' · kræver mindst 22.12'}`);
  ui.line(`System: ${process.platform} ${process.arch}`);
  let gitOK = false, engineOK = false;
  try { const { stdout } = await run('git', ['--version'], { timeout: 5000, windowsHide: true }); ui.line(stdout.trim()); gitOK = true; }
  catch { ui.line('Git mangler. Kodearbejde kan bruges, men versionsgemning kræver Git.'); }
  try { await findExecutable({ timeout: 15000 }); ui.line(`OpenCode: ${VERSION} · versionskontrol bestået`); engineOK = true; }
  catch { ui.line(`OpenCode ${VERSION} mangler. Geninstallér Aura med valgfrie afhængigheder, eller sæt HARNESS_OPENCODE_PATH til din installation af netop den version.`); }
  ui.line('Kontrollen foretager ingen modelkald og installerer ingen programmer.');
  return { nodeOK, gitOK, engineOK };
}
module.exports = { packageName, configure, doctor };
