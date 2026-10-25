// User journeys against unchanged AI-generated food-app snapshots. No source repair.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');

async function run(root, provider, browser) {
  const artifact = path.join(root, provider + '-food', 'build');
  const preview = await startPreview(artifact);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [], checks = [], blocked = [], captures = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === new URL(preview.url).origin || /^(data|blob):/.test(url)) return route.continue();
    blocked.push(new URL(url).origin); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  const capture = async name => {
    const file = name + '.png'; await page.screenshot({ path: path.join(artifact, 'evidence', file), animations: 'disabled' }); captures.push(file);
  };
  const check = async (name, fn) => {
    try { await fn(); checks.push({ name, passed: true }); return true; }
    catch (error) { const file = 'failure-' + (checks.length + 1); await capture(file); checks.push({ name, passed: false, error: error.message.slice(0, 1500), evidence: file + '.png' }); return false; }
  };
  try {
    await fs.mkdir(path.join(artifact, 'evidence'), { recursive: true });
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    await capture('desktop-viewport');
    await check('Demo fremgår tydeligt på forsiden', async () => assert.match(await page.locator('body').innerText(), /demo.*(?:fiktiv|ingen rigtige)/i));
    await check('Søgning viser tom tilstand og kan nulstilles', async () => {
      const input = provider === 'corti' ? page.getByLabel('Søg efter spisested eller mad') : page.getByPlaceholder('Søg efter restauranter...');
      await input.fill('zzzzingenmad'); await expect(page.getByText(/ingen (steder|restauranter)/i).first()).toBeVisible(); await input.fill('');
    });
    await page.setViewportSize({ width: 390, height: 844 }); await capture('mobile-viewport');
    await check('Mobilforsiden har ingen vandret afskæring', async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false));
    await page.evaluate(() => scrollTo(0, 900)); await capture('mobile-scrolled');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => scrollTo(0, 0));
    let menuReady = await check('Valg af restaurant viser retter med priser og tilføj-knapper', async () => {
      await page.locator(provider === 'corti' ? '[data-restaurant="vesuv"]' : '.restaurant-card').first().click();
      await expect(page.getByRole('button', { name: 'Tilføj til kurv', exact: true }).first()).toBeVisible();
      assert.match(await page.locator('body').innerText(), /89[,.]?00?\s*(?:DKK|kr)|89\s*(?:DKK|kr)/i);
    });
    if (!menuReady && provider === 'corti' && await page.locator('#menu-retry').isVisible()) {
      menuReady = await check('Efter fejlen kan brugeren komme videre med Prøv igen', async () => {
        await page.locator('#menu-retry').click();
        await expect(page.getByRole('button', { name: 'Tilføj til kurv', exact: true }).first()).toBeVisible();
      });
    }
    await capture('menu-desktop');
    if (!menuReady) {
      checks.push({ name: 'Tilvalg, kurv, bestilling og ordrehistorik', passed: false, blockedBy: 'Menuen viste ingen fungerende tilføj-knapper; ingen testdata injiceret for at omgå fejlen.' });
    } else if (provider === 'corti') {
      const customized = await check('Pizza kan tilpasses og prisen inkluderer tilvalg', async () => {
        await page.getByRole('button', { name: 'Tilføj til kurv', exact: true }).first().click();
        const dialog = page.locator('#options-dialog'); await expect(dialog).toBeVisible();
        await dialog.getByLabel(/Familie/).check(); await dialog.getByLabel(/Ekstra ost/).check();
        await capture('pizza-options');
        await dialog.getByRole('button', { name: 'Tilføj til kurv', exact: true }).click();
        await page.locator('#cart-button').click();
        await expect(page.locator('#cart-content')).toContainText('139,00');
        await expect(page.locator('#cart-content')).toContainText('Ekstra ost');
      });
      if (customized) {
        await check('Antal ændrer totalen begge veje', async () => {
          await page.getByRole('button', { name: /Én mere/ }).click(); await expect(page.locator('.cart-total:visible')).toContainText('278,00');
          await page.getByRole('button', { name: /Én mindre/ }).click(); await expect(page.locator('.cart-total:visible')).toContainText('139,00');
        });
        await capture('cart-desktop');
        await page.getByRole('button', { name: 'Videre til bestilling', exact: true }).click();
        await check('Ufuldstændig bestilling afvises ved felterne', async () => {
          await page.getByRole('button', { name: 'Bestil nu', exact: true }).click();
          await expect(page.locator('#e-name')).not.toBeEmpty(); await expect(page.locator('#e-phone')).not.toBeEmpty();
          await expect(page.locator('#screen-checkout')).toBeVisible();
        });
        await check('Afhentning fjerner kravet om leveringsadresse', async () => {
          await page.getByLabel('Afhentning hos spisestedet').check(); await expect(page.locator('#address-field')).toBeHidden();
        });
        const ordered = await check('Bestil viser bekræftelse med samme pris og tydelig demo', async () => {
          await page.locator('#f-name').fill('Prøveperson'); await page.locator('#f-phone').fill('12345678');
          await page.getByRole('button', { name: 'Bestil nu', exact: true }).click();
          await expect(page.locator('#screen-confirm')).toBeVisible();
          await expect(page.locator('#confirm-content')).toContainText('139,00');
          await expect(page.locator('#confirm-content')).toContainText(/demo|demonstration/i);
          await capture('confirmation-desktop');
        });
        if (ordered) await check('Ordrehistorik overlever genindlæsning', async () => {
          await page.reload(); await page.locator('#nav-orders').click();
          await expect(page.locator('#orders-content')).toContainText('Vesuv Classica');
          await expect(page.locator('#orders-content')).toContainText('139,00'); await capture('orders-desktop');
        });
      }
    }
    checks.push({ name: 'Ingen JavaScript-fejl gennem forløbet', passed: errors.length === 0 });
    checks.push({ name: 'Ingen eksterne forespørgsler eller rigtig ordreafsendelse', passed: blocked.length === 0 });
    const result = { provider, artifact, checks, errors, blockedExternalOrigins: [...new Set(blocked)], captures,
      limits: ['Fiktive lokale ordrer; ingen rigtig betaling eller restaurantintegration', 'Uændret første genererede kode; ingen manuel reparation', 'Browserkontrol af snapshots; ikke fuld installeret-DMG-test'] };
    await fs.writeFile(path.join(artifact, 'food-functional.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ provider, passed: checks.filter(c => c.passed).length, total: checks.length, errors }));
  } finally { await context.close(); await preview.close(); }
}
(async () => { const root = path.resolve(process.argv[2]); const browser = await chromium.launch({ channel: 'chrome', headless: true }); try { for (const provider of ['mistral', 'corti']) await run(root, provider, browser); } finally { await browser.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });
