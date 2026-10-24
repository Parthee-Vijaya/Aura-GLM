const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const deps = path.resolve(__dirname, '../node_modules');
const { _electron } = require(path.join(deps, 'playwright'));
const executablePath = require(path.join(deps, 'electron'));
const repo = path.resolve(__dirname, '../..');
const [scenario, label = scenario + '-after'] = process.argv.slice(2);
const output = path.join(process.env.AURA_REVIEW_OUTPUT || path.join(os.tmpdir(), 'aura-contribution-review'), label);
(async () => {
  await fs.mkdir(output, {recursive:true});
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aura-pr-review-')));
  const errors = [], checks = [], sizes = [];
  let app;
  const check = (name,value) => { assert(value,name); checks.push(name); };
  try {
    const ui = require(path.join(repo,'desktop/scripts/ui-test-helpers.cjs'));
    app = await _electron.launch({executablePath,args:[path.join(repo,'desktop'),'--user-data-dir='+path.join(root,'profile')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
    const page = await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await ui.skipIntroduction(page);await ui.isolateDocuments(app,root);
    const shot = async name => { await page.waitForTimeout(200);await page.screenshot({path:path.join(output,name+'.png'),scale:'css'}); };
    const size = async (w,h) => { await app.evaluate(({BrowserWindow},s)=>{const win=BrowserWindow.getAllWindows()[0];win.unmaximize();win.setMinimumSize(320,400);win.setContentSize(...s);},[w,h]);await page.waitForTimeout(120); };
    if (scenario === 'onboarding') {
      const maximized=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized());
      if(label.endsWith('after'))check('Starts maximized',maximized);
      await ui.openSetup(page);
      for(const [w,h] of [[1280,800],[980,720]]) {
        await size(w,h);await shot('setup-'+w);
        const measured=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollHeight,actions:[...document.querySelectorAll('#setup-local,#setup-advanced')].map(e=>e.getBoundingClientRect().bottom)}));sizes.push(measured);
        if(label.endsWith('after')) {check('Startup fits '+w,measured.scroll<=h);check('Actions visible '+w,measured.actions.every(y=>y<=h));}
      }
      await page.click('#setup-local');await page.fill('#name','Borgermøder');await page.fill('#purpose','En lokal oversigt over kommende borgermøder.');await size(1280,800);await shot('project-form');
      if(label.endsWith('after'))check('Name before idea',await page.locator('#name').evaluate(n=>n.getBoundingClientRect().top<document.querySelector('#purpose').getBoundingClientRect().top));
      await page.click('#project-options-summary');check('Optional project choices work',await page.locator('#project-options').evaluate(n=>n.open));
    } else {
      await size(1280,800);await page.fill('#name','Prøveprojekt');await page.fill('#purpose','En lokal app med kommende borgermøder.');await page.click('#create');await page.waitForSelector('#workspace:not([hidden])');
      if(scenario==='skill') {
        await page.evaluate(()=>document.querySelector('#skills-button').click());
        await page.waitForSelector('#skills-dialog[open]');await page.selectOption('#skill-select','harness-aura-design');
        check('Primary design method available in existing editor',/Fra én sætning/.test(await page.inputValue('#skill-content')));await shot('instructions');
      } else if(scenario==='materials') {
        await page.fill('#prompt','Brug den vedhæftede beskrivelse som kontekst.');
        if(await page.locator('#chat-materials-plus').count()) {
          await page.click('#chat-materials-plus');await shot('composer');
          const kinds=await page.locator('[data-material-kind]').evaluateAll(nodes=>nodes.map(n=>n.dataset.materialKind));checks.push('Available file kinds: '+kinds.join(','));
          await page.keyboard.press('Escape');check('Escape closes menu',await page.locator('#chat-materials-menu').isHidden());
          const file=path.join(root,'brief.txt');await fs.writeFile(file,'Syntetisk reference: vis dato, sted og tilmelding.');
          await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
          await page.click('#chat-materials-plus');await page.click('#chat-materials-files');await page.click('#materials-next');await page.waitForSelector('#materials-attach');await shot('review');await page.click('#materials-attach');check('Attachment selected',await page.locator('#chat-materials-chips').isVisible());
        } else await shot('composer');
      } else if(scenario==='questions') {
        // Synthetic conversation state rendered by the app's existing functions; no altered HTML/CSS.
        await page.evaluate(()=>{
          appendMessage('En app til lokale borgermøder.','user');appendMessage('Skal brugerne kunne tilmelde sig, og skal tilmeldinger deles mellem brugerne?','assistant');
          renderRunReview({task:'review-fixture',status:'idle',answered:true,diff:{files:[]},files:[],checks:[],mode:'free'},view);
        });await shot('follow-up');
        if(label.endsWith('after'))check('No false completion receipt',await page.locator('#run-review').isHidden());
        await page.fill('#prompt','Ja, tilmeldinger skal kunne deles.');check('Free text remains available',await page.inputValue('#prompt')==='Ja, tilmeldinger skal kunne deles.');
      }
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:true,scenario,label,checks,sizes,errors},null,2));
    console.log(JSON.stringify({passed:true,label,checks:checks.length,output}));
  } finally { if(app)await app.close();await fs.rm(root,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1});
