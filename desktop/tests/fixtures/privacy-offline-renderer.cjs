// Synthetic native negative fixture. Deliberately omits CSP/proxy/API stubs:
// failures must come from the OS boundary, not just browser interception.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),net=require('node:net'),http=require('node:http'),dgram=require('node:dgram');
const {spawn}=require('node:child_process');
const input=JSON.parse(process.argv.at(-1));
app.setPath('userData',path.join(input.state,'profile'));
app.on('window-all-closed',()=>{});app.on('before-quit',e=>e.preventDefault());
app.disableHardwareAcceleration();
const timeout=setTimeout(()=>app.exit(70),12000);
const attempt=async fn=>{try{await fn();return false;}catch{return true;}};
function tcp(host,port){return new Promise((resolve,reject)=>{const s=net.connect(port,host,()=>{s.end('SYNTHETIC-PROTECTED');resolve();});s.on('error',reject);s.setTimeout(1000,()=>{s.destroy();reject(Error());});});}
(async()=>{
 await app.whenReady();process.stderr.write('FIXTURE:ready\n');
 const results={hostReadDenied:await attempt(()=>fs.readFile(input.secret)),snapshotWriteDenied:await attempt(()=>fs.writeFile(path.join(input.root,'tamper.txt'),'changed')),loopbackDenied:await attempt(()=>tcp('127.0.0.1',input.tcpPort)),externalDenied:await attempt(()=>tcp('1.1.1.1',443))};
 process.stderr.write('FIXTURE:tcp-finished\n');results.udpDenied=await attempt(()=>new Promise((resolve,reject)=>{const sock=dgram.createSocket('udp4');const done=error=>{try{sock.close();}catch{} error?reject(error):resolve();};sock.once('error',done);sock.send('SYNTHETIC-PROTECTED',input.udpPort,'127.0.0.1',done);}));
 process.stderr.write('FIXTURE:udp-finished\n');results.subprocessDenied=await new Promise(resolve=>{const c=spawn('/bin/cat',[input.secret],{stdio:'ignore'});c.once('exit',code=>resolve(code!==0));});
 process.stderr.write('FIXTURE:subprocess-finished\n');const w=new BrowserWindow({show:false,width:640,height:480,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true,sandbox:true}});
 await w.loadURL('data:text/html,<h1>Offline negative fixture</h1>');
 process.stderr.write('FIXTURE:page-loaded\n');results.browser=await w.webContents.executeJavaScript(`(async()=>{
   const probe={fetch:false,websocket:false,rtcAvailable:typeof RTCPeerConnection==='function',transportAvailable:typeof WebTransport==='function',nodeUnavailable:typeof require==='undefined'};
   await fetch('http://127.0.0.1:${input.tcpPort}/SYNTHETIC-PROTECTED').then(()=>probe.fetch=true,()=>{});
   const ws=new WebSocket('ws://127.0.0.1:${input.tcpPort}/SYNTHETIC-PROTECTED'); ws.onopen=()=>{probe.websocket=true;ws.send('SYNTHETIC-PROTECTED');};
   const pc=new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${input.udpPort}'}]});pc.createDataChannel('synthetic');await pc.setLocalDescription(await pc.createOffer());
   await new Promise(r=>setTimeout(r,900));pc.close();ws.close();return probe;
 })()`);
 process.stderr.write('FIXTURE:browser-finished\n');results.png=(await w.webContents.capturePage()).toPNG().length>500;
 await fs.writeFile(path.join(input.state,'native-result.json'),JSON.stringify(results));clearTimeout(timeout);app.exit(0);
})().catch(error=>{process.stderr.write('FIXTURE:error:'+error.code+'\n');app.exit(70);});
