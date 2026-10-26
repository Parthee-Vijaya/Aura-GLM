const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadLibrary } = require('../core/library.cjs');
const { Store } = require('../core/store.cjs');
const { Features } = require('../core/features.cjs');
const { Skills } = require('../core/skills.cjs');
const { layoutFor } = require('../core/adapters.cjs');
const { writeSkills, permissions } = require('../core/engine.cjs');
const { composeAppContext } = require('../core/chat-session.cjs');
const { Workbench } = require('../core/workbench.cjs');
const { initialBrief, addAnswers, briefText } = require('../core/brief.cjs');
const NAME = 'harness-arkitektur-og-teknologi';
const IDEA = 'harness-ide-og-afgraensning';
const PROFILES = path.resolve(__dirname, '../../profiles');

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-architecture-guidance-'));
  // Only generated synthetic state is removed; the repository and user profiles
  // are never inputs to this fixture's writable directories.
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const project = { root: path.join(temporary, 'project'), name: 'Mødedemo', purpose: 'Lokal demo med opdigtede møder, ingen login eller betaling.', links: [], tests: 'manuel' };
  await fs.mkdir(project.root);
  const library = await loadLibrary(PROFILES), store = new Store(path.join(temporary, 'state'));
  const features = new Features(store, async () => library), skills = new Skills(async () => library, store, features);
  const directory = path.join(temporary, 'engine');
  return { temporary, project, library, store, features, skills, directory };
}

test('real library and supported exports retain the revised architecture skill and its reference', async t => {
  const f = await fixture(t), architecture = f.library.skills.find(skill => skill.name === NAME);
  const source = await fs.readFile(path.join(PROFILES, 'skills', NAME, 'SKILL.md'), 'utf8');
  assert.equal(architecture.files.find(file => file.path === 'SKILL.md').content, source);
  assert.ok(architecture.files.some(file => file.path === 'references/offentlig-infrastruktur.md'));
  for (const tool of f.library.tools.filter(tool => tool.rules)) {
    const included = layoutFor(f.library, [tool.id], { skills: [NAME] });
    assert.ok(included.entries.some(file => file.path.endsWith(`/${NAME}/SKILL.md`) && file.content === source), tool.id);
    assert.ok(included.entries.some(file => file.path.endsWith(`/${NAME}/references/offentlig-infrastruktur.md`)), tool.id);
    const excluded = layoutFor(f.library, [tool.id], { skills: [] });
    assert.equal(excluded.entries.some(file => file.path.includes(`/${NAME}/`)), false, tool.id);
  }
});

test('confirmed-brief guidance reaches real library, exports and engine without adding a new confirmation or write permission', async t => {
  const f = await fixture(t), source = await fs.readFile(path.join(PROFILES, 'skills', IDEA, 'SKILL.md'), 'utf8');
  const idea = f.library.skills.find(skill => skill.name === IDEA);
  assert.equal(idea.files.find(file => file.path === 'SKILL.md').content, source);
  assert.match(source, /Genbrug en allerede bekræftet projektbrief/);
  assert.match(source, /kræv ikke endnu en bekræftelse af samme opgave/);
  assert.match(source, /Et nyt login-, betalings- eller datadelingsvalg skal stadig afklares/);
  assert.match(source, /I Samtale og Planlæg må du ikke begynde at bygge/);
  assert.match(source, /Plan-, værktøjs- og datagodkendelser gælder stadig/);
  assert.match(source, /Når filskrivning er tilladt/);
  for (const tool of f.library.tools.filter(tool => tool.rules)) {
    const exported = layoutFor(f.library, [tool.id], { skills: [IDEA] });
    assert.ok(exported.entries.some(file => file.path.endsWith(`/${IDEA}/SKILL.md`) && file.content === source), tool.id);
  }
  const before = await f.store.read(), context = await f.skills.context(f.project.root);
  assert.ok(context.skills.some(skill => skill.name === IDEA));
  await writeSkills(f.directory, context.skills);
  assert.ok((await fs.readFile(path.join(f.directory, 'config/skills', IDEA, 'SKILL.md'), 'utf8')).startsWith(source));
  const selection = { directory: f.directory, names: context.skills.map(skill => skill.name) };
  for (const mode of ['chat', 'plan', 'build', 'free']) {
    const policy = permissions(f.project.root, [], mode, selection);
    assert.equal(policy.skill[IDEA], 'allow');
    if (['chat', 'plan'].includes(mode)) { assert.equal(policy['*'], 'deny'); assert.equal(policy.edit, undefined); }
    else { assert.equal(policy.edit['*'], 'ask'); assert.equal(policy.edit['*.key'], 'deny'); }
  }
  assert.deepEqual(await f.store.read(), before);
});

test('actual engine skill files receive the new guidance without granting writes or changing the approved plan', async t => {
  const f = await fixture(t);
  const plan = { id: 'selected-plan', source: 'dig', text: 'Byg den aftalte mødedemo.', context: 'Ingen nye tilladelser.' };
  await f.store.saveProject(f.project.root, { approvedPlan: plan, approvals: { sentinel: 'preserved' } });
  const before = await f.store.read(), context = await f.skills.context(f.project.root);
  const architecture = context.skills.find(skill => skill.name === NAME);
  assert.ok(architecture);
  await writeSkills(f.directory, context.skills);
  const written = await fs.readFile(path.join(f.directory, 'config/skills', NAME, 'SKILL.md'), 'utf8');
  assert.ok(written.startsWith(architecture.files.find(file => file.path === 'SKILL.md').content));
  assert.match(written, /lokal demo uden login, betaling, delte data eller eksterne integrationer/);
  assert.match(written, /I Samtale og Planlæg må du ikke begynde at bygge/);
  assert.match(written, /Plan-, værktøjs- og datagodkendelser gælder stadig/);
  const reference = await fs.readFile(path.join(f.directory, 'config/skills', NAME, 'references/offentlig-infrastruktur.md'), 'utf8');
  assert.equal(reference, architecture.files.find(file => file.path === 'references/offentlig-infrastruktur.md').content);
  const selection = { directory: f.directory, names: context.skills.map(skill => skill.name) };
  for (const mode of ['chat', 'plan', 'build', 'free']) {
    const policy = permissions(f.project.root, [], mode, selection);
    assert.equal(policy.skill[NAME], 'allow');
    assert.equal(policy.read['*.key'], 'deny');
    if (['chat', 'plan'].includes(mode)) {
      assert.equal(policy['*'], 'deny');
      assert.equal(policy.bash, undefined);
      assert.equal(policy.edit, undefined);
    } else {
      assert.equal(policy.bash, 'ask');
      assert.equal(policy.edit['*'], 'ask');
      assert.equal(policy.edit['*.key'], 'deny');
    }
  }
  assert.deepEqual(await f.store.read(), before);
});

test('real prompt composition carries answered requirements and the selected plan without promoting the brief to permissions', async t => {
  const f = await fixture(t), context = await f.skills.context(f.project.root);
  let brief = initialBrief(f.project.purpose);
  brief = addAnswers(brief, [
    { header: 'Login', question: 'Skal der være login?' },
    { header: 'Data', question: 'Skal data deles?' },
  ], [['Ingen login'], ['Kun opdigtede data på denne computer']]);
  const plan = { id: 'approved-plan-42', source: 'dig', text: 'Mødeliste, demotilmelding og bekræftelse.', context: 'Ingen nye rettigheder' };
  const before = JSON.stringify({ context, brief, plan });
  for (const mode of ['chat', 'plan', 'build', 'free']) {
    const result = composeAppContext({
      prepared: { context, mode, runtime: { mode: 'static' }, disclosure: { brief: briefText(brief) } },
      project: f.project, plan, planConversation: ['Brugeren har allerede valgt en lokal demo uden login.'], surface: 'desktop',
    });
    const suppliedBrief = result.components.find(item => item.id === 'Projektbrief');
    assert.ok(suppliedBrief.text.includes(briefText(brief)));
    assert.match(suppliedBrief.text, /Data, ikke tilladelser/);
    if (mode === 'build') {
      const selected = result.components.find(item => item.id === 'Godkendt plan');
      assert.ok(selected.text.includes(plan.id));
      assert.ok(selected.text.includes(plan.text));
      assert.match(selected.text, /ikke som tilladelse til værktøjer/);
    } else assert.equal(result.components.some(item => item.id === 'Godkendt plan'), false);
    if (mode === 'chat') assert.match(result.system, /besvar|Besvar/);
  }
  assert.equal(JSON.stringify({ context, brief, plan }), before);
  const bench = new Workbench({ directory: path.join(f.temporary, 'workbench'), profiles: PROFILES, safeStorage: {}, emit: () => {} });
  try {
    await bench.activate(f.project);
    bench.chat.plan = plan;
    let selected = false;
    bench.selection = async () => { selected = true; throw new Error('No provider is allowed in this test'); };
    await assert.rejects(bench.chat.prepare({ mode: 'build', planID: 'old-plan' }), /seneste plan/);
    assert.equal(selected, false, 'stale plan is rejected before provider selection');
    assert.deepEqual(bench.chat.plan, plan);
  } finally { await bench.close(); }
});

test('optional architecture opt-out and project customization still work while mandatory design remains', async t => {
  const f = await fixture(t), feature = f.library.features.find(item => item.skills.includes(NAME));
  assert.notEqual(feature.alwaysOn, true);
  const original = (await f.skills.list(f.project.root)).find(item => item.id === NAME).content;
  await f.skills.save(f.project.root, { id: NAME, content: original + '\nProjektets aftale: brug den eksisterende statiske løsning.\n' });
  const customized = await f.skills.context(f.project.root);
  assert.ok(customized.skills.find(item => item.name === NAME).files[0].content.endsWith('Projektets aftale: brug den eksisterende statiske løsning.\n'));
  assert.equal((await f.skills.context(null)).skills.find(item => item.name === NAME).files[0].content, original);
  await f.features.save(f.project.root, { scope: 'projekt', values: { [feature.id]: false } });
  const context = await f.skills.context(f.project.root);
  assert.equal(context.skills.some(item => item.name === NAME), false);
  assert.ok(context.skills.some(item => item.name === 'harness-aura-design'));
  await writeSkills(f.directory, context.skills);
  await assert.rejects(fs.readFile(path.join(f.directory, 'config/skills', NAME, 'SKILL.md')), { code: 'ENOENT' });
  assert.equal(permissions(f.project.root, [], 'free', { directory: f.directory, names: context.skills.map(item => item.name) }).skill[NAME], undefined);
});
