// Independent browser checks of untouched real-model foundation outputs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');
async function hashTree(root) {
  const h=crypto.createHash('sha256');
  async function walk(dir,rel='') { for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){ const p=path.join(dir,e.name),n=rel+e.name;if(e.isDirectory())await walk(p,n+'/');else if(e.isFile())h.update(n).update('\0').update(await fs.readFile(p));else throw Error('Unexpected nonfile');} }
  await walk(root);return h.digest('hex');
}
(async()=>{
  const root=path.resolve(process.argv[2]),provider=process.argv[3],artifact=path.join(root,provider+'-food','build');
  const output=path.join(artifact,'flow-evidence');await fs.mkdir(output,{recursive:false});
  const before=await hashTree(path.join(artifact,'public'));
  const preview=await startPreview(artifact),origin=new URL(preview.url).origin;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const errors=[],external=[],checks=[],captures=[];page.setDefaultTimeout(4000);
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const u=r.request().url();if(new URL(u).origin===origin||/^(data|blob):/.test(u))return r.continue();external.push(new URL(u).origin);return r.abort();});
  const capture=async n=>{await page.screenshot({path:path.join(output,n+'.png'),animations:'disabled'});captures.push(n+'.png');};
  const check=async(name,fn)=>{try{await fn();checks.push({name,passed:true});return true;}catch(e){const n='failure-'+(checks.length+1);await capture(n);checks.push({name,passed:false,error:e.message.slice(0,1600),evidence:n+'.png'});return false;}};
  try {
    await page.goto(preview.url,{waitUntil:'networkidle'});await capture('desktop-loaded');
    await check('Fiktive data og demo fremgår',async()=>assert.match(await page.locator('body').innerText(),/demo/i));
    await page.setViewportSize({width:390,height:844});await capture('mobile-loaded');
    await check('Ingen vandret overflow på mobil',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false));
    await check('Mobiloverskrift er ikke skjult bag fast header',async()=>assert.equal(await page.locator('h1:visible').first().evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&e.contains(document.elementFromPoint(b.left+b.width/2,b.top+Math.min(b.height/2,12)));}),true));
    await page.setViewportSize({width:1440,height:900});
    if(provider==='mistral') {
      await check('Spisested kan nås med tastatur',async()=>assert.equal(await page.locator('.restaurant-card').first().evaluate(e=>e.tabIndex>=0),true));
      const menu=await check('Valg af spisested viser menu og retter',async()=>{await page.locator('.restaurant-card').first().click();await expect(page.locator('#menu-screen')).toBeVisible();await expect(page.locator('.dish-card').first()).toBeVisible();});
      await capture('after-restaurant');
      if(!menu)checks.push({name:'Tilpasning, kurv, bestilling, historik',passed:false,blockedBy:'Det almindelige valg af spisested skjuler alle skærme. Ingen programmatisk omgåelse.'});
      await check('Ordrehistorik kan findes i den synlige app',async()=>await expect(page.getByRole('button',{name:/tidligere ordrer|ordrehistorik|mine ordrer/i}).or(page.getByRole('link',{name:/tidligere ordrer|ordrehistorik|mine ordrer/i}))).toBeVisible());
    }
  }finally{await context.close();await browser.close();await preview.close();}
  assert.equal(await hashTree(path.join(artifact,'public')),before);
  checks.push({name:'Ingen runtime-JavaScript-fejl',passed:errors.length===0});checks.push({name:'Ingen ekstern forespørgsel eller rigtig bestilling',passed:external.length===0});
  const result={provider,artifact,sourceUnchanged:true,publicSHA256:before,checks,errors,blockedExternalOrigins:external,captures,scope:'Independent browser journey; not the product smoke check; no AI or handwritten repairs'};
  await fs.writeFile(path.join(artifact,'flow.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({provider,checks,errors,sourceUnchanged:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
