'use strict';
// Browser interaction proof for a hand-built design prototype, not product E2E.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const out = path.join(os.homedir(), 'Library/Application Support/Aura1/ReleaseReports/feedback-20261026/prototype');
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [], external = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:8784') { external.push(url.origin); return route.abort(); }
    return route.continue();
  });
  const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); };
  try {
    await page.goto('http://127.0.0.1:8784/feedback-20261026/', { waitUntil: 'networkidle' });
    check('dark theme is default', await page.locator('html').getAttribute('data-theme'), 'dark');
    check('working glow active', await page.locator('#composer').evaluate(el => getComputedStyle(el).animationName), 'glow');
    await page.screenshot({ path: path.join(out, 'after-working-dark-1280x800.png') });
    const layout = await page.locator('.messages').boundingBox();
    const form = await page.locator('#composer').boundingBox();
    await page.locator('#sidebar-divider').focus(); await page.keyboard.press('ArrowRight');
    check('sidebar keyboard adjustment', await page.locator('#sidebar-divider').getAttribute('aria-valuenow'), '212');
    await page.keyboard.press('Home'); check('sidebar minimum boundary', await page.locator('#sidebar-divider').getAttribute('aria-valuenow'), '170');
    await page.keyboard.press('End'); check('sidebar maximum boundary', await page.locator('#sidebar-divider').getAttribute('aria-valuenow'), '280');
    await page.locator('#sidebar-divider').dblclick();
    await page.locator('[data-scene="question"]').click();
    check('custom answer field visible immediately', await page.locator('#own-answer').isVisible());
    await page.locator('#own-answer').fill('Alle borgere'); await page.keyboard.press('Shift+Enter');
    check('Shift Enter retains question', await page.locator('#question-card').isVisible());
    check('Shift Enter inserts newline', await page.locator('#own-answer').inputValue(), 'Alle borgere\n');
    await page.keyboard.press('Enter');
    check('Enter submits answer into plan review', await page.locator('#plan-card').isVisible());
    check('answer does not auto-approve plan', await page.locator('#status-title').textContent(), 'Byggeplanen afventer dig');
    await page.screenshot({ path: path.join(out, 'after-plan-dark-1280x800.png') });
    await page.locator('#approve-plan').click();
    check('plan choice leaves ordinary approvals', await page.locator('#permission-label').textContent(), 'Almindelige godkendelser');
    await page.locator('#stop-button').click();
    check('Stop ends simulated glow', await page.locator('#composer').evaluate(el => getComputedStyle(el).animationName), 'none');
    check('Stop records user stop', await page.locator('#status-title').textContent(), 'Stoppet af dig');
    await page.locator('#mode-button').click(); await page.locator('#yolo-button').click();
    check('YOLO warns before enabling', await page.locator('#yolo-dialog').isVisible());
    await page.mouse.click(10, 160);
    check('backdrop does not accept warning', await page.locator('#permission-label').textContent(), 'Almindelige godkendelser');
    await page.keyboard.press('Escape');
    check('Escape cancels warning', await page.locator('#yolo-dialog').isVisible(), false);
    await page.locator('#mode-button').click(); await page.locator('#yolo-button').click(); await page.locator('#confirm-yolo').click();
    check('explicit YOLO choice', await page.locator('#permission-label').textContent(), 'YOLO · denne samtale');
    await page.locator('#new-chat').click();
    check('new conversation resets YOLO', await page.locator('#permission-label').textContent(), 'Almindelige godkendelser');
    await page.locator('#own-answer').scrollIntoViewIfNeeded();
    check('visible question removes redundant banner', await page.locator('#waiting-banner').isVisible(), false);
    await page.screenshot({ path: path.join(out, 'after-question-dark-1280x800.png') });
    await page.locator('#notes-button').click(); await page.mouse.click(10, 160);
    check('informational dialog dismisses on backdrop', await page.locator('#info-dialog').isVisible(), false);
    await page.locator('#connection-button').click();
    check('remove connection requires confirmation', await page.locator('#remove-dialog').isVisible());
    await page.locator('[data-close="remove-dialog"]').click();
    check('cancel preserves example connection', await page.locator('#connection-button').isEnabled());
    await page.locator('#connection-button').click(); await page.locator('#confirm-remove').click();
    check('explicit remove updates example only', await page.locator('#connection-button').isDisabled());
    await page.locator('[data-scene="quiet"]').click();
    check('quiet state has no moving glow', await page.locator('#composer').evaluate(el => getComputedStyle(el).animationName), 'none');
    check('quiet status states lack of signals', (await page.locator('#status-detail').textContent()).includes('Ingen nye signaler'));
    await page.locator('#before-button').click();
    for (const button of await page.locator('#before-links button').all()) {
      await button.click(); await page.waitForFunction(() => { const img = document.getElementById('before-image'); return img.complete && img.naturalWidth > 0; });
    }
    checks.push('all four actual before screenshots load');
    await page.locator('#after-button').click(); await page.locator('[data-scene="working"]').click();
    await page.locator('#theme-button').click();
    check('light theme supported', await page.locator('html').getAttribute('data-theme'), 'light');
    await page.screenshot({ path: path.join(out, 'after-working-light-1280x800.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check('reduced motion disables animation', await page.locator('#composer').evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('#theme-button').click();
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      check(`no horizontal overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `after-working-${width}x${height}.png`) });
    }
    await page.locator('#mobile-preview').click();
    check('small-screen preview accessible', await page.locator('.surface').isVisible());
    await page.locator('.meeting-button').first().click();
    check('preview remains explicitly a demo', await page.locator('#info-title').textContent(), 'Tilmelding · demo');
    check('no external traffic', external, []); check('no browser errors', errors, []);
    const result = { status: 'passed', kind: 'hand-built prototype in Chromium, not product or human test', checks, layout: { chatContentHeight: layout.height, composerHeight: form.height }, errors, external };
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } catch (error) { await page.screenshot({ path: path.join(out, 'failure.png') }); throw error; }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
