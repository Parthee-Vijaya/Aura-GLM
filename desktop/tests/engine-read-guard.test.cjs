const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createReadGuard, writeReadGuard, writeSkills } = require('../core/engine.cjs');

async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-read-guard-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'projekt'), directory = path.join(base, 'motor');
  await fs.mkdir(root); await fs.mkdir(directory);
  await fs.writeFile(path.join(root, 'normal.txt'), 'Offentlig');
  await fs.writeFile(path.join(root, '.env'), 'Syntetisk privat');
  await fs.mkdir(path.join(root, 'references'));
  await fs.writeFile(path.join(root, 'references', 'valgt.txt'), 'Valgt materiale');
  await fs.writeFile(path.join(root, 'references', 'privat.txt'), 'Ikke valgt');
  const guard = createReadGuard({ fs, path, root, references: ['references/valgt.txt'] });
  const read = async file => { const output = { args: { filePath: file } }; await guard({ tool: 'read' }, output); return output.args.filePath; };
  return { base, root, directory, guard, read };
}

test('læsebeskyttelsen afviser beskyttede navne, casevarianter, streams og navnealiaser før læsning', async t => {
  const { root, read } = await fixture(t);
  for (const name of ['.env', '.ENV', '.env.local', 'api.KEY::$DATA', 'api.pem:stream', 'api.key.', 'api.key ', 'Secrets/value.txt', '.GIT/config', 'REFERENCES/privat.txt', '.ssh/id_rsa', '.AWS/credentials', '.gnupg/private-keys-v1.d/key', '.kube/config', '.azure/accessTokens.json', '.npmrc', '.pypirc']) {
    await assert.rejects(read(path.join(root, name)), /Aura beskytter denne fil/, name);
  }
  assert.equal(await read('normal.txt'), path.join(root, 'normal.txt'));
  assert.equal(await read('references/valgt.txt'), path.join(root, 'references', 'valgt.txt'));
});

test('en neutral symlink til en beskyttet fil afvises; et almindeligt link bliver kanoniseret', { skip: process.platform === 'win32' }, async t => {
  const { root, read } = await fixture(t);
  await fs.symlink(path.join(root, '.env'), path.join(root, 'offentligt-navn.txt'));
  await fs.symlink(path.join(root, 'normal.txt'), path.join(root, 'normalt-link.txt'));
  await fs.mkdir(path.join(root, '.ssh'));
  await fs.writeFile(path.join(root, '.ssh', 'id_rsa'), 'Synthetic credential');
  await fs.symlink(path.join(root, '.ssh', 'id_rsa'), path.join(root, 'neutral.txt'));
  await assert.rejects(read('offentligt-navn.txt'), /Aura beskytter denne fil/);
  await assert.rejects(read('neutral.txt'), /Aura beskytter denne fil/);
  assert.equal(await read('normalt-link.txt'), path.join(root, 'normal.txt'));
  await fs.rm(path.join(root, 'references', 'valgt.txt'));
  await fs.symlink(path.join(root, 'normal.txt'), path.join(root, 'references', 'valgt.txt'));
  await assert.rejects(read('references/valgt.txt'), /Aura beskytter denne fil/, 'En reference må ikke skifte til et andet mål');
});

test('den genererede plugin kvitterer for indlæsning og bevarer aktive skills referencefiler', async t => {
  const { root, directory } = await fixture(t);
  const skills = [{ name: 'harness-test', files: [{ path: 'SKILL.md', content: '# Prøve' }, { path: 'references/proeve.md', content: 'Offentlig skillreference' }] }];
  await writeSkills(directory, skills);
  const configured = await writeReadGuard(directory, root, ['references/valgt.txt'], skills);
  const plugin = await import(require('node:url').pathToFileURL(path.join(configured.pluginURL, 'index.mjs')).href), hooks = {};
  await plugin.default.setup({tool:{hook:async(name,fn)=>{ hooks[name]=fn; }}});
  assert.equal(JSON.parse(await fs.readFile(configured.readyPath, 'utf8')).token, configured.token);
  const skill = path.join(directory, 'config', 'skills', 'harness-test', 'references', 'proeve.md');
  const output = { tool:'read', input: { path:skill } };
  await hooks['execute.before'](output); assert.equal(output.input.path, skill);
  await assert.rejects(hooks['execute.before']({ tool:'read', input:{path:path.join(root,'.env')} }), /Aura beskytter/);
  await assert.rejects(hooks['execute.before']({ tool:'write', input:{path:path.join(root,'.ENV')} }), /Aura beskytter/);
  const otherTool = { tool:'write', input: { path: path.join(root, 'ordinary-new.txt') } };
  await hooks['execute.before'](otherTool);
  assert.equal(otherTool.input.path, path.join(root, 'ordinary-new.txt'), 'Almindelig skrivning beholder sin eksisterende tilladelsesvej');
});

test('file tool guard rejects protected write/edit and every patch source or move target', async t => {
  const { root, guard } = await fixture(t);
  for (const tool of ['write', 'edit']) {
    for (const name of ['.KUBE/config', 'PRIVATE.PEM', 'references/valgt.txt', 'public:credentials.json'])
      await assert.rejects(guard({ tool }, { args: { filePath: name } }), /Aura beskytter/, tool + ':' + name);
    const output = { args: { filePath: 'new/folder/page.html' } };
    await guard({ tool }, output);
    assert.equal(output.args.filePath, path.join(root, 'new/folder/page.html'));
  }
  for (const header of ['*** Add File: .KUBE/new.txt', '*** Update File: .KUBE/config', '*** Delete File: PRIVATE.PEM', '*** Update File: normal.txt\n*** Move to: .KUBE/moved.txt', '*** Update File: .KUBE/config\n*** Move to: normal.txt'])
    await assert.rejects(guard({ tool: 'patch' }, { args: { patchText: '*** Begin Patch\n' + header + '\n@@\n-Old\n+New\n*** End Patch' } }), /Aura beskytter/, header);
  const output = { args: { patchText: '*** Begin Patch\n*** Add File: new/page.html\n+<p>Ordinary</p>\n*** End Patch' } };
  await guard({ tool: 'patch' }, output);
  assert.equal(output.args.patchText, '*** Begin Patch\n*** Add File: ' + path.join(root, 'new/page.html') + '\n+<p>Ordinary</p>\n*** End Patch');
  await assert.rejects(guard({ tool: 'patch' }, { args: { patchText: 'unknown patch format' } }), /Aura beskytter/);
  for (const wrapper of [text => "<<'PATCH'\n" + text + '\nPATCH', text => 'cat <<"PATCH"\n' + text + '\nPATCH']) {
    const wrapped = { args: { patchText: wrapper('*** Begin Patch\n*** Environment ID: synthetic\n*** Add File: new/wrapped.txt\n+Ordinary\n*** End Patch') } };
    await guard({ tool: 'patch' }, wrapped);
    assert.ok(wrapped.args.patchText.includes('*** Add File: ' + path.join(root, 'new/wrapped.txt')));
    await assert.rejects(guard({ tool: 'patch' }, { args: { patchText: wrapper('*** Begin Patch\n*** Environment ID: synthetic\n*** Add File: .KUBE/new.txt\n+Private\n*** End Patch') } }), /Aura beskytter/);
  }
  for (const space of [' ', '\t', ' \t']) await assert.rejects(guard({ tool: 'patch' }, { args: {
    patchText: '*** Begin Patch\n*** Add File: public/allowed.txt\n+Ordinary\n' + space + '*** Add File: .KUBE/new.txt\n+Private\n*** End Patch'
  } }), /Aura beskytter/, 'native parser accepts indented headers: ' + JSON.stringify(space));
});

test('new file targets under symlinks are checked before any write approval', { skip: process.platform === 'win32' }, async t => {
  const { root, guard } = await fixture(t);
  await fs.mkdir(path.join(root, '.kube'));
  await fs.symlink(path.join(root, '.kube'), path.join(root, 'alias'));
  await assert.rejects(guard({ tool: 'write' }, { args: { filePath: 'alias/new/config' } }), /Aura beskytter/);
  await assert.rejects(guard({ tool: 'patch' }, { args: { patchText: '*** Begin Patch\n*** Add File: alias/new/config\n+Private\n*** End Patch' } }), /Aura beskytter/);
  await fs.symlink(path.join(root, '.kube/missing'), path.join(root, 'dangling'));
  await assert.rejects(guard({ tool: 'write' }, { args: { filePath: 'dangling' } }), /Aura beskytter/);
});

test('patch deletion or movement of a final symlink cannot unlink its target instead', { skip: process.platform === 'win32' }, async t => {
  const { root, guard } = await fixture(t);
  await fs.symlink('normal.txt', path.join(root, 'alias.txt'));
  for (const header of ['*** Delete File: alias.txt', '*** Update File: alias.txt\n*** Move to: moved.txt\n@@\n-Offentlig\n+Changed', '*** Update File: alias.txt\n*** End of File\n*** End of File\n*** Move to: moved.txt\n@@\n-Offentlig\n+Changed']) {
    const output = { args: { patchText: '*** Begin Patch\n' + header + '\n*** End Patch' } };
    await assert.rejects(guard({ tool: 'patch' }, output), /Aura beskytter/, header);
    assert.equal(await fs.readFile(path.join(root, 'normal.txt'), 'utf8'), 'Offentlig');
    assert.equal(await fs.readlink(path.join(root, 'alias.txt')), 'normal.txt');
  }
  // A directory alias does not change which final entry unlink removes.
  await fs.mkdir(path.join(root, 'ordinary'));
  await fs.writeFile(path.join(root, 'ordinary', 'page.txt'), 'Keep');
  await fs.symlink('ordinary', path.join(root, 'folder-alias'));
  const output = { args: { patchText: '*** Begin Patch\n*** Delete File: folder-alias/page.txt\n*** End Patch' } };
  await guard({ tool: 'patch' }, output);
  assert.match(output.args.patchText, new RegExp('Delete File: ' + path.join(root, 'ordinary', 'page.txt')));
});
