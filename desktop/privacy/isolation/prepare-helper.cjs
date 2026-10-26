// SPDX-License-Identifier: EUPL-1.2
// Explicit developer/package preparation, never an implicit runtime fallback.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const run = promisify(execFile);
const { executableDigest } = require('./helper-integrity.cjs');
const sourcePath = path.join(__dirname, 'scope-reaper.c');
const defaultHelperPath = () => {
  const bundled = require('../../core/runtime.cjs').get();
  const root = bundled?.node ? path.dirname(path.dirname(path.dirname(bundled.node))) : path.join(__dirname, '..', '..', '.runtime', `${process.platform}-${process.arch}`);
  return path.join(root, 'privacy', 'aura-scope-reaper');
};
async function prepareHelper(output = defaultHelperPath(), { arch = process.arch } = {}) {
  if (process.platform !== 'darwin') throw new Error('The Privacy Gate process helper requires macOS.');
  if (!['arm64', 'x64'].includes(arch)) throw new Error('Unsupported Privacy Gate helper architecture.');
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o755 });
  const temporary = output + '.' + randomUUID();
  await run('/usr/bin/clang', ['-arch', arch === 'x64' ? 'x86_64' : 'arm64', '-std=c11', '-D_DARWIN_C_SOURCE', '-O2', '-Wall', '-Wextra', '-Werror', sourcePath, '-o', temporary], { timeout: 60000 });
  await fs.chmod(temporary, 0o755);
  if (arch === process.arch) {
    const result = JSON.parse((await run(temporary, ['--self-test'], { timeout: 5000 })).stdout);
    if (result.available !== true || result.implementation !== 'macos-seatbelt-scope-v1') throw new Error('The Privacy Gate process helper failed its host check.');
  }
  const [source, binary] = await Promise.all([fs.readFile(sourcePath), fs.readFile(temporary)]);
  const manifest = { version: 2, executableSha256: executableDigest(binary), platform: process.platform, arch, sourceSha256: createHash('sha256').update(source).digest('hex'), binarySha256: createHash('sha256').update(binary).digest('hex') };
  await fs.rename(temporary, output);
  await fs.writeFile(output + '.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 });
  return output;
}
module.exports = { prepareHelper, defaultHelperPath, sourcePath };
if (require.main === module) prepareHelper().then(file => console.log(file)).catch(error => { console.error(error.message); process.exitCode = 1; });
