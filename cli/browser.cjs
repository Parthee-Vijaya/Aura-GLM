const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const run = promisify(execFile);
function browserCommand(address, platform = process.platform, env = process.env) {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\r\n\0]/.test(address)) throw new Error('Browseradressen er ugyldig.');
  if (platform === 'darwin') return ['/usr/bin/open', [url.href]];
  if (platform === 'win32') return [path.win32.join(env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [url.href]];
  return ['xdg-open', [url.href]];
}
async function openBrowser(url, ui) {
  const [command, args] = browserCommand(url);
  try { await run(command, args, { timeout: 10000, windowsHide: true }); }
  catch { ui.line('Browseren kunne ikke åbnes. Åbn adressen på samme computer:'); ui.line(url); }
}
module.exports = { browserCommand, openBrowser };
