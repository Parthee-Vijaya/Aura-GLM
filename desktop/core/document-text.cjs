// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Plain-text extraction from Word (.docx) and Excel (.xlsx) files for the
// read-only file view. No dependencies: a bounded ZIP directory reader and
// linear tag scans. Nothing is written to disk, no XML parser is involved (so
// no entity expansion beyond the five standard ones and numeric references),
// and input, inflated parts and output are all capped.
const zlib = require('node:zlib');

const INPUT_LIMIT = 5 * 1024 * 1024;
const ENTRY_LIMIT = 8 * 1024 * 1024;
const TEXT_LIMIT = 256 * 1024;
const MAX_ENTRIES = 4000, MAX_SHEETS = 5, MAX_ROWS = 1000, MAX_COLUMNS = 60;
const FORMATS = Object.freeze({ '.docx': 'docx', '.xlsx': 'xlsx' });

class DocumentError extends Error {}
const unreadable = () => new DocumentError('Dokumentet kunne ikke læses. Det kan være beskadiget eller beskyttet med adgangskode.');
const tooLarge = () => new DocumentError('Dokumentets indhold er for stort til at blive vist her.');

// The central directory as name → entry. ZIP64 and encrypted entries are refused in part().
function directory(buffer) {
  let end = -1;
  for (let at = buffer.length - 22, floor = Math.max(0, buffer.length - 65557); at >= floor; at--) if (buffer.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  if (end < 0) throw unreadable();
  const count = buffer.readUInt16LE(end + 10), start = buffer.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || start + buffer.readUInt32LE(end + 12) > end) throw unreadable();
  const entries = new Map();
  for (let index = 0, at = start; index < count; index++) {
    if (at + 46 > end || buffer.readUInt32LE(at) !== 0x02014b50) throw unreadable();
    const nameLength = buffer.readUInt16LE(at + 28);
    entries.set(buffer.toString('utf8', at + 46, at + 46 + nameLength), { flags: buffer.readUInt16LE(at + 8), method: buffer.readUInt16LE(at + 10), packed: buffer.readUInt32LE(at + 20), size: buffer.readUInt32LE(at + 24), local: buffer.readUInt32LE(at + 42) });
    at += 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
  }
  return entries;
}

// One named part as text, or null when the archive has no such part.
function part(buffer, entries, name) {
  const entry = entries.get(name);
  if (!entry) return null;
  if (entry.flags & 1 || entry.packed === 0xffffffff || entry.size === 0xffffffff) throw unreadable();
  if (entry.size > ENTRY_LIMIT) throw tooLarge();
  const at = entry.local;
  if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== 0x04034b50) throw unreadable();
  const begin = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28), data = buffer.subarray(begin, begin + entry.packed);
  if (data.length !== entry.packed) throw unreadable();
  if (entry.method === 0) { if (data.length > ENTRY_LIMIT) throw tooLarge(); return data.toString('utf8'); }
  if (entry.method !== 8) throw unreadable();
  // The declared size can lie; the inflate limit is the real guard.
  try { return zlib.inflateRawSync(data, { maxOutputLength: ENTRY_LIMIT }).toString('utf8'); }
  catch (error) { throw error?.code === 'ERR_BUFFER_TOO_LARGE' ? tooLarge() : unreadable(); }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
const decode = text => text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,4});/gi, (all, body) => {
  if (body[0] !== '#') return Object.hasOwn(ENTITIES, body.toLowerCase()) ? ENTITIES[body.toLowerCase()] : all;
  const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
});

// Collects lines up to the output cap.
function collector() {
  const lines = [];
  let bytes = 0, truncated = false;
  return {
    push(line) {
      const size = Buffer.byteLength(line) + 1;
      if (bytes + size > TEXT_LIMIT) { truncated = true; return false; }
      lines.push(line); bytes += size; return true;
    },
    cut() { truncated = true; },
    result: () => ({ text: lines.join('\n'), truncated }),
  };
}

function word(xml) {
  const out = collector();
  for (const paragraph of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g)) {
    let line = '';
    for (const token of paragraph[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br(?: [^>]*)?\/>/g)) line += token[1] !== undefined ? decode(token[1]) : token[0].startsWith('<w:tab') ? '\t' : '\n';
    if (!out.push(line)) break;
  }
  return out.result();
}

const attribute = (attrs, name) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
const columnIndex = letters => [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
const runs = xml => [...xml.matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map(match => decode(match[1])).join('');

function sheet(xml, shared, out) {
  let count = 0;
  for (const row of xml.matchAll(/<row[ >][\s\S]*?<\/row>/g)) {
    if (++count > MAX_ROWS) { out.cut(); return false; }
    const cells = [];
    for (const cell of row[0].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const letters = /^([A-Z]{1,3})\d+$/.exec(attribute(cell[1], 'r') || '')?.[1], column = letters ? columnIndex(letters) : cells.length;
      if (column >= MAX_COLUMNS) continue;
      const type = attribute(cell[1], 't'), body = cell[2] || '', raw = /<v>([^<]*)<\/v>/.exec(body)?.[1];
      const value = type === 'inlineStr' ? runs(body) : raw === undefined ? '' : type === 's' ? shared[Number(raw)] ?? '' : decode(raw);
      cells[column] = value.replace(/[\t\r\n]+/g, ' ');
    }
    for (let index = 0; index < cells.length; index++) if (cells[index] === undefined) cells[index] = '';
    if (!out.push(cells.join('\t'))) return false;
  }
  return true;
}

function excel(buffer, entries) {
  const workbook = part(buffer, entries, 'xl/workbook.xml'), relations = part(buffer, entries, 'xl/_rels/workbook.xml.rels');
  if (workbook === null || relations === null) throw unreadable();
  const strings = part(buffer, entries, 'xl/sharedStrings.xml') || '';
  const shared = [...strings.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map(match => runs(match[1] || ''));
  const targets = new Map([...relations.matchAll(/<Relationship ([^>]*?)\/?>/g)].map(match => [attribute(match[1], 'Id'), attribute(match[1], 'Target')]));
  const sheets = [...workbook.matchAll(/<sheet ([^>]*?)\/?>/g)].map(match => ({ name: decode(attribute(match[1], 'name') || 'Ark'), target: targets.get(attribute(match[1], 'r:id')) }));
  if (!sheets.length) throw unreadable();
  const out = collector();
  if (sheets.length > MAX_SHEETS) out.cut();
  for (const [index, item] of sheets.slice(0, MAX_SHEETS).entries()) {
    const file = typeof item.target === 'string' ? item.target.replace(/^\/+/, '') : '';
    const xml = file ? part(buffer, entries, file.startsWith('xl/') ? file : 'xl/' + file) : null;
    if (index && !out.push('')) break;
    if (!out.push('Ark: ' + item.name)) break;
    if (xml !== null && !sheet(xml, shared, out)) break;
  }
  return out.result();
}

function extract(format, buffer) {
  if (format !== 'docx' && format !== 'xlsx') throw new DocumentError('Filtypen understøttes ikke her.');
  if (!Buffer.isBuffer(buffer)) throw unreadable();
  if (buffer.length > INPUT_LIMIT) throw new DocumentError('Dokumentet er for stort til at blive vist her. Grænsen er 5 MB.');
  const entries = directory(buffer);
  if (format === 'xlsx') return excel(buffer, entries);
  const xml = part(buffer, entries, 'word/document.xml');
  if (xml === null) throw unreadable();
  return word(xml);
}

module.exports = { extract, FORMATS, DocumentError, INPUT_LIMIT, ENTRY_LIMIT, TEXT_LIMIT };
