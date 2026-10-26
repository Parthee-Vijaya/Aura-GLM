const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),dgram=require('node:dgram'),{spawn}=require('node:child_process');
const {makeProfile,createOfflineRendererIsolation}=require('../privacy/isolation/engine-isolation.cjs');
const {inspectProtectedApp,electronRuntime}=require('../privacy/isolation/offline-renderer.cjs');
const native=process.platform==='darwin';
async function fixture(t){const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aura-offline-renderer-native-')));for(const n of ['snapshot','state'])await fs.mkdir(path.join(base,n),{mode:0o700});t.after(()=>fs.rm(base,{recursive:true,force:true}));return{base,root:path.join(base,'snapshot'),state:path.join(base,'state')};}
test('offline renderer profile is readonly input and zero network, with PID-bound GUI IPC',()=>{
 const profile=makeProfile({workspaceRoot:'/private/input',stateRoot:'/private/state',runtimeRoot:'/runtime',trustedReadRoots:[],trustedReadFiles:[],kind:'renderer',bundleId:'org.ai-alliancen.harness'});
 assert.doesNotMatch(profile,/allow network-/);assert.doesNotMatch(profile,/allow file-write\* \(subpath "\/private\/input"/);
 assert.match(profile,/MachPortRendezvousServer.*param "PROCESS_PID"/);assert.doesNotMatch(profile,/allow mach-lookup\)/);
 const offline=makeProfile({workspaceRoot:'/private/input',stateRoot:'/private/state',runtimeRoot:'/runtime',trustedReadRoots:[],trustedReadFiles:[],kind:'offline'});
 assert.doesNotMatch(offline,/allow network-|windowserver|iokit-open|mach-register/);
});
test('native renderer cannot send via Node, subprocess, HTTP, WebSocket or WebRTC, or read host originals', {skip:!native,timeout:25000},async t=>{
 const{base,root,state}=await fixture(t),secret=path.join(base,'host-original.txt');await fs.writeFile(secret,'SYNTHETIC-PROTECTED-ORIGINAL');
 const tcp=net.createServer(s=>{tcpBytes++;s.on('data',b=>tcpBytes+=b.length);s.destroy();}),udp=dgram.createSocket('udp4');let tcpBytes=0,udpBytes=0;udp.on('message',b=>udpBytes+=b.length);
 await new Promise(r=>tcp.listen(0,'127.0.0.1',r));await new Promise(r=>udp.bind(0,'127.0.0.1',r));t.after(()=>{tcp.close();udp.close();});
 const runtime=await electronRuntime(),script=path.resolve(__dirname,'fixtures/privacy-offline-renderer.cjs');
 const lease=await createOfflineRendererIsolation({workspaceRoot:root,stateRoot:state,runtimeRoot:runtime.runtimeRoot,bundleId:runtime.bundleId,trustedReadFiles:[script,path.resolve(__dirname,'../package.json'),path.resolve(__dirname,'../../package.json')]});
 t.after(()=>lease.dispose());
 const spec=await lease.launchSpec(runtime.executable,['--no-sandbox',script,JSON.stringify({root,state,secret,tcpPort:tcp.address().port,udpPort:udp.address().port})],{stdio:['ignore','ignore','pipe']});
 const child=spawn(spec.file,spec.args,spec.options);let diagnostics='';child.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(0,6000);});const stopTimer=setTimeout(()=>lease.dispose(),15000);t.after(()=>clearTimeout(stopTimer));const completed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,sig)=>code===0?resolve():reject(Error('native-fixture-failed '+code+' '+sig+' '+diagnostics)));});
 await lease.attest();await completed;const stopped=await lease.dispose();assert.equal(stopped.writersStopped,true);assert.equal(stopped.matchingProcesses,0);
 const result=JSON.parse(await fs.readFile(path.join(state,'native-result.json')));
 for(const key of ['hostReadDenied','snapshotWriteDenied','loopbackDenied','externalDenied','udpDenied','subprocessDenied','png'])assert.equal(result[key],true,key);
 assert.equal(result.browser.rtcAvailable,true);assert.equal(result.browser.nodeUnavailable,true);assert.equal(result.browser.fetch,false);assert.equal(result.browser.websocket,false);
 assert.equal(tcpBytes,0);assert.equal(udpBytes,0);assert.equal(await fs.readFile(secret,'utf8'),'SYNTHETIC-PROTECTED-ORIGINAL');
});
test('protected quality runs real desktop/mobile and click inspection in private OS scope', {skip:!native,timeout:25000},async t=>{
 const{base,root}=await fixture(t);await fs.mkdir(path.join(root,'public'));const html='<html><style>body{background:white;color:#123;font:20px system-ui;padding:24px}button{font:20px system-ui;padding:10px}</style><main><h1>Private static fixture</h1><button onclick="this.textContent=\'Done\'">Test</button></main></html>';await fs.writeFile(path.join(root,'public/index.html'),html);
 const report=await inspectProtectedApp({root,directory:path.join(base,'reports')});
 assert.equal(report.status,'checked',JSON.stringify(report));assert.equal(report.isolation.network,'none');assert.equal(report.isolation.writersStopped,true);assert.equal(report.isolation.matchingProcesses,0);assert.equal(report.screenshots.length,2);assert.equal(report.clicks,1);
 for(const screenshot of report.screenshots){const data=await fs.readFile(screenshot);assert.ok(data.length>500);assert.equal(data.toString('ascii',1,4),'PNG');}
 assert.equal(await fs.readFile(path.join(root,'public/index.html'),'utf8'),html);
 assert.equal(await fs.stat(path.join(path.dirname(report.screenshots[0]),'snapshot')).then(()=>true,()=>false),false);
});
test('stopped protected inspection never starts a renderer or returns an image', {skip:!native},async t=>{const{base,root}=await fixture(t);const c=new AbortController();c.abort();const r=await inspectProtectedApp({root,signal:c.signal,directory:path.join(base,'reports')});assert.equal(r.status,'cancelled');assert.equal(r.screenshots,undefined);});
test('Stop retires an active protected renderer and removes only its private inspection copy', {skip:!native,timeout:15000},async t=>{
 const{base,root}=await fixture(t);await fs.mkdir(path.join(root,'public'));const html='<h1>Active synthetic page</h1><script>setInterval(()=>{document.body.dataset.tick=String(Date.now())},10)</script>';await fs.writeFile(path.join(root,'public/index.html'),html);
 const directory=path.join(base,'reports'),controller=new AbortController();
 const running=inspectProtectedApp({root,directory,signal:controller.signal});
 let active=false;
 for(let i=0;i<100;i++) {const entries=await fs.readdir(directory).catch(()=>[]);for(const entry of entries)if(await fs.stat(path.join(directory,entry,'state/session')).then(()=>true,()=>false))active=true;if(active)break;await new Promise(r=>setTimeout(r,25));}
 assert.equal(active,true,'separate browser session started');const start=Date.now();controller.abort();const report=await running;
 assert.equal(report.status,'cancelled');assert.ok(Date.now()-start<5000);assert.deepEqual(await fs.readdir(directory),[]);assert.equal(await fs.readFile(path.join(root,'public/index.html'),'utf8'),html);
});
