// SPDX-License-Identifier: EUPL-1.2
// Word and Excel files open in the file view as extracted text (plan phase 2).
// The reader has no dependencies: a bounded ZIP reader plus linear tag scans.
// It never writes to disk, never expands XML entities beyond the five standard
// ones and numeric references, and caps input, inflated size and output.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const documents = require('../core/document-text.cjs');

// A minimal ZIP writer for fixtures: stored or deflated entries, no ZIP64.
function zip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const { name, data, store = false } of entries) {
    const raw = Buffer.from(data), body = store ? raw : zlib.deflateRawSync(raw), file = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(zlib.crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(file.length, 26);
    const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(store ? 0 : 8, 10);
    header.writeUInt32LE(zlib.crc32(raw), 16); header.writeUInt32LE(body.length, 20); header.writeUInt32LE(raw.length, 24); header.writeUInt16LE(file.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local, file, body); central.push(header, file); offset += 30 + file.length + body.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const docx = body => zip([{ name: '[Content_Types].xml', data: '<Types/>', store: true }, { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>` }]);
const xlsx = ({ strings = [], sheets }) => zip([
  { name: 'xl/workbook.xml', data: `<workbook><sheets>${sheets.map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
  { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships>${sheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>` },
  { name: 'xl/sharedStrings.xml', data: `<sst>${strings.map(value => `<si><t>${value}</t></si>`).join('')}</sst>` },
  ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: `<worksheet><sheetData>${sheet.rows}</sheetData></worksheet>` })),
]);

test('a Word file becomes one line per paragraph, with tabs, breaks and entities', () => {
  const file = docx('<w:p><w:r><w:t>Første afsnit</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Anden linje</w:t><w:tab/><w:t>med tab &amp; tegn &lt;3</w:t><w:br/><w:t>ny linje &#229;</w:t></w:r></w:p><w:p/>');
  assert.deepEqual(documents.extract('docx', file), { text: 'Første afsnit\nAnden linje\tmed tab & tegn <3\nny linje å\n', truncated: false });
});

test('an Excel file becomes tab-separated rows per sheet, with gaps kept as empty cells', () => {
  const file = xlsx({ strings: ['Navn', 'Beløb', 'Leje'], sheets: [
    { name: 'Budget', rows: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>1200</v></c></row>' },
    { name: 'Noter', rows: '<row r="1"><c r="A1" t="inlineStr"><is><t>Fri tekst</t></is></c></row>' },
  ] });
  assert.deepEqual(documents.extract('xlsx', file), { text: 'Ark: Budget\nNavn\t\tBeløb\nLeje\t\t1200\n\nArk: Noter\nFri tekst', truncated: false });
});

test('long output is cut at the limit and says so', () => {
  const body = Array.from({ length: 4000 }, (_, index) => `<w:p><w:r><w:t>${'tekst '.repeat(20)}${index}</w:t></w:r></w:p>`).join('');
  const result = documents.extract('docx', docx(body));
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.text) <= documents.TEXT_LIMIT);
});

test('unsafe or unreadable archives are refused with a plain message', () => {
  assert.throws(() => documents.extract('docx', Buffer.from('ikke en zip-fil')), /kunne ikke læses/);
  assert.throws(() => documents.extract('docx', zip([{ name: 'andet.xml', data: '<x/>' }])), /kunne ikke læses/);
  const bomb = zip([{ name: 'word/document.xml', data: Buffer.alloc(documents.ENTRY_LIMIT + 1024, 0x20) }]);
  assert.throws(() => documents.extract('docx', bomb), /for stort/);
  assert.throws(() => documents.extract('docx', Buffer.alloc(documents.INPUT_LIMIT + 1)), /for stor/);
  assert.throws(() => documents.extract('pptx', docx('<w:p/>')), /understøttes ikke/);
});

test('the file view reads a Word file as a document and still refuses it as an AI reference', async () => {
  const files = require('../core/project-files.cjs');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-doc-')));
  try {
    await fs.writeFile(path.join(root, 'referat.docx'), docx('<w:p><w:r><w:t>Referat fra mødet</w:t></w:r></w:p>'));
    const shown = await files.readFile(root, 'referat.docx');
    assert.equal(shown.kind, 'document'); assert.equal(shown.format, 'docx'); assert.equal(shown.text, 'Referat fra mødet'); assert.equal(shown.truncated, false);
    await assert.rejects(files.checkReference(root, { path: 'referat.docx' }), /kun henvise til tekstfiler/);
    await fs.writeFile(path.join(root, 'falsk.xlsx'), 'ikke et regneark');
    await assert.rejects(files.readFile(root, 'falsk.xlsx'), /kunne ikke læses/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

// A one-page PDF with a single text run, with a correct cross-reference table.
function pdf(text) {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>', `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  return Buffer.from(body + `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<</Root 1 0 R/Size ${objects.length + 1}>>\nstartxref\n${xref}\n%%EOF\n`, 'latin1');
}

test('a PDF opens through the existing bounded local reader, page by page', async () => {
  const files = require('../core/project-files.cjs');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pdf-')));
  try {
    await fs.writeFile(path.join(root, 'notat.pdf'), pdf('Hej fra PDF'));
    const shown = await files.readFile(root, 'notat.pdf');
    assert.deepEqual({ kind: shown.kind, format: shown.format, text: shown.text }, { kind: 'document', format: 'pdf', text: '[Side 1]\nHej fra PDF' });
    await fs.writeFile(path.join(root, 'tom.pdf'), 'ikke en pdf');
    await assert.rejects(files.readFile(root, 'tom.pdf'), /PDF/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('the viewer labels extracted text and keeps it out of the reference button', () => {
  const workspace = require('node:fs').readFileSync(path.join(__dirname, '..', 'ui', 'workspace.js'), 'utf8');
  assert.match(workspace, /code\.text = file\.kind === 'text' \? file\.text : null/, 'only real text files can be referenced');
  assert.match(workspace, /file\.kind === 'document'/);
  assert.match(workspace, /udtrukket tekst/);
});
