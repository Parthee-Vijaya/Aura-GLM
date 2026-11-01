// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Gentagelsesdetektor pr. samtale og opgave: tæller ens værktøjskald i træk efter en
// kanonisk nøgle og rapporterer ved tærsklerne 3, 5 og 8. Et andet kald signatur nulstiller
// rækken. Signalet er vejledende og blokerer aldrig noget; kun afsluttede eller afviste
// kald tæller, ikke mellemværende stream-opdateringer. Inspireret af DeepSeek Harness'
// repeat-tool-reminder (MIT); logikken er genimplementeret til Auras CommonJS-stak.
const THRESHOLDS = [3, 5, 8];

// Kanonisk nøgle: værktøj plus sorterende, normaliserede inputfelter. Kun i hukommelsen.
function key(tool, input) {
  const fields = Object.keys(input || {}).sort().map(name => {
    const value = input[name];
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 300) : JSON.stringify(value) ?? '';
    return `${name}:${text}`;
  });
  return `${String(tool || '').slice(0, 40)}|${fields.join('|')}`;
}

class RepeatTool {
  constructor() { this.reset(); }
  reset() { this.key = null; this.count = 0; this.signaled = new Set(); }
  // Et afsluttet eller afvist kald. Returnerer signalet pr. tærskel, én gang pr. tærskel.
  observe(tool, input) {
    const next = key(tool, input);
    if (next === this.key) this.count += 1;
    else { this.key = next; this.count = 1; this.signaled.clear(); }
    if (!THRESHOLDS.includes(this.count)) return null;
    const level = THRESHOLDS.indexOf(this.count);
    if (this.signaled.has(level)) return null;
    this.signaled.add(level);
    return { tool, count: this.count, level };
  }
}

module.exports = { RepeatTool, key, THRESHOLDS };
