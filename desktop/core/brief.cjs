// Projektbriefen: det, brugeren selv har sagt om projektet. Den udfyldes fra idéen, ønskerne og svarene på AI'ens
// spørgsmål, og brugeren kan rette, fjerne og tilføje linjer. AI'en skriver aldrig i briefen; den får den med som data.
const { randomUUID } = require('node:crypto');

const LIMITS = { items: 30, label: 60, value: 2000 };
const SOURCES = new Set(['idé', 'ønske', 'svar', 'dig']);

function initialBrief(purpose = '') {
  const idea = String(purpose || '').trim().slice(0, LIMITS.value);
  return { items: idea ? [{ id: 'ide', label: 'Idé', value: idea, source: 'idé' }] : [], updatedAt: null };
}
const clean = (value, max) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
// En brief fra brugerfladen eller historikken. Ugyldige linjer afvises med en forklaring i stedet for at blive gemt.
function normalizeBrief(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.items)) throw new Error('Briefen kan ikke læses.');
  if (input.items.length > LIMITS.items) throw new Error(`Briefen kan have højst ${LIMITS.items} linjer.`);
  const seen = new Set();
  const items = input.items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.label !== 'string' || typeof item.value !== 'string') throw new Error('En linje i briefen mangler overskrift eller tekst.');
    const label = clean(item.label, LIMITS.label + 1), value = clean(item.value, LIMITS.value + 1);
    if (!label || !value) throw new Error('Hver linje i briefen skal have både en overskrift og en tekst.');
    if (label.length > LIMITS.label) throw new Error(`Overskriften må højst have ${LIMITS.label} tegn.`);
    if (value.length > LIMITS.value) throw new Error(`Teksten i en linje må højst have ${LIMITS.value.toLocaleString('da-DK')} tegn.`);
    const id = typeof item.id === 'string' && /^[\w-]{1,64}$/.test(item.id) && !seen.has(item.id) ? item.id : randomUUID();
    seen.add(id);
    const result = { id, label, value, source: SOURCES.has(item.source) ? item.source : 'dig' };
    if (item.edited === true) result.edited = true;
    if (typeof item.question === 'string' && item.question.trim()) result.question = clean(item.question, 500);
    return result;
  });
  return { items, updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : null };
}
// Opdaterer eller tilføjer en linje med samme overskrift. Brugerens egne rettelser overskrives kun af et nyt svar fra brugeren selv.
function upsert(brief, line) {
  const items = brief.items.map(item => ({ ...item }));
  const existing = items.find(item => item.label.toLocaleLowerCase('da') === line.label.toLocaleLowerCase('da'));
  if (existing) { Object.assign(existing, line, { id: existing.id, label: existing.label }); delete existing.edited; }
  else items.push({ id: randomUUID(), ...line });
  return { items: items.slice(0, LIMITS.items), updatedAt: new Date().toISOString() };
}
// Svar på AI'ens spørgsmål. Overskriften er spørgsmålets korte header, ellers selve spørgsmålet forkortet.
function addAnswers(brief, questions, answers) {
  let next = brief;
  (questions || []).forEach((question, index) => {
    // AI'ens markering af et anbefalet svar er ikke brugerens ord og kommer ikke med i briefen.
    const value = (answers?.[index] || []).map(answer => String(answer).replace(/\s*[([]\s*(anbefalet|anbefales|recommended)\s*[)\]]\s*$/i, '').trim()).filter(Boolean).join(', ');
    if (!value) return;
    const label = clean(question.header || question.question.replace(/\?$/, ''), LIMITS.label);
    next = upsert(next, { label, value: clean(value, LIMITS.value), source: 'svar', question: clean(question.question, 500) });
  });
  return next;
}
function addWishes(brief, wishes) {
  let next = brief;
  for (const { label, value } of wishes || []) if (label && value) next = upsert(next, { label: clean(label, LIMITS.label), value: clean(value, LIMITS.value), source: 'ønske' });
  return next;
}
const briefText = brief => (brief?.items || []).map(item => `- ${item.label}: ${item.value.replace(/\n+/g, ' ')}`).join('\n');

module.exports = { initialBrief, normalizeBrief, addAnswers, addWishes, briefText, LIMITS };
