// Independent browser examination of unchanged Mistral round-2 snapshot 001.
// Only ordinary browser actions; no generated-source repair or DOM/storage injection.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, expect } = require('../../desktop/node_modules/playwright/test');
const { startPreview } = require('../../desktop/core/preview.cjs');
async function hashTree(root) {
  const hash = crypto.createHash('sha256');
  async function walk(dir, prefix = '') {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name), relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(file, relative + '/');
      else if (entry.isFile()) hash.update(relative).update('\0').update(await fs.readFile(file));
      else throw Error('Unexpected nonfile');
    }
  }
  await walk(root); return hash.digest('hex');
}
(async () => {
  const run = path.resolve(process.argv[2]);
  const artifact = path.join(run, 'quality-snapshots', '001');
  const bundled = process.argv[3] === '--bundled-chromium';
  const output = path.join(run, bundled ? 'functional-browser-chromium' : 'functional-browser');
  await fs.mkdir(output, {recursive: false});
  const before = await hashTree(path.join(artifact, 'public'));
  const preview = await startPreview(artifact), origin = new URL(preview.url).origin;
  const browser = await chromium.launch(bundled ? { headless:true } : { channel:'chrome', headless:true });
  const browserInfo = { engine:'Chromium', channel:bundled ? 'bundled' : 'chrome', version:browser.version(), headless:true };
  const settings = { viewport:{width:1440,height:900}, deviceScaleFactor:1, locale:'da-DK', colorScheme:'light', reducedMotion:'reduce' };
  const contexts=[], checks=[], captures=[], errors=[], external=[], dialogs=[];
  let page, stage='start';
  const fresh = async (mobile=false) => {
    const context = await browser.newContext({...settings, ...(mobile?{viewport:{width:390,height:844}}:{})}); contexts.push(context);
    await context.route('**/*', route => { const u=route.request().url(); if (/^(data|blob):/.test(u)||new URL(u).origin===origin) return route.continue(); external.push(new URL(u).origin); return route.abort(); });
    page = await context.newPage(); page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push({stage,message:error.message}));
    page.on('dialog', async dialog => { dialogs.push({stage,type:dialog.type(),message:dialog.message()}); await dialog.dismiss(); });
    await page.goto(preview.url, {waitUntil:'networkidle'});
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
  };
  const capture = async (name,fullPage=false) => { await page.waitForTimeout(350); await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled',fullPage}); captures.push(name+'.png'); };
  const check = async (name, fn) => { stage=name; try { await fn(); checks.push({name,passed:true}); return true; } catch(error) { const evidence='failure-'+(checks.length+1)+'.png'; await page.screenshot({path:path.join(output,evidence),animations:'disabled'}); checks.push({name,passed:false,error:error.message.slice(0,1200),evidence}); return false; } };
  const blocked = name => checks.push({name,passed:null,blockedBy:'Forrige almindelige brugertrin mislykkedes; ingen omgåelse.'});
  const home = async () => { await page.locator('a[href="#restaurants"]').click(); await expect(page.locator('#restaurants')).toBeVisible(); };
  const pizza = async () => { await page.locator('.restaurant-card').filter({hasText:'Pizza Paradis'}).click(); await expect(page.locator('#restaurant-name')).toHaveText('Pizza Paradis'); await expect(page.locator('#menu-items .menu-item')).toHaveCount(5); };
  const regular = async () => { await page.locator('.menu-item').filter({hasText:'Margherita'}).getByRole('button',{name:'Tilføj til kurv',exact:true}).click(); };
  const openCart = () => page.locator('a.cart-link').click();
  const fillContact = async () => { await page.getByLabel('Fulde navn:').fill('Prøveperson'); await page.getByLabel('Telefon:').fill('12345678'); await page.getByLabel('Email:').fill('demo@example.test'); };
  try {
    await fresh(); await capture('home-desktop'); await capture('home-desktop-full',true);
    await check('Fem spisesteder og tydelig demooplysning ved start', async()=>{ await expect(page.locator('.restaurant-card')).toHaveCount(5); await expect(page.locator('.demo-banner')).toContainText('DEMO: Fiktive data'); await expect(page.locator('footer')).toContainText('Ingen rigtige bestillinger'); });
    await check('Stedkort kan nås med tastatur og har kontrolsemantik', async()=>assert.equal(await page.locator('.restaurant-card').first().evaluate(el=>el.tabIndex>=0 && (el.matches('button,a[href]')||['button','link'].includes(el.getAttribute('role')))),true));
    await check('Tom ordrehistorik vises forståeligt', async()=>{ await page.locator('a[href="#orders"]').click(); await expect(page.locator('#orders-list')).toContainText('Ingen bestillinger endnu'); });
    await home();
    const menu = await check('Valg af Pizza Paradis viser den rigtige menu',pizza);
    if(menu){
      await capture('menu-desktop'); await capture('menu-desktop-full',true);
      await check('Tom kurv har en tom tilstand og blokerer bestilling',async()=>{ await openCart(); await expect(page.locator('#cart-items')).toContainText('Din kurv er tom'); await expect(page.locator('#checkout-button')).toBeDisabled(); });
      await page.locator('#back-to-menu').click();
      const options = await check('Pizza kan tilpasses og tilvalg indgår korrekt i pris',async()=>{ await page.locator('.menu-item').filter({hasText:'Din egen pizza'}).getByRole('button',{name:'Tilpas og tilføj'}).click(); await expect(page.locator('.customization-modal')).toBeVisible(); await page.getByLabel(/Pepperoni/).check(); await page.getByLabel(/Champignon/).check(); await expect(page.locator('#customization-total')).toHaveText('97,00 DKK'); });
      if(options){
        await capture('options-desktop');
        await check('Tilpasset pizza tilføjes gennem knappen',async()=>{ await page.locator('#add-customized-btn').click(); await expect(page.locator('.customization-modal')).toHaveCount(0); await expect(page.locator('#cart-count')).toHaveText('1'); });
        await openCart();
        await check('Kurv viser ret, tilvalg og korrekt samlet pris',async()=>{ await expect(page.locator('.cart-item')).toContainText('Pepperoni'); await expect(page.locator('.cart-item')).toContainText('Champignon'); await expect(page.locator('#cart-total')).toHaveText('97,00 DKK'); });
        await check('Antal op og ned opdaterer pris korrekt',async()=>{ await page.getByRole('button',{name:'+',exact:true}).click(); await expect(page.locator('#cart-total')).toHaveText('194,00 DKK'); await expect(page.locator('#cart-count')).toHaveText('2'); await page.getByRole('button',{name:'-',exact:true}).click(); await expect(page.locator('#cart-total')).toHaveText('97,00 DKK'); });
        await capture('cart-desktop');
        await check('Fjern varen giver tydelig tom kurv og nul total',async()=>{ await page.locator('.remove-item').click(); await expect(page.locator('#cart-items')).toContainText('Din kurv er tom'); await expect(page.locator('#cart-total')).toHaveText('0,00 DKK'); await expect(page.locator('#checkout-button')).toBeDisabled(); });
        await page.locator('#back-to-menu').click(); await regular(); await openCart(); await page.locator('#checkout-button').click(); await capture('checkout-desktop'); await capture('checkout-desktop-full',true);
        await check('Tom kontaktformular afvises',async()=>{ await page.getByRole('button',{name:'Bekræft bestilling'}).click(); assert.equal(await page.locator('#checkout-form').evaluate(form=>form.checkValidity()),false); await expect(page.locator('#checkout')).toBeVisible(); await expect(page.locator('#confirmation')).not.toBeVisible(); });
        await fillContact(); await page.getByLabel('Adresse:',{exact:true}).fill('Eksempelvej 1, 1234 Eksempelby');
        await check('Ugyldig e-mail afvises før bestilling',async()=>{ await page.getByLabel('Email:').fill('ugyldig'); await page.getByRole('button',{name:'Bekræft bestilling'}).click(); assert.equal(await page.getByLabel('Email:').evaluate(el=>el.validity.typeMismatch),true); await expect(page.locator('#checkout')).toBeVisible(); await page.getByLabel('Email:').fill('demo@example.test'); });
        await page.getByLabel('Leveringstype:').selectOption('pickup'); await page.getByLabel('Adresse:',{exact:true}).fill('');
        await check('Afhentning kan bekræftes uden leveringsadresse',async()=>{ await page.getByRole('button',{name:'Bekræft bestilling'}).click(); await expect(page.locator('#confirmation')).toBeVisible(); });
        if(await page.locator('#checkout').isVisible()) {
          await capture('pickup-blocked');
          // A separate ordinary delivery attempt, not a bypass of the failed pickup flow.
          await page.getByLabel('Leveringstype:').selectOption('delivery');
          await check('Levering kræver adresse',async()=>{ await page.getByRole('button',{name:'Bekræft bestilling'}).click(); assert.equal(await page.getByLabel('Adresse:',{exact:true}).evaluate(el=>el.validity.valueMissing),true); });
          await page.getByLabel('Adresse:',{exact:true}).fill('Eksempelvej 1, 1234 Eksempelby');
          const delivery=await check('Gyldig levering viser bekræftelse med ret og pris',async()=>{ await page.getByRole('button',{name:'Bekræft bestilling'}).click(); await expect(page.locator('#confirmation')).toBeVisible(); await expect(page.locator('#confirmation-details')).toContainText('Margherita'); await expect(page.locator('#confirmation-details')).toContainText('89,00 DKK'); });
          if(delivery){
            await capture('confirmation-desktop');
            await check('Ordrehistorik bevares efter genindlæsning',async()=>{ await page.locator('a[href="#orders"]').click(); await expect(page.locator('#orders-list')).toContainText('Margherita'); await page.reload({waitUntil:'networkidle'}); await page.locator('a[href="#orders"]').click(); await expect(page.locator('#orders-list')).toContainText('Margherita'); await expect(page.locator('#orders-list')).toContainText('89,00 DKK'); });
            await capture('history-desktop');
          } else blocked('Ordrehistorik efter genindlæsning');
        }
      }else blocked('Kurv, antal, kontakt, afhentning, levering og historik');
    }else blocked('Menu, tilvalg og bestilling');
    await fresh(); await pizza(); await regular(); await page.reload({waitUntil:'networkidle'}); await openCart();
    await check('Kurv bevares efter genindlæsning',async()=>{ await expect(page.locator('#cart-items')).toContainText('Margherita'); await expect(page.locator('#cart-total')).toHaveText('89,00 DKK'); });
    await page.locator('#checkout-button').click(); await fillContact(); await page.getByLabel('Adresse:',{exact:true}).fill('Eksempelvej 1, 1234 Eksempelby');
    await check('Gemt kurv kan bestilles efter genindlæsning',async()=>{ await page.getByRole('button',{name:'Bekræft bestilling'}).click(); await expect(page.locator('#confirmation')).toBeVisible(); });
    await home();
    await check('Burgerstedets menu indlæses uden runtimefejl',async()=>{ const start=errors.length; await page.locator('.restaurant-card').filter({hasText:"Burger King's"}).click(); await expect(page.locator('#menu-items .menu-item')).toHaveCount(5); assert.equal(errors.length,start); });
    await fresh(true); await capture('home-mobile'); await capture('home-mobile-full',true);
    await check('Mobilforside har ingen vandret overflow',async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false));
    await check('Mobilmenu er tilgængelig og uden vandret overflow',async()=>{ await pizza(); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false); }); await capture('menu-mobile');
    await regular(); await openCart(); await capture('cart-mobile');
    await check('Mobilkurv og checkout kan åbnes uden vandret overflow',async()=>{ await expect(page.locator('#cart-total')).toHaveText('89,00 DKK'); await page.locator('#checkout-button').click(); await expect(page.locator('#checkout-form')).toBeVisible(); assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false); }); await capture('checkout-mobile');
  }catch(error){ checks.push({name:'Resterende forløb',passed:null,blockedBy:error.message.slice(0,1200)}); await capture('unexpected-blocker').catch(()=>{}); }
  finally { for(const context of contexts) await context.close(); await browser.close(); await preview.close(); }
  const after=await hashTree(path.join(artifact,'public')); assert.equal(before,after);
  checks.push({name:'Ingen runtime-JavaScript-fejl under afprøvning',passed:errors.length===0});
  checks.push({name:'Ingen eksterne forespørgsler under afprøvning',passed:external.length===0});
  const totals={passed:checks.filter(x=>x.passed===true).length,failed:checks.filter(x=>x.passed===false).length,blocked:checks.filter(x=>x.passed===null).length};
  const result={provider:'mistral',round:2,snapshot:'001',scope:'First completed build snapshot before product correction. Original generated source is unchanged. No model feedback, manual repair, DOM injection, or storage injection.',artifact,browser:browserInfo,settings,mobileViewport:{width:390,height:844},sourceUnchanged:true,publicSHA256:before,totals,checks,errors,dialogs,external,captures};
  await fs.writeFile(path.join(output,'flow.json'),JSON.stringify(result,null,2));
  const lines=['# Mistral – runde 2, første udkast','', 'Snapshot 001 før Auras automatiske rettelse. Browserprøve af uændrede modelgenererede filer; ingen AI-feedback eller håndrettelse.','',`Resultat: ${totals.passed} bestået, ${totals.failed} fejl, ${totals.blocked} blokeret.`, '', '## Afprøvning','',...checks.map(x=>`- ${x.passed===true?'BESTÅET':x.passed===false?'FEJL':'BLOKERET'}: ${x.name}${x.evidence?' ('+x.evidence+')':''}`),'','## Runtimefejl','',...errors.map(x=>`- ${x.stage}: ${x.message}`),'','## Bevaring','',`Browser: ${browserInfo.channel} Chromium ${browserInfo.version}, headless.`, `SHA-256 før og efter: ${before}. Identiske kildefiler.`, '1440 × 900 desktop og 390 × 844 mobil, DSF 1, da-DK, lyst tema, reduceret bevægelse. Egne browserprofiler og lokal previewserver er lukket.',''];
  await fs.writeFile(path.join(output,'REPORT.md'),lines.join('\n'));
  console.log(JSON.stringify({output,totals,checks,errors,captures,sourceUnchanged:true},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
