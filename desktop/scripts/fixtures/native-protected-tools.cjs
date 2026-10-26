// Actual pinned-engine contracts; all model output and project files are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { OpenCodeEngine, VERSION, parseOpenCodeVersion } = require('../../core/engine.cjs');
const { startFakeProvider } = require('./fake-provider.cjs');
const { observeEngine, sanitizeContract } = require('./opencode-contract.cjs');
const run = promisify(execFile);
const ORIGINAL = 'SYNTHETIC_ORIGINAL\n';
const REPLACEMENT = 'SYNTHETIC_REPLACED\n';
const cases = [
  { name: 'write-lower', tool: 'write', target: '.kube/new.txt' },
  { name: 'write-upper', tool: 'write', target: '.KUBE/new.txt' },
  { name: 'write-extension-lower', tool: 'write', target: 'private.pem' },
  { name: 'write-extension-upper', tool: 'write', target: 'PRIVATE.PEM' },
  { name: 'edit-lower', tool: 'edit', target: '.kube/config', exists: true },
  { name: 'edit-upper', tool: 'edit', target: '.KUBE/config', exists: true },
  { name: 'patch-add-lower', tool: 'patch', target: '.kube/new.txt', action: 'Add' },
  { name: 'patch-add-upper', tool: 'patch', target: '.KUBE/new.txt', action: 'Add' },
  { name: 'patch-update-lower', tool: 'patch', target: '.kube/config', action: 'Update', exists: true },
  { name: 'patch-update-upper', tool: 'patch', target: '.KUBE/config', action: 'Update', exists: true },
  { name: 'patch-delete-upper', tool: 'patch', target: '.KUBE/config', action: 'Delete', exists: true },
  { name: 'patch-move-destination-upper', tool: 'patch', target: 'public/source.txt', action: 'Update', move: '.KUBE/moved.txt', exists: true },
  { name: 'patch-move-source-upper', tool: 'patch', target: '.KUBE/config', action: 'Update', move: 'public/moved.txt', exists: true },
  { name: 'patch-indented-protected-second-header', tool: 'patch', target: '.KUBE/new.txt', rawPatch: '*** Begin Patch\n*** Add File: public/allowed.txt\n+SYNTHETIC_ALLOWED\n \t*** Add File: .KUBE/new.txt\n+SYNTHETIC_REPLACED\n*** End Patch' },
  { name: 'ordinary-write', tool: 'write', target: 'public/new.txt', allowed: true },
  { name: 'ordinary-edit', tool: 'edit', target: 'public/existing.txt', exists: true, allowed: true },
  { name: 'ordinary-patch-add', tool: 'patch', target: 'public/new.txt', action: 'Add', allowed: true },
  { name: 'ordinary-patch-update', tool: 'patch', target: 'public/existing.txt', action: 'Update', exists: true, allowed: true },
  { name: 'ordinary-patch-delete', tool: 'patch', target: 'public/existing.txt', action: 'Delete', exists: true, allowed: true },
  { name: 'ordinary-patch-move', tool: 'patch', target: 'public/source.txt', action: 'Update', move: 'public/moved.txt', exists: true, allowed: true },
  { name: 'selected-reference-read', tool: 'read', target: 'references/selected.txt', selected: true, exists: true, allowed: true },
  { name: 'selected-reference-write-denied', tool: 'write', target: 'references/selected.txt', selected: true, exists: true },
  { name: 'unselected-reference-read-denied', tool: 'read', target: 'references/private.txt', exists: true },
  { name: 'ordinary-patch-heredoc', tool: 'patch', target: 'public/new.txt', action: 'Add', wrap: 'heredoc', allowed: true },
  { name: 'ordinary-patch-cat-heredoc-crlf', tool: 'patch', target: 'public/new.txt', action: 'Add', wrap: 'cat-heredoc', crlf: true, allowed: true },
  { name: 'ordinary-patch-environment-id', tool: 'patch', target: 'public/new.txt', action: 'Add', environment: true, allowed: true },
  { name: 'protected-patch-heredoc', tool: 'patch', target: '.KUBE/new.txt', action: 'Add', wrap: 'heredoc' },
  { name: 'protected-patch-environment-id', tool: 'patch', target: '.KUBE/new.txt', action: 'Add', environment: true },
  { name: 'patch-delete-symlink-preserves-link-and-original', tool: 'patch', target: 'public/alias.txt', action: 'Delete', exists: true, symlink: 'public/original.txt' },
  { name: 'patch-move-symlink-preserves-link-and-original', tool: 'patch', target: 'public/alias.txt', action: 'Update', move: 'public/moved.txt', exists: true, symlink: 'public/original.txt' },
  { name: 'patch-move-symlink-with-end-markers-preserves-original', tool: 'patch', target: 'public/alias.txt', action: 'Update', move: 'public/moved.txt', beforeMoveEndMarkers: 2, exists: true, symlink: 'public/original.txt' },
  { name: 'ordinary-patch-move-with-end-markers', tool: 'patch', target: 'public/source.txt', action: 'Update', move: 'public/moved.txt', beforeMoveEndMarkers: 2, exists: true, allowed: true },
];
const nativeToolCases = Object.freeze(cases.map(spec => Object.freeze(spec)));
async function checkNativeRuntime() {
  if (process.env.AURA_ENGINE_NATIVE !== '1') throw new Error('Set AURA_ENGINE_NATIVE=1 explicitly for this native contract.');
  if (process.platform !== 'darwin') throw new Error('This native contract is qualified on macOS only.');
  const prepared = path.join(__dirname, '../../.runtime', `${process.platform}-${process.arch}`, 'opencode/bin/opencode');
  if (process.env.HARNESS_OPENCODE_PATH && path.resolve(process.env.HARNESS_OPENCODE_PATH) !== prepared) throw new Error('This contract requires the prepared pinned binary.');
  assert.equal(parseOpenCodeVersion((await run(prepared, ['--version'])).stdout.trim()), VERSION);
}
async function read(file) { return fs.readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; }); }
async function removeOwnedSyntheticRun(root, engine) {
  // Only the exact mkdtemp root created by this invocation is disposable. Source
  // fixtures and reports are outside it. Preserve it if process closure is unclear.
  assert.match(path.basename(root), /^aura-native-file-guard-[a-zA-Z0-9]+$/);
  assert.ok(!engine.child || engine.child.exitCode !== null || engine.child.signalCode !== null, 'The owned guardian must have exited before cleanup');
  const open = await run('/usr/sbin/lsof', ['-t', '+D', root]).then(result => result.stdout, error => {
    if (error.code === 1 && !error.stdout && !error.stderr) return '';
    throw error;
  });
  assert.equal(open.trim(), '', 'No process may still hold the synthetic run open');
  await fs.rm(root, { recursive: true });
}
function inputFor(spec, target) {
  if (spec.tool === 'read') return { path: target };
  if (spec.tool === 'write') return { path: target, content: REPLACEMENT };
  if (spec.tool === 'edit') return { path: target, oldString: ORIGINAL.trim(), newString: REPLACEMENT.trim() };
  const moveHeader = spec.move ? '*** End of File\n'.repeat(spec.beforeMoveEndMarkers || 0) + `*** Move to: ${spec.move}\n` : '';
  let patchText = spec.rawPatch || `*** Begin Patch\n${spec.environment ? '*** Environment ID: synthetic-only\n' : ''}*** ${spec.action} File: ${spec.target}\n${moveHeader}${spec.action === 'Add' ? '+' + REPLACEMENT : spec.action === 'Update' ? '@@\n-' + ORIGINAL + '+' + REPLACEMENT : ''}*** End Patch`;
  if (spec.wrap === 'heredoc') patchText = "<<'PATCH'\n" + patchText + '\nPATCH';
  if (spec.wrap === 'cat-heredoc') patchText = 'cat <<"PATCH"\n' + patchText + '\nPATCH';
  if (spec.crlf) patchText = patchText.replaceAll('\n', '\r\n');
  return { patchText };
}
async function runNativeToolCase(name) {
  // Callers select only predefined synthetic scenarios, never arbitrary paths.
  const spec = nativeToolCases.find(candidate => candidate.name === name);
  if (!spec) throw new TypeError('Unknown synthetic native tool scenario.');
  await checkNativeRuntime();
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-native-file-guard-'))), project = path.join(root, 'project');
  await fs.mkdir(project, { mode: 0o700 });
  const target = path.join(project, spec.target), destination = spec.move && path.join(project, spec.move);
  if (spec.exists) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (spec.symlink) {
      const original = path.join(project, spec.symlink);
      await fs.writeFile(original, ORIGINAL);
      await fs.symlink(path.relative(path.dirname(target), original), target);
    } else await fs.writeFile(target, ORIGINAL);
  }
  const input = inputFor(spec, target);
  const model = await startFakeProvider({ synthetic: true, model: spec.tool === 'patch' ? 'gpt-synthetic-contract' : 'fixture-model', script: [
    { text: '', toolCalls: [{ id: 'call_synthetic_probe', name: spec.tool, arguments: JSON.stringify(input) }] }, { text: 'SYNTHETIC_PROBE_DONE' },
  ] });
  const provider = { npm: '@ai-sdk/openai-compatible', name: 'Synthetic protected-path contract', options: { baseURL: model.url, apiKey: model.key }, models: { [model.model]: { name: 'Synthetic', tool_call: true, limit: { context: 32768, output: 1024 } } } };
  const events = [], replies = [];
  const engine = new OpenCodeEngine({ root: project, directory: path.join(root, 'engine'), references: spec.selected ? [spec.target] : [], provider, model: { id: model.model }, onEvent: event => events.push(event) });
  const observations = observeEngine(engine, { synthetic: true });
  try {
    await engine.start();
    await engine.send('SYNTHETIC_PROTECTED_PATH_CONTRACT', 'Use only the fixed synthetic fixture. Preserve file protection and exact approvals.');
    const deadline = Date.now() + 15000;
    while (!events.some(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type))) {
      if (Date.now() > deadline) throw new Error('Native file-guard timeout: ' + spec.name);
      for (const approval of [...engine.pending.values()]) {
        if (replies.some(item => item.id === approval.id)) continue;
        // Only positive ordinary-project cases can approve a mutation. Protected
        // paths and selected references are never approved, even on regression.
        const allow = Boolean(spec.allowed && spec.tool !== 'read' && spec.target.startsWith('public/') && (!spec.move || spec.move.startsWith('public/')));
        replies.push({ id: approval.id, allow, approval: structuredClone(approval) });
        await engine.reply(approval.id, allow);
      }
      await delay(10);
    }
    return sanitizeContract({
      name: spec.name, tool: spec.tool, input, targetContent: await read(target), destinationContent: destination ? await read(destination) : null,
      ...(spec.symlink ? { linkTarget: await fs.readlink(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; }), originalContent: await read(path.join(project, spec.symlink)) } : {}),
      approvals: replies, modelCalls: model.requests.length,
      terminal: events.filter(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type)).map(event => event.type),
      nativeSchema: model.requests[0]?.body.tools?.find(tool => tool.function?.name === spec.tool)?.function?.parameters,
      toolEvents: observations.filter(item => item.event && /tool|permission/.test(item.event.type)),
    }, { roots: [root], secrets: [engine.auth, model.key] });
  } finally { await engine.close(); await model.close(); await removeOwnedSyntheticRun(root, engine); }
}
module.exports = { nativeToolCases, runNativeToolCase, ORIGINAL, REPLACEMENT };
if (require.main === module) (async () => {
  const scenarios = [];
  for (const spec of nativeToolCases) scenarios.push(await runNativeToolCase(spec.name));
  process.stdout.write(JSON.stringify({ version: VERSION, syntheticOnly: true, externalModelCalls: 0, scenarios }, null, 2) + '\n');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
