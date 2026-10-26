// SPDX-License-Identifier: EUPL-1.2
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {HybridCoordinator}=require('../core/privacy/hybrid.cjs');
const {PrivacyGate}=require('../core/privacy/index.cjs');
const {stable}=require('../core/privacy/policy.cjs');

test('hybrid interrupted context survives a second interruption immediately after the durable recovery checkpoint',async()=>{
  const layers={project:{enabled:true,version:'one',workMode:'hybrid',defaultClass:'public',maxClass:'internal',allowedDestinationIds:['local']}};
  const destination={id:'local',locality:'device',endpoint:'http://127.0.0.1:1/v1',model:'synthetic',account:'test',route:'',revision:'one'};
  const getPolicy=()=>structuredClone(layers),resolveDestination=()=>structuredClone(destination);
  const gate=new PrivacyGate({getPolicy,resolveDestination,audit:async()=>{}});
  let saved=null,phase=1;const executed=[];
  const shared={getPolicy,resolveDestination,getAuthoritySnapshot:()=>createHash('sha256').update(stable([layers,destination])).digest('hex'),gate,
    sessionStore:{load:async()=>structuredClone(saved),save:async(_scope,state)=>{
      saved=structuredClone(state);
      if(phase===2&&state.status==='checkpoint'&&!state.pending&&state.recovery.originalPrompt==='Continue A.')throw Error('Simulated crash after durable continuation checkpoint');
    }},
    recoverStage:async()=>({outcome:'rolled-back'}),acknowledgeStage:async()=>{},
    executeStage:async stage=>{
      executed.push({phase,id:stage.stageID,text:stage.materials.map(m=>m.text).join('\n')});
      if(phase===1&&stage.stageID==='assemble')throw Error('Stopped unfinished assembly');
      await stage.dispatch({body:JSON.stringify({messages:[{role:'user',content:'Synthetic local request'}]}),transport:()=>({ok:true})});
      return{text:phase===1?'PREVIOUS_SUCCESSFUL_PREPARATION':'Continued successfully.',sessionID:stage.engineSessionID||'preserved-session'};
    }};
  const input={scope:{root:'/synthetic/project',chat:'one'},taskID:'one',originalPrompt:'ORIGINAL_INTERRUPTED_TASK_A',localRef:'local',revision:1,
    stages:[{id:'prepare',kind:'local',purpose:'prepare',instruction:'Prepare locally.',inputs:['original']},{id:'assemble',kind:'local',purpose:'assemble',instruction:'Assemble locally.',inputs:['original','prepare']}]};
  await assert.rejects(new HybridCoordinator(shared).run(input));
  phase=2;await assert.rejects(new HybridCoordinator(shared).run({...input,taskID:'two',originalPrompt:'Continue A.',revision:2}));
  assert.ok(saved.recovery.references.some(([key,value])=>key==='recovered_context'&&value.text.includes('ORIGINAL_INTERRUPTED_TASK_A')));
  phase=3;await new HybridCoordinator(shared).run({...input,taskID:'three',originalPrompt:'Continue A.',revision:3});
  const resumed=executed.filter(stage=>stage.phase===3);assert.equal(resumed.length,2);
  for(const stage of resumed){assert.match(stage.text,/ORIGINAL_INTERRUPTED_TASK_A/);assert.match(stage.text,/PREVIOUS_SUCCESSFUL_PREPARATION/);}
  assert.equal(saved.status,'complete');
});
