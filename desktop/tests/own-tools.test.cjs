const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { OwnTools } = require('../core/own-tools.cjs');
const { GitVersions } = require('../core/git.cjs');
const profiles = path.join(__dirname, '..', '..', 'profiles');
async function temp(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-egne-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return fs.realpath(root); }

test('advarer om skills, som projektets .gitignore udelader, i et rigtigt Git-repository', async t => {
  const root = await temp(t);
  await fs.writeFile(path.join(root, '.gitignore'), '.claude/\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  const tools = new OwnTools({ profiles, git: new GitVersions() });
  await tools.choose(root);
  const review = await tools.plan(['claude-code']);
  assert.ok(review.ignored.includes('.claude/skills/harness-kodestil/SKILL.md'), JSON.stringify(review.ignored).slice(0, 200));
  assert.ok(!review.ignored.includes('AGENTS.md'));
  assert.equal(review.git.initialized, true);
  const clean = await tools.plan(['codex']);
  assert.deepEqual(clean.ignored, []);
});

test('en mappe uden Git kan stadig gennemgås, og installation kræver en gennemgang først', async t => {
  const root = await temp(t);
  const tools = new OwnTools({ profiles, git: new GitVersions() });
  await assert.rejects(tools.plan(['codex']), /Vælg først projektmappen/);
  await tools.choose(root);
  await assert.rejects(tools.install(), /Gennemgå ændringerne først/);
  const review = await tools.plan(['codex']);
  assert.equal(review.git.initialized, false);
  assert.deepEqual(review.ignored, []);
  const result = await tools.install();
  assert.deepEqual(result.tools, ['codex']);
  await assert.rejects(tools.install(), /Gennemgå ændringerne først/, 'en gennemgang kan kun bruges én gang');
  await tools.planRemoval();
  assert.deepEqual((await tools.remove()).kept, []);
  assert.deepEqual(await fs.readdir(root), []);
});
