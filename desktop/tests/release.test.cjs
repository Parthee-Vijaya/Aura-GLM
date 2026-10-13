const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { expectedFiles, assetURL, validateRelease, releaseSnapshot } = require('../../scripts/release-contract.cjs');
const { check } = require('../../scripts/check-release.cjs');
const version = '0.2.0-beta.6';
function fixture() {
  const content = Buffer.from('Syntetisk installationsfil. Ikke et program.'), sha256 = createHash('sha256').update(content).digest('hex');
  const files = expectedFiles(version).map(name => ({ name, bytes: content.length, sha256, notarized: name.endsWith('.dmg'), ...(name.endsWith('.dmg') ? { notarization: { id: '12345678-1234-1234-1234-123456789abc', checkedAt: '2026-10-13T08:00:00Z' } } : {}) }));
  const manifest = { version, files }, checksums = files.map(f => `${f.sha256}  ${f.name}`).join('\n')+'\n';
  const release = { id: 1, tag_name: `v${version}`, draft: true, prerelease: true, body: 'Syntetiske udgivelsesnoter', assets: [...files.map(f => ({ name: f.name, size: f.bytes, digest: `sha256:${f.sha256}` })), { name: 'release.json' }, { name: 'SHA256SUMS.txt' }].map(a => ({ ...a, state: 'uploaded', browser_download_url: assetURL(`v${version}`, a.name) })) };
  return { content, release, manifest, checksums };
}
test('Udgivelse kræver én gennemgået beta med præcis tre komplette installationsfiler', () => {
  const f = fixture(); assert.equal(validateRelease(f.release,f.manifest,f.checksums,version).files.length,3);
  for (const mutate of [
    f=>f.release.draft=false, f=>f.release.prerelease=false, f=>f.release.body='', f=>f.release.tag_name='v0.2.0-beta.5',
    f=>f.release.assets.pop(), f=>f.release.assets.push({...f.release.assets[0],name:'.env'}),
    f=>f.release.assets[0].digest='sha256:'+'f'.repeat(64), f=>f.release.assets[0].size++,
    f=>f.manifest.version='0.2.0-beta.5', f=>f.manifest.files[0].notarized=false, f=>delete f.manifest.files[0].notarization,
    f=>f.manifest.files[0].notarization.id='-'.repeat(36), f=>f.manifest.files[0].notarization.checkedAt='ukendt',
    f=>f.manifest.files[1]={...f.manifest.files[0]}, f=>f.checksums='forkert',
  ]) { const bad=fixture(); mutate(bad); assert.throws(()=>validateRelease(bad.release,bad.manifest,bad.checksums,version)); }
});
test('Gentagen kontrol tillader downloadtællere, men afviser ændrede noter og filer', () => {
  const {release}=fixture(),before=releaseSnapshot(release);release.assets[0].download_count=2;
  assert.equal(releaseSnapshot(release),before);release.body='Ændrede noter';assert.notEqual(releaseSnapshot(release),before);
  release.body='Syntetiske udgivelsesnoter';release.assets[0].digest='ændret';assert.notEqual(releaseSnapshot(release),before);
});
test('Udgivelseskontrollen læser de faktiske bytes og stopper ved manglende Komplai-login', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'aura-release-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const f=fixture(), metadata={full_name:'ai-alliancen-org/ai-harness',private:false,visibility:'public'};
  for(const file of f.manifest.files)await fs.writeFile(path.join(root,file.name),f.content);
  await fs.writeFile(path.join(root,'release.json'),JSON.stringify(f.manifest));await fs.writeFile(path.join(root,'SHA256SUMS.txt'),f.checksums);
  let calls=0;const unavailable=async()=>{calls++;return new Response('',{status:404});};
  await assert.rejects(check(root,f.release,metadata,version,unavailable),/HTTP 404/);assert.equal(calls,1);
  await fs.writeFile(path.join(root,f.manifest.files[0].name),Buffer.alloc(f.content.length));
  await assert.rejects(check(root,f.release,metadata,version,unavailable),/SHA-256/);assert.equal(calls,1,'Ændret fil stopper før netværket');
  await fs.writeFile(path.join(root,f.manifest.files[0].name),f.content);
  const ready=async()=>Response.json({issuer:'https://auth.komplai.dk',clientId:'12345',authorizationEndpoint:'https://auth.komplai.dk/oauth/v2/authorize',tokenEndpoint:'https://auth.komplai.dk/oauth/v2/token',scopes:['openid','urn:zitadel:iam:org:project:id:123:aud']});
  assert.equal((await check(root,f.release,metadata,version,ready)).version,version);
  await assert.rejects(check(root,f.release,metadata,version,async()=>Response.json({issuer:'https://auth.komplai.dk',clientId:'123'})),/ufuldstændig/);
});
