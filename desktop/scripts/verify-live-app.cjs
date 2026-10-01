// Hele begynderforløbet mod en rigtig model gennem appens egen opsætning: nøglevejledning, forvalgt model, resumé, plan, bygning,
// godkendelse og rettelse. Brugeren taster selv nøglen i appvinduet; scriptet ser aldrig nøglen og sletter appdata med den krypterede
// nøgle bagefter. Kun opdigtet idé og data. Kørslen kan koste penge hos udbyderen; Mistrals gratis plan er gratis.
// Brug: HARNESS_LIVE_PROVIDER=mistral npm run test:live-app -- [resultatmappe] [model-id]
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const desktop = path.join(__dirname, '..');
const { _electron: electron } = require('playwright');
const electronPath = require('electron');
const provider = process.env.HARNESS_LIVE_PROVIDER || 'mistral';
if (!['anthropic', 'mistral', 'corti'].includes(provider)) throw new Error('HARNESS_LIVE_PROVIDER skal være anthropic, mistral eller corti.');

const wanted = process.argv[3] || '';
let out = process.argv[2];
const idea = process.env.IDEA || 'Jeg vil lave en oversigt over tre fiktive mødelokaler, hvor jeg kan finde et lokale med plads til mit møde.';
const correction = process.env.CORRECTION || 'Vis antallet af pladser tydeligt på hvert lokale, og skriv en kort besked, når intet lokale passer til antallet af deltagere.';
const log = [];
let counter = 0;
const note = text => { const line = `[${new Date().toISOString().slice(11, 19)}] ${text}`; log.push(line); console.log(line); };

async function main() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-rigtig-model-')));
  out ||= path.join(root, 'resultat'); await fs.mkdir(out, { recursive: true });
  const documents = path.join(root, 'Dokumenter');
  const app = await electron.launch({ executablePath: electronPath, args: [desktop, '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  try {
    await app.evaluate(({ app }, folder) => app.setPath('documents', folder), documents);
    const win = await app.firstWindow(); win.setDefaultTimeout(30000);
    const errors = []; win.on('pageerror', e => errors.push(e.message));
    const shot = async name => { const file = `${String(++counter).padStart(2, '0')}-${name}.png`; await win.screenshot({ path: path.join(out, file), animations: 'disabled' }); note(`Skærmbillede ${file}`); };
    await win.waitForFunction(() => !document.querySelector('#welcome-build').disabled);
    // Tokenforbrug fra motorens egne beskedoplysninger. Kun tal gemmes.
    await win.evaluate(() => { window.__usage = {}; window.harness.onEvent(e => { const info = e.properties?.info; if (e.type === 'message.updated' && info?.role === 'assistant' && info.tokens) window.__usage[info.id] = info.tokens; }); });

    await win.click('#path-app'); await win.click('#welcome-build'); await win.waitForSelector('#setup:not([hidden])');
    await win.click('#setup-add-provider'); await win.click(`#provider-cards [data-kind="${provider}"]`);
    await win.locator('.key-guide > summary').click(); await shot('noeglevejledning');
    note(`KLAR: Følg vejledningen i appvinduet, indsæt nøglen fra ${provider}, og tryk Gem og kontrollér. Scriptet venter i op til 30 minutter. Resultater: ${out}`);
    await win.waitForFunction(() => !document.querySelector('#setup-continue').hidden && !document.querySelector('#setup-continue').disabled, null, { timeout: 30 * 60000, polling: 1000 });
    note(`Forbindelse: ${(await win.locator('#setup-ai').innerText()).trim()}`);
    await win.click('#setup-continue'); await win.click('#features-all'); await win.waitForSelector('#create-form');
    await win.fill('#purpose', idea); note(`Navneforslag: ${await win.inputValue('#name')}`);
    await win.click('#create'); await win.waitForSelector('#workspace:not([hidden])', { timeout: 60000 });
    const project = (await fs.readdir(path.join(documents, 'Aura'))).map(name => path.join(documents, 'Aura', name))[0];
    await win.waitForFunction(() => document.querySelector('#model-select').value, null, { timeout: 30000 });
    if (wanted && await win.inputValue('#model-select') !== wanted) {
      await win.click('#model-chip'); if (!await win.locator('#model-catalog').evaluate(el => el.open)) await win.click('#model-catalog > summary');
      await win.selectOption('#model-select', wanted); await win.click('#model-done');
    }
    note(`Model: ${await win.inputValue('#model-select')} · ${await win.locator('#model-chip').innerText()}`);

    const approvals = [];
    async function answerApprovals() {
      for (const box of await win.locator('#approvals .approval').all()) {
        const title = (await box.locator('strong').first().innerText().catch(() => '')).trim();
        const target = (await box.locator('.action-target').innerText().catch(() => '')).trim();
        const task = box.locator('button').filter({ hasText: 'Tillad for denne opgave' });
        if (await task.count()) { approvals.push(`tilladt for opgaven: ${target}`); await task.click(); }
        else if (await box.locator('button').filter({ hasText: 'Svar' }).count()) { approvals.push(`spørgsmål: ${title}`); for (const input of await box.locator('input').all()) await input.fill('Brug dit bedste bud, og byg videre.'); await box.locator('button').filter({ hasText: 'Svar' }).click(); }
        else { approvals.push(`afvist: ${title} · ${target}`); await box.locator('button').filter({ hasText: 'Afvis' }).click(); }
      }
    }
    async function runUntilDone(label, limit = 12 * 60000) {
      const start = Date.now();
      await win.waitForFunction(() => !document.querySelector('#stop').hidden || document.querySelector('#data-dialog').open, null, { timeout: 60000 });
      if (await win.locator('#data-dialog').evaluate(el => el.open)) { await shot(`${label}-resume`); await win.click('#accept-send'); }
      while (Date.now() - start < limit) {
        if (await win.locator('#approvals .approval').count()) { await shot(`${label}-godkendelse`); await answerApprovals(); }
        if (await win.locator('#stop').isHidden() && !(await win.locator('#approvals .approval').count())) break;
        await win.waitForTimeout(1500);
      }
      const status = (await win.locator('#run-status').innerText()).trim();
      note(`${label}: status ${status} efter ${Math.round((Date.now() - start) / 1000)} s`);
    }

    // Et nyt projekt har allerede idéen i skrivefeltet; knappen vises kun, når feltet er tomt.
    if (await win.isVisible('#start-idea')) await win.click('#start-idea');
    if (!(await win.inputValue('#prompt')).includes(idea.trim().slice(0, 30))) throw new Error('Idéen står ikke i skrivefeltet.');
    await win.click('#send');
    await runUntilDone('plan');
    const planVisible = await win.locator('#plan-card').isVisible();
    const plan = await win.locator('#plan-text').textContent().catch(() => '');
    await shot('plan');
    if (planVisible) {
      await win.click('#build-plan');
      await runUntilDone('bygning');
      await win.waitForTimeout(2500); await shot('foerste-udkast');
      await win.selectOption('#viewport-preset', 'phone'); await win.waitForTimeout(1500); await shot('mobil'); await win.selectOption('#viewport-preset', 'fluid');
      await win.fill('#prompt', correction); await win.click('#send');
      await runUntilDone('rettelse');
      await win.waitForTimeout(2500); await shot('efter-rettelse');
    } else note('Ingen plan at bygge efter. Se samtalen.');

    const usage = Object.values(await win.evaluate(() => window.__usage));
    await fs.writeFile(path.join(out, 'plan.txt'), plan || '');
    await fs.writeFile(path.join(out, 'samtale.txt'), await win.locator('#messages').innerText());
    await fs.writeFile(path.join(out, 'index.html'), await fs.readFile(path.join(project, 'public/index.html'), 'utf8').catch(() => ''));
    for (const file of ['styles.css', 'app.js', 'script.js', 'main.js']) { const text = await fs.readFile(path.join(project, 'public', file), 'utf8').catch(() => null); if (text !== null) await fs.writeFile(path.join(out, file), text); }
    await fs.writeFile(path.join(out, 'forbrug.json'), JSON.stringify(usage, null, 2));
    note(`Filer i projektet: ${(await fs.readdir(project, { recursive: true })).filter(f => !f.startsWith('.git')).join(', ')}`);
    note(`Godkendelser: ${approvals.join(' | ') || 'ingen'}`);
    const sum = key => usage.reduce((total, u) => total + (key === 'cache' ? (u.cache?.read || 0) : u[key] || 0), 0);
    note(`Modelsvar: ${usage.length} · input ${sum('input')} · output ${sum('output')} · ræsonnement ${sum('reasoning')} · cache læst ${sum('cache')}`);
    note(`Sidefejl: ${JSON.stringify(errors)}`);
  } finally { await app.close().catch(() => {}); await fs.rm(path.join(root, 'appdata'), { recursive: true, force: true }); note('Appdata med den krypterede nøgle er slettet.'); await fs.writeFile(path.join(out, 'log.txt'), log.join('\n')); }
}
main().catch(error => { note(`STOP: ${error.message.split('\n')[0]}`); process.exitCode = 1; });
