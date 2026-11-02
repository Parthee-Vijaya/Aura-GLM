// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The shared renderer save queue (ui/profile-save.js): every profile writer —
// the theme button, the panel toggle and Indstillinger — serializes through it,
// because main.cjs's exclusive() rejects overlapping writes, and every
// successful save is announced as aura:profile-saved with the canonical profile.
const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'profile-save.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };

// Modulet køres i et vm-rige med en falsk rod, så både køen og hændelsen
// kan iagttages direkte.
function makeModule({ document = null, bare = false } = {}) {
  const CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; this.bubbles = init?.bubbles; } };
  const root = bare ? { CustomEvent } : { document, dispatched: [], dispatchEvent: event => root.dispatched.push(event), CustomEvent };
  vm.runInNewContext(source, { window: root, module: undefined, exports: undefined, CustomEvent });
  // Kilden tildeler api'et på roden (window i browseren).
  return root;
}
function makeDocument() {
  const listeners = {};
  return { listeners, addEventListener: (name, handler) => { (listeners[name] ||= []).push(handler); }, dispatchEvent: event => { for (const handler of listeners[event.type] || []) handler(event); return true; } };
}

test('queued kører opgaverne i rækkefølge og afviser ingen', async () => {
  const root = makeModule();
  const order = [];
  const gate = new Promise(resolve => { root.release = resolve; });
  const first = root.profileSaveQueued.queued(async () => { await gate; order.push('først'); });
  const second = root.profileSaveQueued.queued(async () => { order.push('andet'); });
  assert.deepEqual(order, [], 'den anden opgave venter på den første');
  root.release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['først', 'andet'], 'køen bevarer rækkefølgen');
});

test('queued lader en fejlslagen opgave passe og bærer sin egen fejl videre', async () => {
  const root = makeModule();
  const order = [];
  const failing = root.profileSaveQueued.queued(async () => { order.push('fejler'); throw new Error('Datamappen er låst.'); });
  const next = root.profileSaveQueued.queued(async () => { order.push('næste'); });
  await assert.rejects(failing, /Datamappen er låst/);
  await next;
  assert.deepEqual(order, ['fejler', 'næste'], 'en fejl blokerer ikke den næste gemning');
});

test('saved udsender aura:profile-saved på dokumentet med den gemte profil', () => {
  const document = makeDocument();
  const root = makeModule({ document });
  const received = [];
  document.listeners['aura:profile-saved'] = [event => received.push(event.detail)];
  const profile = { name: 'Anna Klit', icon: 'aura-1' };
  root.profileSaveQueued.saved(profile);
  assert.equal(received.length, 1);
  assert.equal(received[0], profile, 'hændelsen bærer den kanoniske profil');
  assert.equal(root.dispatched.length, 0, 'udsendelsen går til dokumentet, som bobler til vinduet');
});

test('saved skader aldrig en gemning uden et dokument eller eventmål', () => {
  const root = makeModule({ bare: true });
  assert.doesNotThrow(() => root.profileSaveQueued.saved({ name: 'Anna' }), 'et manglende eventmål sluger aldrig gemningen');
});

test('modulet er frossent og efterlader præcis profilSaveQueued på roden', () => {
  const root = makeModule();
  assert.equal(typeof root.profileSaveQueued.queued, 'function');
  assert.equal(typeof root.profileSaveQueued.saved, 'function');
  assert.equal(Object.isFrozen(root.profileSaveQueued), true);
  assert.deepEqual(Object.keys(root.profileSaveQueued).sort(), ['queued', 'saved']);
});
