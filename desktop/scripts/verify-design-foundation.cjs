// Verifies the reusable layout itself, not a model's generated application.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { FOOD_LAYOUT_RECIPE, DESIGN_FOUNDATIONS, foundationTokens } = require('./fixtures/design-foundation-legacy.cjs');

async function main() {
  const output = process.argv[2] && path.resolve(process.argv[2]);
  if (!output) throw Error('Provide a local report directory.');
  await fs.mkdir(output, { recursive: true });
  const tokens = Object.entries(foundationTokens(DESIGN_FOUNDATIONS.food)).map(([key, value]) => `--${key}:${value}`).join(';');
  const html = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'none'"><title>Layoutreference</title><style>:root{${tokens}}${FOOD_LAYOUT_RECIPE.css}</style>${FOOD_LAYOUT_RECIPE.html}</html>`;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    const page = await browser.newPage();
    let requests = 0;
    await page.route('**/*', route => { requests++; return route.abort(); });
    for (const [name, width, height, scale] of [['desktop',1440,900,1], ['mobile',390,844,1], ['mobile-large-text',390,844,2]]) {
      await page.setViewportSize({ width, height });
      await page.setContent(html);
      if (scale !== 1) await page.addStyleTag({ content: `html{font-size:${100 * scale}%}` });
      const geometry = await page.evaluate(() => {
        const box = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
        const heading = document.querySelector('h1'), rect = heading.getBoundingClientRect();
        const atHeading = document.elementFromPoint(rect.x + Math.min(rect.width / 2, 80), rect.y + rect.height / 2);
        return {
          width:innerWidth, overflow:document.documentElement.scrollWidth > innerWidth + 1,
          headingVisible:heading === atHeading || heading.contains(atHeading),
          heading:box(heading), header:box(document.querySelector('header')),
          content:box(document.querySelector('#steder')), basket:box(document.querySelector('#kurv')),
          venueButtons:[...document.querySelectorAll('[data-venue]')].map(element => ({ tag:element.tagName, ...box(element) })),
          fixedElements:[...document.querySelectorAll('*')].filter(element => ['fixed','sticky'].includes(getComputedStyle(element).position)).length
        };
      });
      assert.equal(geometry.overflow, false, name + ': horizontal overflow');
      assert.equal(geometry.headingVisible, true, name + ': heading is covered');
      assert.ok(geometry.heading.y >= geometry.header.bottom, name + ': header overlaps content');
      assert.equal(geometry.fixedElements, 0);
      assert.ok(geometry.venueButtons.every(button => button.tag === 'BUTTON' && button.width >= 44 && button.height >= 44));
      if (width > 1000 && scale === 1) {
        assert.ok(geometry.basket.x > geometry.content.right, 'desktop basket is in the right column');
        assert.ok(Math.abs(geometry.basket.y - geometry.content.y) <= 1, 'desktop basket aligns with content');
      } else assert.ok(geometry.basket.y >= geometry.content.bottom, name + ': basket stacks without overlap');
      await page.screenshot({ path:path.join(output, name + '.png'), fullPage:true });
      results.push({ name, textScale:scale, ...geometry });
    }
    await page.setViewportSize({ width:390, height:844 }); await page.setContent(html);
    await page.evaluate(() => { document.querySelector('[data-venue]').addEventListener('click', () => { window.recipeClicks = (window.recipeClicks || 0) + 1; }); });
    const first = page.getByRole('button', { name:/Det lille pizzakøkken.*Se menu/ });
    await first.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.recipeClicks), 2, 'semantic venue button supports Enter and Space');
    await page.getByRole('link', { name:'Kurv', exact:true }).click();
    assert.equal(new URL(page.url()).hash, '#kurv');
    assert.equal(requests, 0);
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ passed:true, scope:'layout-reference-only', fullApplicationFlow:'not-implemented-by-reference', networkRequests:requests, results }, null, 2));
    console.log('PASS layout reference: desktop, mobile, 200% text, heading visibility, basket placement and keyboard activation; no external requests.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
