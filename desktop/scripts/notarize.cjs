// Kør kun efter udtrykkeligt tilvalg med en lokal notarytool-profil.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const run = promisify(execFile);
(async()=>{
 const file=path.resolve(process.argv[2]||''), profile=process.argv[3];
 if(process.platform!=='darwin'||!file.endsWith('.dmg')||!profile) throw new Error('Brug: node scripts/notarize.cjs sti/til/pakke.dmg profilnavn');
 await fs.access(file);
 const {stdout}=await run('xcrun',['notarytool','submit',file,'--keychain-profile',profile,'--wait','--output-format','json'],{timeout:1800000,maxBuffer:1024*1024});
 const result=JSON.parse(stdout);
 if(result.status!=='Accepted') throw new Error(`Apple godkendte ikke pakken. Status: ${result.status}; indsendelse: ${result.id}. Hent Apples log til fejlsøgning.`);
 await run('xcrun',['stapler','staple',file],{timeout:180000});
 await run('xcrun',['stapler','validate',file],{timeout:180000});
 const sha256=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 await fs.writeFile(file+'.notarized.json',JSON.stringify({file:path.basename(file),sha256,status:'Accepted',id:result.id,checkedAt:new Date().toISOString()},null,2));
 console.log('Apple har godkendt DMG-filen; billetten er vedhæftet og kontrolleret. Genbyg downloadoversigten med npm run release:site.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
