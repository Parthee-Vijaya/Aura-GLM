const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { run } = require('../core/git.cjs');
(async () => {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-hosting-')));
 const project=path.join(root,'project'),remote=path.join(root,'server.git'),bin=path.join(root,'bin');
 await fs.mkdir(project);await fs.mkdir(remote);await fs.mkdir(bin);await run(remote,['init','--bare']);
 const source=process.env.HARNESS_TEST_SOURCE ? await fs.readFile(process.env.HARNESS_TEST_SOURCE,'utf8') : '<h1>Test af publicering</h1>';
 await fs.writeFile(path.join(project,'index.html'),source);
 const realGit=execFileSync('/usr/bin/which',['git'],{encoding:'utf8'}).trim();
 // Wrapperen gælder kun testprocessen og omdirigerer den ene syntetiske destination til et lokalt bare repository.
 await fs.writeFile(path.join(bin,'git'),`#!${process.execPath}\nconst {spawnSync}=require('node:child_process');const args=process.argv.slice(2).map(x=>x==='https://github.com/testkonto/ny-app.git'?${JSON.stringify(remote)}:x);if(args.some(x=>x.startsWith('https://github.com/')))process.exit(99);const r=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});process.exit(r.status??1);\n`,{mode:0o755});
 let app;
 try {
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,HARNESS_GITHUB_CLIENT_ID:'syntetisk-client',ELECTRON_RUN_AS_NODE:undefined}});
  await app.evaluate(()=>{
   const original=global.fetch;let created=false;
   global.fetch=async(url,options={})=>{
    if(!String(url).startsWith('https://api.github.com/')&&!String(url).startsWith('https://github.com/login/'))return original(url,options);
    const route=String(url).replace('https://api.github.com','');let data;
    if(route==='/user')data={login:'testkonto'};
    else if(route.startsWith('/user/orgs'))data=[{login:'ai-alliancen-org'}];
    else if(route.startsWith('/user/repos')&&options.method!=='POST')data=created?[{id:42,full_name:'testkonto/ny-app',private:true,permissions:{push:true}}]:[];
    else if(route==='/user/repos'&&options.method==='POST'){const body=JSON.parse(options.body);if(body.name!=='ny-app'||body.private!==true)throw Error('Forkert oprettelse');created=true;data={id:42,full_name:'testkonto/ny-app',private:true,permissions:{push:true}};}
    else if(route==='/repos/testkonto/ny-app'&&created)data={id:42,full_name:'testkonto/ny-app',private:true,permissions:{push:true}};
    else if(String(url).endsWith('/device/code'))data={device_code:'syntetisk-device',user_code:'TEST-CODE',verification_uri:'https://github.com/login/device',interval:5,expires_in:900};
    else if(String(url).endsWith('/access_token'))data={access_token:'syntetisk_github_token'};
    else throw Error('Uventet GitHub-testkald');
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
   };
  });
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('#onboarding'); await page.waitForFunction(() => !document.querySelector('#new').disabled); await page.click('#setup-button');await page.click('#setup-hosting');
  await page.click('#hosting-login');await page.locator('#hosting-code').filter({hasText:'TEST-CODE'}).waitFor();
  await page.locator('#hosting-status').filter({hasText:'testkonto'}).waitFor({timeout:15000});
  const publicState=await page.evaluate(()=>window.harness.hostingState());assert.equal(JSON.stringify(publicState).includes('syntetisk_github_token'),false);
  const appdata=await app.evaluate(({app})=>app.getPath('userData'));assert.equal((await fs.readFile(path.join(appdata,'harness/settings.json'),'utf8')).includes('syntetisk_github_token'),false);
  await page.click('[data-close="hosting-dialog"]');await page.click('#setup-local');
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
  await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');await page.click('#git-button');await page.click('#git-init');
  await page.waitForFunction(()=>document.querySelector('#git-init').hidden&&!document.querySelector('#git-init').disabled);
  await run(project,['config','user.name','Testbruger']);await run(project,['config','user.email','test@example.invalid']);
  await page.click('[data-close="git-dialog"]');await page.click('#git-button');await page.locator('#git-files input').check();await page.fill('#git-message','Gem syntetisk testprojekt');await page.click('#git-save');
  await page.locator('#git-feedback').filter({hasText:'er gemt lokalt'}).waitFor();await page.waitForFunction(()=>!document.querySelector('#git-auto').disabled);await page.click('[data-close="git-dialog"]');
  await page.click('#publish-button');await page.click('#hosting-catalog');await page.waitForFunction(()=>document.querySelector('#hosting-owner').options.length===3);
  await page.locator('#hosting-project details').first().locator('summary').click();await page.selectOption('#hosting-owner','testkonto');await page.fill('#hosting-name','ny-app');await page.click('#hosting-create-form button');
  await page.locator('#hosting-create-description').filter({hasText:'privat repository testkonto/ny-app'}).waitFor();await page.click('#hosting-create-do');await page.locator('#hosting-feedback').filter({hasText:'er oprettet'}).waitFor();
  await page.click('#hosting-attach-form button');await page.locator('#hosting-feedback').filter({hasText:'Ingen filer er uploadet'}).waitFor();
  assert.equal((await run(remote,['for-each-ref'])).length,0);
  await page.click('#hosting-review');await page.locator('#hosting-destination').filter({hasText:'1 commits sendes'}).waitFor();assert.equal(await page.isDisabled('#hosting-push'),true);
  await page.check('#hosting-ack');await page.click('#hosting-push');await page.locator('#hosting-feedback').filter({hasText:'bekræftet på Git-serveren'}).waitFor();
  const branch=(await run(project,['symbolic-ref','--short','HEAD'])).toString().trim();assert.equal((await run(remote,['show',branch+':index.html'])).toString(),source);
  await page.click('#hosting-review');await page.locator('#hosting-feedback').filter({hasText:'synkroniseret'}).waitFor();await page.screenshot({path:path.join(root,'publicering.png'),fullPage:true});
  await page.click('#hosting-disconnect');await page.locator('#hosting-status').filter({hasText:'Ingen GitHub-konto'}).waitFor();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'bestået',root,source:process.env.HARNESS_TEST_SOURCE||'syntetisk standardfil',checks:['Device Flow med kontrolleret GitHub-API','safeStorage uden token i renderer/indstillingsfil','egen konto og organisationsvalg','eksplicit privat repository-oprettelse','tilslutning uden upload','gennemgang og godkendt push til rigtig lokal Git-server','bekræftet serverindhold og synkronisering','lokal afkobling']}));
 } catch(error){console.error(error);if(app){const page=await app.firstWindow();console.error(await page.locator('#hosting-feedback').textContent({timeout:2000}).catch(()=>''));await page.screenshot({path:path.join(root,'fejl.png'),fullPage:true}).catch(()=>{});}throw error;}
 finally {await app?.close();}
})().catch(()=>{process.exitCode=1;});
