// Actual Electron Tab input in synthetic, network-denied snapshots. No AI.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createAppQualityInspector, snapshotApp } = require('../core/app-quality.cjs');
const root = path.resolve(process.argv[2]);
const regressionProject = process.argv[3] && path.resolve(process.argv[3]);
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let server, requests=0, stage='fixture';
  const focusSteps=[], geometrySteps=[];
  function AuditedWindow(options) {
    const win=new BrowserWindow(options), wc=win.webContents;
    const execute=wc.executeJavaScriptInIsolatedWorld.bind(wc);
    wc.executeJavaScriptInIsolatedWorld=async (world,scripts,...rest)=>{
      const value=await execute(world,scripts,...rest);
      if(stage==='geometry' && scripts[0]?.code.includes('globalThis.auraKeyboardFocusProbe=')) {
        await execute(998,[{code:`globalThis.geometryBaseline=Object.fromEntries([...document.querySelectorAll('button')].map(e=>[e.id,{width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,fontSize:getComputedStyle(e).fontSize,labelLeft:e.parentElement.querySelector('label')?.getBoundingClientRect().left}])); undefined;`}]);
      }
      if(scripts[0]?.code.includes('resolve(globalThis.auraKeyboardFocusProbe())')) {
        // Synthetic identifiers stay in this native verifier, never product
        // reports or model instructions. Real-app IDs are not collected.
        const observed=await execute(998,[{code:stage==='fixture' ? `({width:innerWidth,index:Number(/^field-(\\d+)$/.exec(document.activeElement?.id)?.[1]??-1)})` : stage==='geometry' ? `(()=>{const e=document.activeElement,r=e?.getBoundingClientRect();return {width:innerWidth,index:Number(/^field-(\\d+)$/.exec(e?.id)?.[1]??-1),pageY:scrollY,nestedY:document.querySelector('.nested-scroll').scrollTop,before:globalThis.geometryBaseline[e?.id],after:{width:r?.width,height:r?.height,fontSize:e?getComputedStyle(e).fontSize:undefined,labelLeft:e?.parentElement?.querySelector('label')?.getBoundingClientRect().left}}})()` : '({width:innerWidth})'}]);
        if(stage==='fixture') focusSteps.push({...observed,...value});
        if(stage==='geometry') geometrySteps.push({...observed,...value});
        if(value.invisible) await fs.writeFile(path.join(root,stage+'-focus-'+(observed.width===1440?'desktop':'mobile')+'.png'),(await wc.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      }
      return value;
    };
    return win;
  }
  try {
    server=http.createServer((_req,res)=>{requests++; res.end('forbidden');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const project=path.join(root,'project');
    await fs.mkdir(path.join(project,'public'),{recursive:true});
    const cases=['invisible','visible','shadow','border','parent-ring','pseudo','gradient','translucent','inset','neighbour','overlay','unknown-color'];
    const source=`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:24px;color:#222;background:white;font:16px sans-serif}h1{font-size:26px}.cases{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.case{position:relative;padding:20px;background:white;border:2px solid #ddd}label{display:block;margin-bottom:16px}input{display:block;width:100%;padding:10px;color:#222;background:transparent;border:2px solid #777;font:inherit;outline:none}input:focus-visible{outline:3px solid white;outline-offset:5px}
      .visible input:focus-visible{outline-color:#004036}.shadow input:focus-visible{box-shadow:0 0 0 4px #004036}.border input:focus-visible{border-color:#004036}.parent-ring:focus-within{outline:3px solid #004036}.pseudo:focus-within::after{content:'';position:absolute;inset:4px;border:3px solid #004036;pointer-events:none}.gradient{background:linear-gradient(#333,#222);color:white}.translucent input:focus-visible{outline-color:#ffffffaa}.inset input:focus-visible{outline-offset:-4px}.neighbour:focus-within label{color:#004036;text-decoration:underline}.unknown-color{background:oklch(.3 0 0);color:white}.overlay .paint{position:absolute;inset:10px;background:#004036;pointer-events:none}.overlay input{position:relative;color:white}.overlay label{position:relative;z-index:1;color:white}
      @media(max-width:600px){.cases{grid-template-columns:1fr}}
    </style><h1>Fokusprøve</h1><main class="cases">${cases.map((name,i)=>`<section class="case ${name}"><label for="field-${i}">${name}</label>${name==='overlay'?'<div class="paint"></div>':''}<input id="field-${i}"></section>`).join('')}</main><script>document.addEventListener('focusin',()=>fetch('http://127.0.0.1:${server.address().port}/not-allowed').catch(()=>{}));</script></html>`;
    // The local server independently proves focus handlers cannot access
    // services, including CSP refusals Chromium does not emit as loadingFailed.
    await fs.writeFile(path.join(project,'public/index.html'),source);
    const inspect=createAppQualityInspector({BrowserWindow:AuditedWindow,session,directory:path.join(root,'reports')});
    const fixture=await inspect({root:project});
    await fs.writeFile(path.join(root,'fixture.json'),JSON.stringify(fixture,null,2));
    assert(['checked','unsupported'].includes(fixture.status));
    if(fixture.status==='unsupported') assert.equal(fixture.reason,'external-resources-unavailable');
    for(const view of fixture.views.filter(v=>['desktop','mobile'].includes(v.name))) {
      assert.equal(view.keyboardFocus.tested,12,view.name+' actually tabs through twelve controls');
      assert.equal(view.keyboardFocus.invisible,1,view.name+' only identical-color outline without an alternative is flagged');
      assert.equal(view.keyboardFocus.uncertain,11);
      const steps=focusSteps.filter(s=>s.width===view.width);
      assert.equal(steps.length,12);
      for(let index=0;index<12;index++) {
        const step=steps.find(s=>s.index===index);
        assert(step,cases[index]+' actually received keyboard focus');
        assert.equal(step.invisible,index===0?1:0,cases[index]+' individual expected outcome');
      }
    }
    assert.equal(requests,0); assert.equal(BrowserWindow.getAllWindows().length,0);
    assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),source);
    console.log('PASS actual desktop/mobile Tab, invisible outline, eleven conservative negatives, denied focus-handler network, unchanged snapshot');
    stage='geometry';
    const geometryProject=path.join(root,'geometry-project');
    await fs.mkdir(path.join(geometryProject,'public'),{recursive:true});
    const geometryCases=['padding-change','neighbour-position','text-size','page-scroll','nested-scroll'];
    const geometrySource=`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      *{box-sizing:border-box}body{margin:24px;color:#222;background:white;font:16px sans-serif}h1{font-size:26px}.case{height:280px;padding:40px;background:white;border:2px solid #ddd;margin-bottom:20px}label{display:block;margin-bottom:20px}button{display:block;color:#222;background:white;border:2px solid #333;padding:10px 20px;font:16px Arial;outline:none}button:focus-visible{outline:3px solid white;outline-offset:5px}.padding-change button:focus-visible{padding:30px 60px}.neighbour-position:focus-within label{margin-left:30px}.text-size button{width:200px;height:64px}.text-size button:focus-visible{font-size:24px}.nested-scroll{height:280px;overflow:auto;padding:0}.nested-content{height:700px;padding:500px 40px 40px;background:white}
    </style><h1>Fokusgeometri</h1><main>${geometryCases.map((name,i)=>name==='nested-scroll'?`<section class="case nested-scroll"><div class="nested-content"><button id="field-${i}">Nested scroll</button></div></section>`:`<section class="case ${name}"><label>${name}</label><button id="field-${i}">Open</button></section>`).join('')}</main></html>`;
    await fs.writeFile(path.join(geometryProject,'public/index.html'),geometrySource);
    const geometryReport=await inspect({root:geometryProject});
    assert.equal(geometryReport.status,'checked');
    for(const view of geometryReport.views.filter(v=>['desktop','mobile'].includes(v.name))) {
      assert.equal(view.keyboardFocus.tested,5,view.name+' visits all five geometry cases');
      assert.equal(view.keyboardFocus.invisible,2,view.name+' invisible focus remains detected after document and nested scrolling');
      assert.equal(view.keyboardFocus.uncertain,3,view.name+' size, position and text changes are conservative negatives');
      const steps=geometrySteps.filter(s=>s.width===view.width && s.tested);
      for(let index=0;index<5;index++) {
        const step=steps.find(s=>s.index===index);
        assert(step,geometryCases[index]+' actually received keyboard focus');
        assert.equal(step.invisible,index>=3?1:0,geometryCases[index]+' individual expected outcome');
      }
      const padding=steps.find(s=>s.index===0), neighbour=steps.find(s=>s.index===1), text=steps.find(s=>s.index===2);
      assert(padding.after.width>padding.before.width && padding.after.height>padding.before.height,'padding changed actual geometry');
      assert(neighbour.after.labelLeft>neighbour.before.labelLeft,'neighbour actually moved');
      assert.equal(text.after.width,text.before.width);assert.equal(text.after.height,text.before.height);
      assert.notEqual(text.after.fontSize,text.before.fontSize,'typography changed inside unchanged control bounds');
      assert(steps.find(s=>s.index===3).pageY>0,'native Tab actually scrolled the document');
      assert(steps.find(s=>s.index===4).nestedY>0,'native Tab actually scrolled the nested container');
    }
    assert.equal(await fs.readFile(path.join(geometryProject,'public/index.html'),'utf8'),geometrySource);
    console.log('PASS geometry and typography alternatives stay uncertain; identical outlines remain detected after actual page and nested Tab scrolling on desktop/mobile');
    let regression;
    if(regressionProject) {
      stage='regression';
      const before=await snapshotApp(regressionProject);
      regression=await inspect({root:regressionProject});
      await fs.writeFile(path.join(root,'regression.json'),JSON.stringify(regression,null,2));
      assert.equal(regression.status,'checked');
      for(const view of regression.views.filter(v=>['desktop','mobile'].includes(v.name))) assert(view.keyboardFocus.invisible>=1,view.name+' detects preserved real-app focus regression');
      assert.equal((await snapshotApp(regressionProject)).fingerprint,before.fingerprint);
      assert.equal(regression.fingerprint,before.fingerprint);
      console.log('PASS preserved real-app regression detected on desktop/mobile without source changes');
    }
    const controller=new AbortController();controller.abort();
    assert.equal((await inspect({root:project,signal:controller.signal})).status,'cancelled');
    assert.equal(BrowserWindow.getAllWindows().length,0);
    await fs.writeFile(path.join(root,'verification.json'),JSON.stringify({passed:true,requests,cases,focusSteps,fixture,geometryCases,geometrySteps,geometryReport,regression},null,2));
    server.close();app.exit(0);
  }catch(error){console.error(error);server?.close();app.exit(1);}
});
