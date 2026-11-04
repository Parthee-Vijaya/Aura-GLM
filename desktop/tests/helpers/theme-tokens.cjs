const assert = require('node:assert/strict');

// Read both variants of CSS light-dark() without depending on the renderer's
// current OS theme. Keep alpha colors available for real compositing checks.
function tokenThemes(css) {
  const themes = { light: {}, dark: {} };
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const root = /:root\s*\{([^}]*)\}/.exec(clean);
  assert.ok(root, 'the shared theme token rule exists');
  for (const match of root[1].matchAll(/(--aura-[a-z-]+):\s*([^;]+);/g)) {
    const colors = [...match[2].matchAll(/rgba?\(([^)]+)\)/g)].map(color => {
      const channels = color[1].split(',').map(Number);
      assert.ok(channels.every(Number.isFinite), `${match[1]} contains valid numeric color channels`);
      return channels.length === 4 ? { rgb: channels.slice(0, 3), a: channels[3] } : channels;
    });
    if (!colors.length) continue;
    if (match[2].startsWith('light-dark(')) assert.equal(colors.length, 2, `${match[1]} defines both theme variants`);
    themes.light[match[1]] = colors[0];
    themes.dark[match[1]] = colors[1] || colors[0];
  }
  return themes;
}
module.exports = { tokenThemes };
