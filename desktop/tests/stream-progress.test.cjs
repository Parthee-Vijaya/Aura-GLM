const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StreamProgress, partialStrings, codeDraft } = require('../core/stream-progress.cjs');
const root = '/projekt';
const frame = data => Buffer.from(`data: ${JSON.stringify(data)}\r\n\r\n`);
test('Corti-kompatibel strøm skelner ræsonnement, tekst og kode over UTF-8-pakkegrænser', () => {
  const events = [], p = new StreamProgress({ root, interval: 0, emit: e => events.push(e) });
  const write = event => { for (const byte of frame(event)) p.write(Buffer.from([byte])); };
  write({ choices: [{ delta: { reasoning_content: 'Interne noter om blomsten 🌸' } }] });
  assert.equal(events.at(-1).phase, 'reasoning'); assert.equal(events.at(-1).textChars, 0);
  assert.ok(!JSON.stringify(events).includes('Interne noter'));
  write({ choices: [{ delta: { content: 'Jeg laver blomsten.' } }] });
  assert.equal(events.at(-1).textChars, 19);
  write({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'write', arguments: '{"filePath":"/projekt/public/styles.css","content":".blomst {\\n  color: pink;\\n' } }] } }] });
  assert.equal(events.at(-1).draft.file, 'public/styles.css');
  assert.match(events.at(-1).draft.text, /color: pink/); assert.equal(events.at(-1).draft.complete, false);
  write({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '}\\n"}' } }] } }] });
  assert.equal(events.at(-1).draft.complete, true);
  p.end(); assert.equal(events.at(-1).phase, 'received'); assert.equal(p.tools.size, 0);
});
test('Claude og Responses viser de samme udkast', () => {
  for (const protocol of ['claude', 'responses']) {
    const events = [], p = new StreamProgress({ root, interval: 0, emit: e => events.push(e) });
    const raw = JSON.stringify({ filePath: '/projekt/flower.html', content: '🌸\n<p>Hej</p>\n' });
    p.write(frame(protocol === 'claude' ? { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', name: 'write' } } : { type: 'response.output_item.added', item: { type: 'function_call', id: 'a', name: 'write' } }));
    for (const delta of [raw.slice(0, 37), raw.slice(37)]) p.write(frame(protocol === 'claude' ? { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: delta } } : { type: 'response.function_call_arguments.delta', item_id: 'a', delta }));
    assert.equal(events.at(-1).draft.text, '🌸\n<p>Hej</p>\n');
  }
});
test('ufuldstændige stier, private filer, nøgler og indlejrede felter skjules', () => {
  const draft = raw => codeDraft({ id: 'a', name: 'write', raw }, root);
  assert.equal(draft('{"filePath":"/projekt/index'), null);
  for (const filePath of ['/projekt/.env', '/projekt/.git/config', '/andet/index.html', '../index.html']) assert.equal(draft(JSON.stringify({ filePath, content: 'skjult\n' })), null, filePath);
  assert.equal(draft('{"filePath":"/projekt/a.js","content":"const api_key = \\"abc').text, '');
  const hidden = draft(JSON.stringify({ filePath: '/projekt/a.js', content: 'const api_key = "abc";\n' }));
  assert.equal(hidden.hidden, true); assert.equal(hidden.text, '');
  const parsed = partialStrings('{"nested":{"content":"forkert"},"filePath":"a.js","content":"linje\\n\\u00e6');
  assert.equal(parsed.content.text, 'linje\næ'); assert.equal(parsed.content.complete, false);
});
test('ugyldige pakker, keepalive, store svar og fejl i visningen ændrer ikke observerens kald', () => {
  const p = new StreamProgress({ emit: () => { throw Error('Visningsfejl'); } });
  assert.doesNotThrow(() => { p.write(': ping\n\n'); p.write('data: forkert\n\n'); p.write(frame({ choices: [null] })); p.write(frame({ choices: [{ delta: { tool_calls: [null] } }] })); p.write('x'.repeat(600000)); p.end(); });
  assert.equal(p.disabled, true);
});
test('almindelige JSON-svar virker uden streaming', () => {
  const events = [], p = new StreamProgress({ emit: e => events.push(e) });
  p.write(JSON.stringify({ choices: [{ message: { content: 'Hej' } }] }), false); p.end(false);
  assert.equal(events.at(-1).textChars, 3);
});
