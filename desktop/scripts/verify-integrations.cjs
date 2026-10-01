// Integrationsskills mod de rigtige offentlige tjenester. Prøven læser adresser og testopslag fra skillens egen tekst
// og kontrollerer, at tjenesten svarer, som skillen beskriver. Ingen konto, nøgle eller personoplysning bruges.
// CVR kræver en bruger eller en ansøgning og afprøves derfor ikke her; se docs/teststatus.md.
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadLibrary } = require('../core/library.cjs');
const get = url => fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
(async () => {
  const library = await loadLibrary(path.join(__dirname, '../../profiles'));
  const skill = library.skills.find(item => item.name === 'harness-integration-adresser').files.find(file => file.path === 'SKILL.md').content;
  const search = /`(https:\/\/adressevaelger\.dk\/adresser\/soeg\?tekst=<tekst>&token=[^`]+)`/.exec(skill)?.[1];
  const example = /Søg efter `([^`]+)`\. Svaret skal indeholde "([^"]+)"/.exec(skill);
  assert.ok(search && example, 'skillen beskriver søgeadresse og testopslag');
  // 1. Søgningen, som skillen beskriver den, finder den forventede adresse og kan kaldes fra en browser.
  const response = await get(search.replace('<tekst>', encodeURIComponent(example[1])));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), '*', 'kan kaldes fra browseren');
  const body = await response.json();
  assert.equal(body.status, 'ok');
  const hit = body.fund.find(item => item.titel === example[2]);
  assert.ok(hit, `fundet: ${example[2]}`);
  for (const field of ['type', 'id', 'titel', 'husnummerId']) assert.ok(field in hit, `feltet ${field} findes`);
  // 2. Opslag med ID giver postnummer og koordinater i EPSG:25832, som skillen og referencen beskriver.
  const token = new URL(search.replace('<tekst>', 'x')).searchParams.get('token');
  const lookup = await (await get(`https://adressevaelger.dk/husnumre/${hit.husnummerId}?token=${token}`)).json();
  assert.equal(lookup.husnummer.adgangspunkt.geometri.crs.properties.name, 'EPSG:25832');
  assert.equal(lookup.husnummer.postnummer.postnr, '1550');
  const { x, y } = lookup.husnummer.adgangspunkt.koordinater;
  assert.ok(x > 400000 && x < 900000 && y > 6000000 && y < 6450000, 'koordinaterne ligger i Danmark i UTM zone 32');
  console.log(JSON.stringify({ status: 'bestået', checks: ['søgeadressen i skillen svarer', 'kan kaldes fra en browser', 'testopslaget finder den forventede adresse', 'svarets felter som beskrevet', 'opslag med ID giver EPSG:25832 og postnummer'] }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
