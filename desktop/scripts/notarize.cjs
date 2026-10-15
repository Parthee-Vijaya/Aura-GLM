// Kør kun efter udtrykkeligt tilvalg med en lokal notarytool-profil.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const run = promisify(execFile);
(async()=>{
 const file=path.resolve(process.argv[2]||''), profile=process.argv[3];
 const zip=file.endsWith('.zip');
 if(process.platform!=='darwin'||(!file.endsWith('.dmg')&&!zip)||!profile) throw new Error('Brug: node scripts/notarize.cjs sti/til/pakke.dmg-eller-zip profilnavn');
 await fs.access(file);
 const {stdout}=await run('xcrun',['notarytool','submit',file,'--keychain-profile',profile,'--wait','--output-format','json'],{timeout:1800000,maxBuffer:1024*1024});
 const result=JSON.parse(stdout);
 if(result.status!=='Accepted') throw new Error(`Apple godkendte ikke pakken. Status: ${result.status}; indsendelse: ${result.id}. Hent Apples log til fejlsøgning.`);
 if(!zip){
  await run('xcrun',['stapler','staple',file],{timeout:180000});
  await run('xcrun',['stapler','validate',file],{timeout:180000});
 } else {
  // ZIP kan ikke staples. Appen skal have sin billet, inden det endelige arkiv oprettes.
  const unpack=await fs.mkdtemp(path.join(os.tmpdir(),'aura-notary-zip-'));
  try {
   await run('ditto',['-x','-k',file,unpack],{timeout:180000});
   const bundle=path.join(unpack,'Aura.app');
   await run('codesign',['--verify','--deep','--strict',bundle],{timeout:180000});
   await run('xcrun',['stapler','validate',bundle],{timeout:180000});
   await run('syspolicy_check',['distribution',bundle],{timeout:180000});
  } finally { await fs.rm(unpack,{recursive:true,force:true}); }
 }
 const sha256=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 await fs.writeFile(file+'.notarized.json',JSON.stringify({file:path.basename(file),sha256,status:'Accepted',id:result.id,checkedAt:new Date().toISOString()},null,2));
 console.log('Apple har godkendt filen; billet og indhold er kontrolleret. Genbyg downloadoversigten med npm run release:site.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
