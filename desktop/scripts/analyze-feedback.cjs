#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { summarizeFeedbackSession } = require('../core/feedback-metrics.cjs');
const MAX_BYTES = 2 * 1024 * 1024;

async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('Brug: node desktop/scripts/analyze-feedback.cjs <events.json|-> [--observed-through-ms TAL] [--silence-threshold-ms TAL]\nLæs kun anonyme hændelser. Resultatet er JSON på standardoutput. Ingen telemetri eller automatisk filskrivning.\n');
    return;
  }
  const [file, ...flags] = args;
  if (!file || flags.length % 2) throw new Error('Invalid arguments');
  const options = {}, keys = new Map([['--observed-through-ms', 'observedThroughMs'], ['--silence-threshold-ms', 'silenceThresholdMs']]);
  for (let index = 0; index < flags.length; index += 2) {
    const key = keys.get(flags[index]), value = flags[index + 1];
    if (!key || Object.hasOwn(options, key) || !/^\d+$/.test(value)) throw new Error('Invalid arguments');
    options[key] = Number(value);
  }
  const input = file === '-' ? process.stdin : fs.createReadStream(file);
  const chunks = []; let bytes = 0;
  for await (const chunk of input) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) { input.destroy(); throw new Error('Observation too large'); }
    chunks.push(chunk);
  }
  const result = summarizeFeedbackSession(JSON.parse(Buffer.concat(chunks).toString('utf8')), options);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) main(process.argv.slice(2)).catch(() => {
  // Never include supplied input, paths or a parser's excerpt in diagnostics.
  process.stderr.write('Målingen kunne ikke læses. Brug --help, og kontrollér hændelsesformat, rækkefølge og sluttid. Ingen resultater er gemt.\n');
  process.exitCode = 1;
});
module.exports = { main };
