// SPDX-License-Identifier: EUPL-1.2
const test = require('node:test');
const assert = require('node:assert/strict');
const { request, bindInformationalDismiss } = require('../ui/connection-removal.js');
class Element {
  constructor(tag, document) { this.tagName = tag; this.document = document; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.text = ''; this.open = false; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async emit(name, fields = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, ...fields }; for (const handler of this.listeners[name] || []) await handler(event); return event; }
  showModal() { this.open = true; }
  close() { this.open = false; void this.emit('close'); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  focus() { this.document.activeElement = this; }
  getBoundingClientRect() { return { left: 100, top: 100, right: 500, bottom: 400 }; }
  find(fn) { return this.children.flatMap(child => [child, ...child.find(fn)]).filter(fn); }
}
function setup() {
  const document = { createElement(tag) { return new Element(tag, document); }, createTextNode(text) { const node = new Element('#text', document); node.textContent = text; return node; } };
  document.body = document.createElement('body');
  const selected = { id: 'one' }, calls = [];
  const start = overrides => request({ connection: { id: 'one', name: 'Arbejdsforbindelse', secret: 'SHOULD_NEVER_RENDER' }, stillCurrent: id => id === selected.id, remove: async id => { calls.push(id); }, document, ...overrides });
  const dialog = () => document.body.children.find(child => child.tagName === 'dialog');
  const button = action => dialog().find(child => child.dataset.action === action)[0];
  return { document, selected, calls, start, dialog, button };
}
test('confirmation names the connection, omits credential data, labels the modal and focuses Cancel', async () => {
  const f = setup(), done = f.start(), dialog = f.dialog();
  assert.equal(dialog.attributes['aria-labelledby'], 'connection-removal-title'); assert.equal(dialog.attributes['aria-describedby'], 'connection-removal-description');
  assert.match(dialog.textContent, /Arbejdsforbindelse/); assert.match(dialog.textContent, /projekter og samtaler bevares/); assert.doesNotMatch(dialog.textContent, /SHOULD_NEVER_RENDER/);
  assert.equal(f.document.activeElement, f.button('cancel')); assert.deepEqual(f.calls, []);
  await f.button('cancel').emit('click'); assert.equal(await done, false); assert.deepEqual(f.calls, []);
});
test('Escape cancels without deleting or affecting another dialog', async () => {
  const f = setup(), done = f.start(), event = await f.dialog().emit('cancel');
  assert.equal(event.prevented, true); assert.equal(await done, false); assert.deepEqual(f.calls, []); assert.equal(f.dialog(), undefined);
});
test('true backdrop click cancels; blank inside padding and drag ending outside do not', async () => {
  const f = setup(), done = f.start(), dialog = f.dialog();
  await dialog.emit('pointerdown', { clientX: 200, clientY: 200 }); await dialog.emit('click', { clientX: 200, clientY: 200 }); assert.equal(dialog.open, true);
  await dialog.emit('pointerdown', { clientX: 200, clientY: 200 }); await dialog.emit('click', { clientX: 0, clientY: 0 }); assert.equal(dialog.open, true);
  await dialog.emit('pointerdown', { clientX: 0, clientY: 0 }); await dialog.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(await done, false); assert.deepEqual(f.calls, []);
});
test('only an explicit confirm invokes the bound id and double-click cannot repeat it', async () => {
  const f = setup(); let release; const done = f.start({ remove: id => { f.calls.push(id); return new Promise(resolve => { release = resolve; }); } });
  const confirm = f.button('confirm'), cancel = f.button('cancel'), dialog = f.dialog();
  const first = confirm.emit('click'); await confirm.emit('click'); await cancel.emit('click'); await dialog.emit('cancel');
  assert.equal(dialog.open, true); assert.equal(cancel.disabled, true); assert.deepEqual(f.calls, ['one']);
  release(); await first; assert.equal(await done, true); assert.equal(f.dialog(), undefined);
});
test('a changed selection invalidates confirmation without deleting either connection', async () => {
  const f = setup(), done = f.start(); f.selected.id = 'two';
  await f.button('confirm').emit('click'); assert.deepEqual(f.calls, []); assert.equal(f.button('confirm').disabled, true); assert.match(f.dialog().textContent, /dit valg er ændret/);
  await f.button('cancel').emit('click'); assert.equal(await done, false);
});
test('second open request is ignored while a confirmation is pending', async () => {
  const f = setup(), first = f.start(), second = f.start(); assert.equal(await second, false); assert.equal(f.document.body.children.length, 1);
  await f.button('cancel').emit('click'); assert.equal(await first, false);
});
test('failure leaves an explicit retry and Cancel; no automatic retry occurs', async () => {
  const f = setup(); let count = 0; const done = f.start({ remove: async id => { f.calls.push(id); if (++count === 1) throw Error('Forbindelsen er i brug.'); } });
  await f.button('confirm').emit('click'); assert.equal(f.dialog().open, true); assert.match(f.dialog().textContent, /Forbindelsen er i brug/); assert.equal(f.button('cancel').disabled, false); assert.equal(count, 1);
  await f.button('confirm').emit('click'); assert.equal(await done, true); assert.equal(count, 2);
});
test('retired OAuth notice explains revocation without claiming shared tokens are revoked', async () => {
  const f = setup(), done = f.start({ connection: { id: 'one', name: 'Tidligere adgang', retiredOAuth: true } });
  assert.match(f.dialog().textContent, /loginadgang tilbagekaldes/); assert.match(f.dialog().textContent, /komplai Run bevares/);
  await f.button('cancel').emit('click'); await done;
});
test('informational outside dismissal is allowlisted and ignores forms, keys and approvals', async () => {
  const f = setup();
  for (const id of ['connections-dialog', 'skills-dialog', 'data-dialog', 'restore-dialog', 'preview-dialog', 'credential-dialog', 'permission-dialog', 'unknown']) {
    const dialog = f.document.createElement('dialog'); dialog.id = id; dialog.showModal();
    assert.equal(bindInformationalDismiss(dialog), false); await dialog.emit('pointerdown', { clientX: 0, clientY: 0 }); await dialog.emit('click', { clientX: 0, clientY: 0 }); assert.equal(dialog.open, true);
  }
  const support = f.document.createElement('dialog'); support.id = 'support-dialog'; support.showModal(); assert.equal(bindInformationalDismiss(support), true);
  await support.emit('pointerdown', { clientX: 200, clientY: 200 }); await support.emit('click', { clientX: 200, clientY: 200 }); assert.equal(support.open, true);
  await support.emit('pointerdown', { clientX: 0, clientY: 0 }); await support.emit('click', { clientX: 0, clientY: 0 }); assert.equal(support.open, false);
});
