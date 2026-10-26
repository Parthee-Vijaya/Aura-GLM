// SPDX-License-Identifier: EUPL-1.2
// Synthetic-only fixture. All paths/endpoints are provided by the test host.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function accessProbe(config) {
  const read = file => { try { fs.readFileSync(file); return true; } catch { return false; } };
  const write = file => { try { fs.writeFileSync(file, 'synthetic-write'); return true; } catch { return false; } };
  return { insideRead: read(path.join(process.cwd(), 'inside.txt')), outsideRead: read(config.outsideRead), outsideWrite: write(config.outsideWrite), insideWrite: write(path.join(process.cwd(), 'inside-output.txt')) };
}
async function probe(config) {
  const access = accessProbe(config);
  const network = await new Promise(resolve => {
    const request = http.get(config.endpoint, response => { response.resume(); resolve(true); });
    request.on('error', () => resolve(false)); request.setTimeout(700, () => { request.destroy(); resolve(false); });
  });
  const localBind = await new Promise(resolve => {
    const server = net.createServer(); server.once('error', () => resolve(false));
    server.listen(0, '127.0.0.1', () => server.close(() => resolve(true)));
  });
  const child = spawnSync(process.execPath, [__filename, '--child', JSON.stringify(config)], { cwd: process.cwd(), encoding: 'utf8', timeout: 3000 });
  let descendant = null; try { descendant = JSON.parse(child.stdout); } catch {}
  return { ...access, network, localBind, descendant, descendantExit: child.status };
}
module.exports = { probe };
if (require.main === module) {
  const config = JSON.parse(process.argv[3]);
  if (process.argv[2] === '--child') process.stdout.write(JSON.stringify(accessProbe(config)));
  else probe(config).then(result => {
    process.stdout.write('PREVIEW_BOUNDARY_RESULT=' + JSON.stringify(result) + '\n');
    // Keep the process alive long enough for native scope attestation/retirement.
    setInterval(() => {}, 1000);
  }).catch(() => { process.exitCode = 1; });
}
