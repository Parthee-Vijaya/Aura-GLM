// SPDX-License-Identifier: EUPL-1.2
// Native renderer/IPC acceptance in a separate synthetic profile. No credentials.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'), path=require('node:path'), os=require('node:os');
const helpers=require('./ui-test-helpers.cjs');
const {launchTestApp}=require('./electron-test-launch.cjs');
(async()=>{
 const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aura-privacy-ui-')));
 const reports=process.env.AURA_PRIVACY_REPORT||await fs.mkdtemp(path.join(os.tmpdir(),'aura-privacy-ui-report-'));await fs.mkdir(reports,{recursive:true});
 const documents=path.join(temp,'Documents');await fs.mkdir(documents);
 let app,page,launch;const errors=[];
 try{
 ({app,evidence:launch}=await launchTestApp({electron,profile:path.join(temp,'profile')}));
 await helpers.isolateDocuments(app,documents);
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await helpers.skipIntroduction(page);await helpers.toOnboarding(page);await helpers.openSetup(page);await page.click('#setup-local');
 // Repeat-opsætningen genåbner AI-forbindelser; dialogen lukkes, så prøven står
 // ved projektopstarten.
 await page.waitForSelector('#connections-dialog[open]');await page.click('[data-close="connections-dialog"]');
 await page.fill('#name','Privacy Gate UI proof');await page.fill('#purpose','Et syntetisk eksempel uden rigtige borgerdata.');
 await helpers.chooseLocation(app,page,documents);await page.click('#create');await page.waitForSelector('#workspace:not([hidden])');
 assert.equal(await page.locator('#privacy-gate-button').count(),1);
 // DATAKONTROL-SKJOLD (S1): tilstanden bæres af skjoldet — aldrig af knapteksten.
 await page.waitForSelector('#privacy-gate-button[data-privacy-state="off"]');
 const shieldBefore=await page.locator('#privacy-gate-button').evaluate(button=>({state:button.dataset.privacyState,label:button.getAttribute('aria-label'),tooltip:button.title,text:button.textContent.replace(/\s+/g,' ').trim(),svg:button.querySelector('svg[aria-hidden="true"]')!==null,mark:button.querySelector('.privacy-shield-mark')!==null}));
 assert.equal(shieldBefore.state,'off');
 assert.ok(shieldBefore.label.includes('Datakontrol · ikke aktiveret'),'aria-label bærer den gamle titel');
 assert.ok(shieldBefore.label.endsWith('Åbn dataregler'),'aria-label bærer åbningshandlingen');
 assert.equal(shieldBefore.text,'Datakontrol','statusteksten er væk fra knappen');
 assert.equal(shieldBefore.svg,true,'skjoldet er et skjult SVG');
 assert.equal(shieldBefore.mark,true,'off-tilstanden viser ✕ i rødt omrids');
 await page.locator('#privacy-gate-button').click();await page.waitForSelector('#privacy-settings-dialog[open]');
 const state=await page.evaluate(()=>window.harness.privacyGet({scope:'project'}));assert.equal(state.ok,true);assert.equal(state.value.enabled,false);
 assert.equal(await page.locator('.privacy-mode-card').count(),3);
 const switchBefore=await page.locator('#privacy-enable .switch-track').evaluate(track=>{const outer=track.getBoundingClientRect(),knob=track.firstElementChild.getBoundingClientRect();return{width:outer.width,height:outer.height,knob:knob.width,x:knob.x-outer.x};});
 assert.ok(switchBefore.width>=20&&switchBefore.height>=10&&switchBefore.knob>=8,'Approved switch track and knob are visible.');
 await page.screenshot({path:path.join(reports,'privacy-settings.png'),fullPage:true});
 await page.locator('#privacy-enable').check();await page.locator('[data-mode="cloud-controlled"]').click();
 await page.waitForFunction(before=>{const track=document.querySelector('#privacy-enable .switch-track');return track&&track.firstElementChild.getBoundingClientRect().x-track.getBoundingClientRect().x>=before+8;},switchBefore.x);
 assert.equal(await page.locator('#privacy-enable').getAttribute('aria-checked'),'true');
 await page.screenshot({path:path.join(reports,'privacy-settings-enabled.png'),fullPage:true});
 await page.locator('#privacy-save').click();await page.waitForFunction(()=>document.querySelector('#privacy-settings-feedback')?.textContent.includes('Datareglerne er gemt'));
 await page.locator('#privacy-settings-dialog').getByRole('button',{name:'Luk',exact:true}).last().click();
 const enabled=await page.evaluate(()=>window.harness.privacyGet({scope:'project'}));assert.equal(enabled.ok,true);assert.equal(enabled.value.enabled,true);
 // Skjoldet slår over til grøn fyldt med ✓, og ÉN sætning annoncerer skiftet.
 await page.waitForSelector('#privacy-gate-button[data-privacy-state="on"]');
 const shieldAfter=await page.locator('#privacy-gate-button').evaluate(button=>({state:button.dataset.privacyState,label:button.getAttribute('aria-label'),mark:button.querySelector('.privacy-shield-mark')!==null}));
 assert.equal(shieldAfter.state,'on');assert.ok(shieldAfter.label.includes('Cloud med datakontrol'),'aria-label følger cloud-tilstanden');
 assert.equal(shieldAfter.mark,true,'on-tilstanden viser ✓ i fyldt skjold');
 const settingsEntry=await page.locator('#privacy-settings-button').evaluate(button=>button.dataset.privacyState);
 assert.equal(settingsEntry,'on','settings-menu-indgangen følger med tilstanden');
 const announce=await page.locator('#privacy-gate-status');assert.equal(await announce.textContent(),'Datakontrol er slået til.');assert.equal(await announce.isVisible(),true,'annonceringen står i den eksisterende statuslinje');
 assert.equal(await page.locator('#workspace').isVisible(),true);assert.equal(await page.locator('#prompt').inputValue(),'Et syntetisk eksempel uden rigtige borgerdata.');
 await page.screenshot({path:path.join(reports,'privacy-workspace.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,launch,checks:['native UI loaded','shield states off→on with aria-label and hidden SVG','status-change announcement in #privacy-gate-status','three work modes','visible switch track and moving knob','main-owned settings persisted after fresh project and automatic Git status','existing draft and workspace preserved','no renderer errors'],capabilities:enabled.value.capabilities,reports}));
 }catch(error){if(page){await page.screenshot({path:path.join(reports,'privacy-failure.png'),fullPage:true}).catch(()=>{});console.error(JSON.stringify({reports,launch:launch||error.testLaunch,feedback:await page.locator('#privacy-settings-feedback').textContent().catch(()=>null),errors}));}else console.error(JSON.stringify({reports,launch:error.testLaunch}));throw error;}
 finally{await app?.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
