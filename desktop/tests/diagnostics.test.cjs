const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diagnostics } = require('../core/diagnostics.cjs');
test('fejlrapport tillader kun faste felter og afviser fritekst i alle statusfelter', () => {
  const secret = 'privat-sti-og-api-noegle';
  const report = diagnostics({ version: secret, platform: secret, arch: secret, preview: secret, encryption:secret, packaged:secret, versions: { node:secret, git:secret, opencode:secret }, project:secret, running:secret, failures:[{area:secret,type:secret,at:secret}], text:secret, apiKey:secret, root:secret, connections:[secret] });
  assert.equal(JSON.stringify(report).includes(secret),false); assert.equal(report.projektAabent,false); assert.equal(report.installationspakke,false);
  assert.equal(report.noeglelagring,'ikke kontrolleret');
  assert.equal(diagnostics({}).noeglelagring,'ikke kontrolleret');
  assert.equal(diagnostics({encryption:false}).noeglelagring,'ikke tilgængelig');
  const actual = diagnostics({version:'0.2.0-beta.2', platform:'darwin', arch:'arm64', preview:'error', encryption:true, failures:Array.from({length:12},()=>({area:'agent',type:'model',at:new Date().toISOString()}))});
  assert.equal(actual.senesteFejl.length,10); assert.equal(actual.app,'0.2.0-beta.2'); assert.equal(actual.forhaandsvisning,'error');
});
