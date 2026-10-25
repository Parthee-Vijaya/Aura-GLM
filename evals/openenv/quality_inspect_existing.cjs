// Read-only repetition of the product inspector on already generated real apps.
// This is not another model attempt and never repairs source files.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { createAppQualityInspector, snapshotApp } = require('../../desktop/core/app-quality.cjs');
const input = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
require('node:fs').mkdirSync(output, { recursive: false });
app.setName('Aura quality evidence'); app.setPath('userData', path.join(output, 'profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const inspect = createAppQualityInspector({ BrowserWindow, session, directory: path.join(output, 'reports') });
    const results = [];
    for (const provider of ['mistral', 'corti'].filter(name => !process.argv[4] || name === process.argv[4])) {
      const root = path.join(input, provider + '-food', 'build'), before = await snapshotApp(root);
      const report = await inspect({ root });
      assert.equal((await snapshotApp(root)).fingerprint, before.fingerprint);
      results.push({ provider, root, sourceUnchanged: true, report });
      console.log(JSON.stringify({ provider, status: report.status, findings: report.findings, clicks: report.clicks, screenshots: report.screenshots }));
    }
    const inspectorSHA256 = crypto.createHash('sha256').update(await fs.readFile(path.resolve(__dirname, '../../desktop/core/app-quality.cjs'))).digest('hex');
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ scope: 'Read-only inspector repetition; no model calls or repairs', inspectorSHA256, results }, null, 2));
    assert.equal(BrowserWindow.getAllWindows().length, 0); app.exit(0);
  } catch (error) { console.error(error.message); app.exit(1); }
});
