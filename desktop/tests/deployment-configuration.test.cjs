const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DeploymentConfiguration } = require('../core/deployment-configuration.cjs');
const config = { provider: 'azure', project: 'min-app', group: 'Drift', subscription: 'test' };
const relative = '.aura/publishing/azure.json';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return fs.realpath(root);
}
async function existing(root, value = 'Brugerens eksisterende opsætning\n') {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, value);
  return target;
}

test('Gennemgang opretter intet; eksplicit gem skriver kun de gennemgåede filer én gang', async t => {
  const root = await fixture(t), setup = new DeploymentConfiguration();
  const workflow = { path: '.github/workflows/aura-github-pages.yml', content: 'name: Udgiv\non: workflow_dispatch\n' };
  const review = await setup.review(root, config, [workflow]);
  assert.deepEqual(await fs.readdir(root), []);
  assert.equal(review.files.length, 2);
  assert.equal(review.files[0].before, null);
  assert.equal('snapshot' in review.files[0], false);
  assert.deepEqual((await setup.apply(root, review.token)).written, [relative, workflow.path]);
  for (const file of review.files) assert.equal(await fs.readFile(path.join(root, file.path), 'utf8'), file.content);
  await assert.rejects(setup.apply(root, review.token), /Gennemgå/);
  const again = await setup.review(root, config, [workflow]);
  assert.equal(again.unchanged, true);
  assert.deepEqual((await setup.apply(root, again.token)).written, []);
});

test('Gem opdaterer en eksisterende fil og fjerner den gamle rest ved kortere indhold', async t => {
  const root = await fixture(t), target = await existing(root, 'gammelt'.repeat(1000)), setup = new DeploymentConfiguration();
  const review = await setup.review(root, config);
  await setup.apply(root, review.token);
  assert.equal(await fs.readFile(target, 'utf8'), review.files[0].content);
});

test('Ændringer, sletning og en ny fil efter gennemgang bevares ved afvisning', async t => {
  for (const action of ['ændret', 'slettet', 'ny']) {
    const root = await fixture(t), setup = new DeploymentConfiguration();
    if (action !== 'ny') await existing(root);
    const review = await setup.review(root, config);
    if (action === 'slettet') await fs.unlink(path.join(root, relative));
    else await existing(root, 'Andres ændring');
    await assert.rejects(setup.apply(root, review.token), /ændret/);
    if (action !== 'slettet') assert.equal(await fs.readFile(path.join(root, relative), 'utf8'), 'Andres ændring');
  }
});

test('Review afviser symlink i mappen, symlink i filen og hardlinks uden at skrive', async t => {
  const outside = await fixture(t), protectedFile = path.join(outside, 'bevar.txt');
  await fs.writeFile(protectedFile, 'Bevar');
  for (const kind of ['directory', 'file', 'hardlink']) {
    const root = await fixture(t), setup = new DeploymentConfiguration();
    if (kind === 'directory') await fs.symlink(outside, path.join(root, '.aura'));
    else {
      await fs.mkdir(path.join(root, '.aura/publishing'), { recursive: true });
      if (kind === 'file') await fs.symlink(protectedFile, path.join(root, relative));
      else await fs.link(protectedFile, path.join(root, relative));
    }
    await assert.rejects(setup.review(root, config), /link|sikkert/);
    assert.equal(await fs.readFile(protectedFile, 'utf8'), 'Bevar');
  }
});

test('Udskiftning med symlink efter gennemgang ændrer ikke linkets mål', async t => {
  const root = await fixture(t), outside = await fixture(t), target = await existing(root), other = path.join(outside, 'bevar.txt');
  await fs.writeFile(other, 'Bevar');
  const setup = new DeploymentConfiguration(), review = await setup.review(root, config);
  await fs.unlink(target); await fs.symlink(other, target);
  await assert.rejects(setup.apply(root, review.token), /sikkert|ændret/);
  assert.equal(await fs.readFile(other, 'utf8'), 'Bevar');
});

test('NOFOLLOW afviser et filsymlink indsat mellem kontrol og åbning til skrivning', async t => {
  const root = await fixture(t), target = await existing(root), outside = await fixture(t), other = path.join(outside, 'bevar.txt');
  await fs.writeFile(other, 'Bevar'); let armed = false, fired = false;
  const setup = new DeploymentConfiguration({ ...fs, open: async (file, flags, mode) => {
    if (armed && (flags & constants.O_RDWR) && file === target) {
      fired = true; await fs.unlink(target); await fs.symlink(other, target);
    }
    return fs.open(file, flags, mode);
  } });
  const review = await setup.review(root, config); armed = true;
  await assert.rejects(setup.apply(root, review.token), /ændret|sikkert/);
  assert.equal(fired, true);
  assert.equal(await fs.readFile(other, 'utf8'), 'Bevar');
});

test('Et udskiftet filnavn efter åbning får ikke det allerede åbne håndtag til at skrive', async t => {
  const root = await fixture(t), target = await existing(root), outside = await fixture(t), other = path.join(outside, 'bevar.txt');
  await fs.writeFile(other, 'Bevar'); let armed = false, fired = false;
  const setup = new DeploymentConfiguration({ ...fs, open: async (file, flags, mode) => {
    const handle = await fs.open(file, flags, mode);
    if (armed && (flags & constants.O_RDWR) && file === target) {
      fired = true; await fs.rename(target, target + '.old'); await fs.symlink(other, target);
    }
    return handle;
  } });
  const review = await setup.review(root, config); armed = true;
  await assert.rejects(setup.apply(root, review.token), /ændret/);
  assert.equal(fired, true);
  assert.equal(await fs.readFile(other, 'utf8'), 'Bevar');
  assert.equal(await fs.readFile(target + '.old', 'utf8'), 'Brugerens eksisterende opsætning\n');
});

test('Mappeudskiftning efter filåbning opdages, og hverken gammel fil eller eksternt mål ændres', async t => {
  const root = await fixture(t), target = await existing(root), outside = await fixture(t);
  await existing(outside, 'Ekstern fil'); let armed = false, fired = false;
  const setup = new DeploymentConfiguration({ ...fs, open: async (file, flags, mode) => {
    const handle = await fs.open(file, flags, mode);
    if (armed && (flags & constants.O_RDWR) && file === target) {
      fired = true; await fs.rename(path.join(root, '.aura'), path.join(root, '.aura-old'));
      await fs.symlink(path.join(outside, '.aura'), path.join(root, '.aura'));
    }
    return handle;
  } });
  const review = await setup.review(root, config); armed = true;
  await assert.rejects(setup.apply(root, review.token), /ændret/);
  assert.equal(fired, true);
  assert.equal(await fs.readFile(path.join(outside, relative), 'utf8'), 'Ekstern fil');
  assert.equal(await fs.readFile(path.join(root, '.aura-old/publishing/azure.json'), 'utf8'), 'Brugerens eksisterende opsætning\n');
});

test('Alle filer kontrolleres igen efter åbning, og nye tomme filer fjernes ved konflikt', async t => {
  const root = await fixture(t), workflow = { path: '.github/workflows/aura-github-pages.yml', content: 'Ny konfiguration' };
  const target = path.join(root, workflow.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, 'Eksisterende');
  let armed = false, fired = false;
  const setup = new DeploymentConfiguration({ ...fs, open: async (file, flags, mode) => {
    if (armed && file === target && (flags & constants.O_RDWR)) { fired = true; await fs.writeFile(target, 'Andres ændring'); }
    return fs.open(file, flags, mode);
  } });
  const review = await setup.review(root, config, [workflow]); armed = true;
  await assert.rejects(setup.apply(root, review.token), /ændret/);
  assert.equal(fired, true);
  assert.equal(await fs.readFile(target, 'utf8'), 'Andres ændring');
  await assert.rejects(fs.stat(path.join(root, relative)), { code: 'ENOENT' });
});

test('Ukendte, dublerede og for store filer afvises uden ændringer', async t => {
  const root = await fixture(t), setup = new DeploymentConfiguration();
  for (const files of [[{ path: '../udenfor', content: 'x' }], [{ path: relative, content: 'x' }], [{ path: '.github/workflows/aura-test.yml', content: 'x'.repeat(262145) }]]) {
    await assert.rejects(setup.review(root, config, files), /gennemgås|dublerede/);
  }
  assert.deepEqual(await fs.readdir(root), []);
});

test('Gennemgangen tilhører ét projekt og udløber', async t => {
  const root = await fixture(t), other = await fixture(t), setup = new DeploymentConfiguration();
  const review = await setup.review(root, config);
  await assert.rejects(setup.apply(other, review.token), /Gennemgå/);
  const expired = await setup.review(root, config); setup.reviews.get(expired.token).expires = 0;
  await assert.rejects(setup.apply(root, expired.token), /Gennemgå/);
  assert.deepEqual(await fs.readdir(root), []);
});
