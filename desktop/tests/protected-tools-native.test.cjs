const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nativeToolCases, runNativeToolCase, ORIGINAL, REPLACEMENT } = require('../scripts/fixtures/native-protected-tools.cjs');

test('actual pinned engine enforces protected paths before tools and preserves ordinary approvals', {
  skip: process.env.AURA_ENGINE_NATIVE !== '1' ? 'Set AURA_ENGINE_NATIVE=1 with the prepared pinned runtime.' : process.platform !== 'darwin' ? 'Native file-guard contract is qualified on macOS only.' : false,
  timeout: 120000,
}, async t => {
  for (const spec of nativeToolCases) await t.test(spec.name, async () => {
    const result = await runNativeToolCase(spec.name);
    assert.deepEqual(result.terminal, ['session.idle']);
    assert.ok(result.nativeSchema, 'The actual model request must offer this native tool');
    const finished = result.toolEvents.map(item => item.event).filter(event => ['session.tool.failed', 'session.tool.success'].includes(event.type));
    if (!spec.allowed) {
      assert.deepEqual(result.approvals, [], 'Protected actions must be blocked before approval or diff preparation');
      assert.equal(result.targetContent, spec.exists ? ORIGINAL : null);
      assert.equal(result.destinationContent, null);
      if (spec.symlink) {
        assert.equal(result.linkTarget, 'original.txt', 'Rejecting a symlink mutation preserves the link itself');
        assert.equal(result.originalContent, ORIGINAL, 'The original target must not be unlinked or moved instead');
      }
      assert.equal(finished.length, 1);
      assert.equal(finished[0].type, 'session.tool.failed');
      assert.match(JSON.stringify(finished[0].data.error), /Aura beskytter/);
    } else if (spec.tool === 'read') {
      assert.deepEqual(result.approvals, [], 'The exact selected reference remains readable');
      assert.equal(result.targetContent, ORIGINAL);
      assert.equal(finished.length, 1);
      assert.equal(finished[0].type, 'session.tool.success');
      assert.match(JSON.stringify(finished[0]), /SYNTHETIC_ORIGINAL/);
    } else {
      assert.equal(result.approvals.length, 1, 'A normal mutation still needs its exact approval');
      assert.equal(result.approvals[0].allow, true);
      assert.equal(result.approvals[0].approval.permission, 'edit');
      assert.equal(result.targetContent, spec.move || spec.action === 'Delete' ? null : REPLACEMENT);
      assert.equal(result.destinationContent, spec.move ? REPLACEMENT : null);
      assert.equal(finished.length, 1);
      assert.equal(finished[0].type, 'session.tool.success');
    }
  });
});
