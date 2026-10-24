// Real Electron IPC and Git in a disposable profile. Delay only the competing
// operation, so the startup/create race is deterministic without touching user data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');
const ui = require('./ui-test-helpers.cjs');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-project-creation-'));
  const output = process.env.AURA_PR_EVIDENCE;
  const checks = [], errors = [];
  let app, page;
  const check = (name, condition) => { assert(condition, name); checks.push(name); };
  const native = async fn => app.evaluate(fn);
  try {
    app = await _electron.launch({
      executablePath: process.env.AURA_TEST_EXECUTABLE || require('electron'),
      args: [...(process.env.AURA_TEST_EXECUTABLE ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + path.join(root, 'profile')],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
    });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await ui.skipIntroduction(page);
    await ui.isolateDocuments(app, root);
    check('Version history is enabled', (await page.evaluate(() => window.harness.featuresGet())).value.effective.versioner);
    await page.fill('#name', 'Tidligere projekt');
    await page.fill('#purpose', 'En lokal app til tidsregistrering.');
    await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])', { timeout: 90000 });
    const first = await page.evaluate(() => current.root);
    check('Normal creation includes Git', Boolean(await fs.stat(path.join(first, '.git', 'HEAD'))));

    await native(({ app, ipcMain }) => {
      const req = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const { WorkspaceRegistry } = req('./core/workspaces.cjs');
      const select = WorkspaceRegistry.prototype.select;
      globalThis.creationProbe = { calls: 0, restorePending: false };
      WorkspaceRegistry.prototype.select = async function (...args) {
        if (creationProbe.holdRestore) {
          creationProbe.restorePending = true;
          await new Promise(resolve => { creationProbe.releaseRestore = resolve; });
          creationProbe.restorePending = false;
          if (creationProbe.failRestore) throw Error('Test: reopening failed');
        }
        return select.apply(this, args);
      };
      const create = ipcMain._invokeHandlers.get('project:create');
      ipcMain._invokeHandlers.set('project:create', (...args) => { ++creationProbe.calls; return create(...args); });
      const { GitVersions } = req('./core/git.cjs'), start = GitVersions.prototype.startProject;
      GitVersions.prototype.startProject = async function (...args) {
        if (creationProbe.holdCreation) {
          creationProbe.creationPending = true;
          await new Promise(resolve => { creationProbe.releaseCreation = resolve; });
        }
        return start.apply(this, args);
      };
    });
    const waitNative = async key => {
      for (let i = 0; i < 200; i++) {
        if (await app.evaluate((_, key) => globalThis.creationProbe[key], key)) return;
        await page.waitForTimeout(50);
      }
      throw Error('Native operation did not reach ' + key);
    };
    await native(() => { creationProbe.holdRestore = true; });
    await page.reload();
    await waitNative('restorePending');
    check('Create stays disabled while the last project reopens', await page.isDisabled('#create'));
    await page.evaluate(() => {
      $('#name').value = 'Bevar denne idé'; $('#purpose').value = 'Min kladde må ikke forsvinde.';
      $('#purpose').dispatchEvent(new Event('input', { bubbles: true }));
      $('#create-form').requestSubmit();
    });
    await page.waitForTimeout(100);
    check('Submit cannot overlap automatic reopening', await native(() => creationProbe.calls === 0));
    check('No misleading busy error', !await page.locator('#message').textContent().then(text => text.includes('allerede i gang')));
    await native(() => { creationProbe.holdRestore = false; creationProbe.releaseRestore(); });
    await page.waitForSelector('#workspace:not([hidden])');
    check('Pending idea draft survives reopening', await page.evaluate(() => JSON.parse(localStorage.getItem('harness.ideaDraft.v1')).purpose === 'Min kladde må ikke forsvinde.'));

    // An unsuccessful reopen must also release the form and preserve the draft.
    await native(() => { creationProbe.holdRestore = true; creationProbe.failRestore = true; });
    await page.reload(); await waitNative('restorePending');
    await native(() => creationProbe.releaseRestore());
    await page.waitForFunction(() => !$('#create').disabled && !$('#new').disabled);
    check('Reopen failure returns to a usable form', await page.isVisible('#onboarding') && await page.inputValue('#purpose') === 'Min kladde må ikke forsvinde.');
    await native(() => { creationProbe.holdRestore = false; creationProbe.failRestore = false; creationProbe.holdCreation = true; });

    await page.fill('#name', 'Opret kun én gang');
    await page.fill('#purpose', 'En lokal app med en enkelt versionshistorik.');
    await page.click('#create'); await waitNative('creationPending');
    // A late defaults load and idea-panel reset used to re-enable this button.
    await page.evaluate(async () => { await loadStartup(); window.dispatchEvent(new CustomEvent('aura:project', { detail: { root: null } })); });
    check('Late setup work cannot re-enable a pending create', await page.isDisabled('#create'));
    await page.evaluate(() => { $('#create-form').requestSubmit(); $('#create-form').requestSubmit(); });
    await page.waitForTimeout(100);
    check('Repeated submits reach native creation once', await native(() => creationProbe.calls === 1));
    await native(() => { creationProbe.holdCreation = false; creationProbe.releaseCreation(); });
    await page.waitForSelector('#workspace:not([hidden])');
    const second = await page.evaluate(() => current.root);
    check('One folder and one initial commit', (await fs.readdir(path.dirname(second))).filter(name => name.startsWith('projekt-opret-kun')).length === 1 && Boolean(await fs.stat(path.join(second, '.git', 'refs', 'heads', 'main'))));
    check('Plan remains unapproved and no AI run starts', await page.evaluate(() => !running && !activePlan?.approved));
    await page.click('#new'); await page.waitForSelector('#onboarding:not([hidden])');
    check('New project is available after completion', await page.isEnabled('#create'));
    await page.fill('#name', '   ');
    await page.fill('#purpose', 'Bevar idéen ved en afvist oprettelse.');
    await page.click('#create');
    await page.waitForSelector('#message.error:not([hidden])');
    check('Creation failure unlocks the form and preserves the idea', await page.isEnabled('#create') && await page.inputValue('#purpose') === 'Bevar idéen ved en afvist oprettelse.');
    await page.fill('#name', 'Prøv igen'); await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])');
    check('Retry after a failed creation succeeds', await page.evaluate(() => current.name === 'Prøv igen'));
    check('No renderer errors', errors.length === 0);
    if (output) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'project-create-after.png') }); await fs.writeFile(path.join(output, 'project-create-result.json'), JSON.stringify({ passed: true, checks, errors }, null, 2)); }
    console.log(JSON.stringify({ passed: true, checks }));
  } catch (error) {
    if (output && page) { await fs.mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'project-create-failure.png') }).catch(() => {}); }
    throw error;
  } finally {
    if (app) { await native(() => { globalThis.creationProbe?.releaseRestore?.(); globalThis.creationProbe?.releaseCreation?.(); }).catch(() => {}); await app.close(); }
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
