const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { skipIntroduction, previewOptions } = require('./ui-test-helpers.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function unreachable(url) { for (let i = 0; i < 40; i++) { try { await fetch(url, { signal: AbortSignal.timeout(200) }); } catch { return; } await wait(100); } throw new Error('Den stoppede server svarer stadig: ' + url); }
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-frameworks-')));
  const react = path.join(root, 'React med mellemrum'), astro = path.join(root, 'Astro med mellemrum');
  const appSource = `import React from 'react'; export default function App(){const [n,setN]=React.useState(0);return <main><h1>Bibliotekets aktiviteter</h1><p>Et konkret React-projekt</p><button onClick={()=>setN(n+1)}>Tilmeld {n}</button></main>}`;
  for (const folder of [react, astro]) await fs.mkdir(folder, { recursive: true });
  await fs.mkdir(path.join(react, 'src')); await fs.mkdir(path.join(react, 'public'));
  await fs.writeFile(path.join(react, 'public/index.html'), '<h1>FORÆLDET PLACEHOLDER</h1>');
  const pkg = { name: 'harness-react-proeve', private: true, type: 'module', scripts: { dev: 'vite', postinstall: 'node -e "require(\'fs\').writeFileSync(\'script-kortslutning\',\'må ikke køre\')"', predev: 'node -e "process.exit(12)"' }, dependencies: { react: '19.3.0', 'react-dom': '19.3.0' }, devDependencies: { vite: '8.3.1', typescript: '5.9.3' } };
  await fs.writeFile(path.join(react, 'package.json'), JSON.stringify(pkg));
  await fs.writeFile(path.join(react, 'index.html'), '<!doctype html><html lang="da"><meta name="viewport" content="width=device-width"><div id="root"></div><script type="module" src="/src/main.tsx"></script></html>');
  await fs.writeFile(path.join(react, 'src/main.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import App from './App';import './style.css';createRoot(document.getElementById('root')!).render(<App/>);`);
  await fs.writeFile(path.join(react, 'src/App.tsx'), appSource);
  await fs.writeFile(path.join(react, 'src/style.css'), 'body{margin:0;background:#f8fafc;color:#182235;font:16px system-ui}main{max-width:680px;margin:8vh auto;padding:24px}button{background:#0052cc;color:white;padding:12px 24px;border:0;border-radius:8px}h1{font-size:clamp(24px,5vw,40px)}');
  await fs.mkdir(path.join(astro, 'src/pages'), { recursive: true });
  await fs.writeFile(path.join(astro, 'package.json'), JSON.stringify({ name: 'harness-astro-proeve', private: true, type: 'module', scripts: { dev: 'astro dev' }, dependencies: { astro: '7.3.5' } }));
  await fs.writeFile(path.join(astro, 'src/pages/index.astro'), '<!doctype html><html lang="da"><meta name="viewport" content="width=device-width"><body><h1>Kommunens kalender</h1><p>En rigtig Astro-side</p></body></html>');
  let app, page;
  const errors = [];
  async function launch() {
    const bundle = process.env.HARNESS_TEST_PACKAGE;
    const executablePath = bundle ? path.join(bundle, 'Contents/MacOS', path.basename(bundle, '.app')) : require('electron');
    app = await electron.launch({ executablePath, args: [...(bundle ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ...(bundle ? { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } : {}), ELECTRON_RUN_AS_NODE: undefined, OPENROUTER_API_KEY: 'SYNTHETIC_MUST_NOT_REACH_PROJECT' } });
    page = await app.firstWindow(); await skipIntroduction(page); page.on('pageerror', error => errors.push(error.message));
  }
  async function open(folder, framework = true) {
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, folder);
    await page.click('#open'); await page.waitForFunction(folder => document.querySelector('#project-path').textContent === folder, folder);
    if (framework) await page.waitForSelector('#server-open:not([hidden])');
  }
  async function serverDialog() { await previewOptions(page); await page.click('#attach-preview'); await page.waitForSelector('#preview-dialog[open]'); }
  async function install() {
    await page.click('#server-primary'); await page.waitForSelector('#server-review:not([hidden])');
    assert.match(await page.locator('#server-command').textContent(), /--ignore-scripts/);
    await page.click('#server-confirm');
    await page.waitForFunction(() => document.querySelector('#server-primary').textContent === 'Gennemgå opstart' && !document.querySelector('#server-primary').hidden, null, { timeout: 180000 });
  }
  async function start() {
    await page.click('#server-primary'); await page.click('#server-confirm');
    await page.locator('#server-status').filter({ hasText: 'Forhåndsvisningen kører' }).waitFor({ timeout: 60000 });
    await page.click('[data-close="preview-dialog"]');
    return await page.locator('#preview').getAttribute('src');
  }
  try {
    await fs.unlink(path.join(react, 'package.json'));
    await launch(); await open(react, false);
    await page.frameLocator('#preview').locator('h1').filter({hasText:'FORÆLDET PLACEHOLDER'}).waitFor();
    await fs.writeFile(path.join(react, 'package.json'), JSON.stringify(pkg));
    await page.waitForSelector('#server-open:not([hidden])');
    await page.waitForSelector('#preview-stage[hidden]', { state: 'attached' });
    assert.equal(await page.locator('#preview-stage').isVisible(), false);
    await assert.rejects(fs.access(path.join(react, 'node_modules')));
    await page.click('#server-open'); await page.click('#server-primary'); await page.click('#server-cancel');
    await assert.rejects(fs.access(path.join(react, 'node_modules')));
    await install(); await assert.rejects(fs.access(path.join(react, 'script-kortslutning')));
    await page.click('#server-primary');
    await fs.writeFile(path.join(react, 'package.json'), JSON.stringify({ ...pkg, description: 'Ændret efter gennemgang' }));
    await page.click('#server-confirm'); await page.locator('#preview-dialog .dialog-notice').filter({ hasText: 'opsætning er ændret' }).waitFor();
    assert.equal(await page.locator('#preview').getAttribute('src'), null);
    // En virkelig konfiguration kontrollerer, at hemmelige miljøvariable ikke arves.
    await fs.writeFile(path.join(react, 'vite.config.mjs'), `if(process.env.OPENROUTER_API_KEY || process.env.ELECTRON_RUN_AS_NODE)throw Error('Miljøet lækkede');export default {server:{host:'0.0.0.0',open:false}};`);
    let url = await start();
    const frame = page.frameLocator('#preview'); await frame.locator('h1').filter({ hasText: 'Bibliotekets aktiviteter' }).waitFor();
    await frame.getByRole('button', { name: 'Tilmeld 0' }).click(); await frame.getByRole('button', { name: 'Tilmeld 1' }).waitFor();
    assert.equal(await frame.locator('body').evaluate(() => typeof window.harness), 'undefined');
    assert.equal(await frame.locator('body').evaluate(async () => { try { await fetch('https://example.com'); return true; } catch { return false; } }), false);
    await fs.writeFile(path.join(react, 'src/App.tsx'), appSource.replace('Bibliotekets aktiviteter', 'Nye aktiviteter'));
    await frame.locator('h1').filter({ hasText: 'Nye aktiviteter' }).waitFor({ timeout: 20000 });
    await page.selectOption('#viewport-preset', 'phone');
    assert.equal(await frame.locator('body').evaluate(() => innerWidth), 390);
    assert.equal(await frame.locator('body').evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 720));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.ok(await page.locator('#preview-options').evaluate(el => el.getBoundingClientRect().right <= el.closest('.preview').getBoundingClientRect().right));
    await page.screenshot({ path: path.join(root, 'react-mobil.png') });
    await serverDialog(); await page.click('#server-stop'); await unreachable(url);
    await page.locator('#server-primary:not([hidden])').waitFor(); url = await start();
    await open(astro); await unreachable(url); await page.click('#server-open'); await install();
    // Fejl i den faktiske Astro-konfiguration skal stoppe processen og kunne rettes.
    await fs.writeFile(path.join(astro, 'astro.config.mjs'), `throw new Error('SYNTETISK KONFIGURATIONSFEJL');export default {};`);
    await page.click('#server-primary'); await page.click('#server-confirm');
    await page.locator('#server-status').filter({ hasText: 'Serveren stoppede' }).waitFor({ timeout: 60000 });
    assert.match(await page.locator('#server-log').textContent(), /SYNTETISK KONFIGURATIONSFEJL/);
    await fs.unlink(path.join(astro, 'astro.config.mjs'));
    await fs.writeFile(path.join(astro, 'astro.config.mjs'), "export default {base:'/kalender/'};");
    url = await start(); assert.ok(url.endsWith('/kalender/')); await frame.locator('h1').filter({ hasText: 'Kommunens kalender' }).waitFor();
    await fs.writeFile(path.join(astro, 'src/pages/index.astro'), '<h1>Opdateret kalender</h1>');
    await frame.locator('h1').filter({ hasText: 'Opdateret kalender' }).waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(root, 'astro.png') });
    await app.close(); app = null; await unreachable(url);
    await launch(); await open(astro);
    assert.equal(await page.locator('#preview').getAttribute('src'), null);
    await unreachable(url);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ root, passed: ['genkendelse uden kørsel', 'forældet placeholder skjult', 'annullering', 'rigtig npm-installation uden pakkescripts', 'ændret opsætning afvist', 'React/TypeScript/Vite', 'klik og mobilvisning', 'HMR efter filændring', 'miljønøgler udeladt', 'stop og genstart', 'stop ved projektskift', 'Astro-fejl og rettelse', 'Astro-HMR', 'stop ved lukning', 'genåbning uden autostart'], versions: { vite: '8.3.1', react: '19.3.0', astro: '7.3.5' } }));
  } catch (error) { console.error(JSON.stringify({root, notice: await page?.locator('#message').textContent().catch(()=>''), server: await page?.locator('#server-status').textContent().catch(()=>''), log: await page?.locator('#server-log').textContent().catch(()=> '')})); await page?.screenshot({path:path.join(root,'fejl.png')}).catch(()=>{}); throw error; } finally { await app?.close().catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
