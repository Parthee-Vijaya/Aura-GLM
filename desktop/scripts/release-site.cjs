const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.join(__dirname,'..');
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function generate(directory = path.join(root,'release')) {
 await fs.mkdir(directory,{recursive:true});
 const names = (await fs.readdir(directory)).filter(n=>/^AI-Harness-[a-zA-Z0-9.-]+\.(dmg|zip|exe)$/.test(n)).sort();
 const files=[];
 for(const name of names){ const data=await fs.readFile(path.join(directory,name));const sha256=createHash('sha256').update(data).digest('hex'); let notarized=false; try { const receipt=JSON.parse(await fs.readFile(path.join(directory,name+'.notarized.json'),'utf8')); notarized=receipt.status==='Accepted' && receipt.sha256===sha256; } catch {} files.push({name,bytes:data.length,sha256,notarized}); }
 let html=await fs.readFile(path.join(root,'../site/dist/desktop.html'),'utf8');
 const blocks=files.map(f=>`<article class="artifact"><a class="button" download href="${encodeURIComponent(f.name)}">Hent ${escape(f.name.includes('-mac-')?'Mac':'Windows')} · ${f.name.includes('arm64')?'ARM64':'x64'} · ${f.name.endsWith('.dmg')?'DMG':f.name.endsWith('.zip')?'ZIP':'installation'}</a><small>${!f.name.includes('-mac-')?'Windows-testpakke · se signering og afprøvning i teststatus':f.notarized?'Notariseret af Apple · billet kontrolleret':'Mac-testpakke · notarisation ikke dokumenteret for denne fil'}<br>${escape(f.name)} · ${(f.bytes/1024/1024).toFixed(0)} MB<br>SHA-256: ${f.sha256}</small></article>`).join('');
 html=html.replace(/<!-- artifacts -->[\s\S]*?<!-- \/artifacts -->/,`<p>Version ${escape(require('../package.json').version)}. Kun de faktisk byggede filer vises nedenfor. Mac: se notarisation ved den enkelte fil. Se <a href="https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/teststatus.md">teststatus</a> for denne versions signering og afprøvning. En bestået prøve af appen er ikke en prøve af installationsprogrammet.</p>${blocks || '<p>Ingen installationsfiler er bygget her endnu.</p>'}<p><a href="SHA256SUMS.txt">Kontrolsummer</a> · <a href="release.json">Filoversigt</a></p>`);
 await fs.writeFile(path.join(directory,'index.html'),html);
 await fs.copyFile(path.join(root,'../site/dist/desktop.css'),path.join(directory,'desktop.css'));
 await fs.writeFile(path.join(directory,'release.json'),JSON.stringify({version:require('../package.json').version,files},null,2)+'\n');
 await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),files.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');
 return files;
}
if(require.main===module)generate(process.argv[2] ? path.resolve(process.argv[2]) : undefined).then(files=>console.log(`${files.length} faktiske installationsfiler med kontrolsummer. Ingen upload.`)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={generate};
