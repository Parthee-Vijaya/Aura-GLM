// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Workbench } = require('../core/workbench.cjs');
const { CredentialReceipts, binding } = require('../core/credential-entry.cjs');
const profiles = path.join(__dirname, '../../profiles');
async function temp(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-state-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
// The fake keychain embeds the plaintext in its ciphertext on purpose: if a
// secret ever leaked into a returned value, the assertions below would see it.
const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(`krypteret:${text}`), decryptString: data => data.toString().slice('krypteret:'.length) };
const COPY_ERROR = 'Nøglen kan ikke genbruges: udbyderen eller adressen er ændret. Indtast nøglen igen.';
const newBench = async t => new Workbench({ directory: await temp(t), profiles, emit: () => {}, safeStorage });
const stored = async bench => (await bench.store.read()).connections;

test('copy-key: en gemt nøgle genbruges krypteret til samme udbyder og adresse', async t => {
  const bench = await newBench(t);
  const first = (await bench.saveConnection({ kind: 'compatible', name: 'Første', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'klartekst-hemmelighed' })).connections[0];
  assert.equal(first.hasKey, true, 'kilden har en gemt nøgle');
  assert.ok(first.revision, 'den offentlige forbindelse bærer sin revision');
  const saved = await bench.saveConnection({ kind: 'compatible', name: 'Anden', baseURL: 'http://127.0.0.1:1/v1', copyKeyFrom: first.id, copyKeyRevision: first.revision });
  const second = saved.connections.find(c => c.id !== first.id);
  assert.ok(second, 'destinationen er gemt');
  assert.equal(second.hasKey, true, 'nøglen er overført til destinationen');
  assert.equal('secret' in second, false, 'hemmeligheden følger aldrig med returværdien');
  assert.equal(JSON.stringify(saved).includes('klartekst-hemmelighed'), false, 'klarteksten findes ikke i svaret fra hovedprocessen');
  const connections = await stored(bench);
  const source = connections.find(c => c.id === first.id), destination = connections.find(c => c.id === second.id);
  assert.equal(destination.secret, source.secret, 'den krypterede hemmelighed kopieres hovedprocessen imellem');
  assert.equal(bench.store.decrypt(destination), 'klartekst-hemmelighed', 'kopien dekrypteres til kildens nøgle');
});

test('copy-key: en ændret adresse eller udbyder afvises — nøglen sendes ikke til en anden modtager', async t => {
  const bench = await newBench(t);
  const first = (await bench.saveConnection({ kind: 'compatible', name: 'Første', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'hemmelighed' })).connections[0];
  await assert.rejects(bench.saveConnection({ kind: 'compatible', name: 'Anden adresse', baseURL: 'http://127.0.0.1:2/v1', copyKeyFrom: first.id, copyKeyRevision: first.revision }), { message: COPY_ERROR }, 'ændret adresse afvises');
  await assert.rejects(bench.saveConnection({ kind: 'ollama', name: 'Anden udbyder', baseURL: 'http://127.0.0.1:1/v1', copyKeyFrom: first.id, copyKeyRevision: first.revision }), { message: COPY_ERROR }, 'samme adresse er ikke nok — udbyderen skal også være den samme');
  assert.equal((await stored(bench)).length, 1, 'ingen destination gemmes');
});

test('copy-key: en forældet revision afvises', async t => {
  const bench = await newBench(t);
  const first = (await bench.saveConnection({ kind: 'compatible', name: 'Første', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'hemmelighed' })).connections[0];
  const stale = first.revision;
  // Kilden gemmes igen, efter rendereren læste dens revision — fx omdøbt i et andet vindue.
  await bench.saveConnection({ id: first.id, kind: 'compatible', name: 'Første omdøbt', baseURL: 'http://127.0.0.1:1/v1' });
  await assert.rejects(bench.saveConnection({ kind: 'compatible', name: 'Anden', baseURL: 'http://127.0.0.1:1/v1', copyKeyFrom: first.id, copyKeyRevision: stale }), { message: COPY_ERROR });
  assert.equal((await stored(bench)).length, 1, 'ingen destination gemmes');
});

test('copy-key: en ukendt kilde afvises', async t => {
  const bench = await newBench(t);
  await bench.saveConnection({ kind: 'compatible', name: 'Første', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'hemmelighed' });
  await assert.rejects(bench.saveConnection({ kind: 'compatible', name: 'Anden', baseURL: 'http://127.0.0.1:1/v1', copyKeyFrom: 'findes-ikke', copyKeyRevision: 'hvad-som-helst' }), { message: COPY_ERROR });
  assert.equal((await stored(bench)).length, 1, 'ingen destination gemmes');
});

test('copy-key: en almindelig gemning uden copyKeyFrom er uændret', async t => {
  const bench = await newBench(t);
  const saved = await bench.saveConnection({ kind: 'compatible', name: 'Med nøgle', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'hemmelighed' });
  assert.equal(saved.connections[0].hasKey, true, 'en indtastet nøgle gemmes');
  assert.equal(bench.store.decrypt((await stored(bench))[0]), 'hemmelighed');
  const without = await bench.saveConnection({ kind: 'compatible', name: 'Uden nøgle', baseURL: 'http://127.0.0.1:1/v1' });
  assert.equal(without.connections.find(c => c.name === 'Uden nøgle').hasKey, false, 'uden nøgle gemmes der ingen hemmelighed');
  assert.equal(JSON.stringify(without).includes('hemmelighed'), false, 'ingen hemmelighed forlader hovedprocessen');
});

test('copy-key: redigering med uændret udbyder og adresse bevarer nøglen som før', async t => {
  const bench = await newBench(t);
  const first = (await bench.saveConnection({ kind: 'compatible', name: 'Første', baseURL: 'http://127.0.0.1:1/v1', apiKey: 'hemmelighed' })).connections[0];
  const secretBefore = (await stored(bench)).find(c => c.id === first.id).secret;
  const edited = (await bench.saveConnection({ id: first.id, kind: 'compatible', name: 'Omdøbt', baseURL: 'http://127.0.0.1:1/v1' })).connections.find(c => c.id === first.id);
  assert.equal(edited.hasKey, true, 'nøglen bevares, fordi udbyder og adresse er uændret');
  const after = (await stored(bench)).find(c => c.id === first.id);
  assert.equal(after.secret, secretBefore, 'den krypterede hemmelighed er den samme');
  assert.equal(bench.store.decrypt(after), 'hemmelighed');
  assert.notEqual(edited.revision, first.revision, 'hver gemning får en ny revision');
});

test('copy-key: kvitteringen binder copyKeyFrom og copyKeyRevision uden at kræve nøglevinduet', () => {
  const receipts = new CredentialReceipts({ now: () => 0 });
  const configuration = { id: 'ny', kind: 'compatible', name: 'Anden', baseURL: 'http://127.0.0.1:1/v1', copyKeyFrom: 'kilde-1', copyKeyRevision: 'revision-1' };
  // Felterne er referencer, ikke hemmeligheder: de må gerne indgå i bindingen.
  assert.doesNotThrow(() => binding('connection', configuration));
  assert.throws(() => binding('connection', { ...configuration, copyKeySeed: 'ukendt-felt' }), /Ugyldige nøgleoplysninger/, 'andre felter afvises stadig');
  const receipt = receipts.put('connection', configuration, 'hemmelig-nøgle');
  assert.equal(receipts.consume('connection', configuration, receipt), 'hemmelig-nøgle', 'kvitteringen genkender sine referencer');
  const changed = receipts.put('connection', { ...configuration, copyKeyRevision: 'revision-2' }, 'anden-nøgle');
  assert.throws(() => receipts.consume('connection', configuration, changed), /udløbet eller oplysningerne er ændret/, 'en kvittering bundet til en anden revision afvises');
});
