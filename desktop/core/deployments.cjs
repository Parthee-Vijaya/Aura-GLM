const { randomUUID, createHash } = require('node:crypto');
const path = require('node:path');
const { deploymentArtifact } = require('./deployment-artifact.cjs');
const { VercelDeployment, AzureDeployment, publicURL } = require('./deployment-providers.cjs');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function relative(value) { if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.startsWith('/')||value.split('/').some(p=>p==='..')||path.posix.normalize(value)!==value) throw Error('Angiv en relativ mappe uden ..'); return value; }
function configuration(input) {
  if(!input||!['vercel','azure'].includes(input.provider)||!['static','source','functions'].includes(input.mode)) throw Error('Vælg en understøttet udbyder og projekttype.');
  if(input.provider==='azure'&&input.mode==='source'||input.provider==='vercel'&&input.mode==='functions') throw Error('Projekttypen understøttes ikke af denne adapter.');
  const c={provider:input.provider,mode:input.mode,directory:relative(input.directory||'public')};
  for(const key of ['scope','project','subscription','group']) { const value=input[key]||''; if(typeof value!=='string'||value.length>200|| /[\x00-\x1f]/.test(value)) throw Error('Ugyldigt destinationsvalg.'); c[key]=value; }
  c.frontend=input.mode==='functions'?relative(input.frontend||'.'):'.'; c.api=input.mode==='functions'?relative(input.api||'api'):'';
  return c;
}
function validateArtifact(c,a) {
  const names=a.files.map(f=>f.file), prefix=c.provider==='azure'&&c.frontend!=='.'?c.frontend+'/':'';
  if(c.mode!=='source'&&!names.includes(prefix+'index.html')) throw Error('Den gemte frontendmappe mangler index.html. Byg og gem den rigtige version først.');
  if(c.mode==='static'&&names.some(f=>f==='package.json'||f==='vercel.json'||f==='swa-cli.config.json'||f.startsWith('api/')||f.startsWith('.github/'))) throw Error('Mappen indeholder server- eller buildkonfiguration. Vælg kildekode/Functions, eller vælg den færdigbyggede frontendmappe.');
  if(c.mode==='source') {
    const pkg=a.files.find(f=>f.file==='package.json');
    if(!pkg) throw Error('Kildekode kræver package.json i den valgte mappe.');
    try { JSON.parse(pkg.data); } catch { throw Error('package.json kan ikke læses.'); }
    if(!names.some(f=>['package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lock','bun.lockb'].includes(f))) throw Error('Gem en lockfil sammen med kildekoden, så afhængighederne kan genskabes.');
    const vc=a.files.find(f=>f.file==='vercel.json');
    if(vc) { let parsed; try { parsed=JSON.parse(vc.data); } catch { throw Error('vercel.json kan ikke læses.'); } if(parsed.alias||parsed.env||parsed.build?.env) throw Error('Flyt aliases og hemmelige miljøværdier ud af vercel.json. Testudgivelsen ændrer ikke produktionsadresser.'); }
  }
  if(c.provider==='azure'&&names.some(f=>f==='swa-cli.config.json'||f.startsWith('.github/'))) throw Error('Azure-pakken må ikke indeholde en separat SWA CLI- eller workflowkonfiguration. Vælg en mappe med de færdige filer.');
  if(c.mode==='functions' && (c.frontend==='.' || c.api==='.' || c.api===c.frontend || c.api.startsWith(c.frontend+'/') || c.frontend.startsWith(c.api+'/'))) throw Error('Frontend og Functions skal ligge i forskellige mapper.');
  if(c.mode==='functions'&&!names.includes(c.api+'/host.json')) throw Error('Functions-mappen mangler host.json. API’et skal være færdigbygget og selvstændigt; appen kører ingen lokal npm-installation.');
}
class Deployments {
  constructor(store,{providers,fetcher=(...args)=>fetch(...args),artifact=deploymentArtifact}={}) { this.store=store; this.providers=providers||{vercel:new VercelDeployment(),azure:new AzureDeployment()}; this.fetcher=fetcher;this.artifact=artifact;this.reviews=new Map(); }
  async state(root) { const p=await this.store.project(root); return {config:p.deploymentConfig||null,preference:p.startup?.hosting||'',last:p.deploymentLast||null}; }
  async review(root,input) {
    const config=configuration(input), artifact=await this.artifact(root,config.directory); validateArtifact(config,artifact);
    const target=await this.providers[config.provider].inspect(config);
    const token=randomUUID(); this.reviews.clear(); this.reviews.set(token,{root,config,head:artifact.head,hash:artifact.hash,targetHash:hash(target),expires:Date.now()+300000});
    await this.store.saveProject(root,{deploymentConfig:config});
    return {token,config,target,head:artifact.head,hash:artifact.hash,bytes:artifact.bytes,files:artifact.files.map(f=>f.file),environment:config.provider==='azure'?'harness-test':'preview',cost:'Forbrug og eventuelle omkostninger følger din hostingkonto. Appen har ingen verificeret pris eller automatisk udgiftsgrænse.',build:config.mode==='source'?'Udbyderen bygger kildekoden. Installations- og buildscripts kan køre og bruge projektets preview-miljøvariabler.':'Færdige filer uploades. Der køres ingen projektkommando lokalt.',material:'De viste filer fra denne Git-version sendes til hostingudbyderen. Hemmelighedskontrollen er heuristisk og finder ikke alt.'};
  }
  async settings(root) {
    const {config}=await this.state(root);
    if(!config) throw Error('Gennemgå en destination først.');
    return (await this.providers[config.provider].inspect(config)).portal;
  }
  async deploy(root,token) {
    const r=this.reviews.get(token);this.reviews.delete(token);
    if(!r||r.root!==root||r.expires<Date.now()) throw Error('Gennemgå udgivelsen igen.');
    const a=await this.artifact(root,r.config.directory), provider=this.providers[r.config.provider], target=await provider.inspect(r.config);
    if(a.head!==r.head||a.hash!==r.hash||hash(target)!==r.targetHash) throw Error('Version eller destination har ændret sig. Gennemgå udgivelsen igen.');
    const receipt={config:r.config,target,head:a.head,hash:a.hash,startedAt:new Date().toISOString(),state:'SUBMITTING',id:null,url:null,indexHash:r.config.mode!=='source'?a.files.find(f=>f.file===(r.config.provider==='azure'&&r.config.frontend!=='.'?r.config.frontend+'/':'')+'index.html')?.sha256:null};
    await this.store.saveProject(root,{deploymentLast:receipt});
    try { Object.assign(receipt,await provider.deploy(r.config,a,target)); }
    catch { receipt.state='UNKNOWN'; await this.store.saveProject(root,{deploymentLast:receipt}); throw Error('Upload blev ikke bekræftet. Kontrollér udbyderens oversigt før et nyt forsøg. Dit lokale projekt er bevaret.'); }
    await this.store.saveProject(root,{deploymentLast:receipt}); return receipt;
  }
  async check(root) {
    let receipt=(await this.store.project(root)).deploymentLast;
    if(!receipt?.id) throw Error('Der er ingen kendt udgivelse at kontrollere. Se udbyderens oversigt ved ukendt uploadresultat.');
    const provider=this.providers[receipt.config.provider], result=await provider.status(receipt.config,receipt);
    receipt={...receipt,...result,checkedAt:new Date().toISOString(),verification:'Udbyderens status er kontrolleret; siden er endnu ikke verificeret.'};
    if(receipt.state==='READY'&&receipt.url) {
      publicURL(receipt.url,receipt.config.provider==='vercel'?'.vercel.app':'.azurestaticapps.net');
      try {
        const response=await this.fetcher(receipt.url,{redirect:'manual',signal:AbortSignal.timeout(15000)});
        if(!response.ok || (response.status>=300&&response.status<400)) await response.body?.cancel();
        if(response.status===401||response.status===403) receipt.verification='Siden kræver adgang. Åbn linket med din konto og gennemgå appen.';
        else if(response.status>=300&&response.status<400) receipt.verification='Siden viderestiller. Åbn linket og kontrollér adgang og indhold.';
        else if(!response.ok) receipt.verification=`Siden svarede med HTTP ${response.status}.`;
        else if(receipt.indexHash) {
          const reader=response.body.getReader();let total=0;const chunks=[];
          for(;;) {const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>2*1024*1024){await reader.cancel();throw Error();}chunks.push(value);}
          receipt.verification=createHash('sha256').update(Buffer.concat(chunks)).digest('hex')===receipt.indexHash?'Startsiden svarer og matcher den godkendte fil. Øvrige brugerrejser skal gennemgås.':'Siden svarer, men indholdet matcher ikke den godkendte startside. Kontrollér udgivelsen.';
        } else {await response.body?.cancel();receipt.verification='Siden svarer med HTTP 200–299. Backend, login og øvrige brugerrejser skal stadig gennemgås.';}
      } catch { receipt.verification='Testadressen kunne ikke verificeres. Åbn linket og kontrollér udgivelsen.'; }
    }
    await this.store.saveProject(root,{deploymentLast:receipt});return receipt;
  }
}
module.exports={Deployments,configuration,validateArtifact};
