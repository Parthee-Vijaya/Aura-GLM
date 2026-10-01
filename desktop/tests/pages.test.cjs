const {test}=require('node:test');
const assert=require('node:assert/strict');
const {render,build}=require('../../scripts/build-pages.cjs');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const meta={full_name:'ai-alliancen-org/ai-harness',private:true};
const name='AI-Harness-0.2.0-beta.1-mac-arm64.dmg';
const release={tag_name:'v0.2.0-beta.1',published_at:'2026-09-25T12:00:00Z',draft:false,prerelease:true,assets:[{name,state:'uploaded',browser_download_url:`https://github.com/${meta.full_name}/releases/download/v0.2.0-beta.1/${name}`,digest:'sha256:'+'a'.repeat(64)}]};
// Udgivelser fra før navneskiftet hedder AI-Harness-…, nye hedder Aura-…; begge vises.
test('Pages viser installationsfiler med det nye og det tidligere navn',()=>{const aura='Aura-0.2.0-beta.4-mac-arm64.dmg';const html=render([{...release,tag_name:'v0.2.0-beta.4',assets:[{...release.assets[0],name:aura,browser_download_url:`https://github.com/${meta.full_name}/releases/download/v0.2.0-beta.4/${aura}`}]}],meta);assert.match(html,/Hent Mac · Apple-chip/);assert.match(html,new RegExp(aura.replace(/\./g,'\\.')));assert.match(render([release],meta),/AI-Harness-0\.2\.0-beta\.1/);});
test('Pages viser adgangskrav og ingen opdigtede downloads',()=>{assert.match(render([],meta),/kræver login/);assert.doesNotMatch(render([],meta),/Hent Mac/);assert.doesNotMatch(render([{...release,draft:true}],meta),/Hent Mac/);});
test('Pages bruger faktiske releasefiler og afviser fremmede links',()=>{const html=render([release],meta);assert.match(html,/Hent Mac · Apple-chip/);assert.match(html,/SHA-256/);assert.throws(()=>render([{...release,assets:[{...release.assets[0],browser_download_url:'https://example.org/fil'}]}],meta),/matcher ikke/);assert.doesNotMatch(render([{...release,assets:[{name:'.env',state:'uploaded'}]}],meta),/\.env/);});
test('Pages bevarer instruktionspakker og bygger tom tilstand fra rigtige skabeloner',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'harness-pages-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await build([],meta,dir);assert.match(await fs.readFile(path.join(dir,'index.html'),'utf8'),/endnu ingen offentliggjort/);assert.match(await fs.readFile(path.join(dir,'pakker.html'),'utf8'),/Claude/);await fs.access(path.join(dir,'downloads/aura-harness-codex-0.2.0.zip'));await fs.access(path.join(dir,'skills.html'));assert.match(await fs.readFile(path.join(dir,'catalog.json'),'utf8'),/harness-sikkerhedsgennemgang/);assert.ok(!(await fs.readdir(dir)).some(f=>f.endsWith('.dmg')));});
