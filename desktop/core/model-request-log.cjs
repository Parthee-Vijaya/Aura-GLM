// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Lokal metadatajournal over det, der faktisk blev sendt til modellen — "Sendt ud over din
// tekst". Journalen optegner kun kilde, størrelse og hash pr. beskeddel og for hele kaldet;
// aldrig indhold, nøgler eller adresser. Skrives ved transportgrænsen (gatewayen), efter
// Privacy Gate og gateway har ændret forespørgslen sidste gang. Append-only med loft og
// rotation; en revet sidste linje tolereres ved læsning.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const LIMITS = Object.freeze({ entries: 2000, fileBytes: 512 * 1024, messageBytes: 100_000 });
const safe = value => typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\x00-\x1f]/.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

// Forespørgslens dele: hver besked gets kilde (rolle), størrelse og hash. Systemprompten er
// sin egen post. Indhold kommer aldrig med — kun størrelse og fingeraftryk.
function describeRequest(payloadString) {
  const payload = Buffer.isBuffer(payloadString) ? payloadString : Buffer.from(String(payloadString));
  let body; try { body = JSON.parse(payload.toString()); } catch { body = null; }
  const items = [];
  const messages = Array.isArray(body?.messages) ? body.messages : Array.isArray(body?.input) ? body.input : [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const part = JSON.stringify(message);
    if (part.length > LIMITS.messageBytes) { items.push({ source: 'besked', bytes: count(part.length), sha256: null, truncated: true }); continue; }
    items.push({ source: typeof message.role === 'string' ? message.role : 'besked', bytes: count(part.length), sha256: hash(part) });
  }
  if (body?.system !== undefined) {
    const part = JSON.stringify(body.system);
    items.push({ source: 'system', bytes: count(part.length), sha256: part.length <= LIMITS.messageBytes ? hash(part) : null, ...(part.length > LIMITS.messageBytes ? { truncated: true } : {}) });
  }
  return { request: { bytes: count(payload.length), sha256: hash(payload), messages: count(messages.length) }, items };
}

async function fileFor(directory, chat) {
  // Samtale-id'et bliver et filnavn: kun bogstaver, tal og bindestreg.
  if (!/^[A-Za-z0-9-]{1,100}$/.test(chat)) throw new Error('Journalen kræver en gyldig samtale.');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  return path.join(directory, `${chat}.jsonl`);
}

// Skrivninger serialiseres pr. fil, så tætte kald fra samme samtale ikke overskriver hinanden.
const queues = new Map();
async function append(directory, chat, entry = {}) {
  const file = await fileFor(directory, chat);
  const write = () => appendNow(file, chat, entry);
  const previous = queues.get(file) || Promise.resolve();
  const next = previous.then(write, write);
  queues.set(file, next.finally(() => { if (queues.get(file) === next) queues.delete(file); }));
  return next;
}

async function appendNow(file, chat, entry = {}) {
  const record = {
    schema: 1, at: new Date().toISOString(),
    chat, task: safe(entry.task) ? entry.task : null,
    purpose: safe(entry.purpose) ? entry.purpose : 'project-conversation',
    recipient: { ...(entry.recipient && typeof entry.recipient === 'object' ? { model: safe(entry.recipient.model) ? entry.recipient.model : null, route: safe(entry.recipient.route) ? entry.recipient.route : null } : {}) },
    request: { bytes: count(entry.request?.bytes), sha256: entry.request?.sha256 && /^[0-9a-f]{64}$/.test(entry.request.sha256) ? entry.request.sha256 : null, messages: count(entry.request?.messages) },
    items: Array.isArray(entry.items) ? entry.items.slice(0, 400).map(item => ({ source: safe(item?.source) ? item.source : 'besked', bytes: count(item?.bytes), ...(item?.sha256 && /^[0-9a-f]{64}$/.test(item.sha256) ? { sha256: item.sha256 } : {}), ...(item?.truncated === true ? { truncated: true } : {}) })) : []
  };
  let lines = [JSON.stringify(record)];
  try {
    const existing = await fs.readFile(file, 'utf8');
    const kept = existing.split('\n').filter(Boolean);
    if (kept.length + 1 > LIMITS.entries || Buffer.byteLength(existing) + lines[0].length > LIMITS.fileBytes) kept.splice(0, Math.ceil(kept.length / 2)); // rotation: ældste halvdele væk
    lines = [...kept, lines[0]];
  } catch { /* Første post i en ny journal. */ }
  await fs.writeFile(file, lines.join('\n') + '\n', { mode: 0o600 });
  return lines.length;
}

async function list(directory, chat, { offset = 0, limit = 50 } = {}) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('Ugyldigt udsnit af journalen.');
  let existing;
  try { existing = await fs.readFile(await fileFor(directory, chat), 'utf8'); } catch { return { entries: [], total: 0 }; }
  const kept = existing.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  return { total: kept.length, entries: kept.slice(offset, offset + limit) };
}

module.exports = { append, list, describeRequest, LIMITS };
