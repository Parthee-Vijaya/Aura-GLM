const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ChatSession } = require('../core/chat-session.cjs');
const { ApprovalsPolicy } = require('../core/approvals-policy.cjs');

async function fixture(t, target = 'public/app.js') {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-patch-input-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project'); await fs.mkdir(path.join(root, 'public'), { recursive: true });
  const file = path.resolve(root, target), patchText = `*** Begin Patch\n*** Add File: ${target}\n+// test\n*** End Patch`;
  const source = { id: 'permission', sessionID: 'session', permission: 'edit', patterns: [file.slice(1)], tool: { messageID: 'message', callID: 'call' }, metadata: { filepath: file.slice(1), files: [{ type: 'add', filePath: file }] } };
  const part = { id: 'part', sessionID: 'session', messageID: 'message', callID: 'call', type: 'tool', tool: 'apply_patch', state: { status: 'pending', input: {}, raw: '' } };
  const hydrated = { ...part, state: { status: 'running', input: { patchText } } };
  const message = { info: { id: 'message', sessionID: 'session' }, parts: [hydrated] };
  const fetched = [], emitted = [], replies = [];
  const engine = { session: { id: 'session' }, pending: new Map([[source.id, source]]), request: async url => { fetched.push(url); return message; }, reply: async (...args) => replies.push(args) };
  const policy = new ApprovalsPolicy({ read: async () => ({ version: 1, projects: {} }) });
  const chat = { running: true, engine, generation: 1, runStopped: false, runTools: new Map([['part', part]]), approvals: new Map(),
    root, approvalContext: () => ({ projectRoot: root, workspaceRoot: root, mode: 'build' }),
    bench: { approvalsPolicy: policy, chatsChanged() {} }, log() {}, emit: event => emitted.push(event) };
  const run = () => ChatSession.prototype.permissionAsked.call(chat, { type: 'permission.asked', properties: source });
  return { base, root, file, source, part, hydrated, message, fetched, emitted, replies, engine, chat, run };
}

test('pending patch input is hydrated from its exact message and still needs approval', async t => {
  const x = await fixture(t); await x.run();
  assert.deepEqual(x.fetched, ['/session/session/message/message']);
  assert.equal(x.emitted.length, 1); assert.equal(x.emitted[0].properties.policy.projectFile, true);
  assert.equal(x.emitted[0].properties.toolInput.patchText, x.hydrated.state.input.patchText);
  assert.equal(x.chat.approvals.get('permission').descriptor.match.targets[0].path, await fs.realpath(x.root) + '/public/app.js');
  assert.deepEqual(x.replies, []); await assert.rejects(fs.access(x.file));
});

test('complete cached patch input requires no extra request', async t => {
  const x = await fixture(t); x.part.state = x.hydrated.state; await x.run();
  assert.deepEqual(x.fetched, []); assert.equal(x.emitted[0].properties.policy.projectFile, true);
});

for (const [label, mutate] of [
  ['message id', x => { x.message.info.id = 'other'; }],
  ['message session', x => { x.message.info.sessionID = 'other'; }],
  ['part id', x => { x.hydrated.id = 'other'; }],
  ['part session', x => { x.hydrated.sessionID = 'other'; }],
  ['part message', x => { x.hydrated.messageID = 'other'; }],
  ['part call', x => { x.hydrated.callID = 'other'; }],
  ['part tool', x => { x.hydrated.tool = 'write'; }],
  ['part type', x => { x.hydrated.type = 'text'; }],
  ['part status', x => { x.hydrated.state.status = 'completed'; }],
  ['duplicate parts', x => { x.message.parts.push(structuredClone(x.hydrated)); }],
  ['missing patch', x => { delete x.hydrated.state.input.patchText; }],
  ['failed fetch', x => { x.engine.request = async () => { throw Error('unavailable'); }; }],
  ['wrong current session', x => { x.engine.session.id = 'other'; }],
  ['invalid request path', x => { x.source.tool.messageID = '../other'; }],
]) test(`mismatched ${label} cannot supply patch approval input`, async t => {
  const x = await fixture(t); mutate(x); await x.run();
  assert.equal(x.emitted[0].properties.policy.projectFile, false); assert.equal(x.emitted[0].properties.policy.match, undefined);
  assert.deepEqual(x.replies, []);
});

for (const [label, stale] of [
  ['Stop', x => { x.chat.runStopped = true; }],
  ['new generation', x => { x.chat.generation++; }],
  ['changed engine', x => { x.chat.engine = {}; }],
  ['removed permission', x => { x.engine.pending.delete('permission'); }],
  ['replaced permission', x => { x.engine.pending.set('permission', {}); }],
]) test(`${label} during input fetch suppresses the stale permission`, async t => {
  const x = await fixture(t); x.engine.request = async () => { stale(x); return x.message; }; await x.run();
  assert.deepEqual(x.emitted, []); assert.equal(x.chat.approvals.size, 0); assert.deepEqual(x.replies, []);
});

test('hydration does not turn an outside patch into project permission', async t => {
  const x = await fixture(t, '../outside.js'); await x.run();
  assert.equal(x.emitted[0].properties.policy.projectFile, false); assert.deepEqual(x.replies, []);
});

test('hydration does not grant a project symlink escape', async t => {
  const x = await fixture(t, 'public/link/app.js'); const outside = path.join(x.base, 'outside'); await fs.mkdir(outside);
  await fs.symlink(outside, path.join(x.root, 'public/link')); await x.run();
  assert.equal(x.emitted[0].properties.policy.projectFile, false); assert.deepEqual(x.replies, []);
});
