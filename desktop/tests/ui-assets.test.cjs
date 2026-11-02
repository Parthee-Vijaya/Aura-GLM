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

test('avatar-ruten er ét fast navn — protokollen åbner aldrig en fri sti', () => {
  // Profilbilledet er den ene serverede fil uden for ui/: navnet er tilladt
  // præcist, så protokollen aldrig bliver en generel fillæser.
  assert.equal(allowed('avatar.png'), true, 'egne profilbilleder serveres under det faste navn');
  assert.equal(contentType('avatar.png'), 'image/png');
  assert.equal(FILES.includes('avatar.png'), false, 'avataren er ikke en UI-fil på disken');
  for (const name of ['avatar2.png', 'avatar.png.png', 'avatar.jpeg', 'avatar/../avatar.png', 'avatar.png?x=1']) assert.equal(allowed(name), false, name);
});

test('composer-bundbjælkens knaprækkefølge er låst: plus, arbejdsmåde, model, Stop/Send', async () => {
  const index = await fs.readFile(path.join(ui, 'index.html'), 'utf8');
  const start = index.indexOf('<div class="composer-toolbar">');
  const toolbar = index.slice(start, index.indexOf('</form>', start));
  const order = [...toolbar.matchAll(/id="(chat-materials-plus|composer-mode|model-chip|stop|send)"/g)].map(match => match[1]);
  assert.deepEqual(order, ['chat-materials-plus', 'composer-mode', 'model-chip', 'stop', 'send']);
});
