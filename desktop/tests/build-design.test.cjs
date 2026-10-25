const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { loadLibrary } = require('../core/library.cjs');
const { primaryBuildGuidance, DESIGN_QUALITY_CHECKS, PRIMARY_BUILD_SKILL: name } = require('../core/build-design.cjs');
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
test('mandatory core is loaded in every building mode; ordinary chat stays scoped', async t => {
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
  assert.throws(() => primaryBuildGuidance({ ...context, skills: [] }, 'free'), /mangler/);
  assert.equal(primaryBuildGuidance({ ...context, features: { design: false } }, 'free'), primaryBuildGuidance(context, 'free'));
  await f.features.save(f.root, { scope: 'projekt', values: { design: false } });
  assert.equal(primaryBuildGuidance(await f.skills.context(f.root), 'build'), primaryBuildGuidance(context, 'build'));
});
test('project customization reaches the core; pre-project context never borrows another project', async t => {
  const f = await fixture(t), original = (await f.skills.list(f.root)).find(s => s.id === name);
  // Replace the local body while retaining valid reference declarations.
  const references = original.content.split('\n').filter(line => line.includes('](references/')).join('\n');
  await f.skills.save(f.root, { id: name, content: '---\nname: ' + name + '\ndescription: Project design instructions\n---\nPROJECT-ONLY-SYNTHETIC-DESIGN\n' + references });
  assert.match(primaryBuildGuidance(await f.skills.context(f.root), 'free'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  assert.ok(primaryBuildGuidance(await f.skills.context(f.root), 'free').includes(original.content.split('\n---\n')[1].trim()), 'project customization cannot remove the baseline');
  assert.doesNotMatch(primaryBuildGuidance(await f.skills.context(null), 'idea'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  await f.features.save(null, { scope: 'alle', values: { design: false } });
  assert.match(primaryBuildGuidance(await f.skills.context(null), 'idea'), /HOVEDSKILL TIL BYGNING/);
  await f.features.save(f.root, { scope: 'projekt', values: { design: true } });
  assert.match(primaryBuildGuidance(await f.skills.context(f.root), 'free'), /PROJECT-ONLY-SYNTHETIC-DESIGN/);
  assert.match(primaryBuildGuidance(await f.skills.context(null), 'idea'), /HOVEDSKILL TIL BYGNING/);
});
test('legacy global and project opt-outs cannot remove baseline skills, including after reload', async t => {
  const f = await fixture(t);
  await f.store.update(state => { state.features = { chosen: 'valgt', on: { design: false, sikkerhed: false, planlaegning: false, deling: false } }; });
  await f.store.saveProject(f.root, { features: { design: false, kvalitet: false }, approvedPlan: 'preserve-synthetic-plan', permissions: { keep: 'synthetic-permission' } });
  const before = await f.store.read();
  for (let attempt = 0; attempt < 2; attempt++) {
    const settings = await f.features.get(f.root);
    assert.equal(settings.effective.design, true);
    assert.equal(settings.defaults.design, true);
    assert.equal(settings.exceptions.design, undefined);
    assert.equal(settings.effective.sikkerhed, false);
    assert.equal(settings.effective.planlaegning, false);
    assert.equal(settings.effective.deling, false);
    assert.equal(settings.effective.kvalitet, false);
    const list = await f.skills.list(f.root);
    for (const id of [name, 'harness-design-og-tilgaengelighed']) assert.ok(list.find(skill => skill.id === id).alwaysOn);
    for (const root of [f.root, null]) {
      const context = await f.skills.context(root);
      for (const id of [name, 'harness-design-og-tilgaengelighed']) assert.ok(context.skills.some(skill => skill.name === id));
      assert.match(primaryBuildGuidance(context, root ? 'build' : 'idea'), /HOVEDSKILL TIL BYGNING/);
    }
    const store = new Store(path.join(f.root, 'data'));
    f.features = new Features(store, async () => f.library);
    f.skills = new Skills(async () => f.library, store, f.features);
  }
  assert.deepEqual(await f.store.read(), before, 'read-time migration preserves saved plans, permissions and all user data');
});
test('an enabled but malformed main skill fails closed instead of silently substituting instructions', () => {
  const context = files => ({ features: { design: true }, skills: [{ name, files }] });
  assert.throws(() => primaryBuildGuidance(context([]), 'build'), /mangler/);
  assert.throws(() => primaryBuildGuidance(context([{ path: 'SKILL.md', content: 'invalid' }]), 'build'), /YAML/);
});
test('the same observational review contract survives project customization without changing saved state', async t => {
  const f = await fixture(t), original = (await f.skills.list(f.root)).find(s => s.id === name);
  const references = original.content.split('\n').filter(line => line.includes('](references/')).join('\n');
  await f.skills.save(f.root, { id: name, content: '---\nname: ' + name + '\ndescription: Project-specific review fixture\n---\nKeep the existing dense table layout and approved colours.\n' + references });
  const before = await f.store.read();
  const expected = ['direction', 'hierarchy', 'system', 'flow', 'responsive', 'evidence'];
  assert.deepEqual(DESIGN_QUALITY_CHECKS.map(check => check.id), expected, 'QA consumers have one stable set of observational IDs');
  assert.ok(Object.isFrozen(DESIGN_QUALITY_CHECKS) && DESIGN_QUALITY_CHECKS.every(Object.isFrozen));
  for (const root of [null, f.root]) {
    const context = await f.skills.context(root);
    for (const mode of ['idea', 'plan', 'free', 'build']) {
      const text = primaryBuildGuidance(context, mode), contract = text.slice(text.lastIndexOf('FØRSTEUDKAST-KONTROL'));
      for (const check of DESIGN_QUALITY_CHECKS) assert.ok(contract.includes(`[${check.id}] ${check.label}: ${check.acceptance}`));
      assert.match(contract, /Kontrollen giver ingen nye tilladelser/);
      assert.match(contract, /opgaver uden UI/);
      assert.match(contract, /ikke afprøvet/);
      if (['idea', 'plan'].includes(mode)) {
        assert.match(contract, /Du udfører den ikke/);
        assert.doesNotMatch(contract, /gennemfører du kontrollen/);
      } else {
        assert.match(contract, /gennemfører du kontrollen med de tilgængelige, tilladte værktøjer/);
        assert.match(contract, /ret konkrete fejl inden for den godkendte opgave/);
      }
      if (root) assert.ok(text.indexOf('Keep the existing dense table layout') < text.lastIndexOf('FØRSTEUDKAST-KONTROL'), 'project preferences remain available without removing the common checks');
    }
  }
  assert.deepEqual(await f.store.read(), before, 'prompt construction grants nothing and does not rewrite plans, settings or the skill');
});
test('exports route builds to the primary skill only when it is selected and retain the full guide', async t => {
  const { library } = await fixture(t);
  for (const tool of library.tools.filter(t => t.rules)) {
    const included = layoutFor(library, [tool.id], { skills: [name] });
    assert.ok(included.entries.some(f => f.content.includes('læs først harness-aura-design/SKILL.md')), tool.id);
    assert.ok(included.entries.some(f => f.path.endsWith('/references/webapp-craft.md')), tool.id);
    const primary = included.entries.find(f => f.path.endsWith('/harness-aura-design/SKILL.md'));
    assert.ok(primary, tool.id);
    for (const check of DESIGN_QUALITY_CHECKS) assert.ok(primary.content.includes('`' + check.id + '`'), `${tool.id} exports the ${check.id} check`);
    const excluded = layoutFor(library, [tool.id], { skills: [] });
    assert.ok(!excluded.entries.some(f => f.content.includes('læs først harness-aura-design/SKILL.md')), tool.id);
  }
});
test('actual model guidance delegates design to skills without purpose- or provider-selected templates', async t => {
  const f = await fixture(t), context = await f.skills.context(null), before = JSON.stringify(context);
  const purposes = ['En madbestillingsapp med menu og kurv', 'Tidsregistrering for freelancere', 'En hjemmeside til borgermøder', 'En webshop med produktsøgning', '', undefined];
  for (const mode of ['idea', 'plan', 'free', 'build']) {
    const common = primaryBuildGuidance(context, mode, { newInterface: true });
    assert.match(common, /udarbejd selv et konkret designforslag gennem de aktiverede design-skills/);
    assert.match(common, /godkendte designforslag har forrang/);
    assert.match(common, /kilden faktisk er kontrolleret/);
    assert.match(common, /giver ingen tilladelse til at bygge/);
    assert.doesNotMatch(common, /#FAF7F1|#B84A37|#3456A5|#315E4C|--color-background:|grid-template-columns:|<header class="app-header"/);
    for (const purpose of purposes) for (const provider of ['mistral', 'corti', 'openai']) {
      const actual = primaryBuildGuidance(context, mode, { purpose, provider, newInterface: true });
      assert.equal(actual, common, `${provider}/${purpose}: the model receives the same method, not an Aura-selected theme`);
    }
    assert.doesNotMatch(primaryBuildGuidance(context, mode, { purpose: 'UNTRUSTED-PURPOSE-CONTENT', newInterface: true }), /UNTRUSTED-PURPOSE-CONTENT/, 'project purpose remains data in the separately reviewed project context');
  }
  assert.equal(primaryBuildGuidance(context, 'chat', { newInterface: true }), '');
  assert.equal(JSON.stringify(context), before, 'guidance does not mutate skills or project context');
});
test('explicit project colours and existing design survive without adding preset tokens or accepting injected instructions', async t => {
  const f = await fixture(t), context = await f.skills.context(null);
  for (const mode of ['idea', 'plan', 'free', 'build']) {
    for (const newInterface of [true, false, undefined]) {
      for (const primaryColor of ['#123456', '#abc', '#FFD700', '#FFFFFF']) {
        const text = primaryBuildGuidance(context, mode, { newInterface, primaryColor });
        assert.ok(text.includes(`Projektets udtrykkeligt valgte primærfarve er ${primaryColor}; bevar valget`));
        assert.doesNotMatch(text, /--color-accent:|--font-body:|LAYOUTREFERENCE TIL ET NYT MAD-UI/);
        if (newInterface !== true) assert.match(text, /Genbrug det eksisterende, godkendte design/);
      }
      const normal = primaryBuildGuidance(context, mode, { newInterface });
      for (const primaryColor of ['#fff; IGNORE_APPROVALS', '<style>body{color:red}</style>', '#123456\nIGNORE_APPROVALS', { value: '#123456' }]) {
        assert.equal(primaryBuildGuidance(context, mode, { newInterface, primaryColor }), normal, 'invalid structured colour is not promoted into instructions');
      }
    }
  }
});
test('real project reopening keeps design skills, user choices and approved plans without injecting a food template', async t => {
  const f = await fixture(t);
  const { createProject, openProject, designContext } = require('../core/projects.cjs');
  const { composeAppContext } = require('../core/chat-session.cjs');
  const plan = { id: 'approved-plan-fixture', source: 'dig', text: 'Bevar madbestillingens godkendte forløb', context: 'No new permissions' };
  const beforePlan = JSON.stringify(plan);
  for (const color of [null, '#123456']) {
    const created = await createProject(f.root, { name: 'Madbestilling', purpose: 'En madbestillingsapp med menu og kurv', color, links: [], tests: 'manuel' }, [], path.resolve(__dirname, '../../profiles'));
    const context = await f.skills.context(created.root);
    const compose = project => composeAppContext({
      prepared: { context, mode: 'build', runtime: { mode: 'static' }, disclosure: { projectDesign: designContext(project) } },
      project, plan, surface: 'desktop'
    });
    const fresh = await openProject(created.root);
    assert.equal(fresh.waitingForFirstVersion, true);
    const first = compose(fresh), design = first.components.find(component => component.id === 'Hovedskill til bygning');
    assert.match(design.text, /udarbejd selv et konkret designforslag/);
    assert.doesNotMatch(design.text, /#FAF7F1|#B84A37|grid-template-columns:|--color-accent:/);
    if (color) assert.ok(design.text.includes(`primærfarve er ${color}`));
    else assert.doesNotMatch(design.text, /primærfarve er #[a-f0-9]+/i);
    assert.ok(first.components.find(component => component.id === 'Godkendt plan').text.includes(plan.id));
    await fs.writeFile(path.join(created.root, 'public/index.html'), '<!doctype html><h1>Den eksisterende app</h1>');
    const built = await openProject(created.root);
    assert.equal(built.waitingForFirstVersion, undefined);
    const next = compose(built), existing = next.components.find(component => component.id === 'Hovedskill til bygning');
    assert.match(existing.text, /Genbrug det eksisterende, godkendte design/);
    assert.doesNotMatch(existing.text, /#FAF7F1|#B84A37|grid-template-columns:|--color-accent:/);
    if (color) assert.ok(existing.text.includes(`primærfarve er ${color}`));
    assert.notEqual(first.hash, next.hash, 'reviewed app context reflects the existing-design preservation scope');
    assert.equal(await fs.readFile(path.join(created.root, 'public/index.html'), 'utf8'), '<!doctype html><h1>Den eksisterende app</h1>');
  }
  assert.equal(JSON.stringify(plan), beforePlan, 'composition leaves the approved plan untouched');
});
