const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.join(__dirname, '..', '..');
// Profilen, der udfyldes i onboarding-trinnet ved første start (tom profil) og
// genfindes i Indstillinger og efter genstart i de to nye kontroller. Ikonet
// vælges først som Aura-variant og skifter derefter til eget billede, så både
// rækken og avatar-vejen prøves fra første gang.
const PROFILE = { name: 'Anna Klit', icon: 'aura-1', theme: 'dark' };
// Et lille gyldigt PNG, som hovedprocessens nativeImage kan afkode: avataren
// læses som buffer (i modsætning til logoet, der kun vises i browseren).
function tinyPNG() {
  const zlib = require('node:zlib');
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 0x7f)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
(async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-desktop-'));
  const reference = path.join(testRoot, 'reference.txt');
  await fs.writeFile(reference, 'PRIVAT TESTREFERENCE');
  const logo = path.join(testRoot, 'logo.png');
  await fs.writeFile(logo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
  const avatar = path.join(testRoot, 'avatar.png');
  await fs.writeFile(avatar, tinyPNG());
  const executablePath = require('electron');
  let app;
  async function launch({ expectProject } = {}) {
    app = await electron.launch({executablePath, args:[path.join(root, 'desktop'), '--user-data-dir='+path.join(testRoot,'electron-data')], env:{...process.env, ELECTRON_RUN_AS_NODE: undefined}});
    await require('./ui-test-helpers.cjs').isolateDocuments(app, path.join(testRoot, 'Dokumenter'));
    const page = await app.firstWindow();
    // Velkomstdialogen lukkes ikke blindt her: ved første start er den den
    // guidede indgang til opsætningen (fuldvinduesfladen har intet panel).
    await page.locator('#create').waitFor({ state: 'attached' });
    await page.waitForFunction(() => !document.querySelector('#create').disabled && !document.querySelector('#new').disabled);
    // Det projekt, der sidst var åbent, åbnes igen ved start. Et projekt lukket med Nyt projekt gør ikke.
    if (expectProject) { await page.waitForSelector('#workspace:not([hidden])'); assert.equal(await page.locator('#project-name').textContent(), expectProject); await page.frameLocator('#preview').locator('h1').waitFor(); }
    // Fuldvinduesfladen: onboardingfladerne viser ingen app-ramme, så
    // opsætningens sidepanelindgang hører til arbejdsfladen. Tre ærlige
    // indgange: første start går gennem introduktionens byggesti; en genstart
    // med et sidste projekt tager repeat-indgangen fra panelet; en start uden
    // begge dele opretter den første idé — den eneste vej videre på den
    // rammeløse idéflade.
    let guided = false;
    if (await page.locator('#welcome-dialog').evaluate(el => el.open)) {
      guided = true;
      await page.click('#path-app'); await page.click('#welcome-build');
      await page.waitForSelector('#setup:not([hidden])');
    } else if (await page.locator('#workspace').isVisible()) {
      // Opsætningen gennemgås ad de nye veje: "Tilføj forbindelse" åbner det lette
      // flow inde i dialogen (ikke opsætningsskærmen), og "Gennemgå opsætningen"
      // starter repeat-runderne fra panelet.
      await require('./ui-test-helpers.cjs').menuClick(page, '#connections-button');
      await page.waitForFunction(() => { const dialog = document.querySelector('#connections-dialog'); return dialog.open && !dialog.getAnimations().some(animation => animation.playState === 'running'); });
      await page.click('#connection-add'); await page.waitForSelector('#connection-add-flow:not([hidden])');
      await page.click('#connection-add-cancel'); await page.waitForSelector('#connections-list:not([hidden])');
      await page.click('#connections-setup'); await page.waitForSelector('#setup:not([hidden])');
    } else {
      assert.equal(await page.locator('#workspace').isVisible(), false, 'et projekt lukket med Nyt projekt genåbnes ikke');
      await page.fill('#name','Fælleshaven'); await page.fill('#purpose','Find og del aktiviteter med dine naboer.');
      await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
      await require('./ui-test-helpers.cjs').menuClick(page, '#connections-button');
      await page.waitForFunction(() => { const dialog = document.querySelector('#connections-dialog'); return dialog.open && !dialog.getAnimations().some(animation => animation.playState === 'running'); });
      await page.click('#connections-setup'); await page.waitForSelector('#setup:not([hidden])');
    }
    let uploaded = false;
    if (await page.locator('#setup-profile').isVisible()) {
      // Første guidede gang med en tom profil vises profil-trinnet, og felterne
      // udfyldes her. Operativsystemets navneforslag kan nå feltet efter
      // udfyldningen; navnet prøves, til det står stille.
      for (let settled = false, attempts = 0; !settled && attempts < 10; attempts++) {
        await page.fill('#profile-name', PROFILE.name);
        settled = await page.waitForFunction(name => document.querySelector('#profile-name').value === name, PROFILE.name, { timeout: 1000 }).then(() => true, () => false);
      }
      assert.equal(await page.inputValue('#profile-name'), PROFILE.name, 'profilnavnet står stille efter udfyldningen');
      await page.click(`#profile-icon-row button[data-icon="${PROFILE.icon}"]`);
      await page.check(`#profile-theme input[value="${PROFILE.theme}"]`);
      // En afbrudt filvælger er en stille status, ikke en fejl — intet sker.
      await choose([], true); await page.click('#profile-avatar-slot');
      await page.waitForSelector('#message:not([hidden])');
      assert.equal(await page.locator('#message').textContent(), 'Billedvalget blev afbrudt.');
      assert.equal((await page.getAttribute('#message', 'class') || '').includes('error'), false, 'beskeden er ikke en fejl');
      // Eget billede: filvælgeren stubbes, hovedprocessen gemmer og skalerer,
      // og rækken viser forhåndsvisningen som det valgte ikon.
      await choose([avatar]); await page.click('#profile-avatar-slot');
      await page.waitForSelector('#profile-icon-row button[data-icon="upload"][aria-checked="true"]');
      // Ruten svarer altid PNG, gemmes aldrig i cachen og gætter aldrig
      // content-type — som resten af appens nosniff-hærdning.
      assert.deepEqual(await page.evaluate(async () => { const answer = await fetch('avatar.png'); return [answer.status, answer.headers.get('content-type'), answer.headers.get('cache-control'), answer.headers.get('x-content-type-options')]; }), [200, 'image/png', 'no-store', 'nosniff'], 'avatar-ruten: PNG, ingen cache, nosniff');
      uploaded = true;
      // D6 · Detaljeniveau: Fortsæt fra profilen fører gennem detaljetrinnet,
      // før valget af adgang — prøven vælger Nøgletrin (standard) og fortsætter.
      await page.click('#profile-continue');
      await page.waitForSelector('#setup-detail:not([hidden])');
      await page.click('#detail-continue');
    }
    await page.waitForSelector('#setup-choice:not([hidden])');
    await page.click('#setup-local');
    // Guidet "Vælg senere" afslutter ved idéfladen, og den første idé oprettes —
    // derefter er app-rammen tilbage. Repeat-runder genåbner AI-forbindelser;
    // dialogen lukkes, og prøven står i arbejdsfladen.
    if (guided) {
      await page.waitForSelector('#setup', { state: 'hidden' });
      await page.waitForSelector('#onboarding:not([hidden])');
      await page.fill('#name','Fælleshaven'); await page.fill('#purpose','Find og del aktiviteter med dine naboer.');
      await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
    } else {
      await page.waitForSelector('#connections-dialog[open]');
      await page.click('[data-close="connections-dialog"]');
      await page.waitForFunction(() => !document.querySelector('#connections-dialog').open);
      await page.waitForSelector('#workspace:not([hidden])');
    }
    // Opsætningen er lukket, og sidepanelet er tilbage: chippen viser nu
    // avatar-billedet fra profil-trinnet (fuldvinduesfladen skjulte panelet,
    // mens onboarding stod fremme).
    if (uploaded) await page.waitForSelector('#profile-chip:not([hidden]) #profile-chip-mark img');
    const identity = await app.evaluate(({app, Menu}) => ({ name: app.getName(), userData: app.getPath('userData'), labels: Menu.getApplicationMenu().items.map(item => item.label) }));
    assert.equal(identity.name, 'Aura');
    assert.equal(await fs.realpath(identity.userData), await fs.realpath(path.join(testRoot, 'electron-data')));
    assert.deepEqual(identity.labels, [require('../core/distribution.cjs').displayName, 'Rediger', 'Vis', 'Vindue']);
    return page;
  }
  // Ren genstart uden opsætningsgennemløb: bruges dér, hvor prøven skal lande
  // på idéfladen med den gemte kladde intakt (panelets indgange findes først
  // igen, når et projekt findes).
  async function relaunch() {
    app = await electron.launch({executablePath, args:[path.join(root, 'desktop'), '--user-data-dir='+path.join(testRoot,'electron-data')], env:{...process.env, ELECTRON_RUN_AS_NODE: undefined}});
    await require('./ui-test-helpers.cjs').isolateDocuments(app, path.join(testRoot, 'Dokumenter'));
    const page = await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);
    return page;
  }
  async function choose(paths, canceled=false) {
    await app.evaluate(({dialog}, {paths,canceled}) => {dialog.showOpenDialog = async () => ({canceled,filePaths:paths});}, {paths,canceled});
  }
  try {
    let page = await launch();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.screenshot({path:path.join(testRoot, 'opstart.png'), fullPage:true});
    // Kontrol: profilen udfyldes i onboarding og ændres i Indstillinger. Trinnet
    // udfyldte navn, ikon og tema under opstarten; Indstillinger › Din profil
    // viser de samme værdier, et nyt navn gemmes, og sektionen genåbnes med det.
    await page.click('#settings-toggle'); await page.click('#settings-profile-button');
    await page.waitForFunction(name => document.querySelector('#settings-name')?.value === name, PROFILE.name);
    assert.deepEqual(await page.locator('#settings-icons button[aria-checked="true"]').evaluateAll(buttons => buttons.map(button => button.dataset.icon)), ['upload'], 'upload-ikonet fra trinnet står som det valgte');
    assert.equal(await page.evaluate(() => document.body.dataset.workspaceTheme), PROFILE.theme, 'temaet fra profil-trinnet er i brug');
    await page.fill('#settings-name', 'Bo Larsen'); await page.locator('#settings-name').press('Tab');
    await page.waitForFunction(() => window.harness.profileGet().then(result => result.value.profile.name === 'Bo Larsen'));
    await page.click('[data-close="settings-dialog"]');
    await page.click('#settings-toggle'); await page.click('#settings-profile-button');
    await page.waitForFunction(() => document.querySelector('#settings-name')?.value === 'Bo Larsen');
    assert.equal(await page.locator('#settings-dialog').evaluate(dialog => dialog.open), true, 'Din profil genåbnes med det nye navn');
    await page.click('[data-close="settings-dialog"]');
    // Idéfladen igen — panelet skjules dér nu, så trinnets felter udfyldes i
    // ét besøg, før kladden gemmes og prøven genstarter.
    await page.click('#new'); await page.waitForSelector('#onboarding:not([hidden])');
    await page.fill('#name','Fælleshaven'); await page.fill('#purpose','Find og del aktiviteter med dine naboer.');
    await require('./ui-test-helpers.cjs').projectOptions(page); await page.click('#design-options > summary'); await page.fill('#links','https://example.com/design');
    await choose([reference]); await page.click('#reference'); await page.waitForSelector('#assets li');
    await choose([logo]); await page.click('#logo');
    await page.waitForFunction(()=>document.querySelectorAll('#assets li').length===2);
    await page.fill('#design-name', 'Genbrugeligt design'); await page.click('#save-design');
    await page.waitForFunction(() => document.querySelector('#design-select').options.length === 2);
    await fs.unlink(reference); await fs.unlink(logo);
    await app.close(); page = await relaunch();
    // Kontrol: profilen genindlæses efter genstart. Temaet er i brug fra første
    // visning — nu uden nogen opsætningsrunde imellem. Genstarten lander på
    // idéfladen med den gemte kladde intakt: designpakken genbruges her, og
    // idéen oprettes, FØR panelets indgange skal bruges igen.
    assert.equal(await page.evaluate(() => document.body.dataset.workspaceTheme), PROFILE.theme, 'profilens tema sættes ved genstart');
    await page.waitForFunction(() => document.querySelector('#design-select').options.length === 2);
    await require('./ui-test-helpers.cjs').projectOptions(page); await page.click('#design-options > summary'); await page.selectOption('#design-select', { label: 'Genbrugeligt design · 2 filer' });
    await page.waitForFunction(() => document.querySelectorAll('#assets li').length === 2);
    assert.equal(await page.inputValue('#links'), 'https://example.com/design');
    await page.fill('#name','Fælleshaven'); await page.fill('#purpose','Find og del aktiviteter med dine naboer.');
    // Standardplaceringen står fast, når brugeren annullerer valget af en anden mappe.
    await choose([],true); await page.click('#choose-location');
    await page.waitForFunction(()=>!document.querySelector('#create').disabled);
    assert.match(await page.locator('#project-location').textContent(), /Dokumenter › Aura/);
    assert.equal(await page.locator('#onboarding').isVisible(),true);
    await require('./ui-test-helpers.cjs').chooseLocation(app, page, testRoot); await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])');
    // Først nu er app-rammen tilbage, og Indstillinger kan åbnes: felterne
    // viser de gemte værdier.
    await page.click('#settings-toggle'); await page.click('#settings-profile-button');
    await page.waitForFunction(() => document.querySelector('#settings-name')?.value === 'Bo Larsen');
    assert.deepEqual(await page.locator('#settings-icons button[aria-checked="true"]').evaluateAll(buttons => buttons.map(button => button.dataset.icon)), ['upload'], 'profilbilledet genfindes efter genstart');
    await page.click('#settings-avatar-remove');
    await page.waitForFunction(() => document.querySelector('#settings-icons button[data-icon=""]')?.getAttribute('aria-checked') === 'true');
    await page.click('[data-settings-section="appearance"]');
    await page.waitForFunction(theme => document.querySelector(`#settings-theme input[value="${theme}"]`)?.checked === true, PROFILE.theme);
    // Skriftstørrelse (4K-skalering): trin til 16, og zoomen følger med som
    // app-zoom (16/13); tilbage på 13 gendanner 100%. Zoomfaktoren læses i
    // hovedprocessen — den er ikke renderens eget, og den er persisteret
    // gennem profilen, ikke et uadministreret zoomniveau.
    const zoomFactor = () => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.getZoomFactor());
    for (let step = 0; step < 3; step++) await page.click('#settings-font-up');
    await page.waitForFunction(() => window.harness.profileGet().then(result => result.value.profile.appearance.fontSize === 16));
    assert.ok(Math.abs(await zoomFactor() - 16 / 13) < 0.01, 'font size 16 anvendes som app-zoom (1.231)');
    assert.equal(await page.locator('#settings-font-up').isDisabled(), true, 'op-knappen står disabled ved 16');
    for (let step = 0; step < 3; step++) await page.click('#settings-font-down');
    await page.waitForFunction(() => window.harness.profileGet().then(result => result.value.profile.appearance.fontSize === 13));
    assert.ok(Math.abs(await zoomFactor() - 1) < 0.01, 'tilbage på 13 er zoomen 100%');
    await page.click('[data-close="settings-dialog"]');
    // Et nyt projekts første idé står som en redigerbar kladde i Byg (DESIGN.md); teksten ligger i skrivefeltet.
    assert.equal(await page.inputValue('#work-mode'), 'free');
    assert.match(await page.inputValue('#prompt'), /Find og del aktiviteter/);
    assert.equal(await page.locator('#messages').textContent(), '');
    await page.fill('#prompt', 'Min egen kladde'); assert.equal(await page.isVisible('#start-idea'), false, 'en kladde kan ikke overskrives');
    assert.equal(await page.inputValue('#prompt'), 'Min egen kladde');
    assert.equal(await page.locator('#messages').textContent(), '');
    await page.fill('#prompt', '');
    const preview = page.frameLocator('#preview');
    const all = await fs.readdir(testRoot); const projectDir=path.join(testRoot,all.find(x=>x.startsWith('projekt-')));
    const publicIndex=path.join(projectDir,'public/index.html');
    // Før første version viser ruden kun en pladsholder. Når siden er ændret, vises den rigtige side med logoet.
    await page.screenshot({path:path.join(testRoot,'foer-foerste-version.png')});
    await require('./ui-test-helpers.cjs').firstVersion(page,projectDir,'Fælleshaven');
    assert.equal(await preview.locator('.logo').evaluate(el=>el.complete && el.naturalWidth>0),true);
    const initial=await fs.readFile(publicIndex,'utf8');
    await page.waitForTimeout(1800);
    await fs.writeFile(publicIndex,initial.replace('Fælleshaven</h1>','En levende fælleshave</h1>'));
    await preview.locator('h1').filter({hasText:'En levende fælleshave'}).waitFor({timeout:10000});
    for (const [preset, w, h] of [['desktop',1920,1080],['tablet',768,1024],['phone',390,844]]) {
      await page.click(`.viewport-icon[data-preset="${preset}"]`);
      await page.waitForFunction(([w,h])=>{const f=document.querySelector('#preview');return f.clientWidth===w&&f.clientHeight===h;},[w,h]);
      assert.deepEqual(await preview.locator('body').evaluate(()=>[innerWidth,innerHeight]),[w,h]);
    }
    await require('./ui-test-helpers.cjs').previewOptions(page); await page.click('#viewport-rotate');
    assert.deepEqual(await preview.locator('body').evaluate(()=>[innerWidth,innerHeight]),[844,390]);
    await page.fill('#viewport-width','1024'); await page.locator('#viewport-width').press('Tab');
    assert.equal(await preview.locator('body').evaluate(()=>innerWidth),1024);
    await page.keyboard.press('Escape');
    const divider=await page.locator('#workspace-divider').boundingBox();
    const originalWidth=(await page.locator('#chat-panel').boundingBox()).width;
    await page.mouse.move(divider.x+3,divider.y+100);await page.mouse.down();await page.mouse.move(divider.x+143,divider.y+100,{steps:12});await page.mouse.up();
    assert.ok((await page.locator('#chat-panel').boundingBox()).width>originalWidth+100);
    await page.locator('#workspace-divider').focus();await page.keyboard.press('Home');
    assert.equal(await page.locator('#workspace-divider').getAttribute('aria-valuenow'),'280');
    await page.click('.viewport-icon[data-preset="desktop"]');await require('./ui-test-helpers.cjs').previewOptions(page);await page.selectOption('#viewport-zoom','actual');
    // Overløb opstår først, når siden er bredere end ruden. Brug en egen bredde over ruden,
    // så prøven ikke afhænger af vinduets og skærmens størrelse (kendt svaghed i den gamle prøve).
    const surfaceWidth = await page.locator('#preview-surface').evaluate(el => el.clientWidth);
    await page.fill('#viewport-width', String(surfaceWidth + 600)); await page.locator('#viewport-width').press('Tab');
    assert.ok(await page.locator('#preview-surface').evaluate(el=>el.scrollWidth>el.clientWidth));
    await page.selectOption('#viewport-zoom','fit'); await page.keyboard.press('Escape');
    assert.ok(await page.locator('#preview-surface').evaluate(el=>el.scrollWidth<=el.clientWidth));
    await page.screenshot({path:path.join(testRoot,'desktop-preview.png'),fullPage:true});
    await page.click('.viewport-icon[data-preset="fluid"]');
    assert.equal(await preview.locator('body').evaluate(()=>typeof window.harness),'undefined');
    assert.equal(await preview.locator('body').evaluate(()=>typeof require),'undefined');
    assert.equal(await preview.locator('body').evaluate(async()=>{try{await fetch('https://example.com');return true;}catch{return false;}}),false);
    await fs.rename(publicIndex, publicIndex + '.backup');
    await page.locator('#preview-status').filter({hasText:'Kan ikke læse siden'}).waitFor({timeout:10000});
    await fs.rename(publicIndex + '.backup', publicIndex);
    await page.locator('#preview-status').filter({hasText:'Lokal forhåndsvisning'}).waitFor({timeout:10000});
    assert.equal(await preview.locator('body').evaluate(()=>{try{return !!parent.harness;}catch{return false;}}),false);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).setSize(980,720));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    assert.ok((await page.locator('#preview').boundingBox()).width > 250);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).setSize(1440,940));
    await page.screenshot({path:path.join(testRoot, 'arbejdsflade.png'),fullPage:true});
    await page.click('#new');
    await page.waitForSelector('#onboarding:not([hidden])');
    assert.equal(await page.inputValue('#name'), '');
    await app.close();
    page=await launch(); await choose([projectDir]); await page.click('#open');
    await page.frameLocator('#preview').locator('h1').filter({hasText:'En levende fælleshave'}).waitFor();
    await app.close(); page=await launch({ expectProject: 'Fælleshaven' });
    // Samme navn samme sted giver en ny, nummereret mappe. Det eksisterende projekt røres ikke.
    await page.click('#new'); await page.waitForSelector('#onboarding:not([hidden])');
    await page.fill('#name','Fælleshaven');await page.fill('#purpose','Må ikke overskrive');await require('./ui-test-helpers.cjs').chooseLocation(app, page, testRoot);await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])');assert.match(await fs.readFile(publicIndex,'utf8'),/En levende fælleshave/);
    assert.match(await fs.readFile(path.join(testRoot,'projekt-faelleshaven-2','README.md'),'utf8'),/Må ikke overskrive/);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).setSize(980,720));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    assert.deepEqual(errors,[]);
    // Skriftstørrelsen persisterer over genstart: sæt 16, luk appen, og læs
    // zoomfaktoren i den nye instans — fra profilen, ikke et session-zoom.
    // Genstarten går uden launch(): h1-ventet på forhåndsvisningen hører til
    // projektets egen prøve, og et helt nyt projekt uden samtaler genoptager
    // ikke forhåndsvisningen — zoomen er hovedprocessens, ikke previewets.
    // Tilbage på 13 bagefter, så prøven efterlader profilen neutral.
    await page.click('#settings-toggle'); await page.click('#settings-appearance-button');
    await page.waitForSelector('#settings-font-up');
    for (let step = 0; step < 3; step++) await page.click('#settings-font-up');
    await page.waitForFunction(() => window.harness.profileGet().then(result => result.value.profile.appearance.fontSize === 16));
    assert.ok(Math.abs(await zoomFactor() - 16 / 13) < 0.01, 'font 16 står i profilen, og zoomen følger med her');
    await page.click('[data-close="settings-dialog"]'); await app.close();
    app = await electron.launch({ executablePath, args: [path.join(root, 'desktop'), '--user-data-dir=' + path.join(testRoot, 'electron-data')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await require('./ui-test-helpers.cjs').isolateDocuments(app, path.join(testRoot, 'Dokumenter'));
    page = await app.firstWindow();
    await page.waitForSelector('#workspace:not([hidden])');
    assert.equal(await page.locator('#project-name').textContent(), 'Fælleshaven', 'det sidste projekt genåbnes efter genstarten');
    assert.ok(Math.abs(await zoomFactor() - 16 / 13) < 0.01, 'font 16 overlever genstart — faktoren er anvendt fra opstarten');
    await page.click('#settings-toggle'); await page.click('#settings-appearance-button');
    for (let step = 0; step < 3; step++) await page.click('#settings-font-down');
    await page.waitForFunction(() => window.harness.profileGet().then(result => result.value.profile.appearance.fontSize === 13));
    await page.click('[data-close="settings-dialog"]');
    assert.ok(Math.abs(await zoomFactor() - 1) < 0.01, 'tilbage på 13 er zoomen 100%');
    console.log(JSON.stringify({passed:['designpakke genbrugt efter genstart og slettede originaler','projektoprettelse','annulleret dialog','logo og reference','ægte preview','automatisk opdatering fra disk','skærmstørrelser, rotation, egne mål, skalering og trækbar skillelinje','ingen Node eller IPC i preview','genåbning efter genstart','eksisterende projekt bevaret','profil udfyldes i onboarding og ændres i Indstillinger','profil genindlæses efter genstart','skriftstørrelse: trin, app-zoom, nulstilling og persistens efter genstart'],testRoot,projectDir,screenshots:[path.join(testRoot, 'opstart.png'),path.join(testRoot, 'arbejdsflade.png')]}));
  } finally {if(app) await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
