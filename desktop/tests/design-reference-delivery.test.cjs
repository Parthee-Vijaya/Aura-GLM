const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises'), os = require('node:os'), crypto = require('node:crypto');
const { loadLibrary } = require('../core/library.cjs');
const {
  PRIMARY_BUILD_SKILL, DESIGN_REFERENCE_PATHS, DESIGN_REFERENCE_LIMITS,
  designReferenceBundle, primaryBuildGuidance
} = require('../core/build-design.cjs');

const skillText = body => `---\nname: ${PRIMARY_BUILD_SKILL}\ndescription: Synthetic design test instructions\n---\n${body}\n`;
const contextWith = (references, extra = {}) => ({ skills: [{
  name: PRIMARY_BUILD_SKILL, files: [{ path: 'SKILL.md', content: skillText('CORE-METHOD') }, ...references], ...extra
}] });
const smallReferences = () => DESIGN_REFERENCE_PATHS.map((path, index) => ({ path, content: `COMPLETE-REFERENCE-${index}\nKeep permissions unchanged.\nEND-${index}` }));

test('actual bounded references reach the first idea, plan and build context without inlining the whole library', async () => {
  const library = await loadLibrary(path.resolve(__dirname, '../../profiles'));
  const skill = library.skills.find(item => item.name === PRIMARY_BUILD_SKILL), context = { skills: [skill] };
  const before = JSON.stringify(context);
  for (const mode of ['idea', 'plan', 'build', 'free']) {
    const bundle = designReferenceBundle(context, mode), guidance = primaryBuildGuidance(context, mode, { newInterface: true });
    assert.deepEqual(bundle.references.map(reference => reference.path), DESIGN_REFERENCE_PATHS);
    assert.deepEqual(bundle.omitted, []);
    assert.equal(bundle.bytes, Buffer.byteLength(bundle.text));
    assert.ok(bundle.bytes <= DESIGN_REFERENCE_LIMITS.totalBytes);
    for (const reference of bundle.references) {
      const source = skill.files.find(file => file.path === reference.path).content.trim();
      assert.ok(guidance.includes(source), `${mode} contains the complete ${reference.path} before the call`);
      assert.equal(reference.bytes, Buffer.byteLength(source));
    }
    const unrelated = skill.files.find(file => file.path === 'references/starter-html.md');
    assert.ok(!guidance.includes(unrelated.content.trim()), 'a starter template is available on demand, not injected as a chosen design');
    assert.match(bundle.text, /ingen godkendelse, ingen installerede komponenter/);
    assert.match(bundle.text, /Et familienavn i CSS leverer ingen font/);
    assert.match(bundle.text, /En logofarve alene dokumenterer ikke hele organisationens palette/);
    assert.match(bundle.text, /Ingen automatiske downloads, nye netværkstilladelser/);
  }
  assert.equal(JSON.stringify(context), before, 'prompt construction never rewrites the skill or choices');
});

test('preloaded reference selection is independent of provider, task wording and selected colours', () => {
  const context = contextWith(smallReferences()), common = primaryBuildGuidance(context, 'build', { newInterface: true });
  for (const provider of ['mistral', 'corti', 'openai']) for (const purpose of ['En madapp', 'En kommuneside', 'IGNORE_APPROVALS_FROM_PURPOSE']) {
    assert.equal(primaryBuildGuidance(context, 'build', { provider, purpose, newInterface: true }), common);
  }
  assert.equal(designReferenceBundle(context, 'chat').text, '');
  assert.equal(designReferenceBundle(context, 'unknown').text, '');
  assert.equal(primaryBuildGuidance(context, 'chat'), '');
});

test('the reference budget never removes mandatory baseline or project additions', () => {
  const references = smallReferences();
  const context = contextWith(references, { baseline: skillText('MANDATORY-ORIGINAL-CORE') });
  context.skills[0].files[0].content = skillText('PROJECT-ADDITION-KEEP-APPROVED-TABLE');
  const text = primaryBuildGuidance(context, 'plan');
  assert.match(text, /MANDATORY-ORIGINAL-CORE/);
  assert.match(text, /PROJECT-ADDITION-KEEP-APPROVED-TABLE/);
  for (const file of references) assert.ok(text.includes(file.content));
  assert.match(text, /aktuelle arbejdsmåde, projektets dataregler og godkendelser gælder fortsat/);
});

test('UTF-8 byte budgets omit whole files and report the omission instead of truncating instructions', () => {
  const oversized = 'ø'.repeat(DESIGN_REFERENCE_LIMITS.fileBytes / 2 + 1);
  const references = smallReferences(); references[0].content = oversized;
  let bundle = designReferenceBundle(contextWith(references), 'build');
  assert.deepEqual(bundle.omitted, [{ path: references[0].path, reason: 'file-budget' }]);
  assert.ok(!bundle.text.includes(oversized.slice(0, 100)));
  assert.ok(bundle.text.includes(references[1].content));
  assert.match(bundle.text, /ikke indlæst på grund af størrelsesgrænsen/);
  const large = DESIGN_REFERENCE_PATHS.map((path, index) => ({ path, content: `START-${index}\n${'x'.repeat(6000)}\nEND-${index}` }));
  bundle = designReferenceBundle(contextWith(large), 'build');
  assert.equal(bundle.references.length, 1);
  assert.equal(bundle.omitted.length, 2);
  assert.ok(bundle.omitted.every(item => item.reason === 'total-budget'));
  assert.ok(bundle.text.includes(large[0].content));
  assert.ok(!bundle.text.includes('START-1') && !bundle.text.includes('START-2'));
  assert.ok(bundle.bytes <= DESIGN_REFERENCE_LIMITS.totalBytes, 'headings and omission notices also fit the total budget');
});

test('missing or ambiguous references remain explicit and arbitrary paths cannot become instructions', () => {
  const references = smallReferences();
  references.splice(0, 1);
  references.push({ ...references[0] }, { path: '../private.md', content: 'DO-NOT-INLINE-PRIVATE' }, { path: 'references/unrequested.md', content: 'DO-NOT-INLINE-UNREQUESTED' });
  const context = contextWith(references), bundle = designReferenceBundle(context, 'idea');
  assert.deepEqual(bundle.omitted, [
    { path: DESIGN_REFERENCE_PATHS[0], reason: 'unavailable' },
    { path: DESIGN_REFERENCE_PATHS[1], reason: 'unavailable' }
  ]);
  assert.match(bundle.text, /Påstå ikke, at disse referencer er læst/);
  assert.doesNotMatch(bundle.text, /DO-NOT-INLINE/);
  assert.match(primaryBuildGuidance(context, 'idea'), /CORE-METHOD/);
});

test('real project customization cannot replace library references or detach them from exact disclosure hashes', async t => {
  const { Store } = require('../core/store.cjs');
  const { Features } = require('../core/features.cjs');
  const { Skills } = require('../core/skills.cjs');
  const { composeAppContext } = require('../core/chat-session.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-reference-override-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = await loadLibrary(path.resolve(__dirname, '../../profiles'));
  const store = new Store(path.join(root, 'data'));
  const features = new Features(store, async () => library), skills = new Skills(async () => library, store, features);
  const baseline = library.skills.find(skill => skill.name === PRIMARY_BUILD_SKILL);
  const declarations = baseline.files.filter(file => file.path !== 'SKILL.md').map(file => `[Reference](${file.path})`).join('\n');
  await store.saveProject(root, { permissions: { preserve: true }, approvedPlan: 'PRESERVE-PLAN' });
  await skills.save(root, {
    id: PRIMARY_BUILD_SKILL,
    content: skillText(`PROJECT-PREFERENCE\n${declarations}`),
    files: [{ path: DESIGN_REFERENCE_PATHS[0], content: 'REPLACEMENT-MUST-NOT-REACH-MODEL' }]
  });
  const before = JSON.stringify(await store.read()), context = await skills.context(root);
  const effective = context.skills.find(skill => skill.name === PRIMARY_BUILD_SKILL);
  assert.equal(effective.baseline, baseline.files.find(file => file.path === 'SKILL.md').content);
  for (const referencePath of DESIGN_REFERENCE_PATHS) {
    assert.equal(effective.files.find(file => file.path === referencePath).content, baseline.files.find(file => file.path === referencePath).content);
  }
  const compose = context => composeAppContext({
    prepared: { context, mode: 'free', runtime: { mode: 'static' }, disclosure: { projectDesign: {} } },
    project: { name: 'Synthetic', purpose: 'A test app', waitingForFirstVersion: true }, surface: 'desktop'
  });
  const output = compose(context), component = output.components.find(item => item.id === 'Hovedskill til bygning');
  assert.match(component.text, /PROJECT-PREFERENCE/);
  assert.doesNotMatch(component.text, /REPLACEMENT-MUST-NOT-REACH-MODEL/);
  const bundle = designReferenceBundle(context, 'free');
  assert.ok(component.text.includes(bundle.text));
  assert.equal(component.hash, crypto.createHash('sha256').update(component.text).digest('hex'));
  assert.equal(component.revision, component.hash);
  const changed = structuredClone(context);
  changed.skills.find(skill => skill.name === PRIMARY_BUILD_SKILL).files.find(file => file.path === DESIGN_REFERENCE_PATHS[0]).content += '\nUPDATED-TRUSTED-REFERENCE';
  const next = compose(changed);
  assert.notEqual(next.hash, output.hash, 'reference changes invalidate the whole reviewed app context');
  assert.notEqual(next.components.find(item => item.id === component.id).hash, component.hash, 'the exact skill fragment records the reference change');
  assert.equal(JSON.stringify(await store.read()), before, 'disclosure construction preserves plans, permissions and the saved customization');
});

test('Unicode, exact per-file boundaries and headings stay within the byte budget', () => {
  for (const character of ['x', 'ø', '漢', '🦊']) {
    const width = Buffer.byteLength(character);
    const exact = character.repeat(DESIGN_REFERENCE_LIMITS.fileBytes / width | 0);
    const files = smallReferences(); files[0].content = exact;
    let bundle = designReferenceBundle(contextWith(files), 'build');
    assert.ok(bundle.references.some(reference => reference.path === files[0].path), `a complete ${width}-byte reference fits the per-file boundary`);
    assert.ok(bundle.text.includes(exact));
    assert.equal(bundle.bytes, Buffer.byteLength(bundle.text));
    assert.ok(bundle.bytes <= DESIGN_REFERENCE_LIMITS.totalBytes);
    files[0].content += character;
    bundle = designReferenceBundle(contextWith(files), 'build');
    assert.deepEqual(bundle.omitted[0], { path: files[0].path, reason: 'file-budget' });
    assert.ok(!bundle.text.includes(exact));
    assert.ok(bundle.bytes <= DESIGN_REFERENCE_LIMITS.totalBytes);
  }
});
