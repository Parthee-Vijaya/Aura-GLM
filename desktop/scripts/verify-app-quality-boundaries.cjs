// Synthetic local fixtures only. Records fixed categories, never page payloads.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createAppQualityInspector, qualityRepairInstruction } = require('../core/app-quality.cjs');
const root = path.resolve(process.argv[2]);
app.setPath('userData', path.join(root, 'profile'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const evidence = { errors: [], chooserEvents: 0, cancelCommands: 0, constructorStates: [] };
  function AuditedWindow(options) {
    const win = new BrowserWindow(options), wc = win.webContents;
    const command = wc.debugger.sendCommand.bind(wc.debugger);
    wc.debugger.sendCommand = (name, args) => {
      if (name === 'Page.setInterceptFileChooserDialog' && args.enabled && args.cancel) evidence.cancelCommands++;
      return command(name, args);
    };
    wc.debugger.on('message', (_event, method, params) => {
      if (method === 'Page.fileChooserOpened') evidence.chooserEvents++;
      if (method === 'Runtime.exceptionThrown') {
        const text = params.exceptionDetails?.exception?.description || '';
        evidence.errors.push(['Network constructor available', 'Storage not reset', 'File must not be selected'].find(s => text.includes(s)) || 'other-synthetic-error');
      }
    });
    wc.on('did-finish-load', () => {
      if (!wc.getURL().startsWith('https://quality-')) return;
      wc.executeJavaScript(`({rtc:typeof RTCPeerConnection!=='undefined',transport:typeof WebTransport!=='undefined'})`).then(v => evidence.constructorStates.push(v)).catch(() => {});
    });
    return win;
  }
  try {
    const project = path.join(root, 'project');
    await fs.mkdir(path.join(project, 'public'), { recursive: true });
    const inspect = createAppQualityInspector({ BrowserWindow: AuditedWindow, session, directory: path.join(root, 'reports') });
    await fs.writeFile(path.join(project, 'public/index.html'), `<!doctype html><html lang="da"><meta charset="utf-8"><style>body{font:16px sans-serif;color:#222;background:white}button{padding:16px}</style><div class="loading">Indlæser</div><script>
      if(typeof RTCPeerConnection !== 'undefined' || typeof WebTransport !== 'undefined') throw Error('Network constructor available');
      if(localStorage.getItem('prior-visit')) throw Error('Storage not reset'); localStorage.setItem('prior-visit','yes');
      window.addEventListener('beforeunload', e => {e.preventDefault();e.returnValue='stay';});
      setTimeout(()=>{document.body.innerHTML='<h1>Færdig indlæst</h1><button onclick="alert(1)">Åbn dialog</button>';},600);
    </script></html>`);
    const delayed = await inspect({ root: project });
    evidence.delayed = delayed;
    await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    assert.equal(delayed.status, 'checked');
    assert.equal(delayed.findings.some(f => f.id === 'runtime-error'), false);
    assert(evidence.constructorStates.length > 0 && evidence.constructorStates.every(v => !v.rtc && !v.transport));
    assert(delayed.views.every(v => !v.loading && v.headings === 1));
    console.log('PASS pre-page constructors disabled, delayed render, storage reset and suppressed script dialogs');
    await fs.writeFile(path.join(project, 'public/index.html'), `<!doctype html><html lang="da"><meta charset="utf-8"><style>body{font:16px sans-serif}button{padding:16px}</style><h1>Filvælgerprøve</h1><input type="file" hidden id="upload" onchange="throw Error('File must not be selected')" oncancel="document.body.insertAdjacentHTML('beforeend','<h1>Afbrudt sikkert</h1>')"><button onclick="document.getElementById('upload').click()">Vælg lokal fil</button></html>`);
    const file = await inspect({ root: project });
    evidence.file = file;
    assert.equal(file.status, 'checked');
    assert.equal(file.findings.some(f => f.id === 'runtime-error'), false);
    assert.equal(file.clicks, 1);
    assert.equal(file.views.find(v => v.name === 'click-1').headings, 2, 'cancel event confirms the chooser was cancelled');
    assert.equal(evidence.cancelCommands, 2);
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    console.log('PASS hidden file input chooser cancelled before native file access');
    const receiptSource = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px sans-serif;color:#222;background:white;margin:24px}button{padding:16px}</style><main><h1>Demobestilling</h1><button onclick="document.querySelector('main').hidden=true;document.getElementById('receipt').hidden=false">Vis demokvittering</button></main><section id="receipt" hidden><h2>Tak for din demobestilling</h2><p>Din kvittering er synlig her. Ingen bestilling er sendt.</p></section></html>`;
    await fs.writeFile(path.join(project, 'public/index.html'), receiptSource);
    const receipt = await inspect({ root: project });
    evidence.receipt = receipt;
    assert.equal(receipt.status, 'checked');
    assert.equal(receipt.clicks, 1);
    assert.equal(receipt.views.find(v => v.name === 'click-1').visibleMainRegions, 0);
    assert.equal(receipt.findings.find(f => f.id === 'empty-main-after-click').severity, 'warning');
    assert.equal(receipt.findings.some(f => f.severity === 'error'), false);
    assert.equal(qualityRepairInstruction(receipt), '', 'a legitimate receipt outside main cannot trigger an automatic rewrite');
    assert.equal(await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), receiptSource);
    assert.equal(BrowserWindow.getAllWindows().length, 0);
    console.log('PASS visible receipt outside main produces only a review warning, no automatic repair or source changes');
    evidence.passed = true;
    await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    app.exit(0);
  } catch (error) {
    await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.error(error); app.exit(1);
  }
});
