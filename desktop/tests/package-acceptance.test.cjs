'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { argumentsFor, networkBootstrap, mockModel } = require('../scripts/verify-package-acceptance.cjs');

test('package acceptance requires a built app and an explicit evidence destination', () => {
  for (const args of [[], ['--app', './desktop'], ['--app', './App.app'], ['--app', './App.app', '--out', './out.json', '--unknown', 'x'], ['--app', './App.app', '--from', './source', '--out', './out.json'], ['--app', './App.app', '--app', './Other.app', '--out', './out.json']]) assert.throws(() => argumentsFor(args));
  assert.deepEqual(argumentsFor(['--app', './App.app', '--from', './old.dmg', '--out', './out.json']), { app: path.resolve('App.app'), from: path.resolve('old.dmg'), out: path.resolve('out.json') });
});

test('pre-bootstrap guard rejects direct, normalized and TLS external sockets before connection', async () => {
  const source = `
    const vm = require('node:vm'), net = require('node:net'), tls = require('node:tls');
    const realRequire = require, callbacks = {};
    const safeStorage = {};
    const electron = { app: { isReady: () => false, on: (event, callback) => callbacks[event] = callback, commandLine: { appendSwitch() {} } }, safeStorage };
    const context = { require: id => id === 'electron' ? electron : realRequire(id), globalThis: {}, URL }; 
    vm.runInNewContext('(' + ${JSON.stringify(networkBootstrap.toString())} + ')()', context);
    const check = callback => { try { callback(); return 'unblocked'; } catch(error) { return error.code; } };
    const values = [check(() => net.connect({host:'192.0.2.1',port:443})), check(() => new net.Socket().connect({host:'192.0.2.1',port:443})), check(() => new net.Socket().connect(net._normalizeArgs([{host:'192.0.2.1',port:443}]))), check(() => tls.connect({host:'192.0.2.1',port:443})), check(() => net.connect(443,'external.example.invalid'))];
    const request = { onBeforeRequest(callback) { this.callback = callback; } };
    callbacks['session-created']({webRequest:request});
    let productCalls = 0;
    request.onBeforeRequest((_details,callback)=>{productCalls++;callback({});});
    let denied;
    request.callback({url:'https://external.example.invalid/private'}, value=>denied=value.cancel);
    let local;
    request.callback({url:'http://127.0.0.1:12345'}, value=>local=value.cancel!==true);
    let keyDenied=false;try{safeStorage.encryptString('synthetic');}catch{keyDenied=true;}
    console.log(JSON.stringify({values,denied,local,productCalls,keyDenied,available:safeStorage.isEncryptionAvailable()}));
  `;
  const result = JSON.parse((await run(process.execPath, ['-e', source], { timeout: 10000 })).stdout);
  assert.deepEqual(result.values, Array(5).fill('EACCES'));
  assert.equal(result.denied, true); assert.equal(result.local, true); assert.equal(result.productCalls, 1);
  assert.equal(result.keyDenied, true); assert.equal(result.available, false);
});

test('synthetic provider supports catalog, normal answer and stop without storing prompt contents', async t => {
  const model = await mockModel(); t.after(() => model.close());
  const response = await fetch(model.url + '/models');
  assert.equal((await response.json()).data[0].id, 'acceptance-model');
  const body = { model: 'acceptance-model', stream: true, messages: [{ role: 'user', content: 'synthetic-private-prompt' }] };
  const answer = await fetch(model.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  assert.match(await answer.text(), /\[DONE\]/);
  model.state.phase = 'stop';
  const controller = new AbortController();
  const stream = await fetch(model.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body), signal: controller.signal });
  assert.equal(model.state.active.size, 1);
  assert.match(new TextDecoder().decode((await stream.body.getReader().read()).value), /acceptprøve: stop/);
  controller.abort();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(model.state.active.size, 0);
  assert.equal(JSON.stringify(model.state.requests).includes('synthetic-private-prompt'), false);
});

for (const scenario of ['child-exit', 'deadline']) test(`packaged startup aborts after the inspector handshake on ${scenario}`, async () => {
  const vm = require('node:vm'), fs = require('node:fs'), { EventEmitter } = require('node:events');
  const child = new EventEmitter(); Object.assign(child, { pid: 123456789, exitCode: null, signalCode: null, stderr: new EventEmitter() });
  let killed = false, browserConnections = 0;
  class Socket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(raw) {
      const request = JSON.parse(raw);
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: request.id, result: request.method === 'Runtime.evaluate' ? { result: {} } : {} }) }));
        if (request.method === 'Runtime.runIfWaitingForDebugger') this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ method: 'Debugger.paused', params: {} }) }));
        if (request.method === 'Debugger.disable' && scenario === 'child-exit') setTimeout(() => { child.exitCode = 1; child.emit('exit', 1); }, 5);
      });
    }
    close() { this.dispatchEvent(new Event('close')); }
  }
  const module = { exports: {} }, filename = path.resolve(__dirname, '../scripts/verify-package-acceptance.cjs');
  const localRequire = id => {
    if (id === 'node:child_process') return { execFile, spawn: () => { queueMicrotask(() => child.stderr.emit('data', 'Debugger listening on ws://127.0.0.1:12345/synthetic\n')); return child; } };
    if (id === 'playwright') return { chromium: { connectOverCDP() { browserConnections++; throw Error('No browser address was announced.'); } } };
    return require(id);
  };
  const context = { require: localRequire, module, exports: module.exports, process: { kill: () => { killed = true; queueMicrotask(() => { child.signalCode = 'SIGTERM'; child.emit('exit', null, 'SIGTERM'); }); } }, WebSocket: Socket, setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds === 30000 ? scenario === 'deadline' ? 30 : 1000 : milliseconds), clearTimeout, URL, performance };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  await assert.rejects(module.exports.launchPackaged('/synthetic/App.app', [], {}, '/synthetic'), /opstart/);
  assert.equal(browserConnections, 0);
  assert.equal(killed, scenario === 'deadline');
});
