// Independent browser checks of untouched real-model foundation outputs.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { discoverClickTargets } = require('./browser-click-targets.cjs');
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
    await page.goto(preview.url,{waitUntil:'networkidle'});await page.evaluate(()=>window.scrollTo(0,0));await capture('desktop-loaded');
    await fs.writeFile(path.join(artifact,'click-targets.json'),JSON.stringify(await discoverClickTargets(page),null,2));
    await check('Fiktive data og demo fremgår',async()=>assert.match(await page.locator('body').innerText(),/demo/i));
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await capture('mobile-loaded');
    await check('Ingen vandret overflow på mobil',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false));
    await check('Mobiloverskrift er ikke skjult bag fast header',async()=>assert.equal(await page.locator('h1:visible').first().evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&e.contains(document.elementFromPoint(b.left+b.width/2,b.top+Math.min(b.height/2,12)));}),true));
    await page.setViewportSize({width:1440,height:900});
    if(provider==='corti') {
      const total=()=>page.locator('#kurv .total-row strong');
      const returnToMenu=async()=>{await page.getByRole('link',{name:'Steder',exact:true}).click();await page.locator('[data-venue="ilforno"]').click();};
      const fillContact=async()=>{await page.locator('#f-name').fill('Prøveperson');await page.locator('#f-phone').fill('12345678');await page.locator('#f-email').fill('demo@example.test');};
      const submit=()=>page.locator('#order-form').getByRole('button',{name:'Bestil',exact:true}).click();
      await check('Spisested er en tastaturbetjenelig knap',async()=>assert.equal(await page.locator('.venue').first().evaluate(e=>e.tagName==='BUTTON'&&e.tabIndex>=0),true));
      await check('Tom ordrehistorik kan åbnes',async()=>{await page.locator('[data-nav="ordrer"]').click();await expect(page.locator('.orders')).toContainText('Ingen tidligere ordrer endnu');});
      await returnToMenu();
      await check('Valg af spisested viser menu og retter',async()=>{await expect(page.locator('#menu')).toBeVisible();await expect(page.locator('[data-dish="p-marg"]')).toBeVisible();});
      await capture('menu-desktop');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await capture('menu-mobile');await page.setViewportSize({width:1440,height:900});
      await check('Tom kurv kan ikke bestilles',async()=>{await expect(page.locator('#kurv')).toContainText('Din kurv er tom');await expect(page.locator('#kurv button.primary')).toBeDisabled();});
      await check('Tilvalg vises med korrekt pris og Escape giver fokus tilbage',async()=>{await page.locator('[data-dish="p-marg"]').click();await expect(page.locator('#dialog')).toBeVisible();await page.getByRole('checkbox',{name:'Ekstra ost',exact:true}).check();await expect(page.locator('#dialog-price')).toContainText('99,00');await capture('options-desktop');await page.keyboard.press('Escape');await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('[data-dish="p-marg"]')).toBeFocused();});
      await page.locator('[data-dish="p-marg"]').click();await page.getByRole('checkbox',{name:'Ekstra ost',exact:true}).check();await page.locator('#dialog-add').click();
      await check('Tilføj opdaterer straks både tæller og synlig kurv',async()=>{await expect(page.locator('#basket-count')).toHaveText('1');await expect(page.locator('#kurv')).toContainText('Pizza Margherita');await expect(total()).toContainText('99,00');});
      await capture('basket-after-add');
      // Continue only through ordinary visible navigation, recording the workaround explicitly.
      checks.push({name:'Videre forløb bruger synlig navigation Steder → samme menu for at genindlæse kurven',passed:null,note:'Brugeromvej efter separat kontrol af den direkte tilføjelse; ingen DOM- eller datamutation fra testen.'});
      await returnToMenu();
      await check('Kurv findes efter normal genåbning af menuen',async()=>{await expect(total()).toContainText('99,00');await expect(page.locator('#kurv')).toContainText('Ekstra ost');});
      await check('Antal og samlet pris opdateres korrekt',async()=>{await page.locator('.qty-btn[data-d="1"]').click();await expect(total()).toContainText('198,00');await expect(page.locator('#basket-count')).toHaveText('2');await page.locator('.qty-btn[data-d="-1"]').click();await expect(total()).toContainText('99,00');});
      await capture('basket-desktop');await page.locator('#to-checkout').click();
      await check('Tom bestilling viser forståelige feltfejl',async()=>{await submit();for(const id of ['e-name','e-phone','e-email'])await expect(page.locator('#'+id)).toBeVisible();});
      await check('Afhentning kræver ikke leveringsadresse',async()=>{await expect(page.locator('input[value="pickup"]')).toBeChecked();await expect(page.locator('#address-fields')).toBeHidden();});
      await fillContact();
      await check('Kontaktoplysninger bevares ved tilbage til menu og bestilling',async()=>{await page.locator('#back-to-menu').click();await page.locator('#to-checkout').click();await expect(page.locator('#f-name')).toHaveValue('Prøveperson');await expect(page.locator('#f-email')).toHaveValue('demo@example.test');});
      await capture('checkout-desktop');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await capture('checkout-mobile');await page.setViewportSize({width:1440,height:900});
      await check('Afhentning giver demo-bekræftelse med korrekt pris',async()=>{await submit();await expect(page.locator('#confirm-title')).toContainText('Prøveperson');await expect(page.locator('.confirm')).toContainText('Afhentning');await expect(page.locator('.confirm')).toContainText('99,00');await expect(page.locator('.demo-big')).toContainText('Intet er sendt');await expect(page.locator('#basket-count')).toHaveText('0');});
      await capture('confirmation-pickup');
      await check('Tidligere ordre er stadig tilgængelig efter genindlæsning',async()=>{await page.reload({waitUntil:'networkidle'});await page.locator('[data-nav="ordrer"]').click();await expect(page.locator('.orders')).toContainText('Pizza Margherita');await expect(page.locator('.orders')).toContainText('99,00');});
      await capture('orders-after-reload');
      await returnToMenu();await page.locator('[data-dish="p-marg"]').click();await page.locator('#dialog-add').click();await returnToMenu();await page.locator('#to-checkout').click();
      await fillContact();await page.locator('input[value="delivery"]').check();
      await check('Levering kræver adresse',async()=>{await expect(page.locator('#address-fields')).toBeVisible();await submit();for(const id of ['e-street','e-zip','e-city'])await expect(page.locator('#'+id)).toBeVisible();});
      await page.locator('#f-street').fill('Eksempelvej 1');await page.locator('#f-zip').fill('1234');await page.locator('#f-city').fill('Eksempelby');await page.locator('#f-notes').fill('Fiktiv prøve: ved døren');
      await check('Levering kan bekræftes som demo',async()=>{await submit();await expect(page.locator('.confirm')).toContainText('Levering');await expect(page.locator('.confirm')).toContainText('89,00');});
      await capture('confirmation-delivery');
      await check('Leveringsadresse og bemærkning bevares i ordren',async()=>{const orders=await page.evaluate(()=>JSON.parse(localStorage.getItem('madklar.orders.v1')));assert.equal(orders.length,2);assert.match(JSON.stringify(orders[0]),/Eksempelvej 1/);assert.match(JSON.stringify(orders[0]),/ved døren/);});
      await page.getByRole('link',{name:'Steder',exact:true}).click();await page.locator('[data-nav="ordrer"]').click();await capture('orders-two-demos');
    }
    if(provider==='mistral') {
      await check('Spisested er en tastaturbetjenelig knap',async()=>assert.equal(await page.locator('.venue').first().evaluate(e=>e.tagName==='BUTTON'&&e.tabIndex>=0),true));
      await check('Tom ordrehistorik kan åbnes',async()=>{await page.getByRole('link',{name:'Ordrer',exact:true}).click();await expect(page.locator('#orders-view')).toBeVisible();await expect(page.locator('#orders-list')).toContainText(/ingen|endnu/i);});
      await page.getByRole('link',{name:'Spisesteder',exact:true}).click();
      const menu=await check('Valg af spisested viser menu og retter',async()=>{await page.locator('.venue').first().click();await expect(page.locator('#menu-view')).toBeVisible();await expect(page.locator('#menu-items')).not.toBeEmpty();});
      await capture('after-restaurant');
      if(!menu)checks.push({name:'Tilpasning, kurv, bestilling og gemt ordre',passed:false,blockedBy:'Det normale valg af spisested udløser en runtime-fejl og efterlader en tom menu. Ingen omgåelse.'});
    }
  }finally{await context.close();await browser.close();await preview.close();}
  assert.equal(await hashTree(path.join(artifact,'public')),before);
  checks.push({name:'Ingen runtime-JavaScript-fejl',passed:errors.length===0});checks.push({name:'Ingen ekstern forespørgsel eller rigtig bestilling',passed:external.length===0});
  const result={provider,artifact,sourceUnchanged:true,publicSHA256:before,checks,errors,blockedExternalOrigins:external,captures,scope:'Independent browser journey; not the product smoke check; no AI or handwritten repairs'};
  await fs.writeFile(path.join(artifact,'flow.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({provider,checks,errors,sourceUnchanged:true}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
