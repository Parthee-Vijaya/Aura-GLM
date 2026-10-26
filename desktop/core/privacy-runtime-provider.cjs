// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Main-process composition. A renderer/model can select references, never issue
// an isolation lease, declassify a source, or supply an executable/data rule.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PrivacyGateError, composePolicy, inheritClassification, stable } = require('./privacy/policy.cjs');
const { inspectRequest } = require('./privacy/inspector.cjs');
const { snapshotInputs } = require('./privacy/hybrid-snapshots.cjs');
const { HybridRuntime } = require('./privacy/hybrid-runtime.cjs');
const { HybridForkEngine } = require('./privacy/hybrid-fork-engine.cjs');
const { HybridSeatbeltWorkspaces } = require('./privacy/hybrid-seatbelt-workspaces.cjs');
const { FileProvenanceLedger } = require('./privacy/file-provenance-ledger.cjs');
const { CsvReleaseAuthority } = require('./privacy/hybrid-csv-release.cjs');
const connections = require('./connections.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const unavailable = () => new PrivacyGateError('PRIVACY_ISOLATION_UNAVAILABLE', 'Det beskyttede arbejdsmiljø er ikke tilgængeligt. Opgaven er stoppet uden at vælge en ekstern reserve.');
const stale = () => new PrivacyGateError('PRIVACY_STALE', 'Opgavens dataregler, filer eller modelvalg er ændret. Gennemgå opgaven igen.');
function runtimePaths() {
  const bundled = require('./runtime.cjs').get();
  const root = bundled ? path.dirname(path.dirname(path.dirname(bundled.node))) : path.resolve(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`);
  return { root, node: path.join(root,'node','bin','node'), opencode: path.join(root,'opencode','bin','opencode') };
}
class PrivacyRuntimeProvider {
  constructor(bench, { beforeConfigure = async () => {}, availability, createEngine, createGateway, workspaceFactory } = {}) {
    this.bench = bench; this.service = bench.privacy; this.beforeConfigure = beforeConfigure;
    this.dependencies = { availability, createEngine, createGateway, workspaceFactory };
    this.crypto = { encrypt: text => Buffer.from(bench.store.encrypt(text),'base64'), decrypt: bytes => bench.store.decrypt({secret:Buffer.from(bytes).toString('base64')}) };
    this.ledger = new FileProvenanceLedger({directory:path.join(bench.store.root,'privacy','provenance'), ...this.crypto});
  }
  async getAvailability() {
    if (!this.bench.store.encryptionAvailable()) return { hybrid:false, isolation:false };
    const runtime = runtimePaths();
    const probe = this.dependencies.availability || require('../privacy/isolation/engine-isolation.cjs').probeIsolationSupport;
    const native = typeof probe === 'function' ? await probe({runtimeRoot:runtime.root}) : null;
    return { hybrid:native?.available === true, isolation:native?.available === true, reason:native?.reason };
  }
  async requireAvailability() { if (!(await this.getAvailability()).isolation) throw unavailable(); }
  authority(scope, refs) { return sha(stable(refs.map(ref => this.service.snapshotBinding(scope,ref.connectionID)))); }
  async prepareHybrid(scope,pair) {
    this.service.validatePair(pair); await this.requireAvailability();
    const refs=[pair.local,pair.external], binding=this.authority(scope,refs);
    const local=await this.service.destination(pair.local), external=await this.service.destination(pair.external);
    if (local.locality !== 'device' || external.locality === 'device') throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED','Vælg en dokumenteret model på denne computer og en separat ekstern modtager.');
    for (const ref of refs) await this.resolveSelection(ref, scope);
    if (this.authority(scope,refs)!==binding) throw stale();
    return Object.freeze({isCurrent:()=>this.authority(scope,refs)===binding});
  }
  async resolveSelection(ref, scope) {
    const connection=await this.bench.connection(ref.connectionID);
    const model=(this.bench.catalogs.get(connection.id)||[]).find(item=>item.id===ref.modelID);
    if (!model) throw new PrivacyGateError('PRIVACY_STALE','Kontrollér forbindelsen og hent dens modelkatalog før beskyttet arbejde.');
    let route;
    if (ref.routeID) {
      const routes=this.bench.routeCatalogs?.get(connection.id+'\0'+model.id) || await this.bench.routes(connection.id,model.id,scope?.chat);
      route=routes.find(item=>item.id===ref.routeID);
      if (!route) throw stale();
    }
    return { connection, model, route, key:this.bench.store.decrypt(connection) };
  }
  async ledgerScope(scope,root=scope.root) {
    const canonical=await fs.realpath(root), stat=await fs.lstat(canonical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw stale();
    return {root:canonical, rootIdentity:`${stat.dev}:${stat.ino}`, projectRoot:scope.root};
  }
  async inheritedSources(scope,root=scope.root) {
    const layers=await this.service.policies(scope), ledgerScope=await this.ledgerScope(scope,root);
    const originalScope=root===scope.root?null:await this.ledgerScope(scope);
    return [...Object.values(layers).flatMap(layer=>layer?.protectedSources||[]), ...await this.ledger.sources(ledgerScope), ...(originalScope?await this.ledger.sources(originalScope):[])];
  }
  async inheritCopyLabels(projectRoot, sourceRoot, targetRoot, { assertCurrent } = {}) {
    const scope={kind:'project',root:projectRoot,chat:null};
    const source=await this.ledgerScope(scope,sourceRoot),target=await this.ledgerScope(scope,targetRoot);
    await this.ledger.inheritScope(source,target,{assertCurrent});
  }
  async prepareChat(chat,prepared) {
    const scope={kind:'conversation',root:chat.project.root,chat:chat.id};
    const layers=await this.service.policies(scope), policy=composePolicy(layers);
    if (!policy.enabled) return null;
    await this.requireAvailability();
    await this.service.ensureDataFloor(scope,policy.workMode === 'cloud-controlled' ? [] : await this.inheritedSources(scope,chat.root));
    const pair=layers.conversation?.hybridPair || layers.project?.hybridPair || layers.organization?.hybridPair;
    const ref={connectionID:prepared.connection.id,modelID:prepared.model.id,routeID:prepared.route?.id||''};
    if (policy.workMode==='hybrid') {
      await this.prepareHybrid(scope,pair);
      if (stable(ref)!==stable({...pair.external,routeID:pair.external.routeID||''})) throw stale();
    } else await this.service.assertSelection(scope,ref);
    const refs=policy.workMode==='hybrid'?[pair.local,pair.external]:[ref];
    return Object.freeze({ scope, mode:policy.workMode, pair:pair?structuredClone(pair):null, ref, authority:this.authority(scope,refs), refs });
  }
  assertPrepared(value) { if (!value || this.authority(value.scope,value.refs)!==value.authority) throw stale(); return true; }
  async createChatEngine({chat,prepared,onEvent,assertCurrent}) {
    const plan=prepared.privacy; this.assertPrepared(plan); await this.requireAvailability();
    const current=()=>{ if(assertCurrent()!==true) throw stale(); return this.assertPrepared(plan); };
    current(); const projectRoot=await fs.realpath(chat.root), ledgerScope=await this.ledgerScope(plan.scope,projectRoot);
    const originalLedgerScope=projectRoot===plan.scope.root?null:await this.ledgerScope(plan.scope);
    const snapshots=await snapshotInputs(projectRoot,prepared.context,prepared.references);
    const policy=composePolicy(await this.service.policies(plan.scope));
    const refs=plan.refs, destinations=await Promise.all(refs.map(ref=>this.service.destination(ref)));
    const binding=sha(stable({scope:plan.scope,root:projectRoot,policy:policy.binding,destinations,skills:snapshots.sha256}));
    const directory=path.join(this.bench.store.root,'privacy','workers',binding);
    await fs.mkdir(directory,{recursive:true,mode:0o700});
    if (await fs.realpath(directory)!==directory) throw unavailable();
    const allSources=await this.inheritedSources(plan.scope,projectRoot); current();
    const historyFloor=await this.service.getDataFloor(plan.scope);
    const sourceProvenance=plan.mode==='cloud-controlled'?(historyFloor?[historyFloor]:[]):allSources;
    const selections=await Promise.all(refs.map(ref=>this.resolveSelection(ref,plan.scope))); current();
    const priceKey=ref=>stable({...ref,routeID:ref.routeID||''});
    const selected=new Map(refs.map((ref,i)=>[priceKey(ref),selections[i]]));
    const prices=new Map(refs.map((ref,i)=>[priceKey(ref),connections.priceFor(selections[i].connection,selections[i].model,selections[i].route)]));
    const runtime=runtimePaths();
    let engine;
    const admitted=[];
    const checkCloudFile=async (file,stage)=>{
      current();
      if (!(file.bytes instanceof Uint8Array) || Buffer.from(file.bytes).includes(0)) return false;
      let text; try { text=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes); } catch { return false; }
      const checked=inspectRequest(JSON.stringify({messages:[{role:'user',content:JSON.stringify({path:file.path,content:text})}]}),policy);
      const fileIdentity=[{path:file.path,sha256:sha(file.bytes)}];
      const prior=[...await this.ledger.provenance(ledgerScope,fileIdentity), ...(originalLedgerScope?await this.ledger.provenance(originalLedgerScope,fileIdentity):[])]; current();
      const matched=allSources.filter(source=>source.path && (file.path===source.path || file.path.startsWith(source.path+'/')));
      const inherited=inheritClassification(policy,[...matched,...prior,...checked.visibleSources]);
      if (checked.changed || checked.hasPersonalData || checked.hasSecrets || inherited.uninspectable || ['confidential','strict'].includes(inherited.classification) || inherited.attributes.personalData || inherited.attributes.secrets) return false;
      admitted.push(inherited); return true;
    };
    const workspaceFactory=options=>this.dependencies.workspaceFactory ? this.dependencies.workspaceFactory(options) : new HybridSeatbeltWorkspaces({
      ...options, runtimeRoot:runtime.root, getAuthoritySnapshot:()=>this.authority(plan.scope,refs), checkCloudFile,
      requestWritebackApproval:(p,stage)=>engine.ask(p,stage), onWritebackEvent:(event,stage)=>engine.emit(event,stage),
      recordProvenance:async(changes,stage)=>{
        current();
        const entries=changes.filter(change=>change.sha256!==null).map(change=>({...change,provenance:[inheritClassification(policy,[...sourceProvenance,...change.provenance])] }));
        if (entries.length) await this.ledger.record(ledgerScope,entries,{assertCurrent:current});
      },
      onApplied:(name,bytes)=>{ if(chat.task){chat.task.aiFiles.add(name);chat.task.aiHashes.set(name,bytes===null?null:sha(bytes));} }
    });
    const common={
      directory, projectRoot, ...this.crypto, scope:plan.scope, workspaceFactory, closeAfterStage:true, cleanupTimeoutMs:15000,
      getPolicy:scope=>this.service.policies(scope), getAuthoritySnapshot:()=>this.authority(plan.scope,refs),
      resolveDestination:ref=>this.service.destination(ref), resolveSelection:async ref=>{const chosen=await this.resolveSelection(ref,plan.scope);prices.set(priceKey(ref),connections.priceFor(chosen.connection,chosen.model,chosen.route));selected.set(priceKey(ref),chosen);return chosen;}, gate:this.service.gate,
      assertCurrent:current, audit:entry=>this.service.audit(entry),
      resolveLocalChoice:(cause,details={})=>this.service.resolveLocalChoice(cause,{...details,scope:plan.scope,assertCurrent:current}),
      getLocalSourceProvenance:async()=>{current();const sources=await this.inheritedSources(plan.scope,projectRoot);current();return sources;},
      getRequestProvenance:async()=>({provenance:plan.mode==='cloud-controlled'?[...sourceProvenance,...admitted]:[],assertCurrent:current}),
      ...(this.dependencies.createEngine?{createEngine:this.dependencies.createEngine}:{}), ...(this.dependencies.createGateway?{createGateway:this.dependencies.createGateway}:{})
    };
    const shared={ assertCurrent:current, authorizeStage:()=>current(), onEvent, task:()=>chat.task,
      selection:{binding}, snapshots, projectRoot, mode:prepared.mode, sourceProvenance,
      images:prepared.chatMaterials?.files.filter(file=>file.kind==='image')||[],
      requireExistingSession:chat.data.privacySession?.binding===binding,
      persistMarker:async state=>{current();chat.data=await this.bench.history.updateChat(chat.project.root,chat.id,data=>{current();data.privacySession={binding,state,mode:plan.mode};});current();},
      stageSelection:(_kind,ref)=>{const chosen=ref&&selected.get(priceKey(ref));return chosen?{connectionID:chosen.connection.id,modelID:chosen.model.id,modelName:chosen.model.name||chosen.model.id,routeID:chosen.route?.id||'',contextWindow:connections.modelLimits(chosen.connection,chosen.model).context}:undefined;},
      stagePrice:(kind,ref)=>{if(ref)return prices.get(priceKey(ref));const chosen=plan.mode==='hybrid'?selections[kind==='local'?0:1]:selections[0];return connections.priceFor(chosen.connection,chosen.model,chosen.route);}
    };
    if (plan.mode==='hybrid') {
      engine=new HybridForkEngine({...shared, canShareOriginal:text=>{
        current();try { const checked=inspectRequest(JSON.stringify({messages:[{role:'user',content:text}]}),policy); const inherited=inheritClassification(policy,[...sourceProvenance,...checked.visibleSources]);return !checked.changed&&!checked.hasPersonalData&&!checked.hasSecrets&&!inherited.uninspectable&&!['confidential','strict'].includes(inherited.classification)&&!inherited.attributes.personalData&&!inherited.attributes.secrets; } catch{return false;}
      }, releaseMaterials:({revision,signal})=>this.releases(plan,revision,signal,current),
      createRuntime:hooks=>new HybridRuntime({...common,...hooks,localRef:plan.pair.local,externalRef:plan.pair.external})});
    } else {
      const {IsolatedForkEngine,IsolatedRuntime}=require('./privacy/isolated-fork-engine.cjs');
      engine=new IsolatedForkEngine({...shared,locality:destinations[0].locality,
        createRuntime:hooks=>new IsolatedRuntime({...common,...hooks,destinationRef:plan.ref})});
    }
    current(); return engine;
  }
  async releases(plan,revision,signal,current) {
    current();
    const refs=plan.refs||[plan.pair.local,plan.pair.external], authorityBinding=this.authority(plan.scope,refs);
    const assertAuthority=()=>{current();if(this.authority(plan.scope,refs)!==authorityBinding)throw stale();};
    const config=await this.service.privateConfig('hybrid-sources.json'), definitions=config.sources||[]; assertAuthority();
    if (!Array.isArray(definitions)||definitions.length>64) throw stale();
    const sources=definitions.filter(source=>source.projectRoot===plan.scope.root), loaded=new Map();
    if(new Set(sources.map(source=>source.id)).size!==sources.length)throw stale();
    // Every later claim repeats a bounded, no-follow read. Bind both the bytes
    // and the directory/file identities: a same-byte replacement or a symlink
    // in an ancestor must not inherit the original source's release authority.
    const readStable=(root,file,{maxBytes=1_000_000,optional=false,privateFile=false}={})=>{
      if(path.resolve(root)!==root||path.resolve(file)!==file||!file.startsWith(root+path.sep))throw stale();
      const parents=()=>{
        const chain=[];let directory=root;
        for(const component of [null,...path.relative(root,path.dirname(file)).split(path.sep).filter(Boolean)]){
          if(component!==null)directory=path.join(directory,component);
          let stat;try{stat=fsSync.lstatSync(directory);}catch(error){if(optional&&error.code==='ENOENT')return {chain,missing:directory};throw stale();}
          if(!stat.isDirectory()||stat.isSymbolicLink()||fsSync.realpathSync(directory)!==directory)throw stale();
          chain.push([directory,stat.dev,stat.ino,stat.mode]);
        }
        return {chain};
      };
      const beforeParents=parents();
      if(beforeParents.missing)return {fingerprint:sha(stable(beforeParents)),bytes:null};
      let fd;
      try{
        try{fd=fsSync.openSync(file,fsSync.constants.O_RDONLY|fsSync.constants.O_NOFOLLOW);}
        catch(error){if(optional&&error.code==='ENOENT'){const after=parents();if(stable(after)!==stable(beforeParents))throw stale();return {fingerprint:sha(stable([after,'absent'])),bytes:null};}throw stale();}
        const stamp=stat=>[stat.dev,stat.ino,stat.size,stat.mode,stat.uid,stat.nlink,stat.mtimeMs,stat.ctimeMs];
        const before=fsSync.fstatSync(fd);
        if(!before.isFile()||before.nlink!==1||before.size>maxBytes||privateFile&&(before.uid!==process.getuid?.()||before.mode&0o077))throw stale();
        const buffer=Buffer.alloc(before.size+1);let size=0;
        while(size<buffer.length){const read=fsSync.readSync(fd,buffer,size,buffer.length-size,size);if(!read)break;size+=read;}
        const after=fsSync.fstatSync(fd),named=fsSync.lstatSync(file),afterParents=parents();
        if(size!==before.size||named.isSymbolicLink()||stable(stamp(before))!==stable(stamp(after))||stable(stamp(after))!==stable(stamp(named))||stable(beforeParents)!==stable(afterParents))throw stale();
        const bytes=buffer.subarray(0,size);return {bytes,fingerprint:sha(stable([afterParents,stamp(after),sha(bytes)]))};
      }catch(error){if(error instanceof PrivacyGateError)throw error;throw stale();}finally{if(fd!==undefined)fsSync.closeSync(fd);}
    };
    const ledgerScope=await this.ledgerScope(plan.scope);assertAuthority();
    const ledgerFile=this.ledger.file(ledgerScope);
    // Capture the ledger around the initial asynchronous read. Subsequent
    // claims recompute this source's labels synchronously: legitimate writeback
    // of an unrelated file must not revoke the approved, unchanged CSV.
    const ledgerBinding=()=>sha(stable([ledgerFile,ledgerFile+'.required'].map(file=>readStable(this.bench.store.root,file,{maxBytes:2_000_000,optional:true,privateFile:true}).fingerprint)));
    const sourceLabels=(saved)=>{
      const {validated,resolveSources}=require('./privacy/file-provenance-ledger.cjs');
      const read=readStable(this.bench.store.root,ledgerFile,{maxBytes:2_000_000,optional:true,privateFile:true});
      const anchor=readStable(this.bench.store.root,ledgerFile+'.required',{maxBytes:64,optional:true,privateFile:true});
      if(anchor.bytes&&!anchor.bytes.equals(Buffer.from(sha(JSON.stringify(ledgerScope)))))throw stale();
      if(saved.ledgerRequired&&!anchor.bytes||anchor.bytes&&!read.bytes)throw stale();
      saved.ledgerRequired ||= !!anchor.bytes;
      if(!read.bytes)return [];
      let labels;try{const plain=this.crypto.decrypt(read.bytes);if(typeof plain!=='string'||Buffer.byteLength(plain)>2_000_000)throw stale();labels=validated(JSON.parse(plain));}catch{throw stale();}
      if(labels.scope!==sha(JSON.stringify(ledgerScope)))throw stale();
      const resolve=resolveSources(labels),samePath=labels.entries.filter(entry=>entry.path===saved.path),exact=samePath.filter(entry=>entry.sha256===saved.hash);
      const sameBytes=labels.entries.filter(entry=>entry.sha256===saved.hash);
      return [...sameBytes,...(exact.length?[]:samePath)].flatMap(entry=>resolve(entry.sha256));
    };
    const canonical=value=>value.normalize('NFKC').replace(/\\/g,'/').toLocaleLowerCase('en-US');
    const authority=new CsvReleaseAuthority({getPolicy:scope=>this.service.policies(scope),resolveDestination:ref=>this.service.destination(ref),
      resolveSource:async(scope,ref)=>{
        assertAuthority();const source=sources.find(item=>item.id===ref.id);
        if(!source||typeof source.path!=='string'||path.isAbsolute(source.path)||source.path.split(/[\\/]/).some(part=>!part||part==='.'||part==='..'))throw stale();
        const file=path.join(scope.root,source.path),read=readStable(scope.root,file),hash=sha(read.bytes),labelsBinding=ledgerBinding();
        const policy=composePolicy(await this.service.policies(scope));assertAuthority();
        const matched=policy.protectedSources.filter(label=>[source.path,file].some(name=>canonical(name)===canonical(label.path)||canonical(name).startsWith(canonical(label.path)+'/')));
        const prior=await this.ledger.provenance(ledgerScope,[{path:source.path,sha256:hash}]);assertAuthority();
        if(ledgerBinding()!==labelsBinding||readStable(scope.root,file).fingerprint!==read.fingerprint)throw stale();
        const inherited=inheritClassification(policy,[source,...matched,...prior]);
        const text=new TextDecoder('utf8',{fatal:true}).decode(read.bytes);
        const saved={file,path:source.path,hash,textHash:sha(text),fingerprint:read.fingerprint,inherited,source,matched,policy,ledgerRequired:false};
        if(stable(inheritClassification(policy,[source,...matched,...sourceLabels(saved)]))!==stable(inherited))throw stale();
        loaded.set(source.id,saved);
        return {id:source.id,text,revision:hash,...inherited};
      }, assertSourceCurrent:(scope,ref,source)=>{
        assertAuthority();const saved=loaded.get(ref.id);
        if(!saved||saved.hash!==source.revision||saved.textHash!==source.sha256||stable(saved.inherited)!==stable({classification:source.classification,attributes:source.attributes,uninspectable:source.uninspectable}))throw stale();
        if(stable(inheritClassification(saved.policy,[saved.source,...saved.matched,...sourceLabels(saved)]))!==stable(saved.inherited)||readStable(scope.root,saved.file).fingerprint!==saved.fingerprint)throw stale();
        assertAuthority();return true;
      }});
    const result=[];for(const source of sources){current();const release=await authority.release({scope:plan.scope,sourceRef:{id:source.id},destinationRef:plan.pair.external,purpose:'hybrid-cloud-help',revision,signal});result.push({key:`csv_${result.length}`,release});}
    return result;
  }
}
module.exports={PrivacyRuntimeProvider,runtimePaths};
