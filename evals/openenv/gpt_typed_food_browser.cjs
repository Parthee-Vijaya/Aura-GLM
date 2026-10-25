// Browser evidence for the untouched output of the typed GPT transport trial.
// The evaluator never changes generated application source or calls a model.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');
async function manifest(root) {
  const files = {};
  async function visit(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) files[path.relative(root, file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
      else throw Error('Unexpected nonfile');
    }
  }
  await visit(root); return files;
}
(async () => {
  const trial = path.resolve(process.argv[2]), artifact = path.join(trial, 'build'), output = path.join(trial, 'browser-functional');
  await fs.mkdir(output, { recursive: false });
  const before = await manifest(path.join(artifact, 'public'));
  const preview = await startPreview(artifact), origin = new URL(preview.url).origin;
  const browser = await chromium.launch({ headless: true });
  const report = { scope: 'Actual generated app after the Aura run hit its 900-second deadline; no handwritten source fixes and no further AI calls', browserVersion: browser.version(), artifact, sourceFiles: before, views: [], checks: [], errors: [], consoleErrors: [], external: [], requests: [] };
  try {
    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'da-DK', colorScheme: 'light', reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => report.errors.push({ view: name, message: error.message }));
      page.on('console', item => { if (item.type() === 'error') report.consoleErrors.push({ view: name, message: item.text() }); });
      page.on('response', response => report.requests.push({ view: name, path: new URL(response.url()).pathname, status: response.status() }));
      await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue(); report.external.push({ view: name, origin: url.origin }); return route.abort(); });
      const check = (label, details = {}) => report.checks.push({ view: name, label, passed: true, ...details });
      const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('madklar.demo.v1')));
      const shot = async label => {
        await page.evaluate(() => window.scrollTo(0, 0));
        const filename = name + '-' + label + '.png';
        await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
        report.views.push({ name, label, viewport, file: filename, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), mainCharacters: (await page.locator('main').innerText()).length });
      };
      const openCart = async () => { if (name === 'mobile') await page.locator('#mobile-cart button').click(); };
      const closeCart = async () => { if (name === 'mobile') await page.locator('#modal [data-action=close]').click(); };
      const cartScope = () => name === 'mobile' ? page.locator('#modal') : page.locator('.menu-layout .cart-panel');
      try {
        await page.goto(preview.url, { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: 'Vælg spisested', exact: true })).toBeVisible();
        assert.equal(await page.locator('.restaurant-card').count(), 3); check('Three fictional restaurants and explicit demo');
        await expect(page.locator('.demo-badge')).toContainText('Ingen bestilling sendes');
        await shot('home');
        await page.locator('[data-action=restaurant][data-id=forno]').click();
        await expect(page.getByRole('heading', { name: 'Forno & Dej', exact: true })).toBeVisible();
        await shot('menu');
        await openCart(); await expect(cartScope()).toContainText('Der er plads til noget godt.');
        assert.equal(await cartScope().locator('[data-action=checkout]').count(), 0); check('Empty cart has no checkout'); await closeCart();
        await page.getByLabel('Find en ret').fill('zzzz');
        await expect(page.getByRole('heading', { name: 'Ingen retter fundet' })).toBeVisible();
        await page.getByRole('button', { name: 'Nulstil søgning' }).click();
        assert.equal(await page.locator('#dish-list .dish').count(), 5); check('Menu search and reset');
        await page.locator('[data-action=dish][data-id=margherita]').click();
        await page.getByRole('checkbox', { name: /Ekstra ost/ }).check();
        await page.getByRole('checkbox', { name: /Chili/ }).check();
        await page.getByLabel('Antal', { exact: true }).fill('2');
        await expect(page.locator('#add-dish')).toContainText('204');
        await page.locator('#add-dish').click();
        assert.equal((await state()).cart[0].unitPrice, 102); assert.equal((await state()).cart[0].quantity, 2); check('Pizza extras and quantity total 204 DKK');
        await openCart();
        await cartScope().getByRole('button', { name: 'Tilføj én Margherita', exact: true }).click();
        assert.equal((await state()).cart[0].quantity, 3); await expect(cartScope().locator('.grand')).toContainText('306'); check('Quantity update total 306 DKK');
        await shot('cart');
        await cartScope().locator('[data-action=checkout]').click();
        await page.getByRole('radio', { name: /Levering/ }).check();
        await expect(page.locator('#checkout-form button[type=submit]')).toContainText('335'); check('Delivery adds restaurant fee 29 DKK');
        await page.getByLabel('Navn', { exact: true }).fill('');
        await page.getByLabel('Telefon, 8 cifre').fill('12');
        await page.locator('#checkout-form button[type=submit]').click();
        assert.equal(await page.locator('[aria-invalid=true]').count(), 2); assert.equal((await state()).orders.length, 0); check('Invalid contact blocks order with readable errors');
        await page.getByLabel('Navn', { exact: true }).fill('Demo Tester');
        await page.getByLabel('Telefon, 8 cifre').fill('00000000');
        await page.getByLabel('Adresse', { exact: true }).fill('Eksempelvej 10');
        await page.getByLabel('Postnummer', { exact: true }).fill('1234');
        await page.getByLabel('By', { exact: true }).fill('Demoby');
        await shot('checkout');
        await page.locator('#checkout-form button[type=submit]').click();
        await expect(page.getByRole('heading', { name: 'Din demoordre er gemt' })).toBeVisible();
        assert.equal((await state()).orders[0].total, 335); assert.equal((await state()).cart.length, 0); check('Delivery confirmation and persisted order total 335 DKK');
        await shot('confirmation');
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('header [data-action=history]').click();
        assert.equal(await page.locator('.order-card').count(), 1); await expect(page.locator('.order-card')).toContainText('Demo Tester'); check('History survives browser reload');
        await page.locator('header [data-action=home]').click();
        await page.locator('[data-action=restaurant][data-id=forno]').click();
        await page.locator('[data-action=dish][data-id=margherita]').click();
        await page.locator('#add-dish').click();
        await openCart(); await cartScope().locator('[data-action=checkout]').click();
        await page.getByRole('radio', { name: /Afhent selv/ }).check();
        await expect(page.locator('#checkout-form button[type=submit]')).toContainText('85');
        await page.locator('#checkout-form button[type=submit]').click();
        assert.equal((await state()).orders.length, 2); assert.equal((await state()).orders[0].total, 85); check('Pickup order has no delivery fee');
        await page.locator('header [data-action=home]').click();
        await page.locator('[data-action=restaurant][data-id=forno]').click();
        await page.locator('[data-action=dish][data-id=margherita]').click();
        await page.keyboard.press('Escape'); await expect(page.locator('#modal')).not.toBeVisible(); check('Keyboard Escape dismisses item dialog');
        await page.locator('[data-action=dish][data-id=margherita]').click(); await page.locator('#add-dish').click();
        await page.reload({ waitUntil: 'networkidle' });
        await page.locator('[data-action=restaurant][data-id=forno]').click();
        assert.equal((await state()).cart.length, 1); check('Draft cart survives browser reload');
        await page.locator('header [data-action=home]').click();
        await page.locator('[data-action=restaurant][data-id=grill]').click();
        await expect(page.getByRole('heading', { name: 'Skift spisested?' })).toBeVisible();
        await page.getByRole('button', { name: 'Behold kurven' }).click(); assert.equal((await state()).cart.length, 1);
        await page.locator('[data-action=restaurant][data-id=grill]').click();
        await page.getByRole('button', { name: 'Tøm kurv og skift' }).click(); assert.equal((await state()).cart.length, 0);
        await expect(page.getByRole('heading', { name: 'Hjørnets Grill' })).toBeVisible(); check('Restaurant switch requires explicit cart-clear confirmation');
      } catch (error) { report.checks.push({ view: name, label: 'Flow aborted', passed: false, message: error.message }); await page.screenshot({ path: path.join(output, name + '-failure.png'), animations: 'disabled' }); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); await preview.close(); }
  report.sourceUnchanged = JSON.stringify(before) === JSON.stringify(await manifest(path.join(artifact, 'public')));
  report.passed = report.sourceUnchanged && report.checks.every(check => check.passed) && report.views.every(view => !view.overflow) && !report.errors.length && !report.consoleErrors.length && !report.external.length;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter(check => !check.passed), sourceUnchanged: report.sourceUnchanged, errors: report.errors, consoleErrors: report.consoleErrors, external: report.external, overflow: report.views.filter(view => view.overflow), screenshots: report.views.map(view => view.file) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
