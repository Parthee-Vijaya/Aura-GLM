// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installProfileAvatar, AVATAR_NAME, MAX_BYTES, MAX_EDGE } = require('../core/profile-avatar.cjs');
const { ICON_IDS } = require('../core/profile.cjs');

// Profilbilledet er hovedprocessens sag alene: rendereren kan kun bede om
// filvælgeren og får kun udfaldet tilbage — aldrig stier eller billeddata.
// Modultestene stubber dialog og nativeImage og bruger ellers den ægte fs,
// så skrivningen (0600, fast navn) prøves mod en ægte mappe.
async function fixture(t, { width = 1000, height = 400, empty = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-avatar-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'valgt-billede.png');
  await fs.writeFile(source, Buffer.from('kildefil'));
  const calls = { dialog: [], resize: [], saves: [] };
  const image = {
    isEmpty: () => empty,
    getSize: () => ({ width, height }),
    resize: options => { calls.resize.push(options); return { toPNG: () => Buffer.from('skaleret-png') }; },
    toPNG: () => Buffer.from('u-skalet-png'),
  };
  const nativeImage = { createFromBuffer: buffer => { calls.buffer = buffer; return image; } };
  let picker = async () => ({ canceled: true });
  const handlers = new Map();
  installProfileAvatar({
    register: (channel, action) => handlers.set(channel, action),
    dialog: { showOpenDialog: async (owner, options) => { calls.owner = owner; calls.dialog.push(options); return picker(options); } },
    nativeImage,
    fs, path,
    directory: () => directory,
    saveProfile: async patch => { calls.saves.push(patch); return { profile: { name: 'Anna Klit', ...patch }, warnings: [], hasAvatar: patch.icon === 'upload' }; },
    getWindow: () => 'hovedvinduet',
  });
  return { directory, source, calls, handlers, pick: next => { picker = next; } };
}
const stored = f => path.join(f.directory, AVATAR_NAME);

test('konstanten er ét fast filnavn og ét loft — ingen skiftende stier', () => {
  assert.equal(AVATAR_NAME, 'avatar.png');
  assert.equal(MAX_BYTES, 1024 * 1024, 'kildefilen må være på omkring højst 1 MB');
  assert.equal(MAX_EDGE, 256, 'avataren må fylde højst 256x256');
  assert.deepEqual(ICON_IDS, ['aura-1', 'aura-2', 'aura-3'], 'ikonlisten er de tre Aura-varianter');
});

test('upload åbner filvælgeren alene — rendereren kan ikke angive stier eller bytes', async t => {
  const f = await fixture(t);
  f.pick(async options => {
    assert.deepEqual(options.filters, [{ name: 'Billeder (jpg, png)', extensions: ['jpg', 'jpeg', 'png'] }], 'kun jpg og png tilbydes');
    assert.deepEqual(options.properties, ['openFile', 'dontAddToRecent'], 'valget sætter ikke spor i systemets seneste filer');
    return { canceled: false, filePaths: [f.source] };
  });
  const result = await f.handlers.get('profile:upload-avatar')({ path: '/etc/passwd', bytes: 'data:image/png;base64,ævl' });
  assert.equal(f.calls.owner, 'hovedvinduet', 'dialogen får hovedvinduet som ejer');
  assert.equal(f.calls.dialog.length, 1, 'vælgeren åbnes præcis én gang');
  assert.ok(!JSON.stringify(f.calls.dialog[0]).includes('/etc/passwd'), 'rendererens sti når aldrig dialogen');
  assert.ok(!JSON.stringify(result).includes(f.source), 'resultatet bærer aldrig kildesuksen');
  assert.ok(!JSON.stringify(result).includes('kildefil'), 'resultatet bærer aldrig kildeindholdet');
  assert.deepEqual(result, { canceled: false, profile: { name: 'Anna Klit', icon: 'upload' }, warnings: [], hasAvatar: true }, 'rendereren ser kun udfaldet og profilen');
  assert.equal(String(f.calls.buffer), 'kildefil', 'bufferen læses fra den valgte fil i hovedprocessen');
});

test('et annulleret valg skriver intet og gemmer ingen profil', async t => {
  const f = await fixture(t);
  const result = await f.handlers.get('profile:upload-avatar')();
  assert.deepEqual(result, { canceled: true });
  await assert.rejects(() => fs.stat(stored(f)), error => error.code === 'ENOENT', 'ingen avatar-fil skrives');
  assert.deepEqual(f.calls.saves, [], 'profilen røres ikke');
});

test('et for stort billede afvises på dansk uden at skrive noget', async t => {
  const f = await fixture(t);
  const heavy = path.join(f.directory, 'for-stort.png');
  await fs.writeFile(heavy, Buffer.alloc(MAX_BYTES + 1));
  f.pick(async () => ({ canceled: false, filePaths: [heavy] }));
  await assert.rejects(() => f.handlers.get('profile:upload-avatar')(), /Billedet er for stort/);
  await assert.rejects(() => fs.stat(stored(f)), error => error.code === 'ENOENT');
  assert.deepEqual(f.calls.saves, []);
});

test('et ulæseligt billede afvises på dansk uden at skrive noget', async t => {
  const f = await fixture(t, { empty: true });
  f.pick(async () => ({ canceled: false, filePaths: [f.source] }));
  await assert.rejects(() => f.handlers.get('profile:upload-avatar')(), /Billedet kunne ikke læses/);
  await assert.rejects(() => fs.stat(stored(f)), error => error.code === 'ENOENT');
  assert.deepEqual(f.calls.saves, []);
});

test('et stort billede skaleres til 256-kanten med bevaret sideforhold og gemmes 0600', async t => {
  const f = await fixture(t, { width: 1000, height: 400 });
  f.pick(async () => ({ canceled: false, filePaths: [f.source] }));
  await f.handlers.get('profile:upload-avatar')();
  assert.deepEqual(f.calls.resize, [{ width: 256, height: 102 }], 'sideforholdet bevares: 1000x400 bliver 256x102');
  assert.equal(String(await fs.readFile(stored(f))), 'skaleret-png', 'den skalerede PNG gemmes under det faste navn');
  assert.equal((await fs.stat(stored(f))).mode & 0o777, 0o600, 'filen er kun læsbar for brugeren');
  assert.deepEqual(f.calls.saves, [{ icon: 'upload' }], 'filen og ikonvalget skifter sammen');
});

test('et portrætbillede skaleres efter den længste kant', async t => {
  const f = await fixture(t, { width: 400, height: 1000 });
  f.pick(async () => ({ canceled: false, filePaths: [f.source] }));
  await f.handlers.get('profile:upload-avatar')();
  assert.deepEqual(f.calls.resize, [{ width: 102, height: 256 }], '400x1000 bliver 102x256');
});

test('et lille billede gemmes uden skalering', async t => {
  const f = await fixture(t, { width: 120, height: 90 });
  f.pick(async () => ({ canceled: false, filePaths: [f.source] }));
  await f.handlers.get('profile:upload-avatar')();
  assert.deepEqual(f.calls.resize, [], 'billeder inden for 256x256 røres ikke');
  assert.equal(String(await fs.readFile(stored(f))), 'u-skalet-png');
});

test('remove fjerner filen og nulstiller ikonet til initialer', async t => {
  const f = await fixture(t);
  f.pick(async () => ({ canceled: false, filePaths: [f.source] }));
  await f.handlers.get('profile:upload-avatar')();
  const removed = await f.handlers.get('profile:remove-avatar')();
  await assert.rejects(() => fs.stat(stored(f)), error => error.code === 'ENOENT', 'filen er væk');
  assert.deepEqual(f.calls.saves, [{ icon: 'upload' }, { icon: '' }], 'fjernelsen rydder ikonvalget');
  assert.deepEqual(removed, { profile: { name: 'Anna Klit', icon: '' }, warnings: [], hasAvatar: false });
});

test('remove tåler en fil, der allerede er væk', async t => {
  const f = await fixture(t);
  const removed = await f.handlers.get('profile:remove-avatar')();
  assert.deepEqual(removed, { profile: { name: 'Anna Klit', icon: '' }, warnings: [], hasAvatar: false });
});

test('profilbilledet og ikonet har ingen vej til prompts, modellog, diagnostik eller feedback', () => {
  // Navn og ikon er ren UI-tilstand (designdokumentets anti-mål): de filer, der
  // bygger udgående forespørgsler, modellog, diagnostik og feedback, må aldrig
  // nævne avatarruten eller profilens felter.
  const root = path.join(__dirname, '..');
  for (const file of ['core/gateway.cjs', 'core/engine.cjs', 'core/engine-opencode2.cjs', 'core/model-request-log.cjs', 'core/diagnostics.cjs', 'core/feedback.cjs']) {
    const source = fsSync.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /avatar|profile\.icon|profile\.name/i, `${file} rører aldrig profilbilledet eller profilens felter`);
  }
});
