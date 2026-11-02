const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// Productnavnet har én kilde: core/distribution.cjs. Denne test afviser gamle
// produktnavne som levende tekst i UI og holder metadata og titel i trit, så et
// fremtidigt navneskift ikke kan efterlade halve omdøbninger. Historiske
// udgivelsesnoter og repo-/feed-identiteten (Aura-GLM) røres ikke her.
const distribution = require('../core/distribution.cjs');
const ui = path.join(__dirname, '..', 'ui');
const OLD_NAMES = [/Aura GLM/, /AuraGLM/, /Aura[ -]1\b/];

async function uiFiles() {
  const names = (await fs.readdir(ui)).filter(name => /\.(js|html|css)$/.test(name));
  return Promise.all(names.map(async name => ({ name, text: await fs.readFile(path.join(ui, name), 'utf8') })));
}

test('product metadata follows the single display name source', async () => {
  assert.equal(distribution.displayName, 'Aura Prime');
  const packageJson = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.productName, distribution.displayName);
  const builder = require('../electron-builder.cjs');
  assert.equal(builder.productName, distribution.displayName);
  assert.ok(builder.artifactName.startsWith(distribution.artifactPrefix + '-'));
  assert.equal(builder.win.executableName, 'Aura');
});

test('window and dialog titles carry the current product name', async () => {
  const index = await fs.readFile(path.join(ui, 'index.html'), 'utf8');
  assert.equal(/<title>([^<]*)<\/title>/.exec(index)?.[1], distribution.displayName);
  const credential = await fs.readFile(path.join(ui, 'credential-entry.html'), 'utf8');
  assert.match(/<title>([^<]*)<\/title>/.exec(credential)?.[1] || '', new RegExp(`^${distribution.displayName} ·`));
});

test('the UI contains no superseded product names as live text', async () => {
  for (const { name, text } of await uiFiles()) {
    for (const pattern of OLD_NAMES) {
      const found = pattern.exec(text);
      assert.ok(!found, `${name} indeholder et gammelt produktnavn: ${found?.[0]}`);
    }
  }
});

test('the UI keeps using the current product name consistently', async () => {
  const files = (await uiFiles()).filter(({ name }) => name.endsWith('.js') || name.endsWith('.html'));
  const used = files.filter(({ text }) => text.includes(distribution.displayName));
  assert.ok(used.length >= 10, 'Produktnavnet forventes brugt bredt i UI; mangler det helt, er noget gledet.');
});

// C7: README'ens levende tekst følger også navnet og det aktuelle
// onboardingforløb — appens navn er Aura Prime, og den guidede opstart har
// tre trin med profil-trinnet først (funktionstrinnet er væk).
test('the README names the product and the guided onboarding honestly', async () => {
  const readme = await fs.readFile(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.ok(readme.includes('Appens navn og egne menuer er **Aura Prime**.'), 'README navngiver produktet Aura Prime');
  assert.ok(readme.includes('**1 Din profil · 2 Forbindelse · 3 Din idé**'), 'README beskriver opstartens tre trin med profil-trinnet først');
  assert.ok(!readme.includes('Byg i Aura-appen'), 'introduktionens første valg bærer det aktuelle produktnavn');
  assert.ok(!/Funktioner.*-trin/i.test(readme.slice(readme.indexOf('### Den guidede opstart'), readme.indexOf('###', readme.indexOf('### Den guidede opstart') + 4))), 'opstarten spørger ikke længere om funktioner');
});
