const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startGateway } = require('../core/gateway.cjs');
test('HTTP-fejl og afbrudt strøm stopper nye modelkald, men brugerens Stop er ikke en model-fejl', async t => {
  let mode='key', requests=0;
  const server=http.createServer(async(req,res)=>{requests++;for await(const _ of req){};if(mode==='key'){res.writeHead(401);return res.end('privat leverandørsvar');}res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: {"partial":true}\n\n');if(mode==='stream')setTimeout(()=>res.destroy(),20);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  for(const scenario of ['key','stream','stop']){
    mode=scenario;const events=[];const gateway=await startGateway({kind:'compatible',baseURL:`http://127.0.0.1:${server.address().port}/v1`},{id:'test'},'',null,text=>events.push(text));
    const send=()=>fetch(gateway.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gateway.token}`},body:JSON.stringify({model:'test'})});
    const before=requests;try{const response=await send();if(scenario==='stop')gateway.abort();if(scenario==='key'){assert.equal(response.status,401);assert.match(await response.text(),/API-nøglen/);}else await assert.rejects(response.text());
      assert.equal(events.length,scenario==='stop'?0:1);assert.equal(events.join('').includes('privat leverandør'),false);assert.equal((await send()).status,409);assert.equal(requests,before+1);
    }finally{await gateway.close();}
  }
});
