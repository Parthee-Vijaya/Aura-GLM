const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startGateway } = require('../core/gateway.cjs');
const { startFakeProvider } = require('../scripts/fixtures/fake-provider.cjs');
test('HTTP-fejl og afbrudt strøm stopper nye modelkald, men brugerens Stop er ikke en model-fejl', async t => {
  const provider=await startFakeProvider({synthetic:true,model:'test',script:[{status:401},{text:'Partial synthetic answer.',abort:'after-content'},{text:'Partial synthetic answer.',pauseAfterContentMs:60000}]});
  t.after(()=>provider.close());
  for(const scenario of ['key','stream','stop']){
    const events=[];const gateway=await startGateway({kind:'compatible',baseURL:provider.url},{id:'test'},provider.key,null,text=>events.push(text));
    const send=()=>fetch(gateway.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gateway.token}`},body:JSON.stringify({model:'test',stream:true})});
    const before=provider.requests.length;try{const response=await send();if(scenario==='stop')gateway.abort();if(scenario==='key'){assert.equal(response.status,401);assert.match(await response.text(),/API-nøglen/);}else await assert.rejects(response.text());
      assert.equal(events.length,scenario==='stop'?0:1);assert.equal(events.join('').includes('Synthetic provider failure'),false);assert.equal((await send()).status,409);assert.equal(provider.requests.length,before+1);
    }finally{await gateway.close();}
  }
});
