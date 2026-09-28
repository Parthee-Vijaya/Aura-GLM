// Kun faste statusfelter. Ingen fritekst, stier, serveradresser eller kontooplysninger.
function diagnostics(input) {
  const choose = (value, values) => values.includes(value) ? value : 'ukendt';
  const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i.test(value) ? value : 'ukendt';
  return {
    format: 1, tidspunkt: new Date().toISOString(),
    app: version(input.version), system: choose(input.platform, ['darwin','win32','linux']), arkitektur: choose(input.arch, ['arm64','x64','ia32']),
    installationspakke: input.packaged === true,
    vaerktoejer: Object.fromEntries(['node','git','opencode'].map(key => [key, version(input.versions?.[key])])),
    projektAabent: input.project === true, aiAktiv: input.running === true,
    forhaandsvisning: choose(input.preview, ['idle','stopped','installing','starting','running','stopping','error']),
    noeglelagring: input.encryption === true ? 'tilgængelig' : 'ikke tilgængelig',
    senesteFejl: (input.failures || []).slice(-10).map(item => ({ omraade: choose(item.area, ['app','agent','forhaandsvisning','git','forbindelse']), type: choose(item.type, ['adgang','mangler-fil','handling','model','server']), tidspunkt: /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(item.at) ? item.at : 'ukendt' }))
  };
}
module.exports = { diagnostics };
