// The onboarding-simple restyle through the real Electron interface. Only
// synthetic files and a local model catalog: no inference, no access keys,
// no publishing, no changes to the user's profile beyond the test's own data
// directory. The aside visuals are gone with the restyle: the control status
// ("Gemt", "Kontrollerer", "Fejl", "Modellisten svarer") is read inline from
// #setup-ai / #connection-feedback, and the surface is measured instead of
// the retired .onboarding-b-visual column. #task-dialog keeps onboarding-b
// and its #model-visual — that part of the module is still verified here.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
  const output = process.env.AURA_F20_OUTPUT ? path.resolve(process.env.AURA_F20_OUTPUT) : await fs.mkdtemp(path.join(os.tmpdir(), 'aura-f20-native-'));
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(output, 'profile-'));
  const userdata = path.join(root, 'appdata'), project = path.join(root, 'projekt');
  await fs.mkdir(path.join(project, 'public'), { recursive: true });
  const original = '<!doctype html><html lang="da"><head><title>F20-prøve</title></head><body><h1>Bevar denne fil</h1></body></html>';
  await fs.writeFile(path.join(project, 'public', 'index.html'), original);
  const requests = [], errors = [], checks = [], screenshots = [], measurements = [], assets = [];
  const models = [{ id: 'f20-compact', name: 'F20 lille' }, { id: 'f20-balanced', name: 'F20 mellem' }, { id: 'f20-large', name: 'F20 stor' }];
  let available = true, hold = false, app, page;
  const pending = new Set();
  const catalog = res => {
    res.setHeader('content-type', 'application/json');
    if (!available) { res.writeHead(503); res.end(JSON.stringify({ error: 'Syntetisk katalogfejl' })); }
    else res.end(JSON.stringify({ data: models }));
  };
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    if (req.method !== 'GET' || req.url !== '/v1/models') { res.writeHead(405); res.end(); return; }
    if (hold) { pending.add(res); res.on('close', () => pending.delete(res)); } else catalog(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  const passed = name => checks.push(name);
  // The control states read inline from the receipts, not from an aside.
  const receipt = () => page.locator('#setup-ai');
  async function shot(name) {
    const file = path.join(output, `${name}.png`);
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('harness://'));
      return (await window.webContents.capturePage()).toPNG().toString('base64');
    });
    await fs.writeFile(file, Buffer.from(png, 'base64')); screenshots.push({ name, file });
  }
  async function launch() {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + userdata], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await helpers.isolateDocuments(app, path.join(root, 'Dokumenter'));
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    // The welcome dialog is left standing: on the first run the guided setup
    // starts through the introduction's build path — with the full-window
    // surface there is no sidebar entry from the idea screen.
    await page.locator('#create').waitFor({ state: 'attached' });
    await page.waitForFunction(() => !document.querySelector('#create').disabled && !document.querySelector('#new').disabled);
    assert.equal(await page.evaluate(() => typeof window.OnboardingB?.render), 'function', 'præsentationsmodulet skal serveres gennem appens eksisterende assetgrænse');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('link[href="onboarding-simple.css"]')?.sheet)), true, 'den enkle onboarding-stil skal være indlæst gennem appens assetgrænse');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('link[href="onboarding-b.css"]')?.sheet)), true, 'onboarding-b-stilarket består — modeldialogen bruger det stadig');
    const result = await page.evaluate(async () => Promise.all(['onboarding-simple.css', 'onboarding-b.js', 'onboarding-b.css', 'onboarding-aura-mark.svg', 'onboarding-provider-claude.svg', 'onboarding-provider-mistral.svg', 'f20-unknown.svg'].map(async name => { const response = await fetch(`harness://app/${name}`); return { name, status: response.status, mime: response.headers.get('content-type') }; })));
    for (const item of result) {
      if (item.name === 'f20-unknown.svg') assert.equal(item.status, 404, 'ukendte assets skal fortsat afvises');
      else { assert.equal(item.status, 200, item.name); assert.match(item.mime, item.name.endsWith('.svg') ? /^image\/svg\+xml/ : item.name.endsWith('.js') ? /^text\/javascript/ : /^text\/css/); }
    }
    assets.push(...result);
  }
  async function closeReturnedConnections() {
    if (await page.locator('#connections-dialog').evaluate(element => element.open)) await page.click('[data-close="connections-dialog"]');
  }
  // The full-window surface: the app frame is gone while either onboarding
  // main shows, and it is back in the workspace. The states are asserted
  // directly, so a regression reads as a failed check.
  async function assertFrame({ hidden }) {
    const frame = await page.evaluate(() => ({
      sidebar: getComputedStyle(document.querySelector('.sidebar')).display,
      divider: getComputedStyle(document.querySelector('#sidebar-divider')).display,
      header: getComputedStyle(document.querySelector('.app-content > header')).display
    }));
    if (hidden) {
      assert.equal(frame.sidebar, 'none', 'sidepanelet er væk under onboarding');
      assert.equal(frame.divider, 'none', 'skillelinjen er væk under onboarding');
      assert.equal(frame.header, 'none', 'topbjælken er væk under onboarding');
    } else {
      assert.notEqual(frame.sidebar, 'none', 'sidepanelet er tilbage i arbejdsfladen');
      assert.notEqual(frame.divider, 'none', 'skillelinjen er tilbage i arbejdsfladen');
      // Topbjælken er altid væk i arbejdsfladen (styles.css: den har sin egen
      // arbejdsbjælke) — panelet og skillelinjen er rammen, der skal vende.
    }
  }
  // The restyled surfaces: the new markup carries no eyebrow, progress line or
  // topbar; the back button and the discrete step counter stand top-left.
  async function assertSimpleSurface(step) {
    const surface = await page.locator('#setup').evaluate(element => ({
      eyebrow: Boolean(document.querySelector('#setup-eyebrow')),
      progress: Boolean(document.querySelector('.onboarding-b-progress')),
      topbar: Boolean(document.querySelector('.setup-topbar')),
      visual: Boolean(document.querySelector('#setup-visual')),
      back: element.querySelector('.setup-backline')?.textContent || '',
      counter: element.querySelector('#setup-step-state')?.textContent || '',
      clipped: element.scrollWidth > element.clientWidth + 1
    }));
    assert.equal(surface.eyebrow, false, 'eyebrow-teksten er fjernet');
    assert.equal(surface.progress, false, 'fremgangslinjen er fjernet');
    assert.equal(surface.topbar, false, 'topbaren med logo er fjernet');
    assert.equal(surface.visual, false, 'sidepanelet er fjernet');
    assert.equal(surface.clipped, false, 'fladen klipper ikke vandret');
    assert.ok(surface.back.includes('← Tilbage'), 'Tilbage står øverst til venstre');
    assert.ok(surface.counter === `Trin ${step} af 4`, `trintælleren viser trin ${step}`);
    await assertFrame({ hidden: true });
  }
  async function assertModelMarks() {
    const marks = await page.locator('#model-shortlist .model-choice').evaluateAll(cards => cards.map(card => {
      const mark = card.querySelector('.onboarding-b-choice-mark svg'), style = mark && getComputedStyle(mark);
      return { selected: card.getAttribute('aria-pressed') === 'true', shown: Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0) };
    }));
    assert.ok(marks.length > 0); for (const mark of marks) assert.equal(mark.shown, mark.selected, 'fluebenet skal følge det faktisk valgte modelkort');
  }
  try {
    await launch();
    // Velkomstdialogen står åben fra opstarten, og introduktionen skjuler
    // app-rammen (visibility) bag sig — fladens regel måles fra setup vises.
    // Den guidede indgang: introduktionens byggesti — sidepanelindgangen hører
    // til arbejdsfladen.
    await page.click('#path-app'); await page.click('#welcome-build');
    await page.waitForSelector('#setup:not([hidden])');
    // The guided flow starts on the profile step (empty profile) and walks
    // through D6's detail step before the access choice.
    await assertSimpleSurface(1);
    assert.equal(await page.textContent('#setup-title'), 'Din profil');
    assert.equal(await page.locator('#setup-profile .help-cards input').count(), 3, 'hjælpeniveauet er tre valgkort');
    assert.equal(await page.locator('#setup-profile #profile-help').isHidden(), true, 'den skjulte select består som værdiholder');
    await page.check('#setup-profile .help-cards input[value="delvis"]');
    assert.equal(await page.locator('#profile-help').evaluate(element => element.value), 'delvis', 'valgkortene skriver den skjulte select — gemmevejen er uændret');
    await shot('profil-trin');
    await page.click('#profile-continue');
    await page.waitForSelector('#setup-detail:not([hidden])');
    await assertSimpleSurface(2);
    assert.equal(await page.textContent('#setup-title'), 'Hvor meget vil du se af AI’ens arbejde?');
    assert.equal(await page.textContent('#setup-subtitle'), 'Det ændrer kun, hvordan arbejdet vises — ikke hvad Aura kan.');
    const detailValues = await page.locator('#setup-detail .detail-card input').evaluateAll(cards => cards.map(card => ({ value: card.value, checked: card.checked })));
    assert.deepEqual(detailValues, [{ value: 'compact', checked: false }, { value: 'standard', checked: true }, { value: 'detailed', checked: false }], 'Nøgletrin er forvalgt for en ny bruger');
    await page.check('#setup-detail .detail-card input[value="compact"]');
    await page.click('#detail-continue');
    await page.waitForSelector('#setup-choice:not([hidden])');
    assert.equal((await page.evaluate(() => window.harness.profileGet())).value.profile.transcriptView, 'compact', 'Fortsæt gemmer detaljeniveauet gennem profilkøen');
    passed('D6 · Detaljeniveau: tre radio-kort, Nøgletrin forvalgt, Fortsæt gemmer gennem profilkøen');

    // R7: "Vælg senere" on the detail step preserves the saved level — back
    // from the choice returns to the detail step, the skip performs no save.
    await page.click('#setup-back');
    await page.waitForSelector('#setup-detail:not([hidden])');
    await page.click('#detail-skip');
    await page.waitForSelector('#setup-choice:not([hidden])');
    assert.equal((await page.evaluate(() => window.harness.profileGet())).value.profile.transcriptView, 'compact', 'Spring over bevarer det gemte niveau (R7)');
    passed('D6 · Spring over bevarer den gemte værdi (R7)');

    await page.click('#setup-add-provider');
    assert.equal(await page.locator('#provider-cards [data-kind]').count(), 10);
    assert.equal(await page.locator('#provider-cards [data-kind="alexandra"]').count(), 1);
    assert.equal(await page.locator('#provider-cards [data-kind="komplai"]').count(), 0);
    await page.waitForFunction(() => [...document.querySelectorAll('#provider-cards img')].every(image => image.complete && image.naturalWidth > 0));
    const providerColumns = await page.locator('#provider-cards').evaluate(grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    assert.equal(providerColumns, 3, 'udbyderkortene står i tre kolonner');
    // A card focus is pure presentation: no catalog fetch, no task.
    await page.locator('#provider-cards [data-kind="mistral"]').focus();
    await page.locator('#provider-cards [data-kind="anthropic"]').focus();
    assert.equal(requests.length, 0, 'fokus må ikke hente katalog eller sende en opgave');
    await shot('udbydere');
    passed('Ti oprindelige udbydere i tre kolonner — fokus giver ingen netværkskald');

    await page.click('#provider-cards [data-kind="mistral"]');
    assert.equal(await page.inputValue('#provider-kind'), 'mistral');
    assert.equal(await page.inputValue('#base-url'), 'https://api.mistral.ai/v1');
    assert.equal(await page.locator('#base-url').evaluate(element => element.readOnly), true);
    assert.equal(await page.isVisible('#credential-open'), true); assert.equal(requests.length, 0);
    await shot('forbindelse-mistral');
    assert.equal(await page.locator('#api-key').count(), 0, 'nøglen hører kun til det isolerede vindue');
    await page.click('#setup-back');
    assert.equal(await page.textContent('#credential-status'), 'Ingen ny nøgle valgt');
    passed('Oprindelig udbyderformular og endpoint bevares; Tilbage rydder kun den ikke-gemte nøgle');

    for (const [width, height, zoom] of [[1440, 940, 1], [980, 720, 1], [980, 720, 1.5], [750, 850, 1], [390, 844, 1]]) {
      await app.evaluate(({ BrowserWindow }, value) => {
        const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('harness://'));
        // 750/390 er isolerede CSS-stressprøver. Produktets minimumsstørrelse ændres ikke.
        window.setMinimumSize(320, 480); window.setSize(value.width, value.height); window.webContents.setZoomFactor(value.zoom);
      }, { width, height, zoom });
      await page.waitForTimeout(250);
      const measurement = await page.locator('#setup').evaluate(element => ({ width: innerWidth, height: innerHeight, scroll: element.scrollWidth, client: element.clientWidth, body: document.scrollingElement.scrollWidth, detail: document.querySelector('#setup-detail').getBoundingClientRect().width }));
      measurements.push({ requestedWidth: width, requestedHeight: height, zoom, stressOnly: width < 980, ...measurement });
      assert.ok(measurement.scroll <= measurement.client + 1, 'opsætningen må ikke klippe vandret');
      assert.ok(measurement.body <= measurement.width + 1, 'ingen vandret siderulning');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(`udbydere-${width}-${zoom}-top`);
      await page.locator('#setup-local').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#setup-local').evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight + 1; }), 'Vælg senere kan nås');
      await shot(`udbydere-${width}-${zoom}`);
    }
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('harness://')); window.setMinimumSize(980, 720); window.setSize(1440, 940); window.webContents.setZoomFactor(1); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.locator('#setup').evaluate(element => [...element.querySelectorAll('*')].map(item => ({ duration: getComputedStyle(item).animationDuration, iteration: getComputedStyle(item).animationIterationCount })).filter(item => item.duration.split(',').some(value => parseFloat(value) > 0)));
    assert.equal(motion.length, 0, 'fladen står stille ved reduceret bevægelse');
    passed('Responsiv flade ved 1440/980, zoom 150 %, smalle CSS-stressprøver og reduceret bevægelse');

    // Guidet "Vælg senere" afslutter ved idéfladen: the surface is
    // still frame-less there, and Opret is the way back to the workspace —
    // where the sidebar (and its setup entry) returns.
    await page.click('#setup-local'); await page.waitForSelector('#setup', { state: 'hidden' });
    await page.waitForSelector('#onboarding:not([hidden])');
    await assertFrame({ hidden: true });
    assert.equal(await page.isVisible('#idea-back'), false, 'første start har intet projekt bagved — Tilbage-linket vises ikke');
    assert.equal(await page.inputValue('#name'), '', 'den guidede afslutning står ved en frisk idéflade');
    await page.fill('#name', 'Bevar min F20-kladde'); await page.fill('#purpose', 'En lokal, syntetisk aktivitetsoversigt.');
    await shot('projektide');
    await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
    await assertFrame({ hidden: false });
    passed('Vælg senere afslutter den guidede opsætning ved idéfladen; Opret og fortsæt giver app-rammen tilbage');
    // Regression: idéfladens stille vej tilbage — kun når et projekt ligger
    // bagved. Klikket vender gennem displayProject uden at oprette noget, og
    // kladden står gemt, før linket bruges.
    await page.click('#new'); await page.waitForSelector('#onboarding:not([hidden])');
    await assertFrame({ hidden: true });
    assert.equal(await page.isVisible('#idea-back'), true, 'med et åbent projekt bagved står Tilbage-linket fremme');
    await page.fill('#name', 'Kladde på tværs');
    const draft = await page.evaluate(() => localStorage.getItem('harness.ideaDraft.v1'));
    assert.ok(draft.includes('Kladde på tværs'), 'idékladden står gemt, før Tilbage-linket bruges');
    await page.click('#idea-back'); await page.waitForSelector('#workspace:not([hidden])');
    assert.equal(await page.locator('#project-name').textContent(), 'Bevar min F20-kladde', 'Tilbage-linket vender tilbage til det åbne projekt uden at oprette noget');
    assert.equal(await page.isVisible('#idea-back'), false, 'tilbage i arbejdsfladen er linket væk igen');
    assert.match(await page.inputValue('#prompt'), /En lokal, syntetisk aktivitetsoversigt\./, 'arbejdsfladens kladde og visning er bevaret af rundturen');
    const draftAfter = await page.evaluate(() => localStorage.getItem('harness.ideaDraft.v1'));
    assert.ok(String(draftAfter).includes('Kladde på tværs'), 'Tilbage-klikket rydder ikke den gemte idékladde');
    passed('Idéfladen har én stille vej tilbage til arbejdsfladen — uden oprettelse og med kladden i behold');

    // Repeat setup from the workspace sidebar — the entry that remains.
    await helpers.openSetup(page); await page.click('#setup-add-provider'); await page.click('#provider-cards [data-kind="compatible"]');
    if (!await page.locator('#connection-advanced').evaluate(element => element.open)) await page.click('#connection-advanced > summary');
    await page.fill('#connection-name', 'Lokal F20-prøve'); await page.fill('#base-url', endpoint);
    hold = true; await page.click('#save-connection');
    await page.waitForFunction(() => document.querySelector('#setup').dataset.step === 'saved');
    const deadline = Date.now() + 20000;
    while (!pending.size && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(pending.size > 0, 'Gem skal starte den oprindelige, eksplicitte katalogkontrol');
    assert.match(await receipt().textContent(), /Henter modelkatalog/, 'kontrollen læses inline: "kontrollerer" er sin egen tilstand');
    await shot('katalog-afventer'); hold = false; for (const response of [...pending]) catalog(response);
    await page.waitForFunction(() => !document.querySelector('#setup-continue').disabled);
    assert.match(await receipt().textContent(), /Forbindelsen svarer/, 'modellisten svarer: grøn kontrol er kun det faktiske katalogsvar');
    await shot('katalog-kontrolleret');
    const connectionID = await page.inputValue('#setup-connection');
    await page.selectOption('#setup-connection', ''); await page.selectOption('#setup-connection', connectionID);
    assert.match(await receipt().textContent(), /ikke kontrolleret/, 'et nyt forbindelsesvalg kræver sin egen kontrol');
    available = false; await page.click('#setup-test'); await receipt().filter({ hasText: 'mislykkedes' }).waitFor();
    assert.equal(await page.isDisabled('#setup-continue'), true, 'en nyere fejl giver aldrig falsk grøn Fortsæt'); await shot('katalog-fejl');
    available = true; await page.click('#setup-test'); await page.waitForFunction(() => !document.querySelector('#setup-continue').disabled);
    await page.click('#setup-continue'); await page.waitForSelector('#setup', { state: 'hidden' });
    await closeReturnedConnections();
    const saved = JSON.parse(await fs.readFile(path.join(userdata, 'harness', 'settings.json'), 'utf8'));
    assert.equal(saved.connections.length, 1); assert.equal(saved.connections[0].kind, 'compatible'); assert.equal(saved.connections[0].baseURL, endpoint); assert.equal(saved.connections[0].secret, undefined);
    assert.equal(saved.profile.transcriptView, 'compact', 'detaljeniveauet fra trinnet er gemt i profilen');
    passed('Gem, inline-kontrol ("gemt/kontrollerer/fejl/svarer") og Fortsæt-lås: fem adskilte tilstande');

    await helpers.openExistingProject(app, page, project);
    await page.waitForFunction(() => [...document.querySelector('#model-select').options].some(option => option.value === 'f20-large'));
    await helpers.taskOptions(page);
    await page.locator('#model-shortlist .model-choice').first().waitFor(); await assertModelMarks(); await shot('modelvalg');
    const model = await page.locator('#model-shortlist .model-choice').first().getAttribute('data-model');
    await page.locator('#model-shortlist .model-choice').first().click();
    await page.waitForFunction(() => !document.querySelector('#task-dialog').open);
    assert.equal(await page.inputValue('#model-select'), model);
    await helpers.taskOptions(page); assert.equal(await page.locator(`#model-shortlist [data-model="${model}"]`).getAttribute('aria-pressed'), 'true'); await assertModelMarks();
    await shot('model-valgt'); await helpers.closeTaskOptions(page);
    assert.equal(await fs.readFile(path.join(project, 'public', 'index.html'), 'utf8'), original);
    assert.equal(await page.locator('#data-dialog').evaluate(element => element.open), false);
    assert.ok(requests.every(request => request.method === 'GET' && request.url === '/v1/models'), 'opsætning og modelvalg sender ingen inferens');
    passed('Faktisk modelvalg i den eksisterende Din AI-dialog uden inferens eller projektændringer');

    await app.close(); app = null; await launch(); await helpers.openSetup(page); await page.click('#setup-use-saved');
    assert.match(await receipt().textContent(), /ikke kontrolleret/, 'genstart genbruger ikke en gammel grøn kontrol');
    assert.equal(await page.isDisabled('#setup-continue'), true);
    await shot('gemt-ikke-kontrolleret-efter-genstart');
    assert.deepEqual(errors, []); passed('Genstart bevarer forbindelsen og detaljeniveauet men genbruger ikke en gammel grøn katalogkontrol');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ status: 'bestået', root, checks, screenshots, measurements, assets, requests, errors, inference: 'Ikke udført; alle observerede katalogkald var GET /v1/models.', remaining: ['Modelsamtykke, planer og værktøjsgodkendelser prøves særskilt med verify-planning.cjs og verify-approvals.cjs.'] }, null, 2));
    console.log(JSON.stringify({ status: 'bestået', output, checks: checks.length, screenshots: screenshots.length, catalogRequests: requests.length }));
  } catch (error) {
    if (app) await shot('fejl').catch(() => {});
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ status: 'fejlet', root, error: error.message, checks, screenshots, measurements, assets, requests, errors }, null, 2));
    throw error;
  } finally {
    hold = false; for (const response of [...pending]) catalog(response);
    await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
