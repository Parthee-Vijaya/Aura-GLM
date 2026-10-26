const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recordOpenCodeContract } = require('../scripts/fixtures/record-opencode-contract.cjs');
test('real pinned OpenCode records approval, context rejection and process-crash contracts with a synthetic localhost model', {
  skip: process.env.AURA_ENGINE_NATIVE !== '1' || process.platform !== 'darwin' ? 'Set AURA_ENGINE_NATIVE=1 on macOS with the prepared pinned runtime.' : false,
  timeout: 60000,
}, async () => {
  const result = await recordOpenCodeContract();
  assert.equal(result.provenance.externalModelCalls, 0);
  assert.deepEqual(result.scenarios.map(scenario => scenario.name), ['approved-write', 'context-rejection', 'engine-crash']);
  assert.deepEqual(result.scenarios.map(scenario => scenario.modelRequests.length), [2, 3, 1]);
  assert.equal(result.provenance.automaticCrashResumeTested, false);
});
