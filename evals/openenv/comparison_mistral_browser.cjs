// Read-only browser examination of the preserved, budget-stopped Mistral output.
// This never repairs generated files, calls AI, or injects DOM/storage state.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');
async function hashTree(root) {
  const hash = crypto.createHash('sha256');
  async function walk(dir, prefix = '') {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(file, relative + '/');
      else if (entry.isFile()) hash.update(relative).update('\0').update(await fs.readFile(file));
      else throw Error('Unexpected nonfile');
    }
  }
  await walk(root); return hash.digest('hex');
}
(async () => {
  const artifact = path.resolve(process.argv[2]), output = path.join(artifact, 'flow-evidence');
  await fs.mkdir(output, { recursive: false });
  const before = await hashTree(path.join(artifact, 'public'));
  const preview = await startPreview(artifact), origin = new URL(preview.url).origin;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const settings = { viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'da-DK', reducedMotion: 'reduce', deviceScaleFactor: 1 };
  const contexts = [], checks = [], captures = [], errors = [], external = [], consoleErrors = [];
  let page;
  const fresh = async () => {
    const context = await browser.newContext(settings); contexts.push(context);
    await context.route('**/*', route => {
      const url = route.request().url();
      if (/^(data|blob):/.test(url) || new URL(url).origin === origin) return route.continue();
      external.push(new URL(url).origin); return route.abort();
    });
    page = await context.newPage(); page.setDefaultTimeout(3500);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(preview.url, { waitUntil: 'networkidle' });
  };
  const capture = async (name, fullPage = false) => { await page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled', fullPage }); captures.push(name + '.png'); };
  const check = async (name, fn) => {
    try { await fn(); checks.push({ name, passed: true }); return true; }
    catch (error) { const nameOfCapture = 'failure-' + (checks.length + 1); await capture(nameOfCapture); checks.push({ name, passed: false, error: error.message.slice(0, 1400), evidence: nameOfCapture + '.png' }); return false; }
  };
  const blocked = name => checks.push({ name, passed: null, blockedBy: 'Det foregående almindelige brugertrin kunne ikke gennemføres. Ingen omgåelse eller reparation.' });
  const selectPizza = async () => { await page.locator('.restaurant-card').filter({ hasText: 'Pizzeria Roma' }).click(); await expect(page.locator('#menu-grid .menu-item').first()).toBeVisible(); };
  const openPizza = async () => { await page.locator('.menu-item').filter({ hasText: 'Margherita' }).click(); await expect(page.locator('#customize-modal')).toBeVisible(); };
  const contact = async () => { await page.getByLabel('Fulde navn').fill('Prøveperson'); await page.getByLabel('Telefonnummer').fill('12345678'); await page.getByLabel('Email (valgfrit)').fill('demo@example.test'); };
  try {
    await fresh(); await capture('desktop-loaded'); await capture('desktop-full', true);
    await check('Demo er tydeligt oplyst ved start', async () => assert.match(await page.locator('.demo-banner').innerText(), /DEMO.*Ingen reel bestilling/));
    await check('Spisesteder vises efter indlæsning', async () => await expect(page.locator('.restaurant-card')).toHaveCount(4));
    await check('Spisesteder kan nås med tastatur og har kontrolsemantik', async () => assert.equal(await page.locator('.restaurant-card').first().evaluate(el => el.tabIndex >= 0 && (el.matches('button,a[href]') || ['button', 'link'].includes(el.getAttribute('role')))), true));
    await page.setViewportSize({ width: 390, height: 844 }); await capture('mobile-loaded'); await capture('mobile-full', true);
    await check('Ingen vandret overflow på mobilforsiden', async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false));
    await page.setViewportSize(settings.viewport);
    await check('Tom ordrehistorik vises ved almindeligt klik', async () => { await page.getByRole('link', { name: 'Mine ordrer', exact: true }).click(); await expect(page.locator('body')).toContainText(/ingen.*ordrer|ingen bestillinger|endnu/i); });
    await page.goBack({ waitUntil: 'networkidle' });
    const menu = await check('Stedvalg fører til den valgte menu', async () => { await selectPizza(); await expect(page.locator('#restaurant-name')).toHaveText('Pizzeria Roma'); });
    if (menu) {
      await capture('menu-desktop'); await page.setViewportSize({ width: 390, height: 844 }); await capture('menu-mobile'); await page.setViewportSize(settings.viewport);
      await check('Tom kurv vises forståeligt og kan ikke bestilles', async () => {
        await page.locator('a.cart-link').click(); await expect(page.locator('#cart-items-list')).toContainText(/kurv er tom/i);
        await expect(page.locator('#checkout-btn')).toHaveAttribute('aria-disabled', 'true');
      });
      await page.goBack({ waitUntil: 'networkidle' });
      const options = await check('Retten kan tilpasses, og tilvalgsprisen er korrekt', async () => {
        await openPizza(); await page.getByRole('button', { name: /^Ekstra ost/ }).click(); await expect(page.locator('#modal-item-price')).toContainText('104');
      });
      if (options) {
        await capture('options-desktop');
        const added = await check('Tilføj til kurv virker gennem den synlige knap', async () => { await page.getByRole('button', { name: 'Tilføj til kurv', exact: true }).click(); await expect(page.locator('#customize-modal')).not.toBeVisible(); await expect(page.locator('#cart-count')).toHaveText('1'); });
        if (added) {
          await page.locator('a.cart-link').click();
          await check('Kurv viser ret, tilvalg og korrekt pris', async () => { await expect(page.locator('.cart-item')).toContainText('Margherita'); await expect(page.locator('.cart-item')).toContainText('Ekstra ost'); await expect(page.locator('#subtotal')).toContainText('104'); await expect(page.locator('#total')).toContainText('133'); });
          await check('Antal ændrer varepris og samlet pris korrekt', async () => { await page.getByRole('button', { name: '+', exact: true }).click(); await expect(page.locator('#subtotal')).toContainText('208'); await expect(page.locator('#total')).toContainText('237'); await page.getByRole('button', { name: '-', exact: true }).click(); await expect(page.locator('#subtotal')).toContainText('104'); });
          await capture('cart-desktop'); await page.setViewportSize({ width: 390, height: 844 }); await capture('cart-mobile'); await page.setViewportSize(settings.viewport);
          await page.locator('#checkout-btn').click();
          await check('Udfyldte kontaktoplysninger kræves før bestilling', async () => { await page.getByRole('button', { name: 'Bekræft bestilling' }).click(); assert.equal(await page.locator('#checkout-form').evaluate(form => form.checkValidity()), false); assert.match(page.url(), /checkout\.html/); });
          await check('Ugyldig e-mail afvises', async () => { await contact(); await page.getByLabel('Email (valgfrit)').fill('ugyldig'); assert.equal(await page.getByLabel('Email (valgfrit)').evaluate(el => el.validity.typeMismatch), true); await page.getByLabel('Email (valgfrit)').fill('demo@example.test'); });
          await page.getByLabel('Leveringsmetode').selectOption('pickup'); await page.getByLabel('Afhentningstid').fill('18:30');
          await check('Afhentning fjerner leveringsgebyr fra total', async () => await expect(page.locator('#checkout-total')).toContainText('104'));
          await capture('checkout-pickup-desktop'); await page.setViewportSize({ width: 390, height: 844 }); await capture('checkout-pickup-mobile'); await page.setViewportSize(settings.viewport);
          const ordered = await check('Gyldig afhentning fører til bekræftelse', async () => { await page.getByRole('button', { name: 'Bekræft bestilling' }).click(); await expect(page).toHaveURL(/confirmation\.html/); await expect(page.locator('body')).toContainText(/DEMO/); });
          if (ordered) {
            await capture('confirmation-pickup');
            await check('Ordrehistorik bevares efter genindlæsning', async () => { await page.getByRole('link', { name: /ordrer/i }).first().click(); await page.reload({ waitUntil: 'networkidle' }); await expect(page.locator('body')).toContainText('Margherita'); });
          } else { blocked('Bekræftelse og ordrehistorik efter genindlæsning'); await fs.writeFile(path.join(output, 'pickup-invalid-fields.json'), JSON.stringify(await page.locator('#checkout-form').evaluate(form => [...form.elements].filter(el => el.validity && !el.validity.valid).map(el => ({ id: el.id, type: el.type, required: el.required, visible: !!el.getClientRects().length, valueMissing: el.validity.valueMissing }))), null, 2)); }
          // Separate fresh browser profile for delivery; never fill hidden pickup fields to bypass validation.
          await fresh(); await selectPizza(); await openPizza(); await page.getByRole('button', { name: 'Tilføj til kurv', exact: true }).click(); await page.locator('a.cart-link').click(); await page.locator('#checkout-btn').click(); await contact();
          await check('Levering kræver en adresse', async () => { await page.getByRole('button', { name: 'Bekræft bestilling' }).click(); assert.equal(await page.getByLabel('Adresse', { exact: true }).evaluate(el => el.validity.valueMissing), true); });
          await page.getByLabel('Adresse', { exact: true }).fill('Eksempelvej 1, 1234 Eksempelby'); await page.getByLabel('Ønsket leveringstid').fill('19:00');
          const delivered = await check('Gyldig levering fører til bekræftelse', async () => { await page.getByRole('button', { name: 'Bekræft bestilling' }).click(); await expect(page).toHaveURL(/confirmation\.html/); });
          await capture('checkout-delivery-result');
          if (!delivered) await fs.writeFile(path.join(output, 'delivery-invalid-fields.json'), JSON.stringify(await page.locator('#checkout-form').evaluate(form => [...form.elements].filter(el => el.validity && !el.validity.valid).map(el => ({ id: el.id, required: el.required, visible: !!el.getClientRects().length, valueMissing: el.validity.valueMissing }))), null, 2));
          await page.goBack({ waitUntil: 'networkidle' });
          await check('Tøm kurv giver tydelig tom tilstand', async () => { await page.getByRole('button', { name: '×', exact: true }).click(); await expect(page.locator('#cart-items-list')).toContainText(/kurv er tom/i); });
        } else blocked('Mængde/pris, tom kurv, kontakt, afhentning, levering, bekræftelse og historik');
      } else blocked('Kurv og hele bestillingsforløbet');
    } else blocked('Menu, tilvalg, kurv, bestilling og historik');
  } catch (error) { checks.push({ name: 'Resterende forløb', passed: null, blockedBy: error.message.slice(0, 1000) }); await capture('unexpected-blocker').catch(() => {}); }
  finally { for (const context of contexts) await context.close(); await browser.close(); await preview.close(); }
  const after = await hashTree(path.join(artifact, 'public')); assert.equal(after, before);
  checks.push({ name: 'Ingen runtime-JavaScript-fejl', passed: errors.length === 0 });
  checks.push({ name: 'Ingen eksterne forespørgsler', passed: external.length === 0 });
  const result = { provider: 'mistral', model: 'mistral-medium-3-5', artifact, outputStatus: 'Interrupted after 65 completed calls including planning; unfinished artifact, no completed first-draft/QA snapshot', settings, sourceUnchanged: true, publicSHA256: before, checks, errors, consoleErrors, blockedExternalOrigins: external, captures, scope: 'Independent browser flow through visible controls; no model calls, DOM/storage injection, or source repairs' };
  await fs.writeFile(path.join(artifact, 'flow.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checks, errors, captures, sourceUnchanged: true }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
