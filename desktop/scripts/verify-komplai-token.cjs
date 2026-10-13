// Rigtig Electron og OpenCode; kun syntetiske konti og svar fra en lokal HTTP-server.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-token-ui-')));
  const project = path.join(root, 'Projekt med mellemrum'), file = path.join(project, 'public/index.html');
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '<h1>Før ændringen</h1>');
  const key = 'kp_live_' + 'u'.repeat(43), calls = [], errors = [], screens = [];
  let phase = 'valid', app;
  const account = { id: 'org-test', name: 'Prøvekommune', contract: '1', balance: { availableMicros: 10000000 },
    credential: { id: 'token-test', scopes: ['coding:read', 'coding:complete'], expiresAt: '2099-01-01T00:00:00Z' },
    data: { recipients: 'Komplai og syntetisk modelserver', region: 'Kun denne computer i prøven.', training: 'Ingen træning i prøven.', retention: 'Syntetiske prøvedata.', source: 'https://app.komplai.dk', checkedAt: '2026-10-13', version: '1', mode: 'test', accounting: 'Fælles kreditter.', platformStorage: 'Syntetisk forbrugsmetadata.' } };
  const server = http.createServer(async (req, res) => {
    calls.push({ path: req.url, method: req.method });
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.authorization !== `Bearer ${key}` || phase === 'invalid') return json({ error: 'invalid_api_key' }, 401);
    if (req.url === '/v1/aura/account') {
      const value = structuredClone(account);
      if (phase === 'missing') delete value.credential;
      if (phase === 'readonly') value.credential.scopes = ['coding:read'];
      return json(value);
    }
    if (req.url === '/v1/aura/v1/models') return json({ account, data: [{ id: 'synthetic-code', name: 'Syntetisk kodemodel', context_length: 32000, max_output_tokens: 4000, capabilities: { function_calling: true }, pricing: { currency: 'DKK', prompt: '0.000001', completion: '0.000002' } }] });
    if (req.url !== '/v1/aura/v1/chat/completions') return json({ error: 'Ukendt prøveadresse' }, 404);
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), user = [...body.messages].reverse().find(m => m.role === 'user');
    const finished = body.messages.slice(body.messages.lastIndexOf(user) + 1).some(m => m.role === 'tool');
    const tool = !finished ? { index: 0, id: 'call_token', type: 'function', function: { name: 'write', arguments: JSON.stringify({ filePath: file, content: '<h1>Bygget med Komplai-token</h1>' }) } } : null;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = { id: 'test', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: tool ? 'Jeg ændrer startsiden.' : 'Startsiden er ændret.', ...(tool ? { tool_calls: [tool] } : {}) }, finish_reason: null }] };
    res.write('data: ' + JSON.stringify(chunk) + '\n\n');
    res.write('data: ' + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 } }) + '\n\n'); res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const api = `http://127.0.0.1:${server.address().port}`;
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await app.evaluate(({ safeStorage }, api) => {
      const original = globalThis.fetch;
      globalThis.fetch = (url, options) => {
        const address = String(url);
        if (address.startsWith('https://api.komplai.dk/v1/aura/')) return original(address.replace('https://api.komplai.dk', api), options);
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(address)) throw new Error('Prøven må kun kontakte lokale tjenester.');
        return original(url, options);
      };
      safeStorage.isEncryptionAvailable = () => true;
      safeStorage.encryptString = value => Buffer.from('test:' + Buffer.from(value).toString('base64'));
      safeStorage.decryptString = value => Buffer.from(value.toString().slice(5), 'base64').toString();
    }, api);
    const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' });
    const state = async () => (await page.evaluate(() => window.harness.connectionState())).value;
    const screen = async name => {
      const measure = await page.locator('#komplai-connect').evaluate(el => {
        const shown = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        return { words: el.innerText.trim().split(/\s+/).length, choices: [...el.querySelectorAll('button,select,summary')].filter(shown).length, fields: [...el.querySelectorAll('input')].filter(shown).length };
      });
      assert(measure.choices <= 4); screens.push({ name, ...measure }); await page.screenshot({ path: path.join(root, name + '.png') });
    };
    const start = async () => { await page.click('#komplai-token-start'); assert.equal(await page.locator('#komplai-token').getAttribute('type'), 'password'); };
    const check = async () => { await page.fill('#komplai-token', key); await page.click('#komplai-token-check'); await page.waitForFunction(() => !document.querySelector('#komplai-token-check').disabled); assert.equal(await page.inputValue('#komplai-token'), ''); };
    await helpers.skipIntroduction(page); await helpers.openSetup(page); await page.click('#setup-add-provider'); await page.click('#provider-other'); await page.selectOption('#provider-kind', 'komplai');
    await screen('01-loginvalg'); await start(); await screen('02-token');
    for (const [mode, message] of [['invalid', 'API-token'], ['missing', 'API-opdateringen'], ['readonly', 'coding:complete']]) {
      phase = mode; await check(); assert.match(await page.locator('#komplai-feedback').innerText(), new RegExp(message)); assert.equal((await state()).connections.length, 0);
    }
    phase = 'valid'; await check(); await screen('03-gennemgang'); await page.click('#komplai-cancel'); assert.equal((await state()).connections.length, 0);
    await start(); await check(); account.contract = '2'; await page.click('#komplai-confirm');
    await page.waitForFunction(() => document.querySelector('#komplai-feedback').textContent.includes('ændret'));
    assert.equal((await state()).connections.length, 0); await page.click('#komplai-cancel');
    await start(); await check(); assert.equal(calls.filter(c => c.method !== 'GET').length, 0);
    await page.click('#komplai-confirm'); await page.waitForSelector('#setup-continue:not([disabled])'); await page.click('#setup-continue');
    const connection = (await state()).connections[0]; assert.equal(connection.account.authMethod, 'token'); assert.equal(connection.secret, undefined);
    assert.equal(calls.filter(c => c.method !== 'GET').length, 0, 'Login må ikke bruge modellen');
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
    await page.click('#open'); await helpers.taskOptions(page);
    await page.selectOption('#connection-select', connection.id);
    await page.waitForFunction(() => [...document.querySelector('#model-select').options].some(o => o.value === 'synthetic-code'));
    await page.click('#model-catalog > summary'); await page.selectOption('#model-select', 'synthetic-code'); await page.click('#model-done'); await helpers.selectMode(page, 'free');
    await page.fill('#prompt', 'Skift overskriften til Bygget med Komplai-token.'); await page.click('#send');
    await page.waitForFunction(() => document.querySelector('#data-dialog').open || !document.querySelector('#stop').hidden);
    if (await page.locator('#data-dialog').evaluate(el => el.open)) await page.click('#accept-send');
    await page.waitForSelector('#approvals .approval', { timeout: 60000 }); await page.locator('#approvals button').filter({ hasText: 'Tillad for denne opgave' }).click();
    await page.waitForFunction(() => document.querySelector('#stop').hidden, null, { timeout: 60000 });
    assert.match(await fs.readFile(file, 'utf8'), /Bygget med Komplai-token/); await page.frameLocator('#preview').locator('h1').filter({ hasText: 'Bygget med Komplai-token' }).waitFor();
    assert.match(await page.locator('#usage-status').textContent(), /DKK/); await page.screenshot({ path: path.join(root, '04-preview.png') });
    await helpers.menuClick(page, '#connections-button'); await page.locator('#saved-connections button').first().click();
    phase = 'invalid'; await page.click('#connection-remove'); await page.waitForFunction(() => document.querySelector('#saved-connections').textContent.includes('Ingen forbindelser'));
    assert.equal((await state()).connections.length, 0); assert.equal(calls.filter(c => c.method === 'DELETE').length, 0);
    assert.equal((await page.locator('body').innerText()).includes(key), false); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(root, 'screen-measurements.json'), JSON.stringify(screens, null, 2));
    console.log(JSON.stringify({ status: 'bestået', root, screens, checks: ['fejl og manglende API-kontrakt', 'skjult token og annullering', 'ændret kontrakt afviser gammel godkendelse', 'login uden inferens', 'rigtig filændring og preview via OpenCode', 'pris i DKK', 'lokal fjernelse uden tilbagekaldelse'], limitations: ['kontrolleret lokal API og model', 'nøglering simuleret', 'ingen Windows-prøve'] }));
  } catch (error) {
    console.error('Prøvemappe:', root);
    if (app) { const page = await app.firstWindow(); await page.screenshot({ path: path.join(root, 'fejl.png') }).catch(() => {}); console.error((await page.locator('body').innerText()).slice(-7000)); }
    throw error;
  } finally { await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
