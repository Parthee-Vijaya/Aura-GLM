// Gem, fortryd og kom tilbage: hele forløbet i Electron med rigtig OpenCode, Git og projektfiler.
// Modellen er en kontrolleret server. Global Git-opsætning er slået fra, så appens anonyme identitet bruges.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { run } = require('../core/git.cjs');
const helpers = require('./ui-test-helpers.cjs');
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-versions-')));
  const documents = path.join(root, 'Dokumenter');
  const bin = path.join(root, 'bin'); await fs.mkdir(bin);
  const realGit = execFileSync('/usr/bin/which', ['git'], { encoding: 'utf8' }).trim();
  await fs.writeFile(path.join(bin, 'git'), `#!/bin/sh\nexport GIT_CONFIG_GLOBAL=/dev/null\nexport GIT_CONFIG_NOSYSTEM=1\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  let project = '';
  const built = '<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Lokaler</title></head><body><h1>Tre mødelokaler</h1></body></html>';
  const server = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'test-model', name: 'Kontrolleret testmodel' }] })); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const planning = JSON.stringify(body.messages).includes('PLANLÆGNING:');
    const tool = !planning && body.tools?.length && !body.messages.some(m => m.role === 'tool') ? { id: 'skriv', type: 'function', function: { name: 'write', arguments: JSON.stringify({ filePath: path.join(project, 'public/index.html'), content: built }) } } : null;
    res.setHeader('content-type', 'text/event-stream');
    const chunk = { id: 'test', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, ...tool }] } : { role: 'assistant', content: planning ? 'Forslag: En side med tre mødelokaler.' : 'Siden er bygget.' }, finish_reason: null }] };
    res.write('data: ' + JSON.stringify(chunk) + '\n\n');
    res.write('data: ' + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200 } }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let app, page;
  const launch = async () => {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, ELECTRON_RUN_AS_NODE: undefined } });
    await helpers.isolateDocuments(app, documents);
    page = await app.firstWindow(); page.setDefaultTimeout(30000); await helpers.skipIntroduction(page);
  };
  const log = async () => (await run(project, ['log', '--format=%s'])).toString().trim().split('\n');
  const clean = async () => (await run(project, ['status', '--porcelain', '--untracked-files=all'])).toString() === '';
  const heading = text => page.frameLocator('#preview').locator('h1').filter({ hasText: text }).waitFor({ timeout: 30000 });
  try {
    await launch();
    await helpers.toOnboarding(page);
    await page.fill('#purpose', 'Jeg vil lave en oversigt over tre fiktive mødelokaler.'); await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])');
    project = path.join(documents, 'AI Harness', (await fs.readdir(path.join(documents, 'AI Harness')))[0]);
    // 1. Git fra start: første version, anonym identitet og automatiske versioner.
    assert.deepEqual(await log(), ['Projekt oprettet']); assert.equal(await clean(), true);
    assert.equal((await run(project, ['config', 'user.name'])).toString().trim(), 'AI Harness-bruger');
    assert.equal((await run(project, ['config', 'user.email'])).toString().trim(), 'bruger@ai-harness.invalid');
    const starter = await fs.readFile(path.join(project, 'public/index.html'), 'utf8');
    await helpers.menuClick(page, '#connections-button'); await page.selectOption('#provider-kind', 'compatible');
    await page.fill('#connection-name', 'Kontrolleret model'); await page.fill('#base-url', `http://127.0.0.1:${server.address().port}/v1`);
    await page.click('#save-connection'); await page.locator('#connection-feedback').filter({ hasText: 'Forbindelsen er gemt' }).waitFor(); await page.click('[data-close="connections-dialog"]');
    const connection = (await page.evaluate(() => window.harness.connectionState())).value.connections[0];
    await helpers.taskOptions(page); await page.selectOption('#connection-select', connection.id);
    await page.waitForFunction(() => document.querySelector('#model-select').options.length === 2); await page.locator('#model-shortlist button').first().click();
    // 2. En AI-opgave gemmes automatisk som en version, og kortet tilbyder at fortryde den.
    await page.click('#send'); await page.waitForSelector('#data-dialog[open]'); await page.click('#accept-send');
    await page.waitForSelector('#plan-card:not([hidden])', { timeout: 60000 }); await page.waitForFunction(() => !document.querySelector('#build-plan').disabled);
    await page.click('#build-plan');
    await page.locator('#approvals button').filter({ hasText: 'Tillad for denne opgave' }).click({ timeout: 60000 });
    await heading('Tre mødelokaler'); await page.locator('#run-review button').filter({ hasText: 'Fortryd opgaven' }).waitFor({ timeout: 60000 });
    assert.match((await log())[0], /^AI-opgave: Byg første udkast/); assert.equal(await clean(), true);
    await page.screenshot({ path: path.join(root, 'fortryd-tilbud.png'), animations: 'disabled' });
    // 3. Fortryd sætter filerne tilbage til før opgaven og gemmer det som en ny version.
    await page.locator('#run-review button').filter({ hasText: 'Fortryd opgaven' }).click();
    await page.waitForSelector('#restore-dialog[open]'); assert.equal(await page.locator('#restore-title').textContent(), 'Fortryd opgaven');
    await page.waitForFunction(() => !document.querySelector('#restore-confirm').disabled); await page.click('#restore-confirm');
    await page.waitForSelector('#restore-dialog:not([open])', { state: 'attached' });
    assert.equal(await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), starter);
    assert.match((await log())[0], /^Fortrudt: Byg første udkast/); assert.equal(await clean(), true);
    // 4. Versioner i almindeligt dansk; "Gå tilbage hertil" bringer AI'ens version tilbage som en ny version.
    await helpers.menuClick(page, '#git-button'); await page.locator('#git-summary').filter({ hasText: 'Alt er gemt.' }).waitFor();
    assert.equal(await page.locator('#git-history li').count(), 3);
    assert.match(await page.locator('#git-history li').first().textContent(), /^i dag \d{2}\.\d{2} · Fortrudt: Byg første udkast .{0,70} …Nuværende$/);
    assert.equal(await page.locator('#restore-undo').isVisible(), false, 'fortrydelse klares med versionerne');
    await page.screenshot({ path: path.join(root, 'versioner.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Gå tilbage til: AI-opgave:', exact: false }).click();
    await page.waitForFunction(() => !document.querySelector('#restore-confirm').disabled); await page.click('#restore-confirm');
    await page.locator('#git-feedback').filter({ hasText: 'gemt som en ny version' }).waitFor();
    assert.equal(await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), built);
    assert.match((await log())[0], /^Gendannet til: AI-opgave: Byg første udkast/);
    // 5. Gem version med ét klik efter brugerens egen ændring.
    await fs.writeFile(path.join(project, 'public/noter.txt'), 'Mine egne noter');
    await page.click('[data-close="git-dialog"]'); await helpers.menuClick(page, '#git-button');
    await page.locator('#git-summary').filter({ hasText: '1 ændring er ikke gemt endnu.' }).waitFor();
    await page.fill('#git-note', 'Mine noter'); await page.click('#git-save-all');
    await page.locator('#git-summary').filter({ hasText: 'Alt er gemt.' }).waitFor();
    assert.equal((await log())[0], 'Mine noter'); assert.equal(await clean(), true);
    await page.click('[data-close="git-dialog"]');
    const usage = await page.locator('#usage-status').textContent();
    assert.match(usage, /^Denne samtale: [\d.]+ tokens ind · [\d.]+ ud · pris ukendt$/);
    // 6. Kom tilbage: projektet, samtalen og forbruget er der efter genstart.
    await app.close(); app = null; await launch();
    await page.locator('#project-name').filter({ hasText: 'Oversigt over tre fiktive mødelokaler' }).waitFor();
    await heading('Tre mødelokaler'); assert.equal(await page.locator('#usage-status').textContent(), usage);
    await page.screenshot({ path: path.join(root, 'kom-tilbage.png'), animations: 'disabled' });
    console.log(JSON.stringify({ status: 'bestået', root, checks: ['Git, anonym identitet og første version ved oprettelse', 'automatisk version efter AI-opgave', 'Fortryd opgaven som ny version', 'versioner i almindeligt dansk med tidspunkter', 'Gå tilbage hertil som ny version', 'Gem version med ét klik', 'seneste projekt genåbnet efter genstart med samtale og forbrug'] }, null, 2));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(root, 'fejl.png'), animations: 'disabled' }).catch(() => {});
    throw error;
  } finally { await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
