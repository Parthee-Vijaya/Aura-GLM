const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { appIdentity, rememberKeychain, projectParent } = require('../core/app-identity.cjs');

// Rigtige mapper i en midlertidig rod, som Electrons appData, userData og Dokumenter ville se ud.
async function root(t) { const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-identitet-'))); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
const start = (appData, options = {}) => appIdentity({ appData, packaged: true, customUserData: false, userData: path.join(appData, 'Aura'), sessionData: path.join(appData, 'Aura'), ...options });

test('en ny installation hedder Aura i datamappe og nøglering og husker det', async t => {
  const appData = await root(t);
  const identity = start(appData);
  assert.equal(identity.userData, path.join(appData, 'Aura'));
  assert.equal(identity.keychainName, 'Aura');
  assert.equal(rememberKeychain(identity), true);
  assert.deepEqual(JSON.parse(await fs.readFile(identity.marker, 'utf8')), { navn: 'Aura' });
  assert.equal(start(appData).keychainName, 'Aura', 'næste opstart vælger det samme navn');
});

test('en installation fra før navneskiftet beholder sin datamappe og sit navn i nøgleringen', async t => {
  const appData = await root(t);
  await fs.mkdir(path.join(appData, 'AI Harness', 'harness'), { recursive: true });
  const identity = start(appData);
  assert.equal(identity.userData, path.join(appData, 'AI Harness'));
  assert.equal(identity.sessionData, path.join(appData, 'AI Harness'));
  assert.equal(identity.keychainName, 'AI Harness', 'nøgler fra før navneskiftet kan stadig læses');
  rememberKeychain(identity);
  assert.equal(start(appData).keychainName, 'AI Harness');
});

test('udviklingsdata og en valgt datamappe følger samme regel', async t => {
  const appData = await root(t);
  await fs.mkdir(path.join(appData, 'ai-harness-desktop'), { recursive: true });
  const dev = appIdentity({ appData, packaged: false, customUserData: false, userData: path.join(appData, 'Aura'), sessionData: path.join(appData, 'Aura') });
  assert.equal(dev.userData, path.join(appData, 'ai-harness-desktop'));
  assert.equal(dev.keychainName, 'Aura', 'udviklingsdata uden appens egne filer har ingen nøgler fra før');
  // En valgt mappe, fx i opdateringsprøven, med data fra før navneskiftet.
  const custom = path.join(appData, 'valgt');
  await fs.mkdir(path.join(custom, 'harness'), { recursive: true });
  const chosen = appIdentity({ appData, packaged: true, customUserData: true, userData: custom, sessionData: custom });
  assert.equal(chosen.userData, custom);
  assert.equal(chosen.keychainName, 'AI Harness');
  // Et ugyldigt navn i filen ender ikke som appens navn.
  await fs.writeFile(chosen.marker, JSON.stringify({ navn: 'Noget andet' }));
  assert.equal(appIdentity({ appData, packaged: true, customUserData: true, userData: custom, sessionData: custom }).keychainName, 'Aura');
});

test('nye projekter lægges i Dokumenter/Aura, medmindre Dokumenter/AI Harness findes', async t => {
  const documents = await root(t);
  assert.equal(projectParent(documents), path.join(documents, 'Aura'));
  await fs.mkdir(path.join(documents, 'AI Harness'));
  assert.equal(projectParent(documents), path.join(documents, 'AI Harness'));
});
