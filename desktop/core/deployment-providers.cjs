const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function command(executable, args, { cwd = os.tmpdir(), input, extra = {}, timeout = 60000 } = {}) {
  if (!path.isAbsolute(executable)) {
    const local=path.join(os.homedir(), '.local', 'bin', executable);
    if(existsSync(local)) executable=local;
  }
  const env = Object.fromEntries(['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SystemRoot','TEMP','TMP','TMPDIR'].filter(k => process.env[k]).map(k => [k,process.env[k]]));
  Object.assign(env, { NO_COLOR:'1', CI:'1', VERCEL_TELEMETRY_DISABLED:'1', ...extra });
  return new Promise((resolve,reject) => {
    const child = execFile(executable,args,{cwd,env,timeout,maxBuffer:32*1024*1024,windowsHide:true},(error,stdout)=>error ? reject(new Error(error.code==='ENOENT'?'Hostingværktøjet blev ikke fundet. Kontrollér installationen eller angiv programmets fulde sti ved appstart.':'Hostingværktøjet kunne ikke gennemføre handlingen. Kontrollér installation, login og destination. Ved upload kan resultatet være ukendt; kontrollér udbyderen før et nyt forsøg.')) : resolve(stdout));
    child.stdin.on('error',()=>{}); child.stdin.end(input);
  });
}
const identifier = value => { if(typeof value!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(value)) throw Error('Angiv et gyldigt navn eller ID.'); return value; };
const azureResourceGroup = value => { if(typeof value!=='string'||!/^[\p{L}\p{N}_.()-]{1,90}$/u.test(value)||value.endsWith('.')) throw Error('Vælg en gyldig Azure-ressourcegruppe.'); return value; };
const azureAppName = value => identifier(value);
function publicURL(value, suffix) { const u=new URL(value.startsWith('https://')?value:'https://'+value); if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.endsWith(suffix)||u.pathname!=='/'||u.search||u.hash) throw Error('Udbyderen returnerede en ukendt adresse.'); return u.origin; }
class VercelDeployment {
  constructor(run=command) { this.run=run; this.id='vercel'; }
  async api(config, route, body) {
    const args=['api',route,'--scope',identifier(config.scope),'--raw','--non-interactive'];
    if(body) args.push('--method','POST','--input','-');
    const text=await this.run(process.env.HARNESS_VERCEL_PATH||'vercel',args,{input:body?JSON.stringify(body):undefined});
    try { return JSON.parse(text); } catch { throw Error('Vercel gav et uventet svar. Kontrollér destinationen før nyt forsøg.'); }
  }
  async inspect(config) {
    const p=await this.api(config,'/v9/projects/'+identifier(config.project));
    if(!p.id||!p.name) throw Error('Vercel-projektet kunne ikke findes.');
    const history=await this.api(config,'/v6/deployments?projectId='+identifier(p.id)+'&target=production&state=READY&limit=1');
    if(!history.deployments?.some(d=>d.target==='production'&&d.state==='READY')) throw Error('Vercel kan promovere første udgivelse til produktion. Opret først en startversion i et særskilt testprojekt via Vercel; appen uploader ikke til tomme Vercel-projekter.');
    if(p.rootDirectory) throw Error('Vercel-projektet har en særskilt rodmappe. Vælg et testprojekt uden denne indstilling; appen uploader den valgte mappe som rod og ændrer ikke projektindstillinger.');
    if(config.mode==='static' && [p.framework,p.buildCommand,p.installCommand,p.outputDirectory].some(Boolean)) throw Error('Vercel-projektet har buildindstillinger. Vælg kildekode eller et separat statisk testprojekt med standardindstillinger. Appen ændrer ikke indstillingerne.');
    return {id:p.id,name:p.name,owner:p.accountId,settings:{framework:p.framework??null,buildCommand:p.buildCommand??null,installCommand:p.installCommand??null,outputDirectory:p.outputDirectory??null,rootDirectory:p.rootDirectory??null,nodeVersion:p.nodeVersion},access:p.ssoProtection?'Vercel-loginbeskyttelse er konfigureret; kontrollér hvem der har adgang.':'Adgang er ikke verificeret. Behandl testlinket som offentligt, indtil adgangsreglerne er kontrolleret.',environmentKeys:(p.env||[]).filter(e=>e.target?.includes('preview')).map(e=>e.key).sort(),portal:`https://vercel.com/${identifier(config.scope)}/${identifier(p.name)}/settings`,region:'Afhænger af projekt og tjenester; statiske filer kan distribueres globalt.'};
  }
  async deploy(config,artifact,target) {
    const body={name:target.name,project:target.id,files:artifact.files.map(f=>({file:f.file,data:f.data.toString('base64'),encoding:'base64'})),meta:{harnessCommit:artifact.head,harnessArtifact:artifact.hash}};
    // Førsteudgivelser afvises i inspect. Udeladt target giver derefter preview.
    const result=await this.api(config,'/v13/deployments',body);
    if(!result.id||result.target==='production') throw Error('Udgivelsen gav et uventet resultat. Kontrollér Vercel.');
    return {id:identifier(result.id),state:result.readyState||'QUEUED',url:result.url?publicURL(result.url,'.vercel.app'):null};
  }
  async status(config,receipt) {
    const d=await this.api(config,'/v13/deployments/'+identifier(receipt.id));
    if(d.target==='production'||(d.projectId&&d.projectId!==receipt.target.id)) throw Error('Udgivelsen matcher ikke den valgte testdestination.');
    return {state:d.readyState||d.status||'UNKNOWN',url:d.url?publicURL(d.url,'.vercel.app'):null};
  }
}
class AzureDeployment {
  constructor(run=command) { this.run=run; this.id='azure'; }
  args(c) { return ['--name',azureAppName(c.project),'--resource-group='+azureResourceGroup(c.group),'--subscription',identifier(c.subscription),'--only-show-errors','--output','json']; }
  async az(args) { try { return JSON.parse(await this.run(process.env.HARNESS_AZ_PATH||'az',['staticwebapp',...args])); } catch { throw Error('Azure kunne ikke læses. Kontrollér Azure CLI-login, abonnement og Static Web App.'); } }
  async inspect(c) {
    const p=await this.az(['show',...this.args(c)]);
    if(!p.id||!p.defaultHostname) throw Error('Azure Static Web App blev ikke fundet.');
    await this.run(process.env.HARNESS_SWA_PATH||'swa',['--version']);
    return {id:p.id,name:p.name,host:p.defaultHostname,region:p.location||'Ukendt',settings:{sku:p.sku?.name||'Ukendt'},access:'Testmiljø er ikke i sig selv adgangsbeskyttelse. Kontrollér Azure-roller og ruteregler.',environmentKeys:[],portal:'https://portal.azure.com/#resource'+p.id,environmentNote:'Functions-hemmeligheder skal opsættes særskilt i testmiljøet i Azure. Frontendfiler er offentligt indhold.'};
  }
  async deploy(c,artifact) {
    const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'harness-azure-'));
    try {
      const content=path.join(temporary,'content'); await fs.mkdir(content);
      for(const f of artifact.files) { const file=path.join(content,f.file); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,f.data,{flag:'wx'}); }
      const secret=await this.az(['secrets','list',...this.args(c)]);
      if(!secret.properties?.apiKey) throw Error('Azure gav ingen deploymentnøgle.');
      const args=['deploy',path.join(content,c.frontend), '--app-location',content,'--env','harness-test','--no-use-keychain'];
      if(c.api) args.push('--api-location',path.join(content,c.api),'--api-language','node','--api-version','22');
      await this.run(process.env.HARNESS_SWA_PATH||'swa',args,{cwd:temporary,timeout:600000,extra:{SWA_CLI_DEPLOYMENT_TOKEN:secret.properties.apiKey,SWA_CLI_DEBUG:'silent'}});
      return {id:'harness-test',state:'UPLOADED',url:null};
    } finally { await fs.rm(temporary,{recursive:true,force:true}); }
  }
  async status(c,receipt) {
    const list=await this.az(['environment','list',...this.args(c)]);
    const e=list.find(x=>(x.buildId||x.name?.split('/').pop())==='harness-test');
    if(!e || !(Date.parse(e.lastUpdatedOn)>=Date.parse(receipt.startedAt))) return {state:'AWAITING_UPDATE',url:null};
    return {state:e.status==='Ready'?'READY':e.status||'UNKNOWN',url:e.hostname?publicURL(e.hostname,'.azurestaticapps.net'):null};
  }
}
module.exports={VercelDeployment,AzureDeployment,command,publicURL,azureResourceGroup,azureAppName};
