const {test}=require('node:test');const assert=require('node:assert/strict');const view=require('../ui/share-view.js');
const receipt={state:'READY',config:{provider:'azure'},target:{name:'lokaler'},version:{name:'Første test',at:'2026-10-07T09:00:00Z'}};
test('delingsresumé viser faktisk evidens uden at slutte privat adgang eller fuld funktion',()=>{
 assert.match(Object.fromEntries(view.checks({...receipt,state:'UNKNOWN'})).Udbyder,/registreret lokalt/);
 assert.match(Object.fromEntries(view.checks({...receipt,state:'SUBMITTING'})).Udbyder,/udfald endnu ikke bekræftet/);
 let rows=Object.fromEntries(view.checks(receipt));assert.match(rows.Startside,/Ikke kontrolleret/);assert.match(rows['Testerens adgang'],/Ikke afprøvet/);
 rows=Object.fromEntries(view.checks({...receipt,checks:{at:'2026-10-07T09:10:00Z',provider:{status:'unknown'},site:{status:'skipped'},content:{status:'skipped'}}}));assert.match(rows.Udbyder,/mislykkedes/);assert.doesNotMatch(rows.Udbyder,/Udgivet/);
 rows=Object.fromEntries(view.checks({...receipt,checks:{provider:{status:'checked'},site:{status:'answered',http:403},content:{status:'skipped'}}}));assert.match(rows.Startside,/Kræver adgang.*uden login/);assert.match(rows.Indhold,/Ikke kontrolleret/);
 rows=Object.fromEntries(view.checks({...receipt,checkedAt:'2026-10-06T08:00:00Z'}));assert.match(rows.Udbyder,/tidligere registreret; genkontrollér/);
 assert.match(view.destination(receipt),/Azure.*lokaler.*harness-test/);assert.match(view.version(receipt),/Første test/);
});
test('kopier og ugemte filer indgår synligt i afgrænsningen',()=>{assert.match(view.scope({copyCount:2,viewingCopy:true}),/2 samtalekopier.*ikke flettet/);assert.match(view.scope({copyCount:0}),/Ugemte rettelser kommer ikke med/);});

test('kvitteringen skiller appens navn og adresse fra versionsmetadata', () => {
 const r = { ...receipt, id: 'version-1', config: { provider: 'komplai' }, target: { name: 'Blomsten', owner: 'Organisationen', host: 'blomst.komplai.run' }, url: 'https://blomst.komplai.run/' };
 assert.deepEqual(view.identity(r), { name: 'Blomsten', address: 'blomst.komplai.run', account: 'komplai Run · Organisationen' });
 assert.doesNotMatch(JSON.stringify(view.identity(r)), /Første test|version-1/);
});

test('READY fra upload er ingen indholdskontrol eller bekræftet adgang', () => {
 const r = { ...receipt, id: 'version-1', config: { provider: 'komplai', visibility: 'private' } };
 const summary = view.receiptSummary(r);
 assert.equal(summary.publication.title, 'Udgivet'); assert.match(summary.publication.detail, /uploadsvar/);
 assert.equal(summary.publication.tone, 'neutral');
 assert.equal(summary.access.title, 'Adgang ikke kontrolleret'); assert.match(summary.access.detail, /Valgt ved upload/);
 assert.equal(summary.verification.title, 'Startside ikke kontrolleret'); assert.notEqual(summary.verification.tone, 'positive');
});

test('privat kvittering beskriver login uden at påstå medlemsadgang', () => {
 const r = { ...receipt, id: 'version-1', config: { provider: 'komplai', visibility: 'private' }, checks: { provider: { status: 'checked', visibility: 'private' }, site: { status: 'answered', http: 401 }, content: { status: 'skipped' } } };
 const summary = view.receiptSummary(r);
 assert.equal(summary.publication.tone, 'positive'); assert.equal(summary.access.title, 'Kun organisationen');
 assert.match(summary.access.detail, /Log ind med komplai/);
 assert.equal(summary.verification.title, 'Medlemsadgang er ikke afprøvet'); assert.notEqual(summary.verification.tone, 'positive'); assert.equal(summary.verification.hidden, true);
});

test('offentligt filmatch er præcist, og ændret adgang fremhæves', () => {
 const r = { ...receipt, id: 'version-1', config: { provider: 'komplai', visibility: 'private' }, checks: { provider: { status: 'checked', visibility: 'public' }, site: { status: 'answered', http: 200 }, content: { status: 'matched' } } };
 const summary = view.receiptSummary(r);
 assert.equal(summary.access.title, 'Alle med linket'); assert.equal(summary.access.tone, 'warning'); assert.match(summary.access.detail, /ændret siden uploaden/);
 assert.equal(summary.verification.title, 'Startsiden matcher den gemte fil'); assert.equal(summary.verification.tone, 'positive'); assert.equal(summary.verification.detail, ''); assert.match(Object.fromEntries(view.checks(r))['Testerens adgang'], /Ikke afprøvet/);
});

test('ukendt upload og fejlet statuskontrol viser aldrig gammel succes', () => {
 const unknown = view.receiptSummary({ ...receipt, id: null, state: 'UNKNOWN' });
 assert.equal(unknown.publication.title, 'Upload ikke bekræftet'); assert.equal(unknown.publication.tone, 'warning'); assert.match(unknown.publication.detail, /før du prøver en ny upload/);
 const failed = view.receiptSummary({ ...receipt, id: 'version-1', checks: { provider: { status: 'unknown' }, content: { status: 'matched' } } });
 assert.equal(failed.publication.title, 'Status kunne ikke hentes'); assert.notEqual(failed.verification.tone, 'positive');
 const legacy = view.receiptSummary({ ...receipt, id: 'version-1', checkedAt: '2026-10-06T08:00:00Z' });
 assert.match(legacy.publication.detail, /Ældre kvittering/); assert.notEqual(legacy.publication.tone, 'positive');
});

test('Azure viser kun en bekræftet testadresse, aldrig produktionens standardadresse', () => {
 const r = { ...receipt, id: 'harness-test', state: 'UPLOADED', target: { name: 'Prøveapp', host: 'produktion.azurestaticapps.net' } };
 assert.equal(view.identity(r).address, 'Testadresse afventer udgivelse');
 assert.equal(view.identity({ ...r, state: 'READY', url: 'https://test.azurestaticapps.net' }).address, 'test.azurestaticapps.net');
});

test('privat metadata modsagt af anonymt filmatch giver tydelig adgangsadvarsel', () => {
 const summary = view.receiptSummary({ ...receipt, id: 'version-1', config: { provider: 'komplai', visibility: 'private' }, checks: { provider: { status: 'checked', visibility: 'private' }, site: { status: 'answered', http: 200 }, content: { status: 'matched' } } });
 assert.equal(summary.access.title, 'Startsiden er åben'); assert.equal(summary.access.tone, 'warning');
 assert.match(summary.access.detail, /privat adgang.*uden login/); assert.equal(summary.verification.tone, 'warning');
 assert.doesNotMatch(summary.access.title, /Kun organisationen/);
});
