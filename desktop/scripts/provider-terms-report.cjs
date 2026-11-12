'use strict';
const fs = require('node:fs/promises');
const { providerTermsReport } = require('../core/connections.cjs');
async function main(args = process.argv.slice(2)) {
  if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('--'))) throw new Error('Brug provider-terms-report.cjs [--out <ny JSON-fil>].');
  const report = providerTermsReport(), json = JSON.stringify(report, null, 2) + '\n';
  if (args.length) await fs.writeFile(args[1], json, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(json);
  return report;
}
if (require.main === module) main().catch(() => { process.stderr.write('Vilkårsoversigten kunne ikke skrives. Kontrollér argumenter og vælg en ny fil.\n'); process.exitCode = 1; });
module.exports = { main };
