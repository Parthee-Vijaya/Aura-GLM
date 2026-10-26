// SPDX-License-Identifier: EUPL-1.2
// Runs in a separate Electron process. No generated document is opened before
// the host has attested this process's inherited zero-network Seatbelt scope.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAppQualityInspector } = require('../../core/app-quality.cjs');
let input = '', started = false;
app.on('window-all-closed', () => {});
app.on('before-quit', event => event.preventDefault());
const watchdog = setTimeout(() => app.exit(70), 60000);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('no-pings');
// The inherited OS sandbox is authoritative; Chromium cannot nest its own
// sandbox under macOS Seatbelt. Web contents still have no Node/preload API.
process.stdin.setEncoding('utf8');
process.stdin.on('data', async chunk => {
  input += chunk;
  if (input.length > 16384 || started) return app.exit(64);
  if (!input.includes('\n')) return;
  started = true;
  try {
    const request = JSON.parse(input);
    if (request.action !== 'inspect-attested' || !path.isAbsolute(request.root) || !path.isAbsolute(request.state)) throw Error();
    app.setPath('userData', path.join(request.state, 'profile'));
    app.setPath('sessionData', path.join(request.state, 'session'));
    await app.whenReady();
    const inspector = createAppQualityInspector({ BrowserWindow, session, directory: path.join(request.state, 'reports') });
    const report = await inspector({ root: request.root });
    await fs.writeFile(path.join(request.state, 'result.json'), JSON.stringify(report), { mode: 0o600 });
    clearTimeout(watchdog); app.exit(0);
  } catch { clearTimeout(watchdog); app.exit(70); }
});
process.stdin.on('end', () => { if (!started) app.exit(64); });
