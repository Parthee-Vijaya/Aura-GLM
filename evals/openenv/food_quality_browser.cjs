// Independent user journeys on real, unchanged model output. No AI or source repair.
// Selectors reflect the observed food outputs in model-independent-quality-20261025.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');

async function treeHash(root) {
  const hash = crypto.createHash('sha256');
  async function visit(directory, prefix = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name, file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file, name + '/');
      else if (entry.isFile()) hash.update(name).update('\0').update(await fs.readFile(file)).update('\0');
      else throw Error('Unexpected non-file artifact');
    }
  }
  await visit(root); return hash.digest('hex');
}
async function run(root, provider, browser) {
  const artifact = path.join(root, provider + '-food', 'build'), output = path.join(artifact, 'flow-evidence');
  const before = await treeHash(path.join(artifact, 'public'));
  const preview = await startPreview(artifact), origin = new URL(preview.url).origin;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const checks = [], errors = [], blocked = [], captures = [];
  await fs.mkdir(output, { recursive: true });
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === origin || /^(data|blob):/.test(url)) return route.continue();
    blocked.push(new URL(url).origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const capture = async name => { await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled' }); captures.push(name + '.png'); };
  const check = async (name, action) => {
    try { await action(); checks.push({ name, passed: true }); return true; }
    catch (error) { const evidence = 'failure-' + (checks.length + 1); await capture(evidence); checks.push({ name, passed: false, error: error.message.slice(0, 1800), evidence: evidence + '.png' }); return false; }
  };
  const text = () => page.locator('body').innerText();
  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    await expect(page.getByText('Se menu', { exact: true }).first()).toBeVisible();
    await capture('desktop-loaded');
    await check('Tydelig demo og ingen rigtig ordre på forsiden', async () => assert.match(await text(), /demo.*(?:fiktiv|ingen reel|ikke.*spisesteder)/i));
    await check('Søgning, tomt resultat og nulstilling', async () => {
      await page.locator('#search-input').fill('zzzzingenmad');
      await page.locator(provider === 'corti' ? '#search-submit' : '#search-btn').click();
      await expect(page.getByText(/ingen (resultater|restauranter|spisesteder)/i).first()).toBeVisible();
      await page.locator('#search-input').fill('');
      await page.locator(provider === 'corti' ? '#search-submit' : '#search-btn').click();
      await expect(page.getByText('Se menu', { exact: true }).first()).toBeVisible();
    });
    await page.setViewportSize({ width: 390, height: 844 }); await capture('mobile-loaded');
    await check('Mobilforside uden vandret afskæring', async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false));
    await page.setViewportSize({ width: 1440, height: 900 });
    const menu = await check('Første menuåbning viser retter uden genforsøg', async () => {
      await page.getByText('Se menu', { exact: true }).first().click();
      await expect(page.getByRole('button', { name: provider === 'corti' ? 'Tilføj til kurv' : 'Tilpas og tilføj', exact: true }).first()).toBeVisible();
    });
    await capture('menu');
    if (!menu) checks.push({ name: 'Tilvalg, kurv, bestilling og historik', passed: false, blockedBy: 'Menuåbning mislykkedes; ingen omgåelse.' });
    else {
      let added;
      if (provider === 'corti') {
        added = await check('Pizza med tilbehør giver korrekt pris 120 kr.', async () => {
          await page.locator('[data-item="pizza-salame"]').click();
          await page.getByLabel(/Ekstra ost/).check();
          await expect(page.locator('#extras-total')).toContainText('120,00'); await capture('options');
          await page.getByRole('button', { name: 'Læg i kurv', exact: true }).click();
          await page.locator('#cart-button').click();
          await expect(page.locator('#cart-foot')).toContainText('120,00');
        });
      } else {
        added = await check('Pizza med tilbehør giver korrekt pris 104 kr.', async () => {
          await page.locator('[data-item-id="101"].customize-btn').click();
          await page.getByLabel(/Pepperoni/).check(); await capture('options');
          await page.locator('#customize-confirm').click(); await page.locator('#cart-btn').click();
          await expect(page.locator('#cart-summary')).toContainText('104,-');
        });
      }
      if (added) {
        await check('Antal og total opdateres begge veje', async () => {
          await page.locator(provider === 'corti' ? '.qty-plus' : '[data-action="increase"]').click();
          await expect(page.locator(provider === 'corti' ? '#cart-foot' : '#cart-summary')).toContainText(provider === 'corti' ? '240,00' : '208,-');
          await page.locator(provider === 'corti' ? '.qty-minus' : '[data-action="decrease"]').click();
          await expect(page.locator(provider === 'corti' ? '#cart-foot' : '#cart-summary')).toContainText(provider === 'corti' ? '120,00' : '104,-');
        });
        await capture('cart');
        await page.getByText(provider === 'corti' ? 'Videre til bestilling' : 'Gå til bestilling', { exact: true }).click();
        const submit = page.getByRole('button', { name: provider === 'corti' ? 'Bestil (demo)' : 'Bestil', exact: true });
        await check('Udfyldning kræves før bestilling', async () => {
          await submit.click();
          if (provider === 'corti') { await expect(page.locator('#err-name')).not.toBeEmpty(); await expect(page.locator('#err-phone')).not.toBeEmpty(); }
          else assert.equal(await page.locator('#checkout-form').evaluate(e => e.checkValidity()), false);
        });
        await check('Afhentning kræver ikke en leveringsadresse', async () => {
          if (provider === 'corti') { await page.getByLabel('Afhentning', { exact: true }).check(); await expect(page.locator('#f-address')).toHaveCount(0); }
          else { await page.locator('#delivery').selectOption('pickup'); assert.equal(await page.locator('#address').evaluate(e => e.required), false); }
        });
        // A failed pickup requirement is retained. Use the normal delivery path for the next independent check.
        await page.locator(provider === 'corti' ? '#f-name' : '#name').fill('Prøveperson');
        await page.locator(provider === 'corti' ? '#f-phone' : '#phone').fill('12345678');
        if (provider === 'mistral') { await page.locator('#delivery').selectOption('delivery'); await page.locator('#address').fill('Eksempelvej 1'); }
        await capture('checkout');
        const ordered = await check('Bestilling når lokal bekræftelse med demo', async () => {
          await submit.click(); await expect(page.getByRole('heading', { name: 'Tak for din bestilling!', exact: true })).toBeVisible();
          assert.match(await text(), /demo/i); await capture('confirmation');
        });
        if (ordered) await check('Ordrehistorik og pris bevares efter genindlæsning', async () => {
          await page.reload({ waitUntil: 'networkidle' });
          await page.locator(provider === 'corti' ? '[data-nav="orders"]' : '#orders-btn').click();
          await expect(page.locator(provider === 'corti' ? '#view' : '#orders-list')).toContainText(provider === 'corti' ? '120,00' : '104,-');
          await expect(page.locator(provider === 'corti' ? '#view' : '#orders-list')).toContainText(provider === 'corti' ? 'Salame Piccante' : 'Margherita'); await capture('orders');
        });
      }
    }
  } catch (error) { checks.push({ name: 'Forløbets opsætning', passed: false, error: error.message.slice(0, 1800) }); await capture('flow-stopped'); }
  finally { await context.close(); await preview.close(); }
  checks.push({ name: 'Ingen JavaScript-fejl under det afprøvede forløb', passed: errors.length === 0 });
  checks.push({ name: 'Ingen ekstern forespørgsel eller rigtig ordre', passed: blocked.length === 0 });
  const after = await treeHash(path.join(artifact, 'public'));
  assert.equal(after, before);
  const result = { provider, artifact, publicSHA256: before, sourceUnchanged: true, checks, errors, blockedExternalOrigins: [...new Set(blocked)], captures,
    scope: 'Independent browser user journey, not part of the product automatic smoke check',
    limits: ['Fresh isolated browser profile; fictional local orders only', 'No handwritten or extra AI repair', 'Observed pickup/delivery path only, not all permutations or a full accessibility audit'] };
  await fs.writeFile(path.join(artifact, 'flow.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ provider, checks: checks.map(({ name, passed }) => ({ name, passed })), errors, sourceUnchanged: true }));
}
(async () => {
  const root = path.resolve(process.argv[2]), browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { for (const provider of ['mistral', 'corti']) await run(root, provider, browser); } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
