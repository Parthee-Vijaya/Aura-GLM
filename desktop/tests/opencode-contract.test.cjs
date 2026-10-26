const { test } = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('../scripts/fixtures/opencode-2.1.4-observed.json');
const { EventAdapter } = require('../core/engine-opencode2.cjs');
const { sanitizeContract, observeEngine, replayEvents } = require('../scripts/fixtures/opencode-contract.cjs');

const scenario = name => fixture.scenarios.find(item => item.name === name);
const lastMessages = item => item.observations.findLast(item => item.transport === 'http-json' && item.path.includes('/message?order=asc'))
  || item.observations.findLast(item => item.transport === 'http-json' && item.path.includes('/message?limit=100&order=asc'));

test('recorded contract is version-bound observed native data with no raw auth, host paths, opaque cursors or dynamic identifiers', () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.provenance.version, '2.1.4');
  assert.equal(fixture.provenance.version, require('../runtime-lock.json').opencode, 'Record new observed contracts when the pinned engine changes');
  assert.equal(fixture.provenance.syntheticOnly, true);
  assert.equal(fixture.provenance.externalModelCalls, 0);
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /\/Users\/|\/private\/var\/|\/var\/folders\/|%2Fprivate|Basic [A-Za-z0-9+/=]+|Bearer [A-Za-z0-9._-]+|aura-fixture-synthetic-key/);
  assert.doesNotMatch(serialized, /\b(?:ses|msg|evt|per|frm|req)_(?!recorded_)\w+/);
  assert.doesNotMatch(serialized, /cursor=(?!cursor_recorded_)|"(?:created|updated|started|completed|idle|ran)":1\d{12}/);
  assert.ok(fixture.scenarios.every(item => item.observations.some(observation => observation.transport === 'http-json') && item.observations.some(observation => observation.transport === 'sse-data')));
});

test('observed permission and tool events replay exactly one concrete write approval and completed write', () => {
  const recorded = scenario('approved-write'), events = replayEvents(recorded);
  const approvals = events.filter(event => event.type === 'permission.asked');
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].properties.permission, 'edit');
  assert.equal(approvals[0].properties.id, recorded.approvals[0].id);
  assert.match(JSON.stringify(approvals[0].properties.metadata), /result\.txt/);
  assert.equal(events.filter(event => event.type === 'permission.replied').length, 1);
  const tools = events.filter(event => event.properties?.part?.type === 'tool' && event.properties.part.state.status === 'completed');
  assert.equal(tools.length, 1);
  assert.equal(tools[0].properties.part.tool, 'write');
  assert.equal(tools[0].properties.part.state.input.filePath, '/synthetic/contract/project/result.txt');
  assert.equal(events.filter(event => event.type === 'session.idle').length, 1);
  assert.ok(events.some(event => event.type === 'message.part.delta' && event.properties.delta === 'SYNTHETIC_CONTRACT_DONE'));
  assert.deepEqual(recorded.modelRequests.map(request => request.toolResults), [0, 1]);
});

test('observed HTTP history uses the same tool identity as the event stream and one durable user prompt', () => {
  const recorded = scenario('approved-write');
  const sessionID = recorded.hostTerminals[0].properties.sessionID;
  const adapter = new EventAdapter('/synthetic/contract/project');
  const messages = lastMessages(recorded).response.data.map(message => adapter.message(message, sessionID));
  assert.equal(messages.filter(message => message.info.role === 'user').length, 1);
  const write = messages.flatMap(message => message.parts).find(part => part.type === 'tool');
  assert.equal(write.callID, 'call_contract_write');
  assert.equal(write.state.status, 'completed');
  assert.equal(write.state.input.filePath, '/synthetic/contract/project/result.txt');
  assert.equal(recorded.observations.filter(item => item.method === 'POST' && item.path.endsWith('/prompt')).length, 1);
});

test('observed 413 rejection compacts with the same model and completes without duplicating the durable prompt', () => {
  const recorded = scenario('context-rejection'), events = replayEvents(recorded);
  assert.deepEqual(recorded.injectedResponses[0], { status: 413, errorCode: 'context_length_exceeded' });
  assert.deepEqual(recorded.modelRequests.map(request => request.summary), [false, true, false]);
  assert.ok(recorded.modelRequests.every(request => request.model === 'fixture-model'));
  assert.equal(recorded.observations.filter(item => item.event?.type === 'session.compaction.started').length, 1);
  assert.equal(recorded.observations.filter(item => item.event?.type === 'session.compaction.ended').length, 1);
  const messages = lastMessages(recorded).response.data;
  assert.equal(messages.filter(message => message.type === 'user').length, 1);
  assert.equal(messages.find(message => message.type === 'compaction').status, 'completed');
  assert.equal(recorded.observations.filter(item => item.method === 'POST' && item.path.endsWith('/prompt')).length, 1);
  assert.equal(events.filter(event => event.type === 'session.idle').length, 1);
  assert.equal(events.some(event => ['session.error', 'engine.error'].includes(event.type)), false);
});

test('observed real process crash preserves partial content and reports engine failure, not success or automatic resume', () => {
  const recorded = scenario('engine-crash'), events = replayEvents(recorded);
  assert.ok(events.some(event => event.type === 'message.part.delta' && event.properties.delta === 'SYNTHETIC_PARTIAL_BEFORE_CRASH'));
  assert.equal(events.some(event => event.type === 'session.idle'), false);
  assert.equal(recorded.hostTerminals.length, 1);
  assert.equal(recorded.hostTerminals[0].type, 'engine.error');
  assert.equal(recorded.hostTerminals[0].failure.kind, 'engine');
  assert.equal(recorded.modelRequests.length, 1);
  assert.equal(fixture.provenance.automaticCrashResumeTested, false);
});

test('sanitization preserves matching identities while replacing credentials, times, paths and pagination', () => {
  const raw = { headers: { authorization: 'Basic do-not-store' }, apiKey: 'secret', authorization: 'Bearer do-not-store', at: 1700000000000, cursor: { next: 'opaque' }, path: '/api/session/ses_original/message?cursor=opaque', session: { id: 'ses_original', time: { created: 1700000000000 }, location: '/Users/synthetic/project', tokens: { input: 10 } } };
  const clean = sanitizeContract(raw, { roots: ['/Users/synthetic'], secrets: ['secret'] });
  assert.equal(clean.session.id, 'ses_recorded_1');
  assert.equal(clean.path, '/api/session/ses_recorded_1/message?cursor=cursor_recorded_1');
  assert.equal(clean.cursor.next, 'cursor_recorded_1');
  assert.equal(clean.session.location, '/synthetic/contract/project');
  assert.equal(clean.session.time.created, clean.at);
  assert.equal(clean.session.tokens.input, 10);
  assert.equal(clean.headers, '[redacted]');
  assert.doesNotMatch(JSON.stringify(clean), /secret|do-not-store|opaque|ses_original/);
  assert.deepEqual(sanitizeContract(raw, { roots: ['/Users/synthetic'], secrets: ['secret'] }), clean);
  assert.throws(() => sanitizeContract({ unexpected: '/Users/private/project' }), /unsanitized host path/);
});

test('observer records actual returned contract values and excludes configuration/plugin authority', async () => {
  const response = { data: [] }, outputs = [];
  const engine = { session: { id: 'ses_observed' }, wire: async () => response, decodeEvent: event => outputs.push(event) };
  assert.throws(() => observeEngine(engine), /explicitly synthetic/);
  const observations = observeEngine(engine, { synthetic: true });
  assert.equal(await engine.wire('/api/config?location[directory]=private'), response);
  await engine.wire('/api/plugin?location[directory]=private');
  await engine.wire('/api/session/ses_observed/message?limit=100&order=asc');
  engine.decodeEvent({ type: 'session.text.delta', data: { sessionID: 'ses_observed', delta: 'SYNTHETIC' } });
  engine.decodeEvent({ type: 'session.text.delta', data: { sessionID: 'ses_foreign', delta: 'OTHER' } });
  assert.equal(observations.length, 2);
  assert.deepEqual(observations[0].response, response);
  assert.equal(outputs.length, 2, 'Observation must not alter engine event delivery');
  response.data.push('changed later');
  assert.deepEqual(observations[0].response, { data: [] }, 'The recorded response is an immutable-by-copy observation');
});
