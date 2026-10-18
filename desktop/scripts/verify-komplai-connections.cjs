// Rigtig Electron, PKCE-callback, IPC og nøglelager med syntetiske konti og serversvar.
// Ingen ekstern forbindelse, modelkald eller udgivelse. Den rigtige nøglering bruges ikke.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-komplai-forbindelser-')));
  const screens = [];
  for (const mode of ['publish', 'ai', 'begge', 'ai-fra-begge']) {
    let app;
    const errors = [], appdata = path.join(root, mode);
    try {
      app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + appdata], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
      await app.evaluate(({ safeStorage, shell }, mode) => {
        const original = globalThis.fetch;
        globalThis.komplaiFixtureCalls = [];
        const data = { recipients: 'Syntetisk modtager', region: 'Lokal prøve.', training: 'Ingen.', retention: 'Prøvedata.', platformStorage: 'Prøvemetadata.', accounting: 'Månedligt loft.', source: 'https://example.invalid', checkedAt: '2026-10-18', version: '1' };
        const coding = { contract: 'syntetisk-kontrakt', balance: { limitMicros: 10000000, spentMicros: 1000000 }, data };
        const organisation = { id: 'syntetisk-org', name: 'Prøveorganisation', coding: mode === 'publish' ? null : coding, publishing: mode === 'ai' ? null : { address: 'komplai.run', tier: 'shared_free' } };
        const account = { ...coding, id: organisation.id, name: organisation.name };
        globalThis.fetch = async (url, options = {}) => {
          const address = new URL(String(url));
          if (address.protocol === 'http:' && address.hostname === '127.0.0.1') return original(url, options);
          const route = address.pathname + address.search, method = options.method || 'GET';
          globalThis.komplaiFixtureCalls.push({ route, method });
          if (address.origin === 'https://auth.komplai.dk' && route === '/oauth/v2/token') return Response.json({ access_token: 'syntetisk-login', token_type: 'Bearer' });
          if (address.origin !== 'https://api.komplai.dk') throw Error('Prøven må ikke kontakte eksterne tjenester.');
          if (route === '/v1/aura/config') return Response.json({ issuer: 'https://auth.komplai.dk', clientId: 'syntetisk-klient', scopes: ['openid'], authorizationEndpoint: 'https://auth.komplai.dk/oauth/v2/authorize', tokenEndpoint: 'https://auth.komplai.dk/oauth/v2/token' });
          if (route === '/v1/aura/organisations?include=publishing') return Response.json({ organisations: [organisation] });
          if (route === '/v1/aura/publishing/connect') {
            if (!organisation.publishing || JSON.parse(options.body).acceptPublishing !== true) throw Error('Uventet Publish-adgang.');
            return Response.json({ id: 'syntetisk-grant', secret: 'komp_publish_grant_' + 'a'.repeat(64), address: 'komplai.run', expiresAt: '2099-01-01T00:00:00Z' });
          }
          if (route === '/v1/aura/connect') {
            if (!organisation.coding) throw Error('En Publish-organisation må ikke få AI-adgang.');
            return Response.json({ id: 'syntetisk-key', secret: 'kp_live_' + 'a'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' });
          }
          if (route === '/v1/aura/v1/models') return Response.json({ account, data: [{ id: 'syntetisk-model', name: 'Syntetisk model', context_length: 32000, max_output_tokens: 4000, capabilities: { function_calling: true }, pricing: { currency: 'DKK', prompt: '0.000001', completion: '0.000002' } }] });
          if (route === '/v1/aura/account') return Response.json(account);
          if (method === 'DELETE' && ['/v1/aura/session', '/v1/aura/publishing/session'].includes(route)) return Response.json({ revoked: true });
          throw Error('Uventet testkald: ' + method + ' ' + route);
        };
        shell.openExternal = async value => {
          const auth = new URL(value);
          if (auth.origin !== 'https://auth.komplai.dk' || auth.searchParams.get('code_challenge_method') !== 'S256') throw Error('Uventet loginadresse.');
          const callback = new URL(auth.searchParams.get('redirect_uri'));
          callback.searchParams.set('state', auth.searchParams.get('state')); callback.searchParams.set('code', 'syntetisk-kode');
          if (!(await original(callback)).ok) throw Error('Den lokale callback blev afvist.');
        };
        safeStorage.isEncryptionAvailable = () => true;
        safeStorage.encryptString = value => Buffer.from('prøve:' + Buffer.from(value).toString('base64'));
        safeStorage.decryptString = value => Buffer.from(value.toString().slice(6), 'base64').toString();
      }, mode);
      if (mode === 'ai-fra-begge') await app.evaluate((_, modulePath) => {
        const { KomplaiLiveBudget, budgetedFetch } = process.getBuiltinModule('module').createRequire(modulePath)(modulePath);
        globalThis.fetch = budgetedFetch(globalThis.fetch, new KomplaiLiveBudget({ organisationId: 'syntetisk-org', modelId: 'syntetisk-model' }));
      }, path.join(__dirname, 'komplai-live-budget.cjs'));
      const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await helpers.skipIntroduction(page); await helpers.openSetup(page);
      await page.click('#setup-add-provider'); await page.click('#provider-cards [data-kind="komplai"]');
      const login = async () => {
        await page.click('#komplai-login');
        await page.waitForSelector('#komplai-connect[data-stage="organisation"]');
        await page.waitForFunction(() => !document.querySelector('#komplai-confirm').disabled);
      };
      await login();
      assert.equal(await page.locator('#komplai-organisation').isVisible(), false);
      assert.equal(await page.locator('#komplai-terms').evaluate(el => el.closest('details').hidden), mode === 'publish');
      assert.equal(await page.locator('#komplai-publish-row').isVisible(), ['begge', 'ai-fra-begge'].includes(mode));
      if (mode === 'publish') {
        assert.equal(await page.locator('#komplai-terms').textContent(), '');
        assert.equal(await page.locator('#komplai-confirm').textContent(), 'Forbind komplai Publish');
        await page.click('#komplai-cancel');
        assert.equal((await page.evaluate(() => window.harness.komplaiPublishState())).value.connected, false);
        await login();
      } else assert.match(await page.locator('#komplai-terms').textContent(), /Syntetisk modtager/);
      const choices = await page.locator('#komplai-connect :is(button, select, summary, input[type=checkbox]):visible').count();
      assert(choices <= 4, `${mode}: ${choices} synlige valg`);
      screens.push({ mode, choices });
      await page.screenshot({ path: path.join(root, mode + '-organisation.png') });
      if (mode === 'ai-fra-begge') await page.uncheck('#komplai-publish-also');
      await page.click('#komplai-confirm');
      if (mode === 'publish') await page.waitForFunction(() => document.querySelector('#komplai-feedback').textContent.includes('er forbundet'));
      else await page.waitForSelector('#setup-continue:not([disabled])');
      const state = (await page.evaluate(() => window.harness.connectionState())).value;
      const publishing = (await page.evaluate(() => window.harness.komplaiPublishState())).value;
      assert.equal(state.connections.length, mode === 'publish' ? 0 : 1);
      assert.equal(publishing.connected, ['publish', 'begge'].includes(mode));
      assert.equal(JSON.stringify({ state, publishing }).includes('komp_publish_grant_'), false);
      const calls = await app.evaluate(() => globalThis.komplaiFixtureCalls);
      assert.deepEqual(calls.filter(c => ['/v1/aura/connect', '/v1/aura/publishing/connect'].includes(c.route)).map(c => c.route), mode === 'publish' ? ['/v1/aura/publishing/connect'] : mode === 'begge' ? ['/v1/aura/publishing/connect', '/v1/aura/connect'] : ['/v1/aura/connect']);
      assert.equal(calls.some(c => c.route.includes('chat/completions') || c.route.includes('/releases')), false);
      await page.screenshot({ path: path.join(root, mode + '-forbundet.png') });
      const settings = await fs.readFile(path.join(appdata, 'harness/settings.json'), 'utf8');
      assert.doesNotMatch(settings, /komp_publish_grant_|kp_live_|syntetisk-login/);
      for (const connection of state.connections) assert.equal((await page.evaluate(id => window.harness.removeConnection(id), connection.id)).ok, true);
      if (publishing.connected) assert.equal((await page.evaluate(() => window.harness.komplaiPublishDisconnect())).ok, true);
      assert.equal((await page.evaluate(() => window.harness.komplaiPublishState())).value.connected, false);
      assert.deepEqual(errors, []);
    } catch (error) {
      if (app) await (await app.firstWindow()).screenshot({ path: path.join(root, mode + '-fejl.png') }).catch(() => {});
      console.error('Prøvemappe:', root); throw error;
    } finally { await app?.close(); }
  }
  console.log(JSON.stringify({ status: 'bestået', root, screens, checks: ['AI, Publish og begge via PKCE og IPC', 'Publish uden AI-datavilkår', 'annullering før adgang', 'separate krypterede adgange og tilbagekaldelse', 'liveprøvens transport med Publish fravalgt', 'ingen modelkald eller udgivelse'], limitations: ['syntetisk identitetsudsteder og API', 'nøglering simuleret', 'ingen Windows-prøve'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
