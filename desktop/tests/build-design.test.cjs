const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { loadLibrary } = require('../core/library.cjs');
const { primaryBuildGuidance, PRIMARY_BUILD_SKILL: name } = require('../core/build-design.cjs');
const { Store } = require('../core/store.cjs');
const { Features } = require('../core/features.cjs');
const { Skills } = require('../core/skills.cjs');
const { layoutFor } = require('../core/adapters.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-primary-skill-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = await loadLibrary(path.resolve(__dirname, '../../profiles'));
  if (!library.skills.some(skill => skill.name === 'harness-aura-design')) library.skills.push({ name, title: 'Synthetic build method', summary: 'Fixture', files: [
    { path: 'SKILL.md', content: '---\nname: harness-aura-design\ndescription: Synthetic build method\n---\n\nByg noget der fungerer. Se references/webapp-craft.md.\n' },
    { path: 'references/webapp-craft.md', content: 'Synthetic reference for export testing.' }
  ] });
  if (!library.features.find(feature => feature.id === 'design').skills.includes(name)) library.features.find(feature => feature.id === 'design').skills.push(name);
  const store = new Store(path.join(root, 'data')), features = new Features(store, async () => library);
  return { root, library, store, features, skills: new Skills(async () => library, store, features) };
}
test('primary core is loaded in every building mode, but not ordinary chat or a disabled design feature', async t => {
  const f = await fixture(t), context = await f.skills.context(f.root);
  const main = context.skills.find(s => s.name === name).files.find(f => f.path === 'SKILL.md').content;
  for (const mode of ['plan', 'build', 'free', 'idea']) {
    const text = primaryBuildGuidance(context, mode);
    assert.ok(text.includes(main.split('\n---\n')[1].trim()));
    assert.match(text, /fungerende|fungerer/); assert.match(text, /godkendelser/);
    if (mode === 'idea') assert.match(text, /ingen værktøjer i idéhjælpen/);
  }
  assert.equal(primaryBuildGuidance(context, 'chat'), '');
  assert.equal(primaryBuildGuidance(context, 'unknown'), '');
  assert.equal(primaryBuildGuidance({ ...context, skills: [] }, 'free'), '');
  assert.equal(primaryBuildGuidance({ ...context, features: { design: false } }, 'free'), '');
  await f.features.save(f.root, { scope: 'projekt', values: { design: false } });
  assert.equal(primaryBuildGuidance(await f.skills.context(f.root), 'build'), '');
});
test('project customization reaches the core; pre-project context never borrows another project', async t => {
  const f = await fixture(t), original = (await f.skills.list(f.root)).find(s => s.id === name);
  await f.skills.save(f.root, { id: name, content: original.content + '\nPROJECT-ONLY-SYNTHETIC-DESIGN\n' });
  assert.match(primaryBuildGuidance(await f.skills.context(f.root), 'free'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  assert.doesNotMatch(primaryBuildGuidance(await f.skills.context(null), 'idea'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  await f.features.save(null, { scope: 'alle', values: { design: false } });
  assert.equal(primaryBuildGuidance(await f.skills.context(null), 'idea'), '');
  await f.features.save(f.root, { scope: 'projekt', values: { design: true } });
  assert.match(primaryBuildGuidance(await f.skills.context(f.root), 'free'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  assert.equal(primaryBuildGuidance(await f.skills.context(null), 'idea'), '');
});
test('an enabled but malformed main skill fails closed instead of silently substituting instructions', () => {
  const context = files => ({ features: { design: true }, skills: [{ name, files }] });
  assert.throws(() => primaryBuildGuidance(context([]), 'build'), /mangler/);
  assert.throws(() => primaryBuildGuidance(context([{ path: 'SKILL.md', content: 'invalid' }]), 'build'), /YAML/);
});
test('exports route builds to the primary skill only when it is selected and retain the full guide', async t => {
  const { library } = await fixture(t);
  for (const tool of library.tools.filter(t => t.rules)) {
    const included = layoutFor(library, [tool.id], { skills: [name] });
    assert.ok(included.entries.some(f => f.content.includes('læs først harness-aura-design/SKILL.md')), tool.id);
    assert.ok(included.entries.some(f => f.path.endsWith('/references/webapp-craft.md')), tool.id);
    const excluded = layoutFor(library, [tool.id], { skills: [] });
    assert.ok(!excluded.entries.some(f => f.content.includes('læs først harness-aura-design/SKILL.md')), tool.id);
  }
});
