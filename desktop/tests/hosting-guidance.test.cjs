const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalog, link } = require('../core/hosting-guidance.cjs');
const { appRules } = require('../core/project-guidance.cjs');

test('hostingvejledninger åbner kun kendte kilder og skelner fra upload', () => {
  const entries = catalog();
  assert.deepEqual(entries.filter(item => item.integrated).map(item => item.id), ['vercel', 'azure', 'komplai']);
  assert.deepEqual(entries.filter(item => !item.integrated).map(item => item.id), ['cloudflare', 'netlify', 'github-pages', 'promte']);
  for (const entry of entries) {
    assert.ok(entry.summary && entry.scope && entry.data && entry.checkedAt);
    for (const kind of Object.keys(entry.links)) assert.equal(new URL(link(entry.id, kind)).protocol, 'https:');
  }
  for (const input of [['vercel', 'constructor'], ['toString', 'guide'], ['vercel', 'https://example.invalid'], ['javascript:alert(1)', 'guide'], ['komplai', 'data']]) {
    assert.throws(() => link(...input), /findes ikke/);
  }
});

test('agentens faktiske appregler beskriver Del og de tilgængelige udgivelsesveje', () => {
  const enabled = appRules({ deling: true });
  assert.match(enabled, /knap Del står øverst/);
  assert.match(enabled, /Indbygget upload: komplai Run, Vercel og Azure Static Web Apps/);
  assert.match(enabled, /komplai Run kræver kun login med komplai/);
  assert.match(enabled, /Cloudflare Pages, Netlify Drop, GitHub Pages og Promte Apps/);
  assert.match(enabled, /ikke uploadintegrationer/);
  assert.match(enabled, /Python\/Node-servere kan ikke udgives som statiske filer/);
  const disabled = appRules({ deling: false });
  assert.match(disabled, /Indstillinger → Funktioner/);
  assert.doesNotMatch(disabled, /knap Del står øverst/);
});
