// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Icons = require('../ui/profile-icons.js');

// Avatar-billedet (A5): kilden er ét fast navn, og ?v=-cache-busteren bærer
// billedets egen revision (filens mtime, håndteret videre fra hvert
// profil-svar). Chromium kan genbruge et gemt billede trods no-store, så en
// ny upload i samme session kræver en frisk URL. Fallbacken til initialer
// er bundet pr. flade — CSP'en (script-src 'self') efterlader ingen plads
// til en inline onerror i selve img-strengen.
const ui = path.join(__dirname, '..', 'ui');
const chipSource = fs.readFileSync(path.join(ui, 'profile-chip.js'), 'utf8');
const settingsSource = fs.readFileSync(path.join(ui, 'settings.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');

class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null; this.listeners = {}; this._text = ''; this.attributes = new Map(); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get title() { return this.attributes.get('title') || ''; }
  set title(value) { this.attributes.set('title', String(value)); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, event = {}) { for (const handler of this.listeners[name] || []) handler(event); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const wanted = selector.toUpperCase();
    const found = [];
    const walk = el => { for (const child of el.children) { if (child.tagName === wanted) found.push(child); walk(child); } };
    walk(this);
    return found;
  }
}

test('avataren tegnes fra det faste navn — med revisionen som cache-buster', () => {
  Icons.setAvatarRevision(0);
  assert.ok(Icons.avatarImage().includes('<img src="avatar.png"'), 'uden revision er kilden det faste navn');
  assert.ok(!Icons.avatarImage().includes('?v='), 'uden kendt revision er der ingen forespørgsel');
  Icons.setAvatarRevision(1690000000000);
  assert.ok(Icons.avatarImage().includes('<img src="avatar.png?v=1690000000000"'), 'revisionen bliver cache-busteren — samme faste navn');
  assert.ok(!Icons.avatarImage().includes('data:'), 'stadig ingen base64');
  Icons.setAvatarRevision(0);
  assert.ok(!Icons.avatarImage().includes('?v='), 'fjernelsen nulstiller kilden — der er intet billede at buste');
  Icons.setAvatarRevision(-12);
  assert.ok(!Icons.avatarImage().includes('?v='), 'negative værdier klamres til det neutrale 0');
  Icons.setAvatarRevision(Number.NaN);
  Icons.setAvatarRevision('oktav');
  assert.ok(!Icons.avatarImage().includes('?v='), 'ulæselige værdier ændrer intet');
});

test('onerror: et billede, der ikke kan læses, bliver til initialerne', () => {
  const container = new El('button');
  const img = new El('img');
  container.append(img);
  Icons.attachAvatarFallback(container, 'Anna Klit');
  img.emit('error');
  assert.equal(container.textContent, 'AK', 'initialerne er det ærlige svar — samme svar som profilen giver uden fil');
  assert.equal(container.title, 'Initialer', 'titlen følger med tilbagefaldet');
  // Uden et billede i containeren sker der intet — bindingen fejler aldrig.
  const empty = new El('button');
  Icons.attachAvatarFallback(empty, 'Anna');
  assert.equal(empty.textContent, '', 'uden img er der intet at falde tilbage fra');
});

test('protokollen router stadig på stien — ?v= er kun cache-buster', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
  assert.ok(main.includes('const name = url.pathname.slice(1);'), 'navnet læses fra stien — forespørgslen rører aldrig routingen');
  const assets = require('../core/ui-assets.cjs');
  assert.equal(assets.allowed('avatar.png'), true, 'det faste navn er tilladt');
  for (const name of ['avatar.png?x=1', 'avatar2.png']) assert.equal(assets.allowed(name), false, `${name} er ikke en tilladt vej`);
});

test('alle tre flader binder fallbacken og sætter revisionen fra svarene', () => {
  assert.ok(chipSource.includes('attachAvatarFallback(mark, text)'), 'chippen binder fallbacken');
  assert.ok(settingsSource.includes('attachAvatarFallback?.(slot, profile?.name || \'\')'), 'Indstillinger binder fallbacken på avatar-pladsen');
  assert.ok(appSource.includes('attachAvatarFallback?.(slot, initialsPreview())'), 'onboarding-trinnet binder fallbacken');
  for (const source of [chipSource, settingsSource, appSource]) assert.ok(!/onerror=/.test(source), 'ingen inline onerror — CSP\'en tillader den ikke');
});
