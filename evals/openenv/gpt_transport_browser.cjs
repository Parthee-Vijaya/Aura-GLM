// Diagnostic screenshots of untouched, potentially incomplete GPT trial output.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');
async function manifest(root) {
  const result = {};
  async function visit(dir) { for (const item of await fs.readdir(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isDirectory()) await visit(file); else if (item.isFile()) result[path.relative(root, file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'); else throw Error('Unexpected nonfile'); } }
  await visit(root); return result;
}
(async () => {
  const trial = path.resolve(process.argv[2]), artifact = path.join(trial, 'build'), output = path.join(trial, 'browser-diagnostic');
  await fs.mkdir(output, { recursive: false });
  const before = await manifest(path.join(artifact, 'public'));
  const preview = await startPreview(artifact), origin = new URL(preview.url).origin;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'da-DK', colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], consoleErrors = [], external = [], requests = [], views = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', item => { if (item.type() === 'error') consoleErrors.push(item.text()); });
  page.on('response', response => requests.push({ path: new URL(response.url()).pathname, status: response.status() }));
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); external.push(url.origin); return route.abort(); });
  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      await page.setViewportSize(viewport); await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' });
      views.push({ name, viewport, body: await page.locator('body').innerText(), mainCharacters: (await page.locator('main').innerText()).length, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2) });
    }
  } finally { await context.close(); await browser.close(); await preview.close(); }
  const after = await manifest(path.join(artifact, 'public'));
  const report = { browserVersion: browser.version(), artifact, scope: 'Actual unchanged partial output; no generated JavaScript was recovered or repaired by the evaluator', sourceUnchanged: JSON.stringify(before) === JSON.stringify(after), sourceFiles: before, views, requests, errors, consoleErrors, external, completedApplication: views.every(view => view.mainCharacters > 200) && requests.some(request => request.path.endsWith('/app.js') && request.status === 200) };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ completedApplication: report.completedApplication, sourceUnchanged: report.sourceUnchanged, requests, external, views: views.map(({ name, mainCharacters, overflow }) => ({ name, mainCharacters, overflow })) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
