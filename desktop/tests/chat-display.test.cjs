const { test } = require('node:test');
const assert = require('node:assert/strict');
const { progress } = require('../ui/chat-display.js');
test('status skelner mellem svar, tavshed og brugerens godkendelse uden at opfinde tokens', () => {
  const v = { runStartedAt: 1000, lastSignalAt: 1000, receivedChars: 0, waitingFor: [] };
  assert.match(progress(v, 1100).text, /Venter på svar/);
  assert.deepEqual(progress(v, 17000), { quiet: true, text: 'Ingen nye signaler i 16 s. Du kan vente eller stoppe.' });
  v.lastSignalAt = 17000; v.receivedChars = 200;
  assert.deepEqual(progress(v, 18000), { quiet: false, text: '200 tegn modtaget' });
  v.waitingFor = [{}];
  assert.deepEqual(progress(v, 80000), { quiet: false, text: '' });
});
