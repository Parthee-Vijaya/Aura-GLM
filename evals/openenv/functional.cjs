// Semantic browser tasks against generated snapshots. No source repairs or mock data injection.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');

async function run(artifact, kind, browser) {
  const preview = await startPreview(artifact);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(preview.url).origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  page.on('dialog', dialog => dialog.accept());
  const errors = [], checks = [], consoleMessages = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text()); });
  const check = async (name, fn) => {
    try { await fn(); checks.push({ name, passed: true }); }
    catch (error) {
      const evidence = `functional-failure-${checks.length + 1}.png`;
      await page.screenshot({ path: path.join(artifact, evidence), fullPage: true });
      checks.push({ name, passed: false, error: error.message.slice(0, 2500), evidence });
    }
  };
  try {
    await page.goto(preview.url, { waitUntil: 'networkidle' });
    if (kind === 'meetings') {
      await check('Søgning giver en tom tilstand', async () => {
        const search = page.getByLabel(/søg/i).first();
        try {
          await search.fill('zzzzingenmøder');
          await expect(page.getByText(/ingen møder|ingen resultater/i).first()).toBeVisible();
        } finally { await search.fill(''); }
      });
      await check('Tilmelding, genindlæsning og afmelding', async () => {
        await page.getByRole('button', { name: /^tilmeld/i }).first().click();
        const extra = page.locator('dialog[open]');
        if (await extra.count()) {
          for (const input of await extra.locator('input').all()) {
            const type = await input.getAttribute('type');
            if (type === 'number') await input.fill('1');
            else if (['text', 'email', null].includes(type)) await input.fill(type === 'email' ? 'proeve@example.invalid' : 'Prøveperson');
          }
          await extra.getByRole('button', { name: /bekræft|tilmeld/i }).last().click();
        }
        await page.reload();
        const tab = page.getByRole('button', { name: /^mine tilmeldinger/i });
        if (await tab.count()) await tab.first().click();
        const link = page.getByRole('link', { name: /^mine tilmeldinger/i });
        if (await link.count()) await link.first().click();
        await expect(page.getByRole('button', { name: /afmeld/i }).first()).toBeVisible();
        await page.getByRole('button', { name: /afmeld/i }).first().click();
        const confirm = page.locator('dialog[open]').getByRole('button', { name: /bekræft|ja|afmeld/i });
        if (await confirm.count()) await confirm.last().click();
        await page.reload();
        assert.equal(await page.getByRole('button', { name: /afmeld/i }).count(), 0);
        await page.goto(preview.url);
      });
      await check('Eksempelmøder er synligt mærket', async () => {
        assert.match(await page.locator('body').innerText(), /eksempel|fiktiv|demo/i);
      });
      if (path.basename(artifact) === 'revision-build') await check('Ny filtrering har en betjenelig kontrol', async () => {
        const control = page.getByRole('button', { name: /kun.*ledige/i });
        if (await control.count()) {
          await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'true');
          await control.click(); await expect(control).toHaveAttribute('aria-pressed', 'false');
        } else {
          const checkbox = page.getByRole('checkbox', { name: /kun.*ledige/i });
          await checkbox.check(); await expect(checkbox).toBeChecked(); await checkbox.uncheck();
        }
      });
    } else if (kind === 'time') {
      await check('Start og stop registrerer en opgave; data overlever genindlæsning', async () => {
        for (const [label, value] of [[/^projekt/i, 'Prøveprojekt'], [/^opgave/i, 'Pilotens opgave']]) {
          const input = page.getByLabel(label).first();
          if (await input.evaluate(el => el.tagName === 'SELECT')) {
            // Some generated apps require creating the first project/task via their own modal.
            const add = page.getByRole('button', { name: label.source.includes('projekt') ? /tilføj.*projekt/i : /tilføj.*opgave/i });
            if (await add.count()) {
              await add.click();
              await page.getByPlaceholder('Indtast navn').fill(value);
              await page.getByRole('button', { name: /^tilføj$/i }).click();
              await input.selectOption({ label: value });
            } else {
              await input.selectOption({ index: 1 });
            }
          } else await input.fill(value);
        }
        // Re-rendering the other dropdown can clear a selection in a generated app.
        // Re-select visibly through the UI; do not seed or alter its storage/code.
        for (const [label, value] of [[/^projekt/i, 'Prøveprojekt'], [/^opgave/i, 'Pilotens opgave']]) {
          const input = page.getByLabel(label).first();
          if (await input.evaluate(el => el.tagName === 'SELECT') && await input.locator('option').filter({ hasText: value }).count()) await input.selectOption({ label: value });
        }
        await page.getByRole('button', { name: /^start(?: timer)?$/i }).click();
        await page.waitForTimeout(1100);
        await page.getByRole('button', { name: /^stop(?: timer)?$/i }).click();
        await page.reload();
        await expect(page.getByText('Pilotens opgave', { exact: true }).filter({ visible: true }).last()).toBeVisible();
        assert.match(await page.locator('body').innerText(), /samlet|i alt/i);
      });
      if (path.basename(artifact) === 'revision-build') await check('CSV download indeholder registreringen og kolonnerne', async () => {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 5000 }),
          page.getByRole('button', { name: /eksport.*csv/i }).click()
        ]);
        const text = await fs.readFile(await download.path(), 'utf8');
        assert.match(text, /projekt/i); assert.match(text, /opgave/i); assert.match(text, /varighed/i); assert.match(text, /Pilotens opgave/);
      });
      await check('Sletning fjerner registreringen også efter genindlæsning', async () => {
        await page.getByRole('button', { name: /slet/i }).first().click();
        const confirmation = page.locator('dialog[open], [role=dialog]:visible, #confirmDeleteModal:visible').getByRole('button', { name: /^slet$/i });
        if (await confirmation.count()) await confirmation.last().click();
        await page.reload();
        await expect(page.locator('td').getByText('Pilotens opgave', { exact: true })).toHaveCount(0);
      });
    } else if (kind === 'rooms') {
      await check('Deltagerfilter ændrer de synlige lokaler', async () => {
        const control = page.getByLabel(/deltager|kapacitet/i).first();
        const before = await page.getByRole('button', { name: /reserv/i }).count();
        const select = await control.evaluate(el => el.tagName === 'SELECT');
        if (select) await control.selectOption({ index: 2 });
        else { await control.fill('12'); await control.dispatchEvent('input'); await control.dispatchEvent('change'); }
        const apply = page.getByRole('button', { name: /^filtr[eé]r$/i });
        if (await apply.count()) await apply.click();
        const after = await page.getByRole('button', { name: /reserv/i }).count();
        if (select) await control.selectOption({ index: 0 });
        else { await control.fill('1'); await control.dispatchEvent('input'); await control.dispatchEvent('change'); }
        if (await apply.count()) await apply.click();
        assert(after < before, 'Filteret skal reducere antallet af mulige lokaler');
      });
      await check('Reservation bevares og kan annulleres', async () => {
        await page.getByRole('button', { name: /^reservér|^reserver/i }).first().click();
        const future = new Date(Date.now() + 86400000 * 7).toISOString().slice(0, 10);
        await page.locator('input[type=date]').fill(future);
        const name = page.getByLabel(/^dit navn$/i);
        if (await name.count()) await name.fill('Prøveperson');
        const time = page.getByLabel(/tidspunkt/i);
        if (await time.count()) await time.selectOption({ index: 1 });
        await page.getByRole('button', { name: /bekræft reservation|gem reservation|reservér lokalet/i }).click();
        const final = page.getByRole('button', { name: /^bekræft$/i });
        if (await final.isVisible()) await final.click();
        await page.reload();
        await expect(page.getByRole('button', { name: /annull[eé]r/i }).first()).toBeVisible();
        await page.getByRole('button', { name: /annull[eé]r/i }).first().click();
        const yes = page.getByRole('button', { name: /ja.*annull[eé]r|bekræft|annullér reservationen/i });
        if (await yes.count()) await yes.first().click();
        await page.reload();
        await expect(page.getByRole('button', { name: /^annull[eé]r/i })).toHaveCount(0);
      });
      await check('Eksempellokaler er synligt mærket', async () => { assert.match(await page.locator('body').innerText(), /eksempel|fiktiv|demo/i); });
      if (path.basename(artifact) === 'revision-build') await check('Skærmfilter kan bruges', async () => {
        const control = page.getByRole('checkbox', { name: /skærm/i });
        const before = await page.getByRole('button', { name: /^reserv/i }).count();
        if (await control.count()) {
          await control.check(); await expect(control).toBeChecked();
          const apply = page.getByRole('button', { name: /^filtr[eé]r$/i });
          if (await apply.count()) await apply.click();
          assert(await page.getByRole('button', { name: /^reserv/i }).count() < before);
          await control.uncheck();
          if (await apply.count()) await apply.click();
        } else {
          const select = page.getByLabel(/deltager|kapacitet/i);
          await select.selectOption({ label: 'Kun med skærm' });
          assert(await page.getByRole('button', { name: /^reserv/i }).count() < before);
          await select.selectOption({ index: 0 });
        }
      });
    }
    const result = { artifact, kind, checks, pageErrors: errors, consoleMessages };
    await fs.writeFile(path.join(artifact, 'functional.json'), JSON.stringify(result, null, 2));
    return result;
  } finally { await context.close(); await preview.close(); }
}
async function main() {
  const root = path.resolve(process.argv[2]);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let failed = 0, total = 0;
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const caseFile = path.join(root, entry.name, 'case.json');
      if (!await fs.access(caseFile).then(() => true, () => false)) continue;
      const kind = JSON.parse(await fs.readFile(caseFile, 'utf8')).id;
      for (const stage of ['build', 'revision-build']) {
        const artifact = path.join(root, entry.name, stage);
        if (!await fs.access(path.join(artifact, 'public/index.html')).then(() => true, () => false)) continue;
        const result = await run(artifact, kind, browser);
        total += result.checks.length;
        failed += result.checks.filter(check => !check.passed).length + result.pageErrors.length;
        console.log(JSON.stringify({ episode: entry.name, stage, checks: result.checks }));
      }
    }
  } finally { await browser.close(); }
  console.log(JSON.stringify({ total, failed }));
  if (failed) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
