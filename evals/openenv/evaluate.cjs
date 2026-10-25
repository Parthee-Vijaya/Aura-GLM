// Browser evidence is taken from the actual generated files, never a mock UI.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../../desktop/node_modules/playwright');
const { startPreview } = require('../../desktop/core/preview.cjs');

async function inspect(artifact, browser) {
  const server = await startPreview(artifact);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errors = [], blocked = [];
  const origin = new URL(server.url).origin;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/') || /^(data|blob):/.test(url)) return route.continue();
    blocked.push(new URL(url).origin); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const views = [];
  try {
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await fs.mkdir(path.join(artifact, 'evidence'), { recursive: true });
    for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: path.join(artifact, 'evidence', name + '.png'), fullPage: true, animations: 'disabled' });
      const metrics = await page.evaluate(() => {
        const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
        const name = element => element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') || '').split(' ').map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || element.innerText?.trim() || element.title || '';
        return {
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          h1: [...document.querySelectorAll('h1')].map(element => element.textContent.trim()),
          language: document.documentElement.lang,
          unnamedButtons: [...document.querySelectorAll('button')].filter(visible).filter(element => !name(element)).length,
          unlabelledInputs: [...document.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(visible).filter(element => !(element.labels?.length || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'))).length,
          brokenImages: [...document.images].filter(visible).filter(element => !element.complete || !element.naturalWidth).length,
          bodyText: document.body.innerText.slice(0, 14000),
          controls: [...document.querySelectorAll('button,input,select,a')].filter(visible).map(element => ({ tag: element.tagName, type: element.type || '', text: name(element), placeholder: element.placeholder || '', id: element.id }))
        };
      });
      views.push({ name, width, height, ...metrics });
    }
    const result = { artifact, views, pageErrors: errors, blockedExternalOrigins: [...new Set(blocked)], automatedChecksOnly: true };
    await fs.writeFile(path.join(artifact, 'browser.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { await context.close(); await server.close(); }
}
async function main() {
  const root = path.resolve(process.argv[2]);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const stage of ['build', 'revision-build']) {
        const artifact = path.join(root, entry.name, stage);
        if (!await fs.access(path.join(artifact, 'public/index.html')).then(() => true, () => false)) continue;
        const result = await inspect(artifact, browser);
        console.log(JSON.stringify({ episode: entry.name, stage, errors: result.pageErrors.length, overflow: result.views.map(view => view.horizontalOverflow) }));
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { inspect };
