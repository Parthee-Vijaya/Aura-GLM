// Real Workbench -> pinned OpenCode -> provider adapter -> gateway -> controlled HTTP.
// Controlled responses verify transport and mandatory design, not a live model's design quality.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createHash } = require('node:crypto');
const { Workbench } = require('../core/workbench.cjs');
async function scenario(kind, mode, design, surface = 'desktop') {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-primary-transport-')));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  const requests = [], events = [];
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/v1/chat/completions');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw); requests.push(body);
      const answer = mode === 'plan' ? '## Det bygger vi\nEn oversigt.\n\n## Sådan skal det se ud\nEt konkret designforslag.\n\n## Teknik og data\nLokale eksempeldata.\n\n## Det skal du prøve\nSøgning og tilmelding.' : 'Transportprøven er gennemført. Ingen projektfiler er ændret.';
      if (!body.stream) { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({choices:[{index:0,message:{role:'assistant',content:answer},finish_reason:'stop'}]})); }
      res.setHeader('content-type', 'text/event-stream');
      for (const [delta, finish] of [[{role:'assistant',content:answer},null],[{},'stop']]) res.write('data: '+JSON.stringify({id:'synthetic',object:'chat.completion.chunk',model:body.model,choices:[{index:0,delta,finish_reason:finish}],...(finish?{usage:{prompt_tokens:20,completion_tokens:20,total_tokens:40}}:{})})+'\n\n');
      res.end('data: [DONE]\n\n');
    } catch (error) { events.push({testError:error.message}); res.writeHead(500); res.end('{}'); }
  });
  let bench;
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    bench = new Workbench({directory:path.join(root,'data'),profiles:path.resolve(__dirname,'../../profiles'),surface,safeStorage:{},emit:event=>events.push(event)});
    const library=await bench.library();
    if (!library.skills.some(skill => skill.name === 'harness-aura-design')) library.skills.push({name:'harness-aura-design',title:'Syntetisk metode',summary:'Test',files:[{path:'SKILL.md',content:'---\nname: harness-aura-design\ndescription: Synthetic method\n---\n\nByg noget der fungerer.'}]});
    if (!library.features.find(f=>f.id==='design').skills.includes('harness-aura-design')) library.features.find(f=>f.id==='design').skills.push('harness-aura-design');
    await bench.activate({root:project,name:'Syntetisk prøve'});
    await bench.features.save(project,{scope:'projekt',values:{design}});
    if (!design) {
      await bench.store.update(state => { state.features = { chosen: 'valgt', on: { design: false } }; });
      await bench.store.saveProject(project, { features: { design: false } });
    }
    assert.equal((await bench.features.get(project)).effective.design, true);
    const modelID = kind === 'mistral' ? 'mistral-large-4' : 'corti-s1';
    bench.selection=async()=>({connection:{id:'synthetic',kind,name:'Lokal transportprøve',baseURL:`http://127.0.0.1:${server.address().port}/v1`},model:{id:modelID,name:modelID,tool_call:true,limit:{context:131072,output:4096}}});
    const text='En app til at melde sig til borgermøder i Nyborg Kommune';
    const review=await bench.prepare({mode,text});
    assert.equal(requests.length,0,'Review must not send anything');
    const core=review.appContext.components.find(p=>p.id==='Hovedskill til bygning');
    assert.equal(Boolean(core),mode !== 'chat');
    await bench.send({text,fingerprint:review.fingerprint,contextBinding:review.contextBinding});
    const deadline=Date.now()+60000;
    while(!events.some(e=>e.type==='run.status'&&['idle','error','stopped'].includes(e.status))) {
      if(Date.now()>deadline)throw Error('Transportprøven sluttede ikke');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal(events.find(e=>e.type==='run.status'&&['idle','error','stopped'].includes(e.status)).status,'idle');
    assert.ok(!events.some(e=>e.testError),JSON.stringify(events.filter(e=>e.testError)));
    const calls=requests.filter(body=>body.tools?.some(t=>t.function?.name==='skill'));
    assert.ok(calls.length>0,'Actual engine request with tools reached the controlled provider');
    const first=calls[0],system=first.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    assert.equal(first.model,modelID);
    if(core) assert.ok(system.includes(core.text),'First provider request includes exact reviewed core without a skill call');
    else assert.ok(!system.includes('HOVEDSKILL TIL BYGNING:'));
    assert.ok(system.includes('<name>harness-aura-design</name>'));
    assert.ok(first.messages.some(m=>m.role==='user'&&JSON.stringify(m.content).includes(text)));
    assert.deepEqual(await fs.readdir(project),[],'Transport test did not modify the project');
    return {kind,mode,design,surface,model:modelID,requests:calls.length,coreBytes:core?Buffer.byteLength(core.text):0,coreHash:core?createHash('sha256').update(core.text).digest('hex'):null,externalModelCalls:0,passed:true};
  } finally {
    await bench?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.rm(root,{recursive:true,force:true});
  }
}
(async()=>{
 const results=[];
 for(const args of [['mistral','plan',true],['mistral','free',true],['corti','plan',true],['corti','free',true],['corti','free',false],['mistral','free',true,'cli'],['mistral','chat',false]])results.push(await scenario(...args));
 console.log(JSON.stringify({passed:true,engine:require('../runtime-lock.json').opencode,evidence:'Controlled local server; no live design-quality claim',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
