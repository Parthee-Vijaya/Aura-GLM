const readline = require('node:readline');
const { Writable } = require('node:stream');
const { stripVTControlCharacters } = require('node:util');

class Cancelled extends Error { constructor() { super('Handlingen blev afbrudt.'); this.code = 'CANCELLED'; } }
// Modeltekst, filnavne og fejl må ikke sende kontrolsekvenser til brugerens terminal.
function safeText(value) {
  return stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\b(?:kp_live_[\w-]+|sk-(?:ant-|or-v1-)?[\w-]{12,}|gh[pousr]_[\w]{20,}|github_pat_[\w]+)\b/g, '[skjult nøgle]');
}
class Terminal {
  constructor(input = process.stdin, output = process.stdout) { this.input = input; this.output = output; this.active = null; this.ended = false; this.redactions = new Set(); }
  protect(value) { if (value) this.redactions.add(value); }
  text(value) { let text = safeText(value); for (const secret of this.redactions) text = text.split(secret).join('[skjult nøgle]'); return text; }
  write(value) { this.output.write(this.text(value)); }
  line(value = '') { this.write(value + '\n'); }
  interrupt() { this.active?.cancel(); }
  async ask(label, { secret = false, fallback = '', required = false } = {}) {
    if (!this.input.isTTY || !this.output.isTTY) throw new Error('Denne handling kræver en interaktiv terminal. Brug --help eller doctor uden terminal. Ingen handling er godkendt.');
    if (this.ended) throw new Cancelled();
    if (this.active) throw new Error('Et andet spørgsmål venter allerede på svar.');
    let muted = false;
    const output = new Writable({ write: (chunk, encoding, done) => { if (!muted) this.output.write(chunk, encoding); done(); } });
    output.columns = this.output.columns || 80;
    const rl = readline.createInterface({ input: this.input, output, terminal: true, historySize: 0 });
    try {
      const result = await new Promise((resolve, reject) => {
        let answered = false;
        const cancel = () => { answered = true; reject(new Cancelled()); rl.close(); };
        this.active = { cancel };
        rl.once('SIGINT', cancel);
        rl.once('close', () => { if (!answered) { this.ended = true; reject(new Cancelled()); } });
        rl.question(this.text(label + (fallback ? ` [${fallback}]` : '') + ': '), value => { answered = true; resolve(value); });
        muted = secret;
      });
      const value = result || fallback;
      if (required && !value.trim()) throw new Error('Svaret må ikke være tomt.');
      return value;
    } finally {
      rl.close(); output.end(); this.active = null;
      if (secret) this.output.write('\n');
    }
  }
  async confirm(label) { return /^(ja|j)$/i.test((await this.ask(`${label} (ja/NEJ)`)).trim()); }
  // Højst tre indholdsmuligheder og én vej videre på hver side.
  async choose(label, items) {
    if (!items.length) throw new Error('Der er ingen muligheder at vælge.');
    let page = 0, filtered = items;
    while (true) {
      const size = filtered.length <= 4 ? 4 : 3;
      const part = filtered.slice(page * size, page * size + size);
      this.line('\n' + label);
      part.forEach((item, i) => this.line(`${i + 1}. ${item.label}`));
      const pages = Math.ceil(filtered.length / size);
      if (pages > 1) this.line(`4. Næste side (${page + 1}/${pages})`);
      const answer = (await this.ask('Vælg nummer, søg med tekst eller skriv tilbage')).trim();
      if (answer === 'tilbage' || answer === '/back') return null;
      if (answer === '4' && pages > 1) { page = (page + 1) % pages; continue; }
      if (/^[1-4]$/.test(answer) && part[Number(answer) - 1]) return part[Number(answer) - 1].value;
      if (answer && !/^\d+$/.test(answer)) {
        const next = items.filter(item => item.label.toLocaleLowerCase('da').includes(answer.toLocaleLowerCase('da')));
        if (next.length) { filtered = next; page = 0; } else this.line('Ingen resultater. Prøv et andet navn.');
      } else this.line('Vælg en af mulighederne.');
    }
  }
}
module.exports = { Terminal, Cancelled, safeText };
