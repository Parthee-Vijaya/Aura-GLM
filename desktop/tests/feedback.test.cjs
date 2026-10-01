const { test } = require('node:test');
const assert = require('node:assert/strict');
const { contact, mail } = require('../core/feedback.cjs');

test('feedback går kun til en navngiven, almindelig e-mailadresse', () => {
  assert.deepEqual(contact({ name: ' Test Person ', email: ' test@example.org ' }), { name: 'Test Person', email: 'test@example.org' });
  assert.equal(contact({ name: '', email: 'test@example.org' }), null, 'uden navn vises den generelle tekst');
  assert.equal(contact({ name: 'Test', email: '' }), null);
  assert.equal(contact(undefined), null);
  // Tegn, der kunne tilføje modtagere eller felter til e-mailen, afvises.
  for (const email of ['test@example.org?bcc=x@example.org', 'test@example.org&cc=x', 'a b@example.org', 'test@example']) assert.equal(contact({ name: 'Test', email }), null, email);
});

test('e-mailkladden har emne og spørgsmål med appversion og ingen projektdata', () => {
  const url = mail({ name: 'Test', email: 'test@example.org' }, { version: '0.2.0-beta.4', system: 'macOS arm64' });
  const parsed = new URL(url);
  assert.equal(parsed.protocol, 'mailto:');
  assert.equal(parsed.pathname, 'test@example.org');
  assert.equal(parsed.searchParams.get('subject'), 'Feedback om Aura 0.2.0-beta.4');
  assert.match(parsed.searchParams.get('body'), /Hvor gik du i stå[\s\S]*Aura 0\.2\.0-beta\.4 · macOS arm64[\s\S]*Send ikke API-nøgler/);
  assert.deepEqual([...parsed.searchParams.keys()], ['subject', 'body']);
});
