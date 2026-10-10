const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.join(__dirname,'..');
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function generate(directory = path.join(root,'release')) {
 await fs.mkdir(directory,{recursive:true});
 const names = (await fs.readdir(directory)).filter(n=>/^(Aura|AI-Harness)-[a-zA-Z0-9.-]+\.(dmg|zip|exe)$/.test(n)).sort();
 const files=[];
 for(const name of names){ const data=await fs.readFile(path.join(directory,name));const sha256=createHash('sha256').update(data).digest('hex'); let notarized=false; try { const receipt=JSON.parse(await fs.readFile(path.join(directory,name+'.notarized.json'),'utf8')); notarized=receipt.status==='Accepted' && receipt.sha256===sha256; } catch {} files.push({name,bytes:data.length,sha256,notarized}); }
 let html=await fs.readFile(path.join(root,'../site/dist/desktop.html'),'utf8');
 const blocks=files.map(f=>{
  const mac=f.name.includes('-mac-'),arm=f.name.includes('arm64');
  const label=mac?(arm?'Mac med Apple-chip':'Mac med Intel'):(arm?'Windows med ARM':'Windows');
  return `<article class="artifact"><a class="button" download href="${encodeURIComponent(f.name)}">Hent til ${label}${f.name.endsWith('.zip')?' · ZIP':''}</a><small>${(f.bytes/1024/1024).toFixed(0)} MB · ${!mac?'Testpakke til Windows; se signering og afprøvning i teststatus':f.notarized?'Notariseret af Apple · billet kontrolleret':'Testpakke til Mac; denne fils notarisation er ikke bekræftet'}</small><details><summary>Se detaljer</summary><small>${escape(f.name)}<br>SHA-256: ${f.sha256}</small></details></article>`;
 }).join('');
 html=html.replace(/<!-- artifacts -->[\s\S]*?<!-- \/artifacts -->/,`<p>Version ${escape(require('../package.json').version)}. Vælg din computer. Læs <a href="https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/teststatus.md">hvad der er afprøvet, og hvad der mangler</a>, før du installerer.</p>${blocks || '<p>Ingen installationsfiler er bygget her endnu.</p>'}<details><summary>Kontrolsummer og filoversigt</summary><p><a href="SHA256SUMS.txt">Kontrolsummer</a> · <a href="release.json">Filoversigt</a></p></details>`);
 await fs.writeFile(path.join(directory,'index.html'),html);
 await fs.copyFile(path.join(root,'../site/dist/desktop.css'),path.join(directory,'desktop.css'));
 await fs.writeFile(path.join(directory,'release.json'),JSON.stringify({version:require('../package.json').version,files},null,2)+'\n');
 await fs.writeFile(path.join(directory,'SHA256SUMS.txt'),files.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');
 return files;
}
if(require.main===module)generate(process.argv[2] ? path.resolve(process.argv[2]) : undefined).then(files=>console.log(`${files.length} faktiske installationsfiler med kontrolsummer. Ingen upload.`)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={generate};
