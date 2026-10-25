// Metadata-only authenticated catalogue checks; no inference or settings mutation.
const {app,safeStorage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('../../desktop/core/store.cjs');
const models=require('../../desktop/core/connections.cjs');
const configPath=process.argv[2],report=process.argv[3];
require('node:fs').mkdirSync(report,{recursive:false});
app.setName('Aura');app.setPath('userData',path.join(report,'native-profile'));app.on('window-all-closed',()=>{});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
app.whenReady().then(async()=>{
 const config=JSON.parse(await fs.readFile(configPath,'utf8')),results=[];
 for(const t of config.targets){
  const raw=await fs.readFile(t.settings),state=JSON.parse(raw);const c=state.connections.find(c=>c.id===t.connectionID&&c.kind===t.provider);
  if(!c?.secret)throw Error('Encrypted connection reference not found');
  const identity=JSON.parse(await fs.readFile(path.join(path.dirname(t.settings),'noeglering.json'),'utf8'));if(identity.navn!=='Aura')throw Error('Unexpected keychain identity');
  const store=new Store(path.join(report,t.provider),safeStorage),key=store.decrypt(c);
  const result={provider:t.provider,model:t.model,endpoint:c.baseURL,checkedAt:new Date().toISOString(),inferenceCalls:0};
  try{
   const all=await models.listModels(c,key);const m=all.find(m=>m.id===t.model);result.found=Boolean(m);
   if(m){result.catalogue=m;result.supportedEffort=models.effortLevels(c,m);result.effectiveLimits=models.modelLimits(c,m);result.routes=await models.routes(c,key,m.id);}
   if(c.kind==='openrouter'){await models.requestJSON(c.baseURL+'/key',{key});result.authenticatedKeyAccepted=true;}
  }catch(e){result.error=e.message;}
  result.sourceSettingsUnchanged=hash(raw)===hash(await fs.readFile(t.settings));results.push(result);
 }
 await fs.writeFile(path.join(report,'catalogue.json'),JSON.stringify(results,null,2),{mode:0o600});console.log(JSON.stringify(results));app.exit();
}).catch(e=>{console.error(e.message);app.exit(1);});
