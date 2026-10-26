// Opt-in native characterization with fixed synthetic data and localhost only.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { OpenCodeEngine, VERSION, parseOpenCodeVersion } = require('../../core/engine.cjs');
const { startFakeProvider } = require('./fake-provider.cjs');
const { sanitizeContract, observeEngine } = require('./opencode-contract.cjs');
const run = promisify(execFile);
const PROMPT = 'SYNTHETIC_CONTRACT_PROMPT';
const SUMMARY = '## Objective\n- Preserve SYNTHETIC_CONTRACT_PROMPT.\n\n## Requirements\n- Keep the selected model and approvals.\n\n## Decisions\n- No additional file changes.\n\n## Work State\n### Completed\n- Context rejection.\n### Active\n- Answer the current prompt.\n### Blocked\n- (none)\n\n## Next Move\n1. Answer the current prompt.\n\n## Relevant Files\n- (none)\n\n## Important Context\n- SYNTHETIC_CONTRACT_PROMPT remains relevant.';
async function until(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await delay(10); }
  throw new Error(`Native contract timed out: ${description}`);
}

async function recordScenario(name, scenarioRoot) {
  const project = path.join(scenarioRoot, 'project');
  await fs.mkdir(project, { recursive: true, mode: 0o700 });
  const script = name === 'approved-write' ? [
    { text: '', toolCalls: [{ id: 'call_contract_write', name: 'write', arguments: JSON.stringify({ path: path.join(project, 'result.txt'), content: 'SYNTHETIC_APPROVED_RESULT\n' }) }] },
    { text: 'SYNTHETIC_CONTRACT_DONE' },
  ] : name === 'context-rejection' ? [
    { status: 413, errorCode: 'context_length_exceeded' }, { text: SUMMARY }, { text: 'SYNTHETIC_CONTEXT_RECOVERED' },
  ] : [{ text: 'SYNTHETIC_PARTIAL_BEFORE_CRASH', pauseAfterContentMs: 60000 }];
  const model = await startFakeProvider({ synthetic: true, script });
  const provider = { npm: '@ai-sdk/openai-compatible', name: 'Synthetic native contract', options: { baseURL: model.url, apiKey: model.key }, models: { [model.model]: { name: 'Synthetic contract model', tool_call: true, limit: { context: 32768, output: 1024 } } } };
  const events = [], replies = [];
  const engine = new OpenCodeEngine({ root: project, directory: path.join(scenarioRoot, 'engine'), provider, model: { id: model.model }, onEvent(event) { events.push(event); } });
  const observations = observeEngine(engine, { synthetic: true });
  let error, result;
  try {
    await engine.start();
    const sessionID = engine.session.id;
    await engine.send(PROMPT, 'Use the fixed synthetic fixture only. Keep the selected model and concrete approval.');
    if (name === 'approved-write') {
      await until(() => engine.pending.size === 1, 'the exact write approval');
      const [approval] = engine.pending.values();
      assert.equal(approval.sessionID, sessionID);
      assert.equal(approval.permission, 'edit');
      assert.ok(JSON.stringify(approval).includes('result.txt'));
      replies.push({ id: approval.id, allow: true });
      await engine.reply(approval.id, true);
      await until(() => events.some(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type)), 'write completion');
      assert.equal(await fs.readFile(path.join(project, 'result.txt'), 'utf8'), 'SYNTHETIC_APPROVED_RESULT\n');
      assert.equal(model.requests.length, 2);
      assert.equal(events.filter(event => event.type === 'permission.asked').length, 1);
    } else if (name === 'context-rejection') {
      await until(() => events.some(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type)), 'context rejection and compaction');
      assert.equal(model.requests.length, 3);
      assert.equal(JSON.stringify(model.requests[1].body.messages).includes('<template>'), true);
      assert.equal(observations.filter(item => item.event?.type === 'session.compaction.ended').length, 1);
    } else {
      await until(() => observations.some(item => item.event?.type === 'session.text.delta'), 'partial content before crash');
      // Identify only the actual child of this newly owned guardian. No PID or
      // executable can be supplied by the caller, and no unrelated app is touched.
      const listing = await run('/bin/ps', ['-axo', 'pid=,ppid=,comm=']);
      const owned = listing.stdout.split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean).filter(match => Number(match[2]) === engine.child.pid && path.basename(match[3]) === 'opencode');
      assert.equal(owned.length, 1, 'Exactly one real OpenCode child must belong to this fixture guardian');
      const childPID = Number(owned[0][1]);
      process.kill(childPID, 'SIGKILL');
      await until(() => events.some(event => event.type === 'engine.error'), 'actual engine crash notification');
      assert.equal(model.requests.length, 1);
      assert.equal(events.some(event => event.type === 'session.idle'), false);
      assert.equal(engine.active, false);
      assert.equal(engine.session.id, sessionID);
      assert.equal(observations.some(item => item.event?.type === 'session.execution.succeeded'), false);
    }
    if (name !== 'engine-crash') {
      assert.equal(events.filter(event => event.type === 'session.idle').length, 1);
      assert.equal(events.some(event => ['session.error', 'engine.error'].includes(event.type)), false);
      assert.equal(engine.session.id, sessionID);
      const messages = await engine.wire(`/api/session/${sessionID}/message?limit=100&order=asc`);
      assert.equal(messages.data.filter(message => message.type === 'user').length, 1);
      assert.equal(observations.filter(item => item.transport === 'http-json' && item.method === 'POST' && item.path.endsWith('/prompt')).length, 1);
    }
    assert.ok(model.requests.every(request => request.body.model === model.model));
    result = sanitizeContract({ name, injectedResponses: script.map(step => ({ status: step.status || 200, ...(step.errorCode ? { errorCode: step.errorCode } : {}), ...(step.pauseAfterContentMs ? { pauseAfterContentMs: step.pauseAfterContentMs } : {}) })), observations, hostTerminals: events.filter(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type)), approvals: replies, modelRequests: model.requests.map(request => ({ index: request.index, protocol: request.protocol, model: request.body.model, summary: JSON.stringify(request.body.messages).includes('<template>'), toolResults: request.body.messages.filter(message => message.role === 'tool').length })) }, { roots: [scenarioRoot], secrets: [engine.auth, model.key] });
  } catch (cause) { error = cause; }
  finally { await engine.close(); await model.close(); }
  if (error) throw error;
  return result;
}

async function recordOpenCodeContract() {
  if (process.env.AURA_ENGINE_NATIVE !== '1') throw new Error('Set AURA_ENGINE_NATIVE=1 explicitly for the native contract recording.');
  if (process.platform !== 'darwin') throw new Error('This native contract recording is qualified on macOS only.');
  const prepared = path.join(__dirname, '../../.runtime', `${process.platform}-${process.arch}`, 'opencode/bin/opencode');
  if (process.env.HARNESS_OPENCODE_PATH && path.resolve(process.env.HARNESS_OPENCODE_PATH) !== prepared) throw new Error('The native recording requires the prepared pinned binary, without an external override.');
  const actual = (await run(prepared, ['--version'])).stdout.trim();
  assert.equal(parseOpenCodeVersion(actual), VERSION, 'The prepared native binary must match the current pinned version');
  // Source and reports are retained. This root is an explicitly synthetic run,
  // also retained for inspection; it contains no real profile or credentials.
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-native-contract-')));
  const scenarios = [];
  for (const name of ['approved-write', 'context-rejection', 'engine-crash']) scenarios.push(await recordScenario(name, path.join(root, name)));
  return { schemaVersion: 1, provenance: { engine: 'OpenCode', version: VERSION, platform: process.platform, architecture: process.arch, syntheticOnly: true, externalModelCalls: 0, source: 'Observed HTTP JSON responses and SSE data from the actual pinned native engine; model responses are scripted localhost fixtures.', automaticCrashResumeTested: false }, scenarios };
}

module.exports = { recordOpenCodeContract };
if (require.main === module) recordOpenCodeContract().then(fixture => process.stdout.write(JSON.stringify(fixture, null, 2) + '\n')).catch(error => { console.error(error.message); process.exitCode = 1; });
