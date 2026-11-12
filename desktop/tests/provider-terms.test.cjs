const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { definitions, providerTermsReport, disclosure, normalize } = require('../core/connections.cjs');

test('topic provenance inherits the existing reviewed date and source without dating unverified terms', () => {
  for (const def of Object.values(definitions)) {
    assert.equal(def.staleAfterDays, 180);
    for (const topic of ['training', 'region', 'retention']) {
      assert.equal(def.terms[topic].checkedAt, def.termsVerified ? def.checkedAt : null);
      assert.equal(def.terms[topic].source, def.source || null);
    }
  }
  assert.equal(definitions.nvidia.terms.training.checkedAt, null, 'an endpoint lookup is not a terms audit');
});

test('terms report calculates the 180-day threshold and distinguishes stale from unknown', () => {
  const find = (now, kind) => providerTermsReport({ now }).providers.find(provider => provider.kind === kind);
  assert.equal(find('2027-05-02T00:00:00Z', 'google').terms.training.ageDays, 179);
  assert.equal(find('2027-05-02T00:00:00Z', 'google').terms.training.stale, false);
  assert.equal(find('2027-05-03T00:00:00Z', 'google').terms.training.stale, true);
  assert.equal(find('2026-11-04T00:00:00Z', 'nvidia').terms.training.stale, null);
  assert.equal(find('2026-01-01T00:00:00Z', 'google').terms.training.ageDays, null);
  assert.throws(() => providerTermsReport({ now: 'not-a-date' }), /gyldig dato/);
});

test('old saved connections preserve protocol, destination and disclosure fingerprint as metadata evolves', t => {
  const old = { id: 'legacy', kind: 'compatible', name: 'Synthetic legacy', baseURL: 'http://localhost:8000/v1' }, model = { id: 'synthetic-model' };
  assert.equal(disclosure(old, model).fingerprint, disclosure(normalize(old), model).fingerprint);
  const def = definitions.compatible, original = structuredClone(def.terms), text = def.training;
  t.after(() => { def.terms = original; def.training = text; });
  const before = disclosure(old, model).fingerprint;
  def.terms.training = { checkedAt: '2026-11-05', source: 'https://synthetic.example.invalid/terms' };
  assert.equal(disclosure(old, model).fingerprint, before, 'additive review provenance does not revoke an unchanged disclosure');
  def.training = 'Synthetic changed training policy';
  assert.notEqual(disclosure(old, model).fingerprint, before, 'a material policy statement still changes the approved disclosure');
});

test('JSON export is independent of private profiles, refuses overwrite and sanitizes CLI failures', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-terms-export-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { main } = require('../scripts/provider-terms-report.cjs'), target = path.join(root, 'terms.json');
  const report = await main(['--out', target]);
  assert.deepEqual(JSON.parse(await fs.readFile(target, 'utf8')), report);
  assert.equal(report.providers.length, Object.keys(definitions).length);
  await assert.rejects(main(['--out', target]), { code: 'EEXIST' });
  await assert.rejects(main(['--url', 'https://synthetic.example.invalid/']));
  assert.ok(report.providers.every(provider => !Object.hasOwn(provider, 'connections') && !Object.hasOwn(provider, 'secret')));
  const failure = await require('node:util').promisify(require('node:child_process').execFile)(process.execPath, [path.join(__dirname, '../scripts/provider-terms-report.cjs'), '--out', path.join(root, 'SYNTHETIC_PRIVATE_CANARY', 'terms.json')]).catch(error => error);
  assert.equal(failure.code, 1); assert.doesNotMatch(failure.stderr, /SYNTHETIC_PRIVATE_CANARY/);
});
