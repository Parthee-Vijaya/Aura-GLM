// Kører imod Komplais isolerede HTTP-fixture med rigtig JWT, PostgreSQL og OpenFGA.
// Identitetsudsteder og Scaleway er kontrollerede stand-ins. Der bruges ingen rigtige konti eller rigtigt AI-forbrug.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');

async function main() {
  const api = process.env.AURA_KOMPLAI_TEST_API;
  if (!api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) throw new Error('Start Komplais lokale aura-http.integration.test.ts med AURA_DESKTOP_PATH.');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-komplai-desktop-'))), project = path.join(root, 'Prøveprojekt med mellemrum'), file = path.join(project, 'public', 'index.html');
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '<h1>Før ændringen</h1>');
  let app; const errors = [];
  const phase = async mode => { const r = await fetch(api + '/fixture/phase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, file }) }); assert.equal(r.status, 200); };
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await app.evaluate(({ shell, safeStorage }, api) => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        const address = String(url);
        if (address.startsWith('https://api.komplai.dk/v1/aura/')) return original(address.replace('https://api.komplai.dk', api), options);
        if (address === 'https://auth.komplai.dk/oauth/v2/token') return original(api + '/fixture/token', { method: 'POST' });
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(address)) throw new Error('Testen må kun kontakte lokale tjenester.');
        return original(url, options);
      };
      shell.openExternal = async address => {
        const url = new URL(address); if (url.origin !== 'https://auth.komplai.dk') throw new Error('Ukendt testadresse');
        const callback = new URL(url.searchParams.get('redirect_uri')); callback.searchParams.set('state', url.searchParams.get('state')); callback.searchParams.set('code', 'syntetisk-kode');
        const response = await original(callback); if (!response.ok) throw new Error('Login blev afvist');
      };
      // Undgår adgang til testmaskinens rigtige nøglering. Det almindelige krypteringskald og lager bruges fortsat.
      safeStorage.isEncryptionAvailable = () => true;
      safeStorage.encryptString = value => Buffer.from('test:' + Buffer.from(value).toString('base64'));
      safeStorage.decryptString = value => Buffer.from(value.toString().slice(5), 'base64').toString();
    }, api);
    const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message)); await page.emulateMedia({ reducedMotion: 'reduce' });
    await helpers.skipIntroduction(page);
    await helpers.openSetup(page); await page.click('#setup-add-provider'); await page.click('#provider-cards [data-kind="komplai"]');
    assert.equal(await page.locator('#api-key').isVisible(), false); assert.equal(await page.locator('#save-connection').isVisible(), false);
    await page.screenshot({ path: path.join(root, 'komplai-login.png') });
    await page.click('#komplai-login'); await page.waitForSelector('#komplai-organisations:not([hidden])');
    await page.click('#komplai-cancel');
    assert.equal(await page.locator('#komplai-organisations').isVisible(), false);
    assert.equal(await page.locator('#komplai-login').isVisible(), true);
    assert.equal(await page.locator('#setup-title').textContent(), 'Log ind med komplai');
    await page.click('#komplai-login'); await page.waitForSelector('#komplai-organisations:not([hidden])');
    assert(await page.locator('#komplai-connect :is(button, select, summary):visible').count() <= 4);
    assert.match(await page.locator('#komplai-credit-summary').textContent(), /Syntetisk prøvekommune.*denne måned/);
    assert.doesNotMatch(await page.locator('#komplai-connect').innerText(), /Scaleway|Hetzner/);
    await page.locator('#komplai-connect summary').click();
    assert.match(await page.locator('#komplai-connect').innerText(), /Scaleway/);
    assert.match(await page.locator('#komplai-connect').innerText(), /Hetzner/);
    await page.locator('#komplai-connect summary').click();
    await page.screenshot({ path: path.join(root, 'organisation.png') });
    await page.click('#komplai-confirm'); await page.waitForSelector('#setup-continue:not([disabled])'); await page.click('#setup-continue');
    const connected = (await page.evaluate(() => window.harness.connectionState())).value.connections.find(c => c.kind === 'komplai');
    await app.evaluate((_, options) => {
      const { KomplaiLiveBudget, budgetedFetch } = process.getBuiltinModule('module').createRequire(options.module)(options.module);
      globalThis.komplaiTestBudget = new KomplaiLiveBudget(options);
      globalThis.fetch = budgetedFetch(globalThis.fetch, globalThis.komplaiTestBudget);
    }, { organisationId: connected.account.organisationId, modelId: 'synthetic-code', module: path.join(__dirname, 'komplai-live-budget.cjs') });
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
    await page.click('#open');
    await page.waitForFunction(() => document.querySelector('#model-select').value === 'synthetic-code');
    await helpers.selectMode(page, 'free');
    async function send(message) {
      await page.fill('#prompt', message); await page.click('#send');
      await page.waitForFunction(() => document.querySelector('#data-dialog').open || !document.querySelector('#stop').hidden);
      if (await page.locator('#data-dialog').evaluate(el => el.open)) {
        assert.equal(await page.locator('#data-details').isVisible(), false);
        assert.doesNotMatch(await page.locator('#data-dialog').innerText(), /Scaleway|Hetzner/);
        assert.match(await page.locator('#data-summary').innerText(), /komplai/i);
        await page.screenshot({ path: path.join(root, 'komplai-data-resume.png') });
        await page.locator('#data-dialog > details > summary').click();
        const details = await page.locator('#data-details').innerText();
        assert.match(details, /Scaleway/); assert.match(details, /Hetzner/); assert.match(details, /Tyskland/);
        const price = page.locator('#data-details dd').filter({ hasText: 'DKK' });
        await price.locator('summary').click();
        assert.match(await price.innerText(), /DKK/);
        assert.equal(await price.locator('pre').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Hele prisoplysningen skal kunne læses uden vandret rulning');
        await page.locator('#data-details dt').filter({ hasText: /^Modtagere$/ }).evaluate(el => el.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: path.join(root, 'komplai-datadetaljer.png') });
        await page.locator('#data-dialog > details > summary').click();
        await page.click('#accept-send');
      }
    }
    async function finished() { await page.waitForFunction(() => document.querySelector('#stop').hidden, null, { timeout: 60000 }); assert.deepEqual(errors, []); }
    await phase('write'); await send('Skift startsidens overskrift til Bygget gennem Komplai.');
    await page.waitForSelector('#approvals .approval', { timeout: 60000 }); await page.locator('#approvals button').filter({ hasText: 'Tillad for denne opgave' }).click(); await finished();
    assert.match(await fs.readFile(file, 'utf8'), /Bygget gennem Komplai/);
    await page.frameLocator('#preview').locator('h1').filter({ hasText: 'Bygget gennem Komplai' }).waitFor();
    assert.match(await page.locator('#usage-status').textContent(), /DKK/); assert.doesNotMatch(await page.locator('#usage-status').textContent(), /USD/);
    await page.screenshot({ path: path.join(root, 'kode-og-preview.png') });
    await phase('reject'); await send('Foreslå en anden overskrift.'); await page.waitForSelector('#approvals .approval', { timeout: 60000 }); await page.locator('#approvals button').filter({ hasText: /^Afvis$/ }).click(); await finished();
    assert.match(await fs.readFile(file, 'utf8'), /Bygget gennem Komplai/);
    await phase('stop'); await send('Vent på et nyt svar.'); await page.waitForFunction(() => !document.querySelector('#stop').disabled); await page.click('#stop'); await finished();
    const budget = await app.evaluate(() => globalThis.komplaiTestBudget.summary());
    assert(budget.calls >= 2); assert(budget.reservedUpperBoundDkk <= 10);
    const state = (await page.evaluate(() => window.harness.connectionState())).value;
    const connection = state.connections.find(c => c.kind === 'komplai'); assert.equal(connection.secret, undefined);
    await helpers.menuClick(page, '#connections-button'); await page.locator('#saved-connections button').first().click();
    await page.click('#connection-remove'); await page.waitForFunction(() => document.querySelector('#saved-connections').textContent.includes('Ingen forbindelser'));
    const settings = await fs.readFile(path.join(root, 'appdata', 'harness', 'settings.json'), 'utf8'); assert.equal(JSON.parse(settings).connections.length, 0);
    assert.doesNotMatch(await page.locator('body').textContent(), /kp_live_|synthetic-scaleway-secret/);
    console.log(JSON.stringify({ status: 'bestået', root, checks: ['PKCE-login og organisationsvalg i UI', 'rigtig Komplai-API og kreditregnskab', 'rigtig OpenCode og filgodkendelse', 'preview af ændringen', 'afvisning og stop', 'forbrug i DKK', 'tilbagekaldelse og lokal sletning'], limitations: ['syntetisk identitetsudsteder og model', 'nøglering simuleret', 'Windows ikke afprøvet'] }));
  } catch (error) { console.error('Verifikationsmappe:', root); if (app) { const page = await app.firstWindow(); await page.screenshot({ path: path.join(root, 'fejl.png') }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-6500)); } throw error; }
  finally { await app?.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
