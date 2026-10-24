const test=require('node:test'),assert=require('node:assert/strict');
const {binding,key,report,imageAllowed}=require('../core/model-support.cjs');
const connection={id:'synthetic',revision:'revision-1',kind:'compatible',baseURL:'https://example.invalid/v1',protocol:'openai'},model={id:'synthetic-model',capabilities:{tools:true,vision:true}},route={id:'synthetic-route',capabilities:{vision:false}};
test('catalog declarations remain separate from measured support; false and unknown are preserved',()=>{
 const value=report(connection,model,route,{catalogAt:'2026-10-24T08:00:00Z'});assert.equal(value.catalog.model.images,true);assert.equal(value.catalog.route.images,false);assert.deepEqual(value.measurements,[]);assert.equal(report(connection,{id:model.id},null).catalog.model.tools,null);assert.equal(imageAllowed(model,route),false);assert.equal(imageAllowed(model,{id:'unknown'}),false);assert.equal(imageAllowed(model,{id:'explicit',capabilities:{vision:true}}),true);assert.equal(imageAllowed(model,null),true);assert.equal(imageAllowed({capabilities:{}},null),false);
});
test('controlled measurements are explicitly labelled and match only an exact recipient/model/route/protocol/engine binding',()=>{
 const evidence=[{binding:key(binding(connection,model,route)),capability:'tools',outcome:'passed',environment:'controlled',method:'Synthetic fixture tool call; no production model',at:'2026-10-24T08:00:00Z'}];
 assert.equal(report(connection,model,route,{evidence}).measurements[0].environment,'controlled');
 for(const changed of [{...connection,id:'other'}, {...connection,revision:'revision-2'}, {...connection,baseURL:'https://other.invalid'}, {...connection,protocol:'responses'}])assert.equal(report(changed,model,route,{evidence}).measurements.length,0);
 assert.equal(report(connection,{...model,id:'different'},route,{evidence}).measurements.length,0);assert.equal(report(connection,model,{id:'different'},{evidence}).measurements.length,0);
});
test('malformed or unsupported measurement records never become verification evidence',()=>{
 const bound=key(binding(connection,model,route)),valid={binding:bound,capability:'images',outcome:'passed',environment:'controlled',method:'Synthetic bounded response',at:'2026-10-24T08:00:00Z'};
 const evidence=[null,{}, {...valid,environment:'model-claim'}, {...valid,at:'not-a-date'}, {...valid,outcome:'probably'}, {...valid,capability:'all'}, {...valid,method:'x'.repeat(501)}];assert.deepEqual(report(connection,model,route,{evidence}).measurements,[]);
});

require('node:test')('tool observations record only bound metadata, label loopback controls and never store tool contents',()=>{
 const {toolRun,binding,key}=require('../core/model-support.cjs'),assert=require('node:assert/strict');
 const c={id:'one',baseURL:'http://127.0.0.1:1/v1',kind:'compatible'},m={id:'fixture'},r={id:'route'};const observed=toolRun(c,m,r);
 assert.equal(observed.environment,'controlled');assert.equal(observed.binding,key(binding(c,m,r)));assert.equal(toolRun({...c,baseURL:'https://example.org/v1'},m,r).environment,'provider');assert.equal(Object.hasOwn(observed,'content'),false);
});
require('node:test')('support evidence loads from a packaged core without a parent runtime-lock file',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');const root=await fs.mkdtemp(path.join(os.tmpdir(),'aura-support-package-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.cp(path.resolve(__dirname,'../core'),path.join(root,'core'),{recursive:true});assert.equal(typeof require(path.join(root,'core/model-support.cjs')).report,'function');
});
