// S1 DATAKONTROL-SKJOLD preview probe — the three shield states (off · on ·
// pending) in light and dark theme, at both button locations (composer status
// row and the settings-menu popover entry), plus MEASURED contrast against the
// adjacent surfaces and the focus ring via keyboard. Committed S1 probe for
// Parthee's after-the-fact review. Probe practice in this repo: probes and
// scratch verify scripts stay UNTRACKED, and only what a test in tests/*.test.cjs
// actually depends on is committed. This file landed in the S1 commit by
// mistake and stays in the tree (local source is never deleted), so it
// documents the exception, not the rule. Pending er sættes ved at sætte
// data-privacy-state og fjerne tegnet på de to knapper — samme markup
// renderStatus producerer (enhedstestene dækker den rigtige renderer).
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const helpers = require('./ui-test-helpers.cjs');

const OUT = process.env.SHIELD_OUTPUT || path.resolve(__dirname, '../../.superpowers/sdd/uiux-overhaul-plan/shield-preview');

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-shield-')));
  const documents = path.join(temp, 'Documents'); await fs.mkdir(documents);
  const errors = [];
  let app, page;
  const shot = async name => { await page.screenshot({ path: path.join(OUT, name + '.png'), animations: 'disabled' }); console.log('skærmbillede:', name + '.png'); };

  // WCAG relative luminance + contrast ratio, measured on computed colors.
  const measure = async (buttonSelector, surfaceSelector) => page.evaluate(({ buttonSelector, surfaceSelector }) => {
    const lum = (r, g, b) => { const [R, G, B] = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * R + 0.7152 * G + 0.0722 * B; };
    const ratio = (a, b) => { const pair = [lum(...a), lum(...b)].sort((x, y) => y - x); return Math.round(((pair[0] + 0.05) / (pair[1] + 0.05)) * 100) / 100; };
    const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const opaque = element => { let node = element, background = null; while (node && node !== document.documentElement) { const value = getComputedStyle(node).backgroundColor; if (value && !/rgba?\(\s*0,\s*0,\s*0,\s*0\)/.test(value) && value !== 'transparent') { background = value; break; } node = node.parentElement; } return background; };
    const button = document.querySelector(buttonSelector);
    const shape = button.querySelector('.privacy-shield-shape');
    const mark = button.querySelector('.privacy-shield-mark');
    const shapeStyle = getComputedStyle(shape), markStyle = mark ? getComputedStyle(mark) : null;
    const surface = opaque(document.querySelector(surfaceSelector));
    const field = button.getBoundingClientRect();
    const fill = shapeStyle.fill, stroke = shapeStyle.stroke;
    return { state: button.dataset.privacyState, label: button.getAttribute('aria-label'), tooltip: button.title, word: button.textContent.trim(),
      colors: { fill, stroke, mark: markStyle ? markStyle.stroke : null, surface },
      field: { w: Math.round(field.width), h: Math.round(field.height) },
      ratios: {
        shapeVsSurface: fill.includes('rgb') && !/,\s*0\)/.test(fill) ? ratio(rgb(fill), rgb(surface)) : ratio(rgb(stroke), rgb(surface)),
        markVsFill: markStyle && fill.includes('rgb') && !/,\s*0\)/.test(fill) ? ratio(rgb(markStyle.stroke), rgb(fill)) : null,
        markVsSurface: markStyle && !(fill.includes('rgb') && !/,\s*0\)/.test(fill)) ? ratio(rgb(markStyle.stroke), rgb(surface)) : null } };
  }, { buttonSelector, surfaceSelector });

  const bothThemes = async (prefix, measureSelectors) => {
    await shot(prefix + '-light');
    const light = await measure(...measureSelectors);
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(250);
    await shot(prefix + '-dark');
    const dark = await measure(...measureSelectors);
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(250);
    console.log(prefix, 'lys:', JSON.stringify(light));
    console.log(prefix, 'mørk:', JSON.stringify(dark));
  };

  app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(temp, 'profile')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await helpers.isolateDocuments(app, documents);
  await helpers.skipIntroduction(page); await helpers.toOnboarding(page); await helpers.openSetup(page); await page.click('#setup-local');
  await page.waitForSelector('#connections-dialog[open]'); await page.click('[data-close="connections-dialog"]');
  await page.fill('#name', 'Skjold-forhåndsvisning'); await page.fill('#purpose', 'Syntetisk eksempel uden rigtige borgerdata.');
  await helpers.chooseLocation(app, page, documents); await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('harness://')); window.setMinimumSize(600, 500); window.setContentSize(1280, 800); });
  await page.waitForFunction(() => innerWidth === 1280 && innerHeight === 800);

  // ---- Tilstand 1: off (nyt projekt uden datakontrol) — komponist og menu.
  await page.waitForSelector('#privacy-gate-button[data-privacy-state="off"]');
  await bothThemes('01-off-composer', ['#privacy-gate-button', '#status-line-row']);
  await helpers.menuClick(page, '#settings-toggle');
  await page.waitForSelector('#settings-menu:popover-open');
  await bothThemes('02-off-settingsmenu', ['#privacy-settings-button', '#settings-menu']);
  await page.keyboard.press('Escape');

  // ---- Tilstand 2: on — aktiveret gennem den rigtige dialog og gemt.
  await page.locator('#privacy-gate-button').click(); await page.waitForSelector('#privacy-settings-dialog[open]');
  await page.locator('#privacy-enable').check(); await page.locator('[data-mode="cloud-controlled"]').click();
  await page.locator('#privacy-save').click();
  await page.waitForFunction(() => document.querySelector('#privacy-settings-feedback')?.textContent.includes('Datareglerne er gemt'));
  await page.locator('#privacy-settings-dialog').getByRole('button', { name: 'Luk', exact: true }).last().click();
  await page.waitForSelector('#privacy-gate-button[data-privacy-state="on"]');
  const announcement = await page.evaluate(() => ({ text: document.querySelector('#privacy-gate-status').textContent, visible: !document.querySelector('#privacy-gate-status').hidden }));
  console.log('annoncering efter gem:', JSON.stringify(announcement));
  await bothThemes('03-on-composer', ['#privacy-gate-button', '#status-line-row']);
  await helpers.menuClick(page, '#settings-toggle');
  await page.waitForSelector('#settings-menu:popover-open');
  await bothThemes('04-on-settingsmenu', ['#privacy-settings-button', '#settings-menu']);
  await page.keyboard.press('Escape');

  // ---- Tilstand 3: pending — samme markup som renderStatus' pending-gren.
  await page.evaluate(() => {
    for (const button of [document.getElementById('privacy-gate-button'), document.getElementById('privacy-settings-button')]) {
      button.dataset.privacyState = 'pending';
      button.querySelector('.privacy-shield-mark')?.remove();
    }
  });
  await bothThemes('05-pending-composer', ['#privacy-gate-button', '#status-line-row']);
  await helpers.menuClick(page, '#settings-toggle');
  await page.waitForSelector('#settings-menu:popover-open');
  await bothThemes('06-pending-settingsmenu', ['#privacy-settings-button', '#settings-menu']);
  await page.keyboard.press('Escape');

  // ---- Keyboard: fokusring på skjoldknappen og tooltip-indholdet.
  await page.evaluate(() => window.PrivacyGate.refresh());
  await page.waitForSelector('#privacy-gate-button[data-privacy-state="on"]');
  await page.locator('#send').focus();
  for (let step = 0; step < 8; step++) { await page.keyboard.press('Tab'); if (await page.evaluate(() => document.activeElement?.id) === 'privacy-gate-button') break; }
  const focused = await page.evaluate(() => ({ id: document.activeElement?.id, outline: getComputedStyle(document.activeElement).outlineStyle, width: getComputedStyle(document.activeElement).outlineWidth, tooltip: document.activeElement?.title?.slice(0, 80) }));
  console.log('tastaturfokus:', JSON.stringify(focused));
  await shot('07-keyboard-focus-light');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(250);
  await shot('07-keyboard-focus-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  console.log(JSON.stringify({ ok: errors.length === 0, output: OUT, errors }));
  await app.close();
  await fs.rm(temp, { recursive: true, force: true });
})().catch(error => { console.error(error); process.exitCode = 1; });
