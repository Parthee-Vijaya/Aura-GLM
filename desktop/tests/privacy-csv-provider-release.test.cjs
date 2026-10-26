// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Synthetic filesystem/authority regression. No model, credential or network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { PrivacyRuntimeProvider } = require('../core/privacy-runtime-provider.cjs');
const { claimCsvRelease } = require('../core/privacy/hybrid-csv-release.cjs');
const { PrivacyGateError, composePolicy } = require('../core/privacy/policy.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const denied = error => error instanceof PrivacyGateError && ['PRIVACY_BLOCKED', 'PRIVACY_STALE', 'PRIVACY_LOCAL_REQUIRED', 'PRIVACY_PROVENANCE_MISSING'].includes(error.code);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-csv-release-'));
  const project = path.join(root, 'project'), profile = path.join(root, 'profile');
  await fs.mkdir(path.join(project, 'data'), { recursive: true, mode: 0o700 });
  await fs.mkdir(profile, { mode: 0o700 });
  const file = path.join(project, 'data/cases.csv'), bytes = 'kind,count\nExample,10\n';
  await fs.writeFile(file, bytes, { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scope = { kind: 'conversation', root: project, chat: 'synthetic-chat' };
  const destination = { id: 'cloud', locality: 'cloud', endpoint: 'https://example.invalid/v1', model: 'synthetic' };
  const state = {
    definitions: [{ id: 'cases', path: 'data/cases.csv', projectRoot: project, classification: 'confidential', attributes: { personalData: false, secrets: false } }],
    policies: { organization: { enabled: true, version: 'organization-1', workMode: 'hybrid', defaultClass: 'public', allowedDestinationIds: ['cloud'], hybridReleaseRules: [{ id: 'csv', version: '1', transform: 'csv-generic-schema-v1', projectRoot: project, sourceIds: ['cases'], destinationIds: ['cloud'], purposes: ['hybrid-cloud-help'], sourceClasses: ['confidential'], allowPersonalData: false }] }, project: { enabled: true, version: 'project-1', defaultClass: 'public', protectedSources: [] } },
  };
  const bench = { store: { root: profile, encrypt: text => Buffer.from(text).toString('base64'), decrypt: value => Buffer.from(value.secret, 'base64').toString(), encryptionAvailable: () => true }, privacy: {
    privateConfig: async () => ({ sources: structuredClone(state.definitions) }),
    policies: async () => structuredClone(state.policies), destination: async () => structuredClone(destination),
    snapshotBinding: () => sha(JSON.stringify([state.policies, state.definitions, destination])),
  } };
  const provider = new PrivacyRuntimeProvider(bench);
  const pair = { local: { connectionID: 'local', modelID: 'local-model' }, external: { connectionID: 'cloud', modelID: 'synthetic' } };
  const plan = { scope, pair, refs: [pair.local, pair.external] };
  const release = async () => (await provider.releases(plan, 1, undefined, () => true))[0].release;
  const claim = capability => claimCsvRelease(capability, { scope, destination, purpose: 'hybrid-cloud-help', revision: 1, policyBinding: composePolicy(state.policies).binding, runID: 'synthetic-run' });
  const label = async provenance => provider.ledger.record(await provider.ledgerScope(scope), [{ path: 'data/cases.csv', sha256: sha(bytes), provenance: [provenance] }], { assertCurrent: () => true });
  return { root, project, profile, file, bytes, provider, state, scope, release, claim, label };
}

test('provider releases only generic synthetic CSV after inheriting eligible source labels', async t => {
  const f = await fixture(t); await f.label({ classification: 'confidential', attributes: { personalData: false, secrets: false } });
  const claimed = f.claim(await f.release()), output = JSON.parse(claimed.text);
  assert.equal(output.format, 'aura-synthetic-csv-v1');
  assert.equal(claimed.requiresApproval, true);
  assert.deepEqual(output.columns.map(column => column.name), ['COLUMN_1', 'COLUMN_2']);
  assert.equal(claimed.text.includes('cases.csv'), false);
  assert.equal(claimed.text.includes('Example,10'), false);
});

test('provider applies stricter project path labels and encrypted derivation labels to CSV rules', async t => {
  for (const origin of ['policy-file', 'policy-directory', 'policy-case-alias', 'ledger']) {
    for (const value of ['strict', 'personalData', 'secrets', 'uninspectable']) await t.test(origin + ':' + value, async t => {
      const f = await fixture(t), label = { classification: value === 'strict' ? 'strict' : 'confidential', attributes: { personalData: value === 'personalData', secrets: value === 'secrets' }, uninspectable: value === 'uninspectable' };
      if (origin === 'ledger') await f.label(label);
      else f.state.policies.project.protectedSources = [{ path: origin === 'policy-directory' ? 'data' : origin === 'policy-case-alias' ? 'DATA/CASES.CSV' : 'data/cases.csv', ...label }];
      await assert.rejects(f.release(), denied);
    });
  }
});

test('source read and asynchronous label lookup are one stable authority snapshot', async t => {
  for (const mutation of ['bytes', 'same-byte-replacement', 'ancestor-symlink', 'new-label']) await t.test(mutation, async t => {
    const f = await fixture(t), original = f.provider.ledger.provenance.bind(f.provider.ledger); let changed = false;
    f.provider.ledger.provenance = async (...args) => {
      const result = await original(...args);
      if (!changed) {
        changed = true;
        if (mutation === 'bytes') await fs.writeFile(f.file, 'kind,count\nDifferent,20\n');
        if (mutation === 'same-byte-replacement') { await fs.writeFile(f.file + '.new', f.bytes); await fs.rename(f.file + '.new', f.file); }
        if (mutation === 'ancestor-symlink') {
          await fs.rename(path.dirname(f.file), path.join(f.root, 'outside'));
          await fs.symlink(path.join(f.root, 'outside'), path.dirname(f.file));
        }
        if (mutation === 'new-label') await f.label({ classification: 'strict' });
      }
      return result;
    };
    await assert.rejects(f.release(), denied);
  });
});

test('pending CSV capability cannot survive source, policy, configuration or ledger changes', async t => {
  for (const mutation of ['bytes', 'same-byte-replacement', 'ancestor-symlink', 'new-label', 'removed-label', 'policy', 'configuration']) await t.test(mutation, async t => {
    const f = await fixture(t);
    if (mutation === 'removed-label') await f.label({ classification: 'confidential' });
    const capability = await f.release();
    if (mutation === 'bytes') await fs.writeFile(f.file, 'kind,count\nDifferent,20\n');
    if (mutation === 'same-byte-replacement') { await fs.writeFile(f.file + '.new', f.bytes); await fs.rename(f.file + '.new', f.file); }
    if (mutation === 'ancestor-symlink') { await fs.rename(path.dirname(f.file), path.join(f.root, 'outside')); await fs.symlink(path.join(f.root, 'outside'), path.dirname(f.file)); }
    if (mutation === 'new-label') await f.label({ classification: 'strict' });
    if (mutation === 'removed-label') await fs.unlink(f.provider.ledger.file(await f.provider.ledgerScope(f.scope)));
    if (mutation === 'policy') f.state.policies.project.protectedSources.push({ path: 'data/cases.csv', classification: 'strict' });
    if (mutation === 'configuration') f.state.definitions[0].classification = 'strict';
    assert.throws(() => f.claim(capability), denied);
  });
});

test('provider refuses symlinks, hardlinks and oversized sources before issuing a CSV capability', async t => {
  for (const kind of ['symlink', 'hardlink', 'oversize']) await t.test(kind, async t => {
    const f = await fixture(t);
    if (kind === 'symlink') { await fs.rename(f.file, path.join(f.root, 'outside.csv')); await fs.symlink(path.join(f.root, 'outside.csv'), f.file); }
    if (kind === 'hardlink') await fs.link(f.file, path.join(f.root, 'alias.csv'));
    if (kind === 'oversize') await fs.writeFile(f.file, 'a'.repeat(1_000_001));
    await assert.rejects(f.release(), denied);
  });
});

test('unrelated approved writeback keeps a release valid but stronger same-byte and derived labels revoke it', async t => {
  for (const scenario of ['unrelated-writeback', 'same-byte-renamed', 'derived-stricter']) await t.test(scenario, async t => {
    const f = await fixture(t), capability = await f.release(), scope = await f.provider.ledgerScope(f.scope);
    if (scenario === 'unrelated-writeback') {
      await f.provider.ledger.record(scope, [{ path: 'public/generated.txt', sha256: sha('Approved unrelated result'), provenance: [{ classification: 'confidential' }], parents: [sha(f.bytes)] }], { assertCurrent: () => true });
      assert.equal(f.claim(capability).requiresApproval, true);
    } else if (scenario === 'same-byte-renamed') {
      await f.provider.ledger.record(scope, [{ path: 'renamed.csv', sha256: sha(f.bytes), provenance: [{ classification: 'strict' }] }], { assertCurrent: () => true });
      assert.throws(() => f.claim(capability), denied);
    } else {
      const parent = sha('Synthetic parent data');
      await f.provider.ledger.record(scope, [{ path: 'parent.csv', sha256: parent, provenance: [{ classification: 'strict' }] }, { path: 'data/cases.csv', sha256: sha(f.bytes), provenance: [{ classification: 'confidential' }], parents: [parent] }], { assertCurrent: () => true });
      assert.throws(() => f.claim(capability), denied);
    }
  });
});
