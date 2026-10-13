const { test } = require('node:test');
const assert = require('node:assert/strict');
const { KomplaiLiveBudget, budgetedFetch } = require('../scripts/komplai-live-budget.cjs');
const catalogue = (pricing = { currency: 'DKK', prompt: '0.000002', completion: '0.000005' }) => ({ account: { id: 'organisation', contract: 'aftale' }, data: [{ id: 'kode', capabilities: { function_calling: true }, pricing }] });
const body = { model: 'kode', messages: [{ role: 'user', content: 'Byg en side med æ, ø og å.' }], max_tokens: 1000 };
const headers = { 'x-komplai-contract': 'aftale' };
const create = () => new KomplaiLiveBudget({ organisationId: 'organisation', modelId: 'kode' });
test('Liveprøven stopper kaldet, før den samlede øvre pris overskrider 10 kr.', () => {
  const budget = create(); budget.catalogue(catalogue({ currency: 'DKK', prompt: '0', completion: '0.005' }));
  budget.reserve(body, headers); budget.reserve(body, headers);
  assert.equal(budget.summary().reservedUpperBoundDkk, 10);
  assert.throws(() => budget.reserve(body, headers), /før afsendelse/);
  assert.equal(budget.summary().calls, 2);
});
test('Liveprøven afviser forkert organisation, model, aftale og manglende priser', () => {
  const budget = create();
  assert.throws(() => budget.reserve(body, headers));
  budget.catalogue(catalogue());
  assert.throws(() => budget.reserve({ ...body, model: 'anden' }, headers));
  assert.throws(() => budget.reserve(body, { 'x-komplai-contract': 'ændret' }));
  assert.throws(() => budget.reserve({ ...body, max_tokens: null }, headers));
  assert.throws(() => budget.catalogue({ ...catalogue(), account: { id: 'anden', contract: 'aftale' } }));
  assert.throws(() => budget.reserve(body, headers));
  for (const price of [{ currency: 'USD', prompt: '0', completion: '0' }, { currency: 'DKK', prompt: null, completion: '0' }, { currency: 'DKK', prompt: 'NaN', completion: '0' }]) assert.throws(() => budget.catalogue(catalogue(price)));
  assert.equal(budget.summary().calls, 0);
});
test('Liveprøvens inputgrænse medregner UTF-8, værktøjer og protokol; katalogopdatering nulstiller ikke loftet', () => {
  const budget = create(); budget.catalogue(catalogue());
  const request = { ...body, tools: [{ type: 'function', function: { name: 'write', description: 'Skriv ærligt' } }] };
  const input = Buffer.byteLength(JSON.stringify({ messages: request.messages, tools: request.tools })) + 32 + 64 + 256;
  budget.reserve(request, headers);
  assert.equal(budget.summary().reservedUpperBoundDkk, (input * 2 + 1000 * 5) / 1e6);
  budget.catalogue(catalogue()); budget.reserve(request, headers);
  assert.equal(budget.summary().reservedUpperBoundDkk, 2 * (input * 2 + 1000 * 5) / 1e6);
  assert.throws(() => new KomplaiLiveBudget({ organisationId: 'a', modelId: 'b', maxMicros: 20_000_000 }));
});
test('Transporten stopper ved beløbsgrænsen og afviser andre destinationer før fetch', async () => {
  let sent = 0;
  const budget = create();
  const send = budgetedFetch(async (url, init) => {
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/models')) return Response.json(catalogue({ currency: 'DKK', prompt: '0', completion: '0.005' }));
    sent++; throw new Error('Forbindelsen blev afbrudt efter afsendelse');
  }, budget);
  await send('https://api.komplai.dk/v1/aura/v1/models');
  const request = () => send('https://api.komplai.dk/v1/aura/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) });
  await assert.rejects(request(), /efter afsendelse/); await assert.rejects(request(), /efter afsendelse/);
  await assert.rejects(request(), /før afsendelse/);
  for (const url of ['https://api.scaleway.ai/v1/chat/completions', 'https://api.komplai.dk/v1/aura/v1/chat/completions/', 'https://api.komplai.dk/v1/aura/v1/chat/completions?other=true']) await assert.rejects(send(url, { method: 'POST' }), /tillader kun/);
  assert.equal(sent, 2, 'Kun de to tilladte kald må nå transporten; fejl frigiver ikke testbudget');
});
