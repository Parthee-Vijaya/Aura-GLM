// D5b: statuslinjens fire felter og tooltip. Parthees format — kontekst · tok/s ·
// tokens · pris — altid alle fire synlige; manglende data viser 0, og nuancerne
// (vindue ukendt, uprisede kald, afventende måling) står i det ærlige tooltip.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { format } = require('../ui/status-line.js');

const empty = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0, unpriced: 0 };
const selected = { connectionID: 'chosen', modelID: 'vendor/model', routeID: '' };
const connection = { id: 'chosen', kind: 'openrouter', name: 'Valgt forbindelse' };
const measured = { inputTokens: 79800, windowTokens: 1000000, percentage: 7.98 };
const speed = value => ({ value, known: true, quality: 'observed', source: 'engine-step-streamed', unit: 'tok/s', stepCount: 2, connectionID: 'chosen', modelID: 'vendor/model' });
const emptyWindow = { inputTokens: null, windowTokens: 1000000, percentage: null };
const line = input => {
  const shaped = format({ selected, connection, contextValue: emptyWindow, ...input });
  return [shaped.context, shaped.speed, shaped.tokens, shaped.price].join(' · ');
};
const contextOf = input => format({ selected, connection, contextValue: emptyWindow, usage: null, speed: null, ...input }).context;

test('tilstandstabellen: alle fire felter står altid, og manglende data viser 0', () => {
  // Tom samtale, vindue kendt (katalogvindue uden måling).
  assert.equal(line({ usage: null, speed: null }), '0/1M (0%) · 0 tok/s · 0 tokens · $0,00');
  // Målt kontekst med procent (opencode-stil) og en færdig turs tok/s.
  assert.equal(line({ contextValue: measured, usage: { ...empty, input: 100000, cacheRead: 20000, cacheWrite: 4800, output: 30000, reasoning: 2000, calls: 12, cost: 0.42 }, speed: speed(229) }),
    '79,8k/1M (8%) · 229 tok/s · 156.800 tokens · $0,42');
  // Vindue ukendt: tal uden /vindue og uden procent — aldrig en opdigtet grænse.
  assert.equal(line({ contextValue: { inputTokens: 5000, windowTokens: null, percentage: null }, usage: null, speed: null }), '5k · 0 tok/s · 0 tokens · $0,00');
  assert.equal(line({ contextValue: null, usage: null, speed: null }), '0 · 0 tok/s · 0 tokens · $0,00');
});

test('ingen model valgt: 0/0 — samtalens forbrug og tal bevares', () => {
  const shaped = format({ selected: { connectionID: '', modelID: '', routeID: '' }, connection: null, usage: { ...empty, input: 1000, output: 500, calls: 2, cost: 0.2 }, speed: speed(50), contextValue: measured });
  assert.equal([shaped.context, shaped.speed, shaped.tokens, shaped.price].join(' · '), '0/0 · 50 tok/s · 1.500 tokens · $0,20');
});

test('k/M-forkortelsen: én decimal, dansk komma, ingen afsluttende ,0 — og hele tal under 1.000', () => {
  const context = (input, window) => contextOf({ contextValue: { inputTokens: input, windowTokens: window, percentage: 0 } });
  assert.equal(context(500, 1000), '500/1k (0%)');
  assert.equal(context(12000, 128000), '12k/128k (0%)');
  assert.equal(context(79800, 200000), '79,8k/200k (0%)');
  assert.equal(context(999949, 1000000), '999,9k/1M (0%)');
  assert.equal(context(999950, 1000000), '1M/1M (0%)');
  assert.equal(context(1500000, 2000000), '1,5M/2M (0%)');
  assert.equal(context(64000, 64000), '64k/64k (0%)');
});

test('procenten afrundes til heltal og følger kun en målt måling', () => {
  const context = percentage => contextOf({ contextValue: { inputTokens: 79800, windowTokens: 1000000, percentage } });
  assert.equal(context(7.98), '79,8k/1M (8%)');
  assert.equal(context(42.16), '79,8k/1M (42%)');
  assert.equal(context(120), '79,8k/1M (120%)');
  assert.equal(context(null), '79,8k/1M (0%)');
});

test('prisfeltet: USD, DKK, blandede, under én cent, uprisede kald og lokal Ollama', () => {
  const price = usage => line({ usage, speed: null, contextValue: { inputTokens: 79800, windowTokens: 1000000, percentage: null } });
  assert.equal(price({ ...empty, calls: 3, cost: 0.42 }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · $0,42');
  assert.equal(price({ ...empty, calls: 2, otherCalls: 1, otherCosts: { DKK: 0.18 }, cost: 0.42 }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · $0,42 + 0,18 kr.');
  assert.equal(price({ ...empty, calls: 1, cost: 0.004 }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · <$0,01');
  assert.equal(price({ ...empty, calls: 2, cost: 0.42, unpriced: 1 }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · $0,42*');
  assert.equal(price({ ...empty, calls: 2, unpriced: 2 }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · $0,00*');
  assert.equal(price({ ...empty, calls: 1, otherCalls: 1, otherCosts: { DKK: 0.004 } }), '79,8k/1M (0%) · 0 tok/s · 0 tokens · <0,01 kr.');
  // Lokal Ollama: faktiske tal og $0,00 uden stjerne — omkostningen er reelt nul.
  const local = format({ selected, connection: { id: 'chosen', kind: 'ollama', name: 'Ollama' }, usage: { ...empty, input: 8000, output: 900, calls: 3, unpriced: 3 }, speed: speed(41), contextValue: { inputTokens: 8000, windowTokens: 32000, percentage: 25 } });
  assert.equal([local.context, local.speed, local.tokens, local.price].join(' · '), '8k/32k (25%) · 41 tok/s · 8.900 tokens · $0,00');
});

test('tok/s-feltet: heltal, 0 som visningsværdi når intet er målt', () => {
  assert.equal(line({ usage: null, speed: speed(229) }), '0/1M (0%) · 229 tok/s · 0 tokens · $0,00');
  assert.equal(line({ usage: null, speed: { value: 229, known: false, quality: 'unknown', source: 'unmeasured-turn', unit: 'tok/s', stepCount: 0 } }), '0/1M (0%) · 0 tok/s · 0 tokens · $0,00');
  assert.equal(line({ usage: null, speed: null }), '0/1M (0%) · 0 tok/s · 0 tokens · $0,00');
  assert.equal(line({ usage: null, speed: { value: null, known: true, stepCount: 1 } }), '0/1M (0%) · 0 tok/s · 0 tokens · $0,00', 'en kendt måling uden tal viser også 0');
});

test('tooltip: ærlige nuancer — målekvalifikation, hastighedens dækning, R9, prisgrundlag og TTFT', () => {
  const shaped = format({ selected, connection, modelName: 'Vendor Model', contextValue: measured, usage: { ...empty, input: 100000, cacheRead: 20000, cacheWrite: 4800, output: 30000, reasoning: 2000, calls: 12, cost: 0.42 }, speed: { ...speed(229), ttftMs: 1234 } });
  const text = shaped.tooltip.join('\n');
  assert.match(text, /senest afsluttede modelkald/);
  assert.match(text, /ikke samtalens samlede forbrug/);
  assert.match(text, /79\.800 tokens/);
  assert.match(text, /kontekstvindue: 1\.000\.000 tokens/);
  assert.match(text, /modellens kapacitet, ikke mod Auras arbejdsgrænse/);
  assert.match(text, /Observeret svarhastighed \(inkl\. ræsonnement, ekskl\. værktøjstid\): 229 tok\/s i den seneste tur/, 'værdien er den seneste/afsluttede turs — også efter turafslutning og genåbning');
  assert.match(text, /målt over 2 trin/);
  assert.match(text, /TTFT: 1\.234 ms/);
  assert.match(text, /100\.000 nye, 20\.000 fra cache og 4\.800 skrevet til cache/);
  assert.match(text, /30\.000 svar og 2\.000 ræsonnement/);
  assert.match(text, /12 modelkald/);
  assert.match(text, /overslag ud fra udbyderens listepris/);
  assert.match(text, /Vendor Model/);
  // Ukendt måling: 0 er visningsværdi — aldrig "ukendt" eller en udeladt del.
  const waiting = format({ selected, connection, contextValue: null, usage: null, speed: null });
  assert.match(waiting.tooltip.join('\n'), /Afventer første gyldige hastighedsmåling\. 0 er visningsværdi/);
  const unpriced = format({ selected, connection, contextValue: measured, usage: { ...empty, calls: 3, cost: 0.42, unpriced: 2 }, speed: null });
  assert.match(unpriced.tooltip.join('\n'), /2 kald mangler prisdata; beløbet dækker prissatte kald/);
  const local = format({ selected, connection: { id: 'chosen', kind: 'ollama', name: 'Ollama' }, contextValue: measured, usage: { ...empty, calls: 1, unpriced: 1 }, speed: null });
  assert.match(local.tooltip.join('\n'), /Ingen API-omkostning for lokal kørsel/);
  assert.doesNotMatch(local.tooltip.join('\n'), /mangler prisdata/);
  const noModel = format({ selected: { connectionID: '', modelID: '', routeID: '' }, connection: null, contextValue: null, usage: null, speed: null });
  assert.doesNotMatch(noModel.tooltip.join('\n'), /undefined|null/);
});

test('tooltip: ingen TTFT uden måling, intet forbrud uden kald — og ingen fremmed tekst', () => {
  const shaped = format({ selected, connection, contextValue: measured, usage: null, speed: null });
  const text = shaped.tooltip.join('\n');
  assert.doesNotMatch(text, /TTFT/);
  assert.match(text, /Ingen modelkald i denne samtale endnu/);
  const illegal = format({ selected: null, connection: { evil: true }, contextValue: { inputTokens: NaN }, usage: { cost: 'FREE', calls: 'x' }, speed: 'hurtig' });
  assert.equal(JSON.stringify(illegal).includes('undefined'), false, 'ingen del mangler');
  assert.doesNotMatch(illegal.tooltip.join('\n'), /NaN|undefined/);
});

// ---------- statiske pins: DOM-strukturen og de skjulte afhængigheder ----------

const read = name => fs.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const app = read('app.js');
const html = read('index.html');
const components = read('components.css');
const styles = read('styles.css');
const calm = read('workspace-calm.css');
const privacyGate = read('privacy-gate.js');

test('linjen er én fokuserbar knap med tooltip-forbindelse og UDEN aria-live', () => {
  const row = /<div class="composer-status"[^>]*id="status-line-row"[^>]*>[\s\S]*?<\/div>/.exec(html)[0];
  assert.match(row, /<button[^>]*id="context-status"[^>]*aria-describedby="status-line-help"/, 'linjen er en knappes id bevaret til privacy-gate-ankeredet');
  assert.match(row, /id="draft-status" role="status"/, 'kladdestatus består som transient role=status i samme række');
  assert.doesNotMatch(row, /aria-live/, 'linjen og rækken har ingen aria-live — den opdateres hver tur');
  assert.doesNotMatch(html, /id="usage-status"/, 'den gamle forbrugsstatus er erstattet af den ene linje');
  assert.doesNotMatch(html, /id="context-label"|id="context-meter"/, 'meter og etiket fra R3-visningen er fjernet');
  assert.match(html, /<div id="status-line-help" popover class="status-line-help menu-material"/, 'tooltippet er et ankeret popover-lag på menu-materialet');
  assert.match(app, /\$\('#status-line-row'\)\.before\(form\)/, 'composeren dokker før statusrækken (flyttet anker, samme rækkefølge)');
  assert.match(privacyGate, /\[get\('context-status'\), 'privacy-gate-button', 'before'\]/, 'P1: skjoldet er det FØRSTE segment — knappen sættes foran linjen');
});

test('heltefasen skjuler linjen og kladden — datakontrol-knappen består i rækken', () => {
  const rules = [...strip(components).matchAll(/^[^{}]*#chat-panel\[data-phase="hero"\][^{}]*\{[^}]*\}/gm)].map(match => match[0]);
  const hiding = rules.find(rule => rule.includes('#context-status'));
  assert.ok(hiding, 'heltefasen skjuler fortsat statuslinjen');
  assert.match(hiding, /:is\(#context-status,\s*#draft-status\)/);
  assert.doesNotMatch(hiding, /\.composer-status/, 'rækken selv står — Datakontrol-knappen er en altid-synlig sikkerhedsflade');
  assert.match(strip(calm), /\.workspace-calm :is\(\.composer-status,#context-status\)\s*\{[^}]*font-size:\s*12px[^}]*var\(--muted\)/, 'kontrast-reglen fra ui-typografipinnen består');
});

test('P1 (§7.1): statuslinjen er ÉN centreret række — skjold · linje · transient kladde', () => {
  const clean = strip(styles);
  const rowRule = /\.composer-status\s*\{[^}]*\}/.exec(clean)[0];
  assert.match(rowRule, /display:\s*flex/, 'rækken er én flex-række — ikke et gitter med tre justeringer');
  assert.match(rowRule, /justify-content:\s*center/, 'rækken er centreret');
  assert.match(rowRule, /gap:\s*16px/, 'segmenterne er adskilt af 16 px');
  assert.doesNotMatch(clean, /\.composer-status[^{]*\{[^}]*grid/, 'intet gitter mere — én række');
  assert.doesNotMatch(clean, /#draft-status[^{]*\{[^}]*grid-row/, 'kladdestatus har ingen egen række længere — forbigående segment på raden');
  assert.doesNotMatch(clean, /#privacy-gate-button[^{]*\{[^}]*grid-row/, 'datakontrol-knappen har ingen egen række længere');
  assert.match(clean, /\.composer-status > #privacy-gate-button\s*\{[^}]*padding:\s*1px 8px[^}]*border-radius:\s*var\(--radius-xs\)/, 'skjoldet bærer segmentgrammatikken: padding 1/8 og radius 8');
  assert.match(clean, /:root\s*\{[^}]*--radius-xs:\s*var\(--aura-radius-sm\)/, '--radius-xs er defineret (8 px) — pillens hjørner er ikke firkantede');
  const lineRule = /\.status-line\s*\{[^}]*\}/.exec(clean)[0];
  assert.match(lineRule, /padding:\s*1px 8px/, 'segmentpadding er 1/8 (§7.1)');
  assert.match(lineRule, /border-radius:\s*var\(--radius-xs\)/, 'radius 8');
  assert.match(lineRule, /font-size:\s*var\(--aura-text-12\)/, '12 px fra typeskalaen');
});

test('WCAG: tabellariske cifre, 24px-klikmål, dæmpet kontrastfarve og feltombrydning', () => {
  const lineRule = /\.status-line\s*\{[^}]*\}/.exec(strip(styles))[0];
  assert.match(lineRule, /font-variant-numeric:\s*tabular-nums/, 'tallene hopper ikke');
  assert.match(lineRule, /min-height:\s*24px/, 'klikmålet er mindst 24 px');
  assert.match(lineRule, /color:\s*var\(--muted\)/, '12 px-teksten bruger den målte dæmpede farve');
  assert.match(strip(styles), /\.status-field\s*\{[^}]*white-space:\s*nowrap/, 'et felt brydes aldrig midt i et tal');
  // S4-UI (livefundet 4.11): rækken stod på TRE linjer ved 980 px, fordi
  // flex-wrap satte kladdestatus på egen linje. Nu er hele rækken nowrap, og
  // kladdestatussen er et forbigående segment EFTER $0,00*; målingerne viger
  // først (draft-crowded), når pladsen mangler — Datakontrol-knappen består.
  assert.match(strip(styles), /\.composer-status\s*\{[^}]*flex-wrap:\s*nowrap/, 'rækken er én nowrap-række');
  assert.match(strip(styles), /\.status-line\s*\{[^}]*flex-wrap:\s*nowrap/, 'felterne står altid på én linje — ombrydningen var livefundet, ikke design');
  assert.match(strip(styles), /\.composer-status\.draft-crowded\s*>\s*#context-status\s*\{[^}]*display:\s*none/, 'ved pladsmangel viger målingerne først');
  assert.doesNotMatch(strip(styles), /\.composer-status\.draft-crowded[^{]*\{[^}]*#privacy-gate-button/, 'Datakontrol-knappen viger aldrig');
  assert.match(strip(styles), /#draft-status[^{]*\{[^}]*white-space:\s*nowrap/, 'kladdestatussegmentet bryder aldrig linjen');
  assert.match(app, /draft-crowded/, 'app.js sætter crowding-tilstanden efter en måling');
  assert.match(strip(styles), /#draft-status[^{]*\{[^}]*transition:\s*opacity/, 'kladdestatus fader ud');
  assert.match(strip(styles), /prefers-reduced-motion[^@]*#draft-status[^{]*\{[^}]*transition:\s*none/, 'reduceret bevægelse respekteres');
});

test('§6.5: de samme fire felter på ALLE detaljeniveauer — særreglen er pensioneret', () => {
  for (const file of [styles, components, calm]) {
    assert.doesNotMatch(file, /transcript-(compact|standard|detailed)[^{]*\{[^}]*status/, 'intet detaljeniveau ændrer statuslinjen');
  }
  for (const level of ['compact', 'standard', 'detailed']) {
    const shaped = format({ selected, connection, contextValue: measured, usage: { ...empty, input: 1, output: 1, calls: 1 }, speed: speed(5) });
    assert.equal(shaped.context, '79,8k/1M (8%)');
    assert.equal(shaped.speed, '5 tok/s');
    assert.equal(shaped.tokens, '2 tokens');
    assert.equal(shaped.price, '$0,00', `niveauet ${level} viser de samme fire felter`);
  }
});
