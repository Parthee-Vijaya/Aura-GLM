const { test } = require('node:test');
const assert = require('node:assert/strict');
const { suggest } = require('../ui/model-advice.js');
const model = (id, tools = true) => ({ id, name: id, capabilities: { tools } });

test('Claude: Anthropics eget udgangspunkt først, derefter Sonnet og Haiku, og aldrig mere end tre', () => {
  const catalog = ['claude-sonnet-4-5-20250929', 'claude-sonnet-5-5', 'claude-opus-4-1-20250805', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5-20251001'].map(id => model(id));
  const { curated, picks } = suggest(catalog, 'anthropic');
  assert.equal(curated, true);
  assert.deepEqual(picks.map(pick => pick.model.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']);
  assert.match(picks[0].text, /Anthropics eget udgangspunkt/);
});
test('appen anbefaler aldrig selv en model', () => {
  for (const kind of ['anthropic', 'mistral', 'corti', 'openrouter', 'zen']) {
    const catalog = ['claude-opus-5-5', 'claude-sonnet-5-5', 'mistral-medium-latest', 'mistral-large-latest', 'corti-s1', 'corti-s1-mini', 'anthropic/claude-sonnet-4.5'].map(id => model(id));
    assert.ok(!suggest(catalog, kind).picks.some(pick => /anbefal/i.test(pick.text)), kind);
  }
});
test('indsats vises kun, hvor udbyderen har en dokumenteret standard', () => {
  const { effort } = require('../ui/model-advice.js');
  assert.equal(effort('anthropic', 'claude-opus-5-5'), 'middel');
  assert.equal(effort('anthropic', 'claude-sonnet-5-5'), 'høj');
  assert.equal(effort('anthropic', 'claude-haiku-4-5-20251001'), null);
  assert.equal(effort('mistral', 'mistral-medium-latest'), null);
});

test('Mistral og OpenRouter får kodemodeller først; modeller uden værktøjer vises ikke', () => {
  // Devstral er udfaset. Mistral peger selv på Mistral Medium til agenter; Codestral er til kodeforslag og vises ikke.
  const mistral = suggest(['mistral-large-latest', 'codestral-2508', 'mistral-medium-latest', 'devstral-medium-2507', 'pixtral-12b'].map(id => model(id)).concat(model('devstral-2512', false)), 'mistral');
  assert.equal(mistral.picks[0].model.id, 'mistral-medium-latest');
  assert.ok(!mistral.picks.some(pick => pick.model.id === 'devstral-2512'), 'modeller uden værktøjskald springes over');
  assert.deepEqual(mistral.picks.slice(1).map(pick => pick.model.id), ['mistral-large-latest']);
  assert.ok(!mistral.picks.some(pick => pick.model.id.startsWith('codestral')));
  const openrouter = suggest(['openai/gpt-4o', 'anthropic/claude-sonnet-4.5', 'mistralai/devstral-medium', 'qwen/qwen3-coder'].map(id => model(id)), 'openrouter');
  assert.deepEqual(openrouter.picks.map(pick => pick.model.id), ['anthropic/claude-sonnet-4.5', 'mistralai/devstral-medium', 'qwen/qwen3-coder']);
});

test('Large 4 vises én gang som prøveversion, kun når kataloget har den, og overtager ikke standardvalget', () => {
  const catalog = ['mistral-medium-latest', 'mistral-large-4', 'mistral-large-4-0', 'mistral-large-2512'].map(id => model(id));
  const { picks } = suggest(catalog, 'mistral');
  assert.equal(picks.length, 3);
  assert.equal(picks[0].model.id, 'mistral-medium-latest');
  assert.equal(picks[1].model.id, 'mistral-large-4-0');
  assert.match(picks[1].text, /offentlig prøveversion/);
  assert.equal(suggest(catalog, 'mistral').defaultID, 'mistral-medium-latest');
  assert.equal(suggest([model('mistral-large-4')], 'mistral').defaultID, null, 'prøveversionen er ikke et nyt standardvalg, selv om Medium mangler');
  assert.equal(suggest([model('mistral-medium-latest'), model('mistral-large-4', false)], 'mistral').picks.length, 1);
});

test('ukendte udbydere og egne servere får et udvalg uden anbefaling', () => {
  const { curated, picks } = suggest([model('qwen3:8b'), model('llama3', undefined), model('gemma', false), model('mistral-nemo')], 'ollama');
  assert.equal(curated, false);
  assert.equal(picks.length, 3);
  assert.ok(!picks.some(pick => /Anbefalet/.test(pick.text)));
  assert.deepEqual(suggest([], 'anthropic').picks, []);
});
