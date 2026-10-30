const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { loadLibrary } = require('../core/library.cjs');
const { primaryBuildGuidance, designReferenceBundle } = require('../core/build-design.cjs');
const { writeSkills, permissions, engineConfig } = require('../core/engine.cjs');
const profileRoot = path.resolve(__dirname, '../../profiles');
const examples = [
  ['references/open-design-landing.md', '57704cd5b01a96e338f5de2f404a12269b5a14d1'],
  ['references/open-design-overview.md', '8cb5d073c7944fa4f1791dcedff8df9199992e34']
];
async function librarySkill() {
  const library = await loadLibrary(profileRoot);
  return { library, skill: library.skills.find(item => item.name === 'harness-aura-design') };
}
test('the examples retain their reviewed HTML with scripts and remote asset dependencies absent', async () => {
  const { skill } = await librarySkill();
  for (const [name, sourceBlob] of examples) {
    const reference = skill.files.find(file => file.path === name);
    const blocks = [...reference.content.matchAll(/^```html\n([\s\S]*?)^```/gm)];
    assert.equal(blocks.length, 1);
    const html = blocks[0][1], bytes = Buffer.from(html);
    const blob = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(blob, sourceBlob, 'the reviewed source or documented offline adaptation is pinned');
    assert.match(html, /<!doctype html>/i);
    assert.doesNotMatch(html, /<script\b|\bon\w+\s*=|https?:\/\/|<iframe\b|<object\b|<embed\b|<base\b/i);
    assert.match(reference.content, /statisk visuelt eksempel/);
    assert.match(reference.content, /normale filgodkendelser/);
    assert.match(reference.content, /open-design-license\.md/);
  }
});
test('examples are offered selectively without injecting every HTML example or dropping the existing first-call references', async () => {
  const { skill } = await librarySkill(), context = { skills: [skill] };
  for (const mode of ['idea', 'plan', 'build', 'free']) {
    const bundle = designReferenceBundle(context, mode), guidance = primaryBuildGuidance(context, mode);
    assert.equal(bundle.references.length, 3); assert.deepEqual(bundle.omitted, []);
    assert(bundle.bytes <= 12 * 1024);
    for (const [name] of examples) {
      assert(guidance.includes(path.basename(name)), 'the catalog is in the first model call');
      const html = skill.files.find(file => file.path === name).content.match(/^```html\n([\s\S]*?)^```/m)[1];
      assert(!guidance.includes(html), 'the model chooses a reference instead of receiving every template');
    }
    assert.match(guidance, /eksisterende godkendt design/);
    assert.match(guidance, /Ingen automatisk kopiering, MCP-installation eller nye tilladelser/);
  }
  assert.equal(primaryBuildGuidance(context, 'chat'), '');
});
test('native delivery writes passive Markdown only and keeps the original tool and MCP policy', async t => {
  const { library, skill } = await librarySkill();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-open-design-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeSkills(root, [skill]);
  const skillRoot = path.join(root, 'config/skills/harness-aura-design');
  for (const [name] of examples) {
    const file = path.join(skillRoot, name);
    assert.equal(await fs.readFile(file, 'utf8'), skill.files.find(item => item.path === name).content);
    assert.equal((await fs.stat(file)).mode & 0o111, 0);
    assert((await fs.readFile(path.join(skillRoot, 'SKILL.md'), 'utf8')).includes(file));
  }
  const policy = permissions(root, [], 'build', { directory: root, names: library.skills.map(item => item.name) });
  assert.equal(policy.bash, 'ask'); assert.equal(policy.external_directory['*'], 'ask');
  assert.equal(policy.read['*.env'], 'deny');
  assert.deepEqual(engineConfig({}, { id: 'fixture-model' }, policy).mcp, {});
  assert.deepEqual((await fs.readdir(root)).sort(), ['config']);
});
test('both complete source licenses survive delivery with their original bytes', async () => {
  const { skill } = await librarySkill();
  for (const [name, expected] of [
    ['references/open-design-license.md', '9d95806a26532623360eb84bb17d298f394b55ef73fb4c0796d99b4319b2b0da'],
    ['references/open-design-kit-license.md', '6dd7352a4368f2d39410164c21759111df7855d4fc21ab0b92f89e8a7f38246f']
  ]) assert.equal(crypto.createHash('sha256').update(skill.files.find(file => file.path === name).content).digest('hex'), expected);
});
