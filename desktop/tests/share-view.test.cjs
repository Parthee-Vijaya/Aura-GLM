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
