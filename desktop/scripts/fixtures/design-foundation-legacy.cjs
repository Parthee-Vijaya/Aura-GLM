// Historical experiment retained as local source and test evidence.
// Not imported by Aura runtime or included in model instructions.
const DESIGN_FOUNDATIONS = Object.freeze(Object.fromEntries(Object.entries({
  utility: {
    label: 'Arbejdsredskab',
    palette: { background: '#F5F6F8', surface: '#FFFFFF', ink: '#182232', muted: '#596579', border: '#D9DEE7', accent: '#3456A5', soft: '#EAF0FC' },
    heading: 'var(--font-body)', width: '75rem',
    composition: 'Kompakt værktøjslinje på ca. 64 px; titel og primær handling i samme række. Vis opgavens data, timer eller arbejdsflade direkte under den. Brug rækker, tabel eller et fokuseret arbejdsområde med 12–16 px indvendig afstand; ingen velkomsthero eller kort for hvert datapunkt. Sekundære oplysninger får mindre vægt, ikke mindre læsbar tekst. På mobil prioriteres handling og de vigtigste felter; brede tabeller får kun intern rulning.'
  },
  editorial: {
    label: 'Indhold og deltagelse',
    palette: { background: '#F7F6F2', surface: '#FFFFFF', ink: '#202925', muted: '#5B665F', border: '#DDDFD7', accent: '#315E4C', soft: '#E8EFE7' },
    heading: 'Georgia, "Times New Roman", serif', width: '70rem',
    composition: 'En kort indledning med tydelig titel, én forklarende sætning og næste handling; efterfølges hurtigt af selve indholdet. Brug en asymmetrisk tekst-/billedkomposition kun hvor et relevant motiv findes. Arrangementer vises som dato + titel + sted + handling i vandrette rækker, artikler med læsebredde 65ch. På mobil står teksten før relevant billedindhold, og indholdet forbliver vigtigere end dekoration. Ingen opdigtede officielle logoer.'
  },
  commerce: {
    label: 'Katalog og køb',
    palette: { background: '#F7F7F5', surface: '#FFFFFF', ink: '#22262A', muted: '#5F656D', border: '#DDDFE1', accent: '#35475E', soft: '#E8EDF2' },
    heading: 'var(--font-body)', width: '80rem',
    composition: 'Kompakt navigation med søgning og tydelig kurv; kategori/filtre tæt ved produkterne. Brug ens billedformat, tydelige produktnavne, højrestillede priser og en enkel primær handling. Vælg kataloggitter kun når sammenligneligt produktindhold begrunder det; hold detaljer, valgmuligheder og køb samlet. Mobil har 1–2 kolonner efter indhold og en tydelig kurv uden at dække sidste vare. Ingen kunstige rabatter, anmeldelser eller succesfulde betalinger.'
  },
  food: {
    label: 'Madvalg og bestilling',
    palette: { background: '#FAF7F1', surface: '#FFFFFF', ink: '#25221F', muted: '#66615C', border: '#DED8CF', accent: '#B84A37', soft: '#F5E2DA' },
    heading: 'var(--font-body)', width: '74rem',
    composition: 'Cremefarvet hovedflade, mørk tekst og koral som én sparsom handlingsfarve. Kompakt navigation på ca. 64 px med stedvalg og kurv, derefter stedets navn og menu uden høj reklamehero. Kategorier som enkel navigation; menuposter som titel/beskrivelse + højrestillet pris + tilføj, adskilt af fine linjer. Desktop: fleksibel menu og ca. 20rem kurv; mobil: én kolonne og kurvhandling ved bunden med reserveret plads. Eventuelle billeder får samme rolige beskæring; brug kun tilladte lokale fotos eller en gennemarbejdet lokal SVG med genkendelige retter, sammenhængende proportioner og få nuancer. Emoji, ens farvefelter og tilfældige cirkler/rektangler er ikke madillustrationer. Uden passende billeder bruges en bevidst typografisk menu, ikke tomme billedbokse.'
  }
}).map(([id, foundation]) => [id, Object.freeze({ id, ...foundation, palette: Object.freeze(foundation.palette) })])));
const FOUNDATION_TOKENS = Object.freeze({
  'font-body': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'text-small': '0.875rem', 'text-body': '1rem', 'text-lead': '1.125rem', 'text-title': 'clamp(1.5rem, 2.4vw, 2rem)', 'text-display': 'clamp(2rem, 3.8vw, 3rem)',
  'line-body': '1.55', 'line-heading': '1.12', 'measure': '65ch',
  'space-1': '0.25rem', 'space-2': '0.5rem', 'space-3': '0.75rem', 'space-4': '1rem', 'space-6': '1.5rem', 'space-8': '2rem', 'space-12': '3rem',
  'gutter': 'clamp(1rem, 3vw, 2.5rem)', 'radius-control': '0.5rem', 'radius-panel': '0.875rem', 'control-min': '2.75rem'
});
// A layout reference, not a complete app. Real actions/data remain the model's
// task and require the same plan and permissions as all other generated code.
const FOOD_LAYOUT_RECIPE = Object.freeze({
  html: `<header class="app-header"><div class="shell header-row"><a class="brand" href="#steder">Madvalg</a><nav aria-label="Hovednavigation"><a href="#steder">Spisesteder</a><a href="#kurv">Kurv</a></nav><small>Eksempeldata</small></div></header>
<main class="shell work-grid"><section id="steder" aria-labelledby="places-title"><h1 id="places-title">Vælg spisested</h1><p>Se menuen, og sammensæt din bestilling.</p><div class="venue-list">
<button type="button" class="venue" data-venue="pizza"><small>Pizzeria</small><strong>Det lille pizzakøkken</strong><span>Stenovnsbagte pizzaer og sæsonens tilbehør.</span><b>Se menu <span aria-hidden="true">→</span></b></button>
<button type="button" class="venue" data-venue="greens"><small>Grønt køkken</small><strong>Grønne tallerkener</strong><span>Sprøde salater og varmt brød.</span><b>Se menu <span aria-hidden="true">→</span></b></button>
</div></section><aside class="basket" id="kurv" aria-labelledby="basket-title"><h2 id="basket-title">Din kurv</h2><p>Tilføj noget fra menuen.</p><div class="total"><span>Total</span><strong>0,00 kr.</strong></div><button class="primary" type="button" disabled>Gå til bestilling</button></aside></main>`,
  css: `*{box-sizing:border-box}body{margin:0;background:var(--color-background);color:var(--color-ink);font:var(--text-body)/var(--line-body) var(--font-body)}
.shell{max-width:var(--content-max);margin:auto;padding-inline:var(--gutter)}.app-header{background:var(--color-surface);border-bottom:1px solid var(--color-border)}.header-row{min-height:4rem;display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-4);padding-block:var(--space-3)}.brand{font-weight:750;text-decoration:none}.header-row nav{display:flex;gap:var(--space-4);margin-left:auto}a{color:inherit}nav a{display:inline-flex;align-items:center;min-height:var(--control-min)}
.work-grid{display:grid;grid-template-columns:minmax(0,1fr) 20rem;gap:var(--space-8);align-items:start;padding-block:var(--space-8)}.work-grid>*,.venue>*{min-width:0;overflow-wrap:anywhere}h1,h2{font-family:var(--font-heading);line-height:var(--line-heading);margin:0 0 var(--space-3)}h1{font-size:var(--text-title)}h2,.venue>strong{font-size:var(--text-lead)}p{color:var(--color-muted);max-width:var(--measure)}small{font-size:var(--text-small);color:var(--color-muted)}
.venue-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-4)}.venue,.basket{padding:var(--space-6);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-panel)}.venue{display:flex;flex-direction:column;gap:var(--space-3);text-align:left;font:inherit;color:inherit;cursor:pointer}.venue:hover{border-color:var(--color-accent)}.venue>b{display:flex;justify-content:space-between;align-items:center;min-height:var(--control-min);margin-top:auto}.total{display:flex;justify-content:space-between;gap:var(--space-3);border-top:1px solid var(--color-border);padding-block:var(--space-4);font-variant-numeric:tabular-nums}
.primary{width:100%;min-height:var(--control-min);padding:var(--space-3);font:inherit;border:0;border-radius:var(--radius-control);background:var(--color-accent);color:var(--color-on-accent)}.primary:disabled{background:var(--color-soft);color:var(--color-muted)}:is(a,button):focus-visible{outline:3px solid var(--color-focus);outline-offset:3px}
@media(max-width:52rem){.work-grid{grid-template-columns:minmax(0,1fr)}}@media(max-width:36rem){.venue-list{grid-template-columns:minmax(0,1fr)}.header-row>small{flex-basis:100%}}`
});
function selectDesignFoundation({ purpose, newInterface } = {}) {
  if (newInterface !== true) return null;
  const text = typeof purpose === 'string' ? purpose.normalize('NFKC').toLocaleLowerCase('da-DK').slice(0, 12000) : '';
  if (/madbestill|food.order|take.?away|bestil.{0,30}(mad|pizza)|order.{0,30}(food|pizza)/u.test(text) || /(restaurant|pizzeria|grillbar|spisested|caf[eé]|pizza)/u.test(text) && /(bestil|bestilling|order|menu|kurv|delivery)/u.test(text)) return DESIGN_FOUNDATIONS.food;
  if (/dashboard|tidsregistr|time.track|projektstyr|project.manage|statistik|analyse|reporting|regnskab|sagsbehandl/u.test(text)) return DESIGN_FOUNDATIONS.utility;
  if (/webshop|webbutik|e.?commerce|online.shop|shopping|produktkatalog|product.catalog|indkøbskurv/u.test(text)) return DESIGN_FOUNDATIONS.commerce;
  if (/borgermød|arrangement|event|magasin|editorial|portfolio|landing.page|artikel|article|nyheds|hjemmeside|website/u.test(text)) return DESIGN_FOUNDATIONS.editorial;
  return DESIGN_FOUNDATIONS.utility;
}
function luminance(hex) {
  const c = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function foundationTokens(foundation, primaryColor) {
  let accent = foundation.palette.accent;
  if (typeof primaryColor === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(primaryColor)) accent = (primaryColor.length === 4 ? '#' + [...primaryColor.slice(1)].map(c => c + c).join('') : primaryColor).toUpperCase();
  const p = foundation.palette;
  return Object.freeze({
    ...FOUNDATION_TOKENS, 'font-heading': foundation.heading, 'content-max': foundation.width,
    'color-background': p.background, 'color-surface': p.surface, 'color-ink': p.ink, 'color-muted': p.muted, 'color-border': p.border,
    'color-accent': accent, 'color-on-accent': contrast(accent, '#FFFFFF') >= contrast(accent, '#000000') ? '#FFFFFF' : '#000000',
    'color-soft': accent === p.accent ? p.soft : p.background,
    'color-focus': contrast(accent, p.background) >= 3 && contrast(accent, p.surface) >= 3 ? accent : p.ink
  });
}

module.exports = { DESIGN_FOUNDATIONS, FOOD_LAYOUT_RECIPE, selectDesignFoundation, foundationTokens };
