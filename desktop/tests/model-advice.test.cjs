const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggest } = require('../ui/model-advice.js');
const model = (id, tools = true) => ({ id, name: id, capabilities: { tools } });

test('Claude: nyeste Sonnet anbefales først, derefter Opus og Haiku, og aldrig mere end tre', () => {
  const catalog = ['claude-3-7-sonnet-20250219', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', 'claude-3-5-haiku-20241022', 'claude-haiku-4-5-20251001'].map(id => model(id));
  const { curated, picks } = suggest(catalog, 'anthropic');
  assert.equal(curated, true);
  assert.deepEqual(picks.map(pick => pick.model.id), ['claude-sonnet-4-5-20250929', 'claude-opus-4-1-20250805', 'claude-haiku-4-5-20251001']);
  assert.match(picks[0].text, /^Anbefalet/);
  assert.ok(!picks.slice(1).some(pick => /Anbefalet/.test(pick.text)));
});

test('Mistral og OpenRouter får kodemodeller først; modeller uden værktøjer vises ikke', () => {
  const mistral = suggest(['mistral-large-latest', 'codestral-2508', 'devstral-medium-2507', 'devstral-small-2507', 'pixtral-12b'].map(id => model(id)).concat(model('devstral-2512', false)), 'mistral');
  assert.equal(mistral.picks[0].model.id, 'devstral-medium-2507');
  assert.ok(!mistral.picks.some(pick => pick.model.id === 'devstral-2512'), 'modeller uden værktøjskald springes over');
  assert.deepEqual(mistral.picks.slice(1).map(pick => pick.model.id), ['codestral-2508', 'mistral-large-latest']);
  const openrouter = suggest(['openai/gpt-4o', 'anthropic/claude-sonnet-4.5', 'mistralai/devstral-medium', 'qwen/qwen3-coder'].map(id => model(id)), 'openrouter');
  assert.deepEqual(openrouter.picks.map(pick => pick.model.id), ['anthropic/claude-sonnet-4.5', 'mistralai/devstral-medium', 'qwen/qwen3-coder']);
});

test('ukendte udbydere og egne servere får et udvalg uden anbefaling', () => {
  const { curated, picks } = suggest([model('qwen3:8b'), model('llama3', undefined), model('gemma', false), model('mistral-nemo')], 'ollama');
  assert.equal(curated, false);
  assert.equal(picks.length, 3);
  assert.ok(!picks.some(pick => /Anbefalet/.test(pick.text)));
  assert.deepEqual(suggest([], 'anthropic').picks, []);
});
