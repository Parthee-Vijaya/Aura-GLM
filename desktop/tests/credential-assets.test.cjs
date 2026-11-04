const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

function isolatedSession() {
  let request, permission;
  const isolated = { webRequest: { onBeforeRequest(handler) { request = handler; } }, setPermissionRequestHandler(handler) { permission = handler; }, setPermissionCheckHandler() {}, on() {} };
  const desktop = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
  const start = source.indexOf('const isolated = session.fromPartition(`credential-');
  const end = source.indexOf('return isolated;', start) + 'return isolated;'.length;
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(`(function(){${source.slice(start, end)}})()`, { session: { fromPartition: () => isolated }, crypto: { randomUUID: () => 'synthetic' }, path, __dirname: desktop, require });
  return { request: url => { let answer; request({ url }, value => { answer = value; }); return answer.cancel; }, permission: () => { let answer; permission({}, 'camera', value => { answer = value; }); return answer; }, asset: file => pathToFileURL(path.join(desktop, 'ui', file)).href };
}

test('the isolated credential window can load its shared theme while denying unrelated resources', () => {
  const session = isolatedSession();
  for (const file of ['credential-entry.html', 'credential-entry.css', 'credential-entry.js', 'aura-tokens.css']) assert.equal(session.request(session.asset(file)), false, file);
  for (const url of [session.asset('app.js'), session.asset('styles.css'), session.asset('aura-tokens.css') + '?extra=1', 'file:///etc/hosts', 'https://example.com/aura-tokens.css']) assert.equal(session.request(url), true, url);
  assert.equal(session.permission(), false, 'the new stylesheet grants no browser permissions');
});
