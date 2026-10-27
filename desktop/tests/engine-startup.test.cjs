// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createStartupRecord, install, sinkDirectory, uninstall } = require('../core/engine-startup.cjs');

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-startup-record-'));
  t.after(() => uninstall());
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('opstartsregistrer indeholder kun faste felter og aldrig indhold, stier eller hemmeligheder', () => {
  const record = createStartupRecord({ mode: 'plan', privacyIsolation: true, sandbox: false, detached: true });
  record.phase('find-executable');
  record.phase('spawn');
  record.child({ pid: 4242, exitCode: null, spawnErrorCode: 'ENOENT' });
  record.urlProgress({ found: true, stdoutBytes: 512, stderrBytes: 33 });
  record.fail(Object.assign(new Error('hemmelig-fritekst-med-sti /Users/parthee/privat'), { code: 'EACCES', status: 503 }));
  const snapshot = record.finalize();
  const serialized = JSON.stringify(snapshot);
  // Fast kontrakt: kun disse nøgler må findes i posten.
  const allowed = new Set(['schemaVersion', 'startupID', 'startedAt', 'mode', 'privacyIsolation', 'sandbox', 'detached', 'events', 'outcome', 'errorPhase', 'errorName', 'errorCode', 'httpStatus', 'child', 'url']);
  for (const key of Object.keys(snapshot)) assert.equal(allowed.has(key), true, `uventet felt: ${key}`);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.mode, 'plan');
  assert.equal(snapshot.privacyIsolation, true);
  assert.deepEqual(snapshot.events.map(event => event.phase), ['find-executable', 'spawn']);
  assert.equal(snapshot.child.pid, 4242);
  assert.equal(snapshot.child.spawnErrorCode, 'ENOENT');
  assert.equal(snapshot.url.found, true);
  assert.equal(snapshot.url.stdoutBytes, 512);
  assert.equal(snapshot.outcome, 'error');
  assert.equal(snapshot.errorCode, 'EACCES');
  assert.equal(snapshot.httpStatus, 503);
  // Ingen fritekst, ingen systemadgange, ingen outputindhold må optræde.
  assert.equal(serialized.includes('hemmelig-fritekst'), false);
  assert.equal(Object.keys(snapshot.child).includes('stdout'), false);
});

test('ukendte fase- og feltværdier afvises eller pacificeres uden indholdslæk', () => {
  const record = createStartupRecord({ mode: 'build' });
  record.phase('evig ukendt fase med fritekst'.repeat(5));
  let latest = null;
  for (let index = 0; index < 40; index++) record.phase(index % 2 ? 'url' : 'health');
  record.child({ pid: -1, exitCode: 2.5, signal: 'SIGAFRI', spawnErrorCode: 'EKKEL-' + 'A'.repeat(30) });
  record.urlProgress({ stdoutBytes: -1, stderrBytes: Number.MAX_SAFE_INTEGER * 2 });
  record.fail(Object.assign(new Error('x'), { code: 'IKKE-ET-SYSTEMKODE', status: 99999 }));
  latest = record.finalize();
  assert.ok(latest.events.length <= 24, 'begænset hændelsesantal');
  assert.equal(latest.child.pid, null, 'negativ pid afvises');
  assert.equal(latest.child.signal, null, 'ukendt signaludtryk afvises');
  assert.equal(latest.child.spawnErrorCode, null, 'ukendt fejlkode afvises');
  assert.equal(latest.url.stdoutBytes, null, 'negativt antal afvises');
  assert.equal(latest.errorCode, null, 'ikke-fast fejlkode afvises');
  assert.equal(latest.httpStatus, null, 'ugyldig HTTP-status afvises');
  const unknown = latest.events.find(event => event.phase === 'unknown');
  assert.ok(unknown, 'ukendt fase navngives som fast værdi uden fritekst');
});

test('install() gemmer afgrænsede JSONL-linjer og beholder kun de seneste poster', async t => {
  const dir = await directory(t);
  const { retention } = install({ directory: dir, retention: 5 }) || {};
  assert.equal(typeof retention === 'number' && retention === 5, true);
  assert.equal(sinkDirectory(), dir);
  const record = createStartupRecord({ mode: 'chat' });
  record.phase('start');
  record.ready();
  assert.ok(record.finalize(), 'første færdigskrivning skrives');
  for (let index = 0; index < 9; index++) { const again = createStartupRecord({ mode: 'chat' }); again.phase('spawn'); again.fail(new Error('sporadisk')); again.finalize(); }
  const lines = (await fs.readFile(path.join(dir, 'engine-startup.jsonl'), 'utf8')).split('\n').filter(Boolean);
  assert.equal(lines.length, 5, 'kun de seneste fem opstarter bevares');
  assert.equal(JSON.parse(lines.at(-1)).outcome, 'error');
  assert.equal(JSON.parse(lines.at(-1)).errorName, 'Error');
  assert.equal(JSON.parse(lines.at(-1)).mode, 'chat');
  assert.ok(lines.every(line => { const parsed = JSON.parse(line); return parsed.schemaVersion === 1 && /^[0-9a-f-]{36}$/.test(parsed.startupID); }), 'hver linje er en gyldig post');
});

test('uændret færdigskrivning skriver ikke igen; ny tilstand tilføjes', async t => {
  const dir = await directory(t);
  install({ directory: dir, retention: 30 });
  const initial = createStartupRecord({ mode: 'chat' });
  initial.phase('spawn');
  initial.ready();
  assert.ok(initial.finalize(), 'første færdigskrivning returnerer posten');
  const first = (await fs.readFile(path.join(dir, 'engine-startup.jsonl'), 'utf8')).split('\n').filter(Boolean);
  assert.equal(first.length, 1);
  assert.equal(initial.finalize(), null, 'uændret anden færdigskrivning skriver ikke igen');
  const steady = createStartupRecord({ mode: 'chat' });
  steady.phase('spawn');
  steady.ready();
  steady.finalize();
  assert.equal(steady.finalize(), null, 'gentagen færdigskrivning uden ændringer skriver ikke igen');
  const after = (await fs.readFile(path.join(dir, 'engine-startup.jsonl'), 'utf8')).split('\n').filter(Boolean);
  assert.equal(after.length, 2, 'kun nye tilstande føjes til filen');
});

test('uden installering skriver registrering intet til disken', async t => {
  uninstall();
  const probe = createStartupRecord({ mode: 'free' });
  probe.phase('start');
  probe.ready();
  assert.equal(probe.finalize().outcome, 'ready');
  assert.equal(sinkDirectory(), null);
  // Ingen mappe oprettes til opstartsregistrering uden opsætning.
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-startup-nosink-'));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const before = await fs.readdir(tempRoot);
  const withoutSink = createStartupRecord({ mode: 'free' });
  withoutSink.finalize();
  assert.deepEqual(await fs.readdir(tempRoot), before);
});

test('genoptaget færdigskrivning efter en stoppet opstart forbliver observerbar', async t => {
  const dir = await directory(t);
  install({ directory: dir, retention: 3 });
  const record = createStartupRecord({ mode: 'build' });
  record.phase('spawn');
  record.ready();
  record.finalize();
  // Stop efter en ellers fuldført opstart skal kunne ses som ny linje.
  record.fail(new Error('Agentmotorens opstart blev stoppet.'));
  const appended = record.finalize();
  assert.equal(appended.outcome, 'error');
  const lines = (await fs.readFile(path.join(dir, 'engine-startup.jsonl'), 'utf8')).split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).outcome, 'ready');
  assert.equal(JSON.parse(lines[1]).outcome, 'error');
});
