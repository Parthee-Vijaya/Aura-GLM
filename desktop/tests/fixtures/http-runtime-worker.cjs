// SPDX-License-Identifier: EUPL-1.2
'use strict';
// A deliberately isolated process: no uncaught-exception handler may hide the
// original Undici process-crash regression. All responses come from loopback.
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const mode = process.argv.includes('--bundled') ? 'bundled' : 'patched';
const native = process.argv.includes('--electron');
const profile = process.argv.find(value => value.startsWith('--profile='))?.slice(10);
const baseline = globalThis.fetch;
const dispatcherKeys = [Symbol.for('undici.globalDispatcher.1'), Symbol.for('undici.globalDispatcher.2')];
const dispatchers = dispatcherKeys.map(key => globalThis[key]);
const runtime = require('../../core/http-runtime.cjs');
assert.equal(globalThis.fetch, baseline, 'Importing the helper must not replace a transport.');
assert.deepEqual(dispatcherKeys.map(key => globalThis[key]), dispatchers, 'Importing the helper must not install a dispatcher.');
if (mode === 'patched') runtime.install();
let app, protocol, session;
if (native) {
  ({ app, protocol, session } = require('electron'));
  assert.ok(profile && path.isAbsolute(profile));
  app.setPath('userData', profile);
  app.setPath('sessionData', path.join(profile, 'session'));
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-background-networking');
  protocol.registerSchemesAsPrivileged([{ scheme: 'aura-http-test', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

async function main() {
  if (native) await app.whenReady();
  const sockets = new Set(), requests = [];
  const malformed = net.createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\r\nContent-Length: 1\r\nConnection: close\r\n\r\n'));
  });
  const healthy = http.createServer(async (request, response) => {
    const body = []; for await (const chunk of request) body.push(chunk);
    requests.push({ path: request.url, body: Buffer.concat(body).toString(), type: request.headers['content-type'] || '' });
    if (request.url === '/redirect') { response.writeHead(302, { location: '/must-not-follow' }); response.end(); return; }
    if (request.url === '/stream') { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.write('data: first\n\n'); setImmediate(() => response.end('data: [DONE]\n\n')); return; }
    if (request.url === '/slow') { response.writeHead(200); response.write('pending'); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end('{"healthy":true}');
  });
  try {
    malformed.listen(0, '127.0.0.1'); await once(malformed, 'listening');
    healthy.listen(0, '127.0.0.1'); await once(healthy, 'listening');
    await assert.rejects(fetch('http://127.0.0.1:' + malformed.address().port, { signal: AbortSignal.timeout(5000), redirect: 'error' }), error => /content-encoding/.test(error.cause?.message || ''));
    // The old fetch promise rejects correctly, then its orphaned body stream
    // crashes the process. Await a fresh I/O turn and prove healthy work survives.
    await new Promise(resolve => setTimeout(resolve, 80));
    const url = 'http://127.0.0.1:' + healthy.address().port;
    assert.deepEqual(await (await fetch(url + '/health')).json(), { healthy: true });
    assert.equal(await (await fetch(url + '/stream')).text(), 'data: first\n\ndata: [DONE]\n\n');
    await assert.rejects(fetch(url + '/redirect', { redirect: 'error' }));
    assert.equal(requests.some(request => request.path === '/must-not-follow'), false);
    const form = new FormData(); form.set('message', 'synthetic upload');
    await (await fetch(new Request(url + '/form', { method: 'POST', body: form }))).text();
    const upload = requests.find(request => request.path === '/form');
    assert.match(upload.type, /^multipart\/form-data; boundary=/); assert.match(upload.body, /synthetic upload/);
    const controller = new AbortController(), slow = await fetch(url + '/slow', { signal: controller.signal });
    controller.abort(); await assert.rejects(slow.text());
    if (native) {
      protocol.handle('aura-http-test', () => new Response('trusted synthetic UI response', { headers: { 'content-type': 'text/plain' } }));
      assert.equal(await (await session.defaultSession.fetch('aura-http-test://app/health')).text(), 'trusted synthetic UI response');
      protocol.unhandle('aura-http-test');
      assert.equal(app.getPath('userData'), profile);
    }
    if (mode === 'patched') {
      const vetted = require('undici');
      for (const name of ['fetch', 'Request', 'Response', 'Headers', 'FormData', 'WebSocket', 'EventSource']) assert.equal(globalThis[name], vetted[name]);
      const mock = async () => new Response('injected'); globalThis.fetch = mock;
      runtime.install(); assert.equal(globalThis.fetch, mock, 'Repeated setup must not clobber injected transports.');
      globalThis.fetch = vetted.fetch;
      await vetted.getGlobalDispatcher().close();
    }
    process.stdout.write(JSON.stringify({ mode, native, node: process.versions.node, electron: process.versions.electron || null, bundledUndici: process.versions.undici, activeUndici: mode === 'patched' ? runtime.VERSION : process.versions.undici, malformedRejected: true, survived: true, stream: true, redirectBlocked: true, formData: true, aborted: true, protocol: native, requests: requests.map(item => item.path) }) + '\n');
  } finally {
    for (const socket of sockets) socket.destroy();
    healthy.closeAllConnections();
    await Promise.all([new Promise(resolve => malformed.close(resolve)), new Promise(resolve => healthy.close(resolve))]);
  }
}
main().then(() => { if (native) app.exit(0); }, error => { console.error(error.stack); if (native) app.exit(1); else process.exitCode = 1; });
