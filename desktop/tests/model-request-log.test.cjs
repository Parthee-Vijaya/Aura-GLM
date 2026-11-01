const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { append, list, describeRequest, remove, LIMITS } = require('../core/model-request-log.cjs');

async function journal(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-model-log-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'logs');
}

test('journalen gemmer kun kilde, størrelse og hash — aldrig indhold', async t => {
  const directory = await journal(t);
  const payload = JSON.stringify({ model: 'm1', messages: [{ role: 'user', content: 'MIN HEMMELIGE TEKST med kodeordet xyzzy' }], system: 'Du er en hjælpsom assistent' });
  const request = describeRequest(payload);
  assert.equal(request.request.bytes, Buffer.byteLength(payload), 'størrelsen tælles i bytes');
  assert.equal(request.request.messages, 1);
  assert.equal(request.items.length, 2, 'beskeden og systemprompten er hver sin post');
  assert.equal(request.items[0].source, 'user');
  assert.equal(request.items[0].sha256.length, 64);
  await append(directory, 'chat-1', { task: 'task-1', purpose: 'project-conversation', recipient: { model: 'm1', route: null }, ...request });
  const raw = await fs.readFile(path.join(directory, 'chat-1.jsonl'), 'utf8');
  assert.doesNotMatch(raw, /HEMMELIGE|hjælpsom|xyzzy/, 'intet indhold i journalen');
  assert.match(raw, /"source":"user"/); assert.match(raw, /"bytes":\d+/);
  const mode = (await fs.stat(path.join(directory, 'chat-1.jsonl'))).mode & 0o777;
  assert.equal(mode, 0o600, 'journalen er kun læsbar for ejeren');
  const page = await list(directory, 'chat-1', {});
  assert.equal(page.total, 1); assert.equal(page.entries[0].request.sha256, request.request.sha256);
  assert.equal(page.entries[0].recipient.model, 'm1');
  assert.equal((await list(directory, 'findes-ikke')).total, 0, 'en tom journal er ikke en fejl');
});

test('udsnittet er pagineret, og revne linjer tolereres ved læsning', async t => {
  const directory = await journal(t);
  for (let index = 0; index < 5; index++) await append(directory, 'chat-2', { task: `task-${index}`, ...describeRequest('{"messages":[]}') });
  const page = await list(directory, 'chat-2', { offset: 2, limit: 2 });
  assert.equal(page.total, 5); assert.deepEqual(page.entries.map(entry => entry.task), ['task-2', 'task-3']);
  await fs.appendFile(path.join(directory, 'chat-2.jsonl'), '{"schema":1,"at":"2026-11-01T12:00:00Z","items":[{"source":"us'); // revet linje
  const whole = await list(directory, 'chat-2', { limit: 50 });
  assert.equal(whole.total, 5, 'den revne sidste linje springes over');
  await assert.rejects(list(directory, 'chat-2', { offset: -1 }), /Ugyldigt udsnit/);
  await assert.rejects(list(directory, 'chat-2', { limit: 999 }), /Ugyldigt udsnit/);
});

test('rotation kasserer de ældste poster ved loftet', async t => {
  const directory = await journal(t);
  const total = LIMITS.entries + 10;
  for (let index = 0; index < total; index++) await append(directory, 'chat-3', { task: `task-${String(index).padStart(5, '0')}`, ...describeRequest('{"messages":[]}') });
  const page = await list(directory, 'chat-3', { limit: 200 });
  assert.ok(page.total < total, 'journalen er blevet roteret');
  assert.ok(page.total <= LIMITS.entries, 'journalen overholder postloftet');
  assert.notEqual(page.entries[0].task, 'task-00000', 'de ældste poster er roteret væk');
  const tail = await list(directory, 'chat-3', { offset: Math.max(0, page.total - 3), limit: 3 });
  assert.equal(tail.entries.at(-1).task, `task-${String(total - 1).padStart(5, '0')}`, 'den seneste post overlever altid');
  const numbers = page.entries.map(entry => Number(entry.task.slice(5)));
  assert.deepEqual([...numbers].sort((a, b) => a - b), numbers, 'posterne forbliver i tidsrækkefølge');
});

test('describeRequest tæller beskeder, systemprompt og enorme dele ærligt', () => {
  const info = describeRequest(JSON.stringify({ input: [{ role: 'user', content: 'Hej' }, { role: 'assistant', content: 'Svar' }] }));
  assert.equal(info.request.messages, 2); assert.equal(info.items.length, 2);
  const broken = describeRequest('ikke json');
  assert.equal(broken.request.messages, 0); assert.deepEqual(broken.items, []);
  const big = describeRequest(JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(200000) }] }));
  assert.equal(big.items[0].truncated, true, 'en enorm del får hash null i stedet for at blive gemt');
  assert.equal(big.items[0].sha256, null);
  assert.equal(describeRequest(JSON.stringify({ system: 'kort' })).items[0].source, 'system');
  assert.equal(describeRequest('{}').request.messages, 0);
});

test('journalen skrives atomisk og afviser en mappe, der ikke er privat', async t => {
  const directory = await journal(t);
  await append(directory, 'chat-a', { task: 't1', ...describeRequest('{"messages":[]}') });
  await append(directory, 'chat-a', { task: 't2', ...describeRequest('{"messages":[]}') });
  const page = await list(directory, 'chat-a', {});
  assert.equal(page.total, 2, 'atomisk skrivning bevarer begge poster');
  const entries = await fs.readdir(directory);
  assert.equal(entries.filter(name => name.endsWith('.tmp')).length, 0, 'ingen midlertidige filer efterlades');
  const open = path.join(await journal(t), 'open');
  await fs.mkdir(path.dirname(open), { recursive: true }); await fs.mkdir(open, { mode: 0o755 });
  await assert.rejects(append(open, 'chat-b', {}), /ikke privat/, 'en mappe med gruppeadgang afvises');
  await assert.rejects(append(open, 'chat/b', {}), /gyldig samtale/, 'stier i samtale-id afvises');
});

test('remove venter på igangværende skrivninger og forhindrer filen i at genopstå', async t => {
  const directory = await journal(t);
  // Start en skrivning og slet samtidig.
  const writing = append(directory, 'chat-race', { task: 't1', ...describeRequest('{"messages":[]}') });
  await remove(directory, 'chat-race');
  await writing; // skrivningen er færdig; filen må ikke genopstå.
  const page = await list(directory, 'chat-race', {});
  assert.equal(page.total, 0, 'journalen er væk og genopstår ikke');
  // En ny skrivning til den slettede samtale afvises.
  await append(directory, 'chat-race', { task: 't2', ...describeRequest('{"messages":[]}') });
  assert.equal((await list(directory, 'chat-race', {})).total, 0, 'ingen nye poster efter sletning');
});
