const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { Workbench } = require('../core/workbench.cjs');
async function setup(t, start = async()=>{}, summarize = async()=>{}) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-context-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const project=path.join(root,'project');await fs.mkdir(project);
 const sends=[]; let starts=0;const bench=new Workbench({directory:path.join(root,'data'),profiles:path.resolve(__dirname,'../../profiles'),safeStorage:{},emit(){},engineFactory:()=>({active:true,session:{id:'synthetic'},start:async()=>{starts++;await start(bench)},messages:async()=>[{}],summarize:async()=>summarize(bench),send:async(text,system)=>{sends.push({text,system})},abort:async()=>{},close:async()=>{}})});t.after(()=>bench.close());await bench.activate({root:project,name:'Syntetisk projekt'});
 bench.selection=async()=>({connection:{id:'fixture',kind:'compatible',name:'Syntetisk',baseURL:'http://127.0.0.1:1/v1'},model:{id:'fixture'}});
 return {bench,project,sends,starts:()=>starts,prepare:()=>bench.prepare({mode:'chat',connectionID:'fixture',modelID:'fixture',text:'Hej'})};
}

for(const mode of ['chat','plan','build','free'])test(mode+': necessary questions are encouraged without changing chosen mode or plan authority',async t=>{
 const f=await setup(t);f.bench.chat.plan={id:'chosen',text:'Approved user plan',context:'Local demo'};
 const d=await f.bench.prepare({mode,planID:'chosen',connectionID:'fixture',modelID:'fixture',text:'Byg en oversigt'});
 await f.bench.send({text:'Byg en oversigt',fingerprint:d.fingerprint,contextBinding:d.contextBinding});
 assert.equal(f.sends.length,1);assert.match(f.sends[0].system,/højst tre relevante spørgsmål/);assert.match(f.sends[0].system,/Brugeren kan altid skrive sit eget svar/);
 assert.equal(f.bench.chat.runMode,mode);if(mode==='build')assert.equal(f.bench.chat.plan.id,'chosen');
});
