const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { findExecutable, VERSION, isolatedEnv, writePluginRuntime, pluginRuntimeFiles, pluginRuntimePatterns } = require('../core/engine.cjs');

// Små falske motorer som shell-scripts: en langsom, en med forkert version og en rigtig, der tæller sine kald.
const unix = { skip: process.platform === 'win32' };
async function engine(t, body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-motor-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'opencode'); await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return { dir, file };
}

test('en langsom motor i den pakkede app giver en forklaring om ventetid, ikke en udviklerkommando', unix, async t => {
  const { file } = await engine(t, 'sleep 5');
  await assert.rejects(findExecutable({ bundled: { opencode: file }, timeout: 300 }), error => /kunne ikke starte sin AI-motor i tide/.test(error.message) && !/npm run/.test(error.message));
});

test('en manglende eller forkert motor i den pakkede app beder om en ny installation', unix, async t => {
  const { file } = await engine(t, 'echo 0.0.1');
  await assert.rejects(findExecutable({ bundled: { opencode: file }, timeout: 5000 }), /Installer appen igen/);
  await assert.rejects(findExecutable({ bundled: { opencode: path.join(os.tmpdir(), 'findes-ikke', 'opencode') }, timeout: 5000 }), /Installer appen igen/);
});

test('en kontrolleret motor kontrolleres kun én gang pr. kørsel', unix, async t => {
  const { dir, file } = await engine(t, `echo x >> "$(dirname "$0")/kald"\necho ${VERSION}`);
  assert.equal(await findExecutable({ bundled: { opencode: file }, timeout: 5000 }), file);
  assert.equal(await findExecutable({ bundled: { opencode: file }, timeout: 5000 }), file);
  assert.equal((await fs.readFile(path.join(dir, 'kald'), 'utf8')).trim().split('\n').length, 1);
});
test('V2 plugin-opstart installerer ingen SDK og bruger et isoleret hjem', async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-plugin-start-'))); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await writePluginRuntime(dir); await writePluginRuntime(dir);
  assert.deepEqual(await fs.readdir(path.join(dir,'config')), []);
  assert.deepEqual(await pluginRuntimeFiles(), []); assert.deepEqual(await pluginRuntimePatterns(), []);
  const env = isolatedEnv(dir, {}, 'syntetisk', { commandIsolation: true });
  assert.equal(env.HOME, path.join(dir, 'home')); assert.equal(env.USERPROFILE, env.HOME); assert.equal(env.OPENCODE_TEST_HOME, env.HOME); assert.equal(env.SHELL, '/bin/bash');
  assert.equal(isolatedEnv(dir, {}, 'syntetisk').SHELL, undefined);
});
test('migrering fjerner kun Auras verificerede gamle SDK-links og efterlader ukendte data urørt', async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-plugin-migration-'))); t.after(() => fs.rm(dir,{recursive:true,force:true}));
  for (const folder of [path.join(dir,'config'),path.join(dir,'config','opencode')]) {
    await fs.mkdir(folder,{recursive:true});
    const dependencies={'@opencode-ai/plugin':'1.18.33'};
    await fs.writeFile(path.join(folder,'package.json'),JSON.stringify({name:'aura-agent-plugins',private:true,dependencies}));
    await fs.writeFile(path.join(folder,'package-lock.json'),JSON.stringify({name:'aura-agent-plugins',lockfileVersion:3,packages:{'':{dependencies},'node_modules/@opencode-ai/plugin':{version:'1.18.33'}}}));
    await fs.symlink('/missing/desktop/node_modules',path.join(folder,'node_modules'));
  }
  await writePluginRuntime(dir);
  assert.deepEqual(await fs.readdir(path.join(dir,'config')),['opencode']);
  await fs.writeFile(path.join(dir,'config','opencode.json'),'{"unexpected":true}');
  await assert.rejects(writePluginRuntime(dir),/indstillinger afviger/);
  assert.equal(await fs.readFile(path.join(dir,'config','opencode.json'),'utf8'),'{"unexpected":true}');
});
test('V2 versionsbanner accepteres kun med den præcise låste version', unix, async t => {
  const {file}=await engine(t,`echo 'opencode v${VERSION}'`);
  assert.equal(await findExecutable({bundled:{opencode:file}}),file);
});
