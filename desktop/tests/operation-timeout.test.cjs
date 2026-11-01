const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deadline } = require('../core/operation-timeout.cjs');

test('egen tidsgrænse og brugerens stop holdes adskilt som årsager', async () => {
  const upstream = new AbortController();
  const limit = deadline({ signal: upstream.signal, milliseconds: 60, operation: 'kontrollen' });
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(limit.isTimeout(), true); assert.equal(limit.isStopped(), false);
  assert.match(limit.signal.reason.message, /Tidsgrænse nået for kontrollen/);
  limit.done();
});

test('brugerens stop vinder over en samtidig tidsgrænse, og et allerede stoppet signal stopper med det samme', async () => {
  const upstream = new AbortController();
  const limit = deadline({ signal: upstream.signal, milliseconds: 30, operation: 'kontrollen' });
  upstream.abort();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(limit.isStopped(), true); assert.equal(limit.isTimeout(), false);
  assert.match(limit.signal.reason.message, /Stoppet af dig/);
  limit.done();
  const stopped = new AbortController(); stopped.abort();
  const immediate = deadline({ signal: stopped.signal, milliseconds: 60, operation: 'kontrollen' });
  assert.equal(immediate.isStopped(), true); assert.equal(immediate.signal.aborted, true);
  immediate.done();
});

test('done() rydder timer og lytter, og årsagerne kan aflæses præcist efter afslutning', async () => {
  const upstream = new AbortController();
  const limit = deadline({ signal: upstream.signal, milliseconds: 20, operation: 'kontrollen' });
  limit.done();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(limit.isTimeout(), false, 'ryddet timer udløser ikke tidsgrænsen');
  assert.equal(limit.isStopped(), false);
  assert.equal(limit.signal.aborted, false);
  upstream.abort();
  assert.equal(limit.isStopped(), false, 'fjernet lytter reagerer ikke på upstream mere');
});

test('ugyldige tidsgrænser afvises', () => {
  assert.throws(() => deadline({ milliseconds: -1 }), /Ugyldig tidsgrænse/);
  assert.throws(() => deadline({ milliseconds: 'x' }), /Ugyldig tidsgrænse/);
});
