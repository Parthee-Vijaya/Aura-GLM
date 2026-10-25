const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../core/app-quality.cjs');
const source = fs.readFileSync(filename, 'utf8');

// Execute the exact function sent to the isolated browser world. The fixture
// supplies computed styles; no approximation of its color parser is tested.
function inspect(color, background = 'rgb(0, 0, 0)', pseudoStyle = {}) {
  const text = { childNodes: [{ nodeType: 3, textContent: 'Readable text' }], parentElement: null, disabled: false,
    getBoundingClientRect: () => ({ width: 300, height: 30 }), getAttribute: () => null };
  const document = { documentElement: { scrollWidth: 390 }, images: [], querySelector: () => null,
    querySelectorAll: selector => ['p,li,label,h1,h2,h3,button,a,span', 'p,li,label'].includes(selector) ? [text] : [] };
  const style = { color, backgroundColor: background, visibility: 'visible', display: 'block', opacity: '1', backgroundImage: 'none', filter: 'none', mixBlendMode: 'normal', fontSize: '16px', fontWeight: '400' };
  return vm.runInNewContext(source + '\ninspectDocument()', { require: createRequire(filename), module: { exports: {} }, Buffer, document, innerWidth: 390, innerHeight: 844, getComputedStyle: (_element, pseudo) => pseudo ? { ...style, content: 'none', backgroundColor: 'rgba(0, 0, 0, 0)', ...pseudoStyle } : style, URL, location: { href: 'https://quality-fixture.invalid/', origin: 'https://quality-fixture.invalid' } });
}

test('unsupported CSS color spaces cannot trigger an automatic contrast repair', () => {
  // This OKLCH gray is bright on black; treating .8 as an sRGB byte falsely
  // reports nearly-black text. Unsupported spaces must remain unmeasured.
  for (const color of ['oklch(0.8 0 0)', 'lab(80 0 0)', 'color(display-p3 0.8 0.8 0.8)', 'oklab(0.8 0 0)']) assert.equal(inspect(color).lowContrast, 0, color);
  assert.equal(inspect('rgb(255, 255, 255)', 'oklch(0.2 0 0)').lowContrast, 0, 'unknown background is not assumed white');
});

test('known opaque sRGB colors retain real contrast checks', () => {
  assert.equal(inspect('rgb(255, 255, 255)').lowContrast, 0);
  assert.equal(inspect('rgb(30, 30, 30)').lowContrast, 1);
  assert.equal(inspect('rgba(30, 30, 30, 1)').lowContrast, 1);
  assert.equal(inspect('rgba(30, 30, 30, 0.4)').lowContrast, 0, 'translucent foreground requires compositing');
});

test('an implicit canvas is not assumed white when a page may use dark color-scheme', () => {
  assert.equal(inspect('rgb(230, 230, 230)', 'rgba(0, 0, 0, 0)').lowContrast, 0);
});

 test('painted pseudo-elements make composited contrast uncertain without disabling plain checks', () => {
  const painted = { content: '""', backgroundColor: 'rgb(0, 0, 0)' };
  assert.equal(inspect('rgb(255, 255, 255)', 'rgb(255, 255, 255)', painted).lowContrast, 0);
  for (const hidden of [{content:'none'}, {display:'none'}, {visibility:'hidden'}, {opacity:'0'}])
    assert.equal(inspect('rgb(255, 255, 255)', 'rgb(255, 255, 255)', {...painted,...hidden}).lowContrast, 1);
  assert.equal(inspect('rgb(255, 255, 255)', 'rgb(255, 255, 255)', {content:'""'}).lowContrast, 1, 'transparent pseudo does not suppress a real failure');
});
