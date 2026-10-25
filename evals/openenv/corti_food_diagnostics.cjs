const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('../../desktop/node_modules/playwright/test');
const {startPreview}=require('../../desktop/core/preview.cjs');
(async()=>{
 const root=path.resolve(process.argv[2]);const out=path.join(root,'diagnostic-evidence');await fs.mkdir(out,{recursive:false});
 const preview=await startPreview(root);const origin=new URL(preview.url).origin;
 const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 const external=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();external.push(new URL(r.request().url()).origin);return r.abort();});
 const settle=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.waitForTimeout(200);};
 try{
  await page.goto(preview.url,{waitUntil:'networkidle'});await page.locator('[data-venue="ilforno"]').click();await page.evaluate(()=>scrollTo(0,0));await settle();await page.screenshot({path:path.join(out,'mobile-menu-settled.png')});
  const menu=await page.evaluate(()=>({headers:[...document.querySelectorAll('header')].map(e=>({class:e.className,text:e.innerText,rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))})),frames:document.querySelectorAll('iframe').length,scrollY,bodyHeight:document.body.scrollHeight}));
  await page.locator('[data-dish="p-marg"]').click();await page.locator('#dialog-add').click();await page.getByRole('link',{name:'Steder',exact:true}).click();await page.locator('[data-venue="ilforno"]').click();await page.locator('#to-checkout').click();await page.evaluate(()=>scrollTo(0,0));await settle();
  const fields=await page.locator('span.error').evaluateAll(es=>es.map(e=>({id:e.id,hidden:e.hidden,display:getComputedStyle(e).display,rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))})));
  await page.screenshot({path:path.join(out,'checkout-before-any-validation.png')});
  await fs.writeFile(path.join(root,'diagnostics.json'),JSON.stringify({menu,fields,external,errors,scope:'Read-only browser UI navigation, no AI or app source changes'},null,2));console.log(JSON.stringify({menu,fields,external,errors}));
 }finally{await context.close();await browser.close();await preview.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
