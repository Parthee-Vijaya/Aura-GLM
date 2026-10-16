const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
(async()=>{
 const root=process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname,'../release');const manifest=JSON.parse(await fs.readFile(path.join(root,'release.json'),'utf8'));
 assert(manifest.files.length);const installers=manifest.files.filter(f=>!f.name.endsWith('.zip'));const allowed=new Set(['index.html','desktop.css','terminal.css','downloads.js','images/aura-icon.png','release.json','SHA256SUMS.txt',...manifest.files.map(f=>f.name)]);
 const server=http.createServer(async(req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('content-type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.js')?'application/javascript':name.endsWith('.png')?'image/png':'application/octet-stream');createReadStream(path.join(root,name)).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'harness-download-'));
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:1200,height:1000},acceptDownloads:true});
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.locator('.artifact').first().waitFor();assert.equal(await page.locator('.artifact').count(),installers.length);
  const icon='images/aura-icon.png';
  assert.equal(await page.locator('.brand img').getAttribute('src'),icon);
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'),icon);
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),icon);
  assert.equal(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0),true,'Aura-logoet skal være indlæst i browseren');
  const iconResponse=await page.request.get(new URL(icon,page.url()).href);
  assert.equal(iconResponse.status(),200);assert.equal(iconResponse.headers()['content-type'],'image/png');
  assert.deepEqual(await iconResponse.body(),await fs.readFile(path.join(__dirname,'../../docs/images/aura-icon.png')),'Downloadsidens logo og ikoner matcher Aura-originalen');
  assert.equal(await page.getByRole('tab').count(),2,'App og terminal er tilgængelige på samme side');
  assert.equal(await page.locator('#app').isVisible(),true);
  await page.getByRole('tab',{name:/^Terminal/}).click();assert.equal(await page.locator('#terminal').isVisible(),true);
  await page.getByRole('tab',{name:/^App/}).click();assert.equal(await page.locator('#app').isVisible(),true);
  await page.screenshot({path:path.join(output,'downloadside.png'),fullPage:true});
  for (const [index, artifact] of installers.entries()) {
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('.artifact a').nth(index).click()]);
   assert.equal(download.suggestedFilename(),artifact.name,'Linket henter den angivne installationsfil');
   const stream=await download.createReadStream();assert(stream,'Browseren skal have hentet en læsbar fil');
   const hash=createHash('sha256');let bytes=0;
   for await(const chunk of stream){bytes+=chunk.length;hash.update(chunk);}
   assert.equal(bytes,artifact.bytes,'Downloadens størrelse matcher filoversigten');
   assert.equal(hash.digest('hex'),artifact.sha256,'Kontrolsum matcher for '+artifact.name);
   await download.delete();
  }
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,'mobil.png'),fullPage:true});
  console.log(JSON.stringify({status:'bestået',output,files:installers.map(f=>f.name),checks:['Aura-logo indlæst; logo, favicon og touch-ikon matcher originalen','alle installationslinks','alle installationsfiler hentet via browser','filnavne, størrelser og SHA-256 matcher','desktop og mobil'],publiceret:false}));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
