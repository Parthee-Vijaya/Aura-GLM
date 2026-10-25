// Optional manual credential setup. Never reads the credential field.
const { _electron: electron } = require('../../desktop/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const helpers = require('../../desktop/scripts/ui-test-helpers.cjs');
(async () => {
  const profile = path.resolve(process.argv[2]);
  await fs.mkdir(profile, { recursive: true });
  const app = await electron.launch({ executablePath: require('../../desktop/node_modules/electron'), args: [path.resolve(__dirname, '../../desktop'), '--user-data-dir=' + profile] });
  const page = await app.firstWindow();
  await helpers.skipIntroduction(page);
  await helpers.openSetup(page);
  await page.click('#setup-add-provider');
  await page.click('#provider-cards [data-kind="corti"]');
  const pending = page.context().waitForEvent('page');
  await page.click('#credential-open');
  const secure = await pending;
  await secure.bringToFront();
  console.log('SECURE_CORTI_READY');
  // A stored key flag is not proof of valid access. The worker verifies the
  // live catalogue after the user has saved and confirmed the connection.
  await new Promise(resolve => app.on('close', resolve));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
