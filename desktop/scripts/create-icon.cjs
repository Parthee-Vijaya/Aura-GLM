const fs = require('node:fs/promises');
const path = require('node:path');

// Det vedtagne logo er fælles for README, web, brugerflade og installationspakker.
async function syncAuraIcons() {
  const source = path.join(__dirname, '../../docs/images/aura-icon.png');
  for (const target of ['../packaging/icon.png', '../ui/aura-icon.png']) {
    await fs.copyFile(source, path.join(__dirname, target));
  }
}

if (require.main === module) syncAuraIcons().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { syncAuraIcons };
