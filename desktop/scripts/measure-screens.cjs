// Måler appens skærme og dialoger: synlige ord, valg og felter, og klik pr. opgave. Hver skærm får et skærmbillede.
// DESIGN.md siger: tæl de synlige valg, og se skærmen i appen. Scriptet gør det for alle skærme på én gang, så en ændring kan måles før og efter.
// Modellen er en kontrolleret server i Anthropics format bag appens eget Claude-kort. Nøglen er opdigtet og forlader ikke computeren.
// Brug: node scripts/measure-screens.cjs [mappe]. Resultatet står i maalinger.md og maalinger.json i mappen.
const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const helpers = require('./ui-test-helpers.cjs');

const state = { project: null, builds: 0, requests: 0 };
const page = title => `<!doctype html><html lang="da"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>Tre fiktive mødelokaler.</p></body></html>`;
const plan = 'Det bygger vi\nEn side med tre fiktive mødelokaler og et felt til antal deltagere.\n\nDet skal du prøve\nSkriv 8 i feltet, og kontrollér, at kun de store lokaler vises.';
const isToolResult = message => Array.isArray(message.content) && message.content.some(part => part.type === 'tool_result');
function stream(response, reply) {
  const block = reply.tool ? { type: 'tool_use', id: `toolu_${state.requests}`, name: reply.tool, input: {} } : { type: 'text', text: '' };
  const delta = reply.tool ? { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) } : { type: 'text_delta', text: reply.text };
  const message = { id: `msg_${state.requests}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } };
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of [{ type: 'message_start', message }, { type: 'content_block_start', index: 0, content_block: block }, { type: 'content_block_delta', index: 0, delta }, { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: reply.tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 200 } }, { type: 'message_stop' }]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    const data = [['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-4-5-20251001', 'Claude Haiku 4.5']].map(([id, display_name]) => ({ type: 'model', id, display_name, created_at: '2026-01-01T00:00:00Z' }));
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ data, has_more: false }));
  }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); state.requests++;
  const last = [...body.messages].reverse().find(message => message.role === 'user');
  if (!body.tools?.length) return stream(res, { text: 'Mødelokaler' });
  if (last && isToolResult(last)) return stream(res, { text: 'Første udkast er bygget.' });
  if (JSON.stringify(body.system || '').includes('PLANLÆGNING:')) return stream(res, { text: plan });
  state.builds++;
  stream(res, { tool: 'write', input: { filePath: path.join(state.project, 'public/index.html'), content: page(`Udkast ${state.builds}`) } });
});

(async () => {
  const out = path.resolve(process.argv[2] || await fs.mkdtemp(path.join(os.tmpdir(), 'harness-maaling-')));
  await fs.mkdir(out, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-maaling-app-')));
  const documents = path.join(root, 'Dokumenter'); await fs.mkdir(documents);
  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  const realGit = execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(bin, 'git'), `#!/bin/sh\nexport GIT_CONFIG_GLOBAL=/dev/null\nexport GIT_CONFIG_NOSYSTEM=1\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, ELECTRON_RUN_AS_NODE: undefined } });
  await helpers.isolateDocuments(app, documents);
  // Anthropic går til den kontrollerede server, og Ollama på computeren svarer med én fast model.
  await app.evaluate((_, port) => { const original = global.fetch; global.fetch = (url, options) => { const value = String(url); if (value === 'http://127.0.0.1:11434/api/tags') return Promise.resolve(new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { headers: { 'content-type': 'application/json' } })); return original(value.startsWith('https://api.anthropic.com/') ? value.replace('https://api.anthropic.com', `http://127.0.0.1:${port}`) : url, options); }; }, server.address().port);
  const win = await app.firstWindow(); win.setDefaultTimeout(60000);
  const errors = []; win.on('pageerror', error => errors.push(error.message));
  const results = [], tasks = {};
  let task = null, counter = 0;
  const click = async (selector, options) => { if (task) tasks[task]++; await win.click(selector, options); };
  const begin = name => { task = name; tasks[name] = 0; };
  // Synlige ord, valg og felter i skærmens eget område. Lukkede afsnit og skjulte elementer tæller ikke med.
  async function measure(name, selector, title) {
    await win.waitForTimeout(400);
    const data = await win.evaluate(sel => {
      const root = document.querySelector(sel);
      // checkVisibility udelader også indhold i lukkede afsnit, som stadig har en størrelse i layoutet.
      const shown = el => el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }) && el.getBoundingClientRect().width > 0;
      const text = root.innerText.replace(/\s+/g, ' ').trim();
      const controls = [...root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary')].filter(shown);
      // En ⓘ er en forklaring, ikke et valg, så den tælles for sig.
      return { words: text ? text.split(' ').length : 0, choices: controls.filter(el => !el.matches('input:not([type=checkbox]):not([type=radio]), textarea, .info')).length, infos: controls.filter(el => el.matches('.info')).length, fields: controls.filter(el => el.matches('input:not([type=checkbox]):not([type=radio]), textarea')).length, text };
    }, selector);
    const file = `${String(++counter).padStart(2, '0')}-${name}.png`;
    await win.screenshot({ path: path.join(out, file), animations: 'disabled' });
    results.push({ name, title, file, ...data });
  }
  try {
    await win.waitForFunction(() => !document.querySelector('#welcome-build').disabled);
    // Velkomst og opsætning.
    await measure('velkomst', '#welcome-dialog', 'Velkomst: vej');
    await win.click('#path-app'); await measure('velkomst-start', '#welcome-dialog', 'Velkomst: start');
    await win.click('#welcome-example'); await win.frameLocator('#demo-preview').locator('h1').waitFor(); await measure('demonstration', '#welcome-dialog', 'Demonstration'); await win.click('#demo-back');
    begin('Forbind Claude med en nøgle');
    await click('#welcome-build'); await win.waitForSelector('#setup:not([hidden])'); await measure('ai-valg', '#setup', 'Opsætning: hvordan forbinder du AI');
    await click('#setup-add-provider'); await measure('udbydere', '#setup', 'Opsætning: udbyder');
    await click('#provider-cards [data-kind="anthropic"]'); await measure('noegle', '#setup', 'Opsætning: nøgle til Claude');
    task = null; await win.locator('.key-guide > summary').click(); await measure('noeglehjaelp', '#setup', 'Opsætning: sådan får du en nøgle'); await win.locator('.key-guide > summary').click(); task = 'Forbind Claude med en nøgle';
    await win.fill('#api-key', 'syntetisk-noegle-kun-til-maaling'); await click('#save-connection');
    await win.locator('#setup-ai').filter({ hasText: /virker|svarer/ }).waitFor(); await measure('forbindelse', '#setup', 'Opsætning: forbindelsen virker');
    await click('#setup-continue'); task = null;
    await win.locator('#setup-title').filter({ hasText: 'Hvad skal Aura hjælpe med?' }).waitFor(); await measure('funktioner-start', '#setup', 'Første start: funktioner');
    await win.click('#features-pick'); await measure('funktioner-vaelg', '#setup', 'Første start: vælg selv');
    await win.click('#setup-back'); await win.click('#features-all'); await win.waitForSelector('#create-form');
    // Projektopstart.
    await measure('projektopstart', '#onboarding', 'Hvad vil du bygge?');
    await helpers.projectOptions(win); await measure('flere-valg', '#onboarding', 'Hvad vil du bygge? · Flere valg');
    await win.evaluate(() => { for (const details of document.querySelectorAll('#onboarding details')) details.open = true; }); await measure('flere-valg-alt', '#onboarding', 'Hvad vil du bygge? · alt foldet ud');
    await win.evaluate(() => { for (const details of document.querySelectorAll('#onboarding details')) details.open = false; });
    // Første resultat.
    begin('Fra idé til første udkast');
    await win.fill('#purpose', 'Jeg vil lave en oversigt over tre fiktive mødelokaler.');
    await click('#create'); await win.waitForSelector('#workspace:not([hidden])');
    state.project = path.join(documents, 'Aura', (await fs.readdir(path.join(documents, 'Aura')))[0]);
    await measure('arbejdsomraade', '#workspace', 'Arbejdsområde: tomt projekt');
    task = null; await win.click('#model-chip'); await measure('din-ai', '#task-dialog', 'Din AI'); await win.click('[data-close="task-dialog"]'); task = 'Fra idé til første udkast';
    await click('#send'); await win.waitForSelector('#data-dialog[open]'); await measure('foer-du-sender', '#data-dialog', 'Før du sender');
    task = null; await win.locator('#data-dialog details > summary').first().click(); await measure('foer-du-sender-alt', '#data-dialog', 'Før du sender · Se alle oplysninger'); await win.locator('#data-dialog details > summary').first().click(); task = 'Fra idé til første udkast';
    await click('#accept-send'); await win.waitForSelector('#plan-card:not([hidden])', { timeout: 120000 }); await win.waitForFunction(() => !document.querySelector('#build-plan').disabled);
    await measure('forslag', '#plan-card', 'Forslag: klar til at bygge?');
    await click('#build-plan');
    const allow = win.locator('#approvals button').filter({ hasText: 'Tillad for denne opgave' }).first(); await allow.waitFor({ timeout: 120000 });
    await measure('godkendelse', '#approvals', 'Godkendelse af filændringer');
    tasks[task]++; await allow.click();
    await win.locator('#run-review button').filter({ hasText: 'Fortryd opgaven' }).waitFor({ timeout: 120000 }); await win.locator('#run-status').filter({ hasText: 'Klar' }).waitFor();
    await measure('resultat', '#run-review', 'Resultatkort'); task = null;
    // Fortryd og versioner.
    begin('Fortryd opgaven');
    await click('#run-review button >> text=Fortryd opgaven'); await win.waitForFunction(() => !document.querySelector('#restore-confirm').disabled);
    await measure('fortryd', '#restore-dialog', 'Fortryd opgaven');
    await click('#restore-confirm'); await win.waitForSelector('#restore-dialog:not([open])', { state: 'attached' }); task = null;
    await helpers.menuClick(win, '#git-button'); await win.locator('#git-summary').filter({ hasText: 'Alt er gemt.' }).waitFor(); await measure('versioner', '#git-dialog', 'Versioner');
    await win.click('#git-advanced > summary'); await measure('versioner-avanceret', '#git-dialog', 'Versioner · Avanceret'); await win.click('[data-close="git-dialog"]');
    await win.click('#changes-button'); await measure('aendringer', '#changes-dialog', 'Ændringer'); await win.click('[data-close="changes-dialog"]');
    await helpers.menuClick(win, '#attach-preview'); await measure('forhaandsvisning', '#preview-dialog', 'Forhåndsvisning og server'); await win.click('[data-close="preview-dialog"]');
    // Indstillinger.
    await helpers.menuClick(win, '#features-button'); await measure('funktioner', '#features-dialog', 'Funktioner');
    await win.locator('#features-list input[data-feature="deling"]').check(); await win.locator('#features-feedback').filter({ hasText: 'Gemt' }).waitFor();
    await win.click('#features-advanced > summary'); await win.click('#skills-button'); await measure('instruktioner', '#skills-dialog', 'Instruktioner i projektet'); await win.click('[data-close="skills-dialog"]'); await win.click('[data-close="features-dialog"]');
    await win.click('#deploy-button'); await win.waitForSelector('#deployment-dialog[open]'); await measure('del', '#deployment-dialog', 'Del'); await win.click('[data-close="deployment-dialog"]');
    await helpers.menuClick(win, '#publish-button'); await win.waitForSelector('#hosting-dialog[open]');
    // GitHub-status indlæses efter, at dialogen åbner; vent på den, så målingen er den samme fra gang til gang.
    await win.waitForFunction(() => document.querySelector('#hosting-status').textContent.trim()); await measure('sikkerhedskopi', '#hosting-dialog', 'Sikkerhedskopi'); await win.click('[data-close="hosting-dialog"]');
    await helpers.menuClick(win, '#connections-button'); await measure('forbindelser', '#connections-dialog', 'Administrer forbindelser'); await win.click('[data-close="connections-dialog"]');
    await helpers.menuClick(win, '#support-button'); await win.waitForSelector('#support-dialog[open]'); await measure('hjaelp', '#support-dialog', 'Hjælp og feedback'); await win.click('[data-close="support-dialog"]');
    await win.click('#tools-button'); await win.waitForSelector('#tools-dialog[open]'); await measure('kodevaerktoej', '#tools-dialog', 'Aura Harness i dit kodeværktøj'); await win.click('#tools-dialog [data-close]');
    // Tabel: flest ord først, så de tungeste skærme står øverst.
    const rows = [...results].sort((a, b) => b.words - a.words);
    const table = ['| Skærm | Ord | Valg | ⓘ | Felter | Skærmbillede |', '|---|---:|---:|---:|---:|---|', ...rows.map(row => `| ${row.title} | ${row.words} | ${row.choices} | ${row.infos} | ${row.fields} | ${row.file} |`)].join('\n');
    const clicks = ['| Opgave | Klik |', '|---|---:|', ...Object.entries(tasks).map(([name, count]) => `| ${name} | ${count} |`)].join('\n');
    await fs.writeFile(path.join(out, 'maalinger.md'), `# Måling af skærme\n\nMålt ${new Date().toISOString().slice(0, 10)} i Electron med en kontrolleret model. Ord og valg tæller kun det, der er synligt i skærmens eget område; lukkede afsnit tæller ikke med. Ord i en liste tæller alle dens muligheder med. Valg er knapper, links, kontakter, lister og foldbare afsnit. ⓘ er forklaringer, der åbnes med et klik. Felter er tekstfelter.\n\n${table}\n\n## Klik pr. opgave\n\n${clicks}\n\nSidefejl: ${errors.length}\n`);
    await fs.writeFile(path.join(out, 'maalinger.json'), JSON.stringify({ results, tasks, errors }, null, 2));
    console.log(JSON.stringify({ status: errors.length ? 'sidefejl' : 'målt', out, skaerme: results.length, ord: results.reduce((sum, row) => sum + row.words, 0), tasks, errors }, null, 2));
    if (errors.length) process.exitCode = 1;
  } catch (error) {
    await win.screenshot({ path: path.join(out, 'fejl.png'), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally { await app.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
