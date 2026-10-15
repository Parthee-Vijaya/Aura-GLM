// Layoutprøve i Electron med lange, syntetiske chat- og værktøjshændelser. Ingen modelkald.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-layout-')));
  const project = path.join(root, 'projekt'); await fs.mkdir(project);
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    const page = await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);
    await app.evaluate(({ dialog }, project) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] }); }, project);
    await page.click('#open'); await page.waitForSelector('#workspace:not([hidden])');
    await app.evaluate(({ BrowserWindow }, project) => {
      const send = event => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.send('harness:event', event);
      send({ type: 'message.updated', properties: { info: { id: 'layout', role: 'assistant' } } });
      send({ type: 'message.part.updated', properties: { part: { id: 'text', messageID: 'layout', type: 'text', text: ('Et langt svar med en farve #0052cc og flere afsnit.\n\n').repeat(100) } } });
      for (let i = 0; i < 70; i++) send({ type: 'activity', root: project, entry: { id: 'tool-' + i, kind: 'tool', status: 'completed', title: 'Læs fil', target: 'public/eksempel-' + i + '.html', output: 'Syntetisk testindhold.\n'.repeat(40), at: Date.now(), started: Date.now() - 1000, ended: Date.now() } });
    }, project);
    await page.locator('#messages .color-swatch').first().waitFor(); await page.click('#tab-activity');
    await page.locator('#activity-list li').first().waitFor();
    const measurements = [];
    for (const zoom of [1, 1.5]) {
      await app.evaluate(({ BrowserWindow }, zoom) => { const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')); win.setSize(980, 720); win.webContents.setZoomFactor(zoom); }, zoom);
      await page.waitForTimeout(250);
      await page.locator('#activity-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.locator('#activity-scroll').hover(); await page.mouse.wheel(0, 1400);
      // Hjul/trackpad uden for panelerne og direkte siderulning må heller ikke flytte arbejdsområdet.
      await page.locator('.workspace-bar h1').hover(); await page.mouse.wheel(0, 1400);
      await page.evaluate(() => window.scrollTo(0, 100000));
      await page.waitForTimeout(250);
      const result = await page.evaluate(() => {
        const d = document.scrollingElement, bounds = id => { const el = document.querySelector(id), b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, height: b.height, scroll: el.scrollHeight, client: el.clientHeight, offset: el.scrollTop }; };
        return { width: innerWidth, height: innerHeight, document: { width: d.scrollWidth, height: d.scrollHeight, y: d.scrollTop, overscroll: getComputedStyle(d).overscrollBehaviorY }, workspace: bounds('#workspace'), chat: bounds('#chat-content'), activity: bounds('#activity-scroll'), composer: bounds('#chat-form') };
      });
      measurements.push({ zoom, ...result });
      // Electron tager hele vinduet med, også når browserens zoom ændrer CSS-pixelstørrelsen.
      const screenshot = await app.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://'));
        const { width, height } = win.getContentBounds();
        return (await win.webContents.capturePage({ x: 0, y: 0, width, height })).toPNG().toString('base64');
      });
      await fs.writeFile(path.join(root, 'layout-' + zoom + '.png'), Buffer.from(screenshot, 'base64'));
    }
    await fs.writeFile(path.join(root, 'maalinger.json'), JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify({ root, measurements }));
    for (const m of measurements) {
      assert.ok(m.document.height <= m.height + 1, 'intet tomt område under appen');
      assert.ok(m.document.width <= m.width + 1, 'ingen vandret siderulning');
      assert.equal(m.document.y, 0, 'rulning i aktivitet må ikke flytte hele vinduet');
      assert.equal(m.document.overscroll, 'none', 'systemets overscroll må ikke åbne et tomt område');
      assert.ok(m.composer.bottom <= m.height + 1, 'skrivefeltet skal blive i vinduet');
      assert.ok(m.chat.height > 0 && m.activity.height > 0 && m.activity.scroll > m.activity.client, 'lange paneler ruller indvendigt');
    }
    // Skiftet tilbage til den lange projektformular må ikke miste sin rulning.
    await page.click('#new'); await page.waitForSelector('#onboarding:not([hidden])');
    await require('./ui-test-helpers.cjs').projectOptions(page); await page.click('#design-options > summary');
    await page.locator('#create').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#create').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight + 1));
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollTop > 0));
  } finally { await app?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
