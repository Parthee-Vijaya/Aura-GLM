const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Manifestet er protokollens én kilde: enhver fil, index.html indlæser, skal være tilladt,
// og enhver tilladt fil skal findes på disken. En ny UI-fil uden manifestpost giver fejl her,
// ikke en stille 404 fra harness://-protokollen.
const ui = path.join(__dirname, '..', 'ui');
const { FILES, ONBOARDING_ASSETS, allowed, contentType } = require('../core/ui-assets.cjs');

test('hvert script, stylesheet og billede i index.html er tilladt af manifestet', async () => {
  const index = await fs.readFile(path.join(ui, 'index.html'), 'utf8');
  const references = [...index.matchAll(/(?:src|href)="([a-z0-9-]+\.(?:js|css|png))"/g)].map(match => match[1]);
  assert.ok(references.length >= 40, 'index.html forventes at indlæse mange lokale filer');
  for (const name of references) assert.ok(allowed(name), `index.html indlæser en fil uden manifestpost: ${name}`);
});

test('alle manifestfiler findes på disken, og indholdstyperne er faste', async () => {
  assert.ok(FILES.includes('index.html'));
  for (const name of [...FILES, ...ONBOARDING_ASSETS]) await fs.access(path.join(ui, name));
  assert.equal(contentType('aura-icon.png'), 'image/png');
  assert.equal(contentType('provider-openai.svg'), 'image/svg+xml');
  assert.equal(contentType('app.js'), 'text/javascript');
  assert.equal(contentType('styles.css'), 'text/css');
  assert.equal(contentType('index.html'), 'text/html; charset=utf-8');
});

test('manifestet afviser ukendte filer og stikveje uden at røre mønstrene', () => {
  assert.equal(allowed('app.js'), true);
  assert.equal(allowed('provider-corti.svg'), true);
  for (const name of ['../main.cjs', 'main.cjs', '', 'app.js.js', 'node_modules/x.js', 'app%2Ejs']) assert.equal(allowed(name), false, name);
});
