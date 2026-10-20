const { test } = require('node:test');
const assert = require('node:assert/strict');
const { VercelSetup, project, deployment, portal, importURL } = require('../core/vercel-setup.cjs');

const selected = { id: 'prj_test', name: 'webside', rootDirectory: 'apps/web', link: { type: 'github', org: 'organisation', repo: 'webside', productionBranch: 'main', gitCredentialId: 'hemmelig' }, env: [{ value: 'hemmelig' }] };
const config = { provider: 'vercel', scope: 'mit-team', project: 'prj_test', repository: 'organisation/webside', productionBranch: 'main', name: 'webside', portal: 'https://vercel.com/mit-team/webside/settings/git' };
const sha = 'a'.repeat(40);
const build = patch => ({ uid: 'dpl_test', projectId: 'prj_test', source: 'git', state: 'READY', target: 'production', createdAt: 1792490400000, url: 'webside-test.vercel.app', meta: { githubOrg: 'organisation', githubRepo: 'webside', githubCommitRef: 'main', githubCommitSha: sha, githubCommitAuthorEmail: 'privat@example.invalid' }, ...patch });
function storeFixture() {
  let value = { draft: 'Brugerens tekst', deploymentConfig: { provider: 'azure' } };
  return { project: async () => value, saveProject: async (_root, patch) => { value = { ...value, ...patch }; return value; } };
}

test('Vercel viser saniterede teams og projekter på tværs af sider uden API-skrivninger', async () => {
  const calls = [], setup = new VercelSetup(storeFixture(), async (_exe, args) => {
    calls.push(args);
    if (args[0] === '--version') return 'Vercel CLI 56';
    assert.equal(args[args.indexOf('--method') + 1], 'GET');
    const route = args[1];
    if (route.startsWith('/v2/teams')) return JSON.stringify({ teams: [{ id: 'team_test', slug: 'mit-team', name: 'Mit team', billing: { email: 'privat@example.invalid' } }], pagination: {} });
    assert.equal(args[args.indexOf('--scope') + 1], 'mit-team');
    if (route.includes('until=123')) return JSON.stringify({ projects: [{ ...selected, id: 'prj_anden', name: 'anden' }], pagination: {} });
    return JSON.stringify({ projects: [selected], pagination: { next: 123 } });
  });
  assert.deepEqual(await setup.state(), { status: 'ready', teams: [{ id: 'team_test', slug: 'mit-team', name: 'Mit team' }] });
  assert.deepEqual(await setup.projects('mit-team'), [
    { id: 'prj_anden', name: 'anden', repository: 'organisation/webside', productionBranch: 'main', rootDirectory: 'apps/web', gitConnected: true },
    { id: 'prj_test', name: 'webside', repository: 'organisation/webside', productionBranch: 'main', rootDirectory: 'apps/web', gitConnected: true }
  ]);
  assert.equal(calls.length, 4);
  assert.equal(calls.some(args => args.includes('deploy') || args.includes('link') || args.includes('POST') || args.includes('PATCH')), false);
  assert.doesNotMatch(JSON.stringify(project(selected)), /hemmelig|env|Credential/);
  assert.equal(project({ ...selected, link: { type: 'gitlab', org: 'organisation', repo: 'webside' } }).gitConnected, false);
});

test('Vercel adskiller manglende CLI, login og tomt teamvalg', async () => {
  const noCli = new VercelSetup(storeFixture(), async () => { throw Error('privat sti'); });
  assert.deepEqual(await noCli.state(), { status: 'tools-required', teams: [] });
  const noLogin = new VercelSetup(storeFixture(), async (_exe, args) => { if (args[0] === '--version') return '56'; throw Error('privat token'); });
  assert.deepEqual(await noLogin.state(), { status: 'login-required', teams: [] });
  const empty = new VercelSetup(storeFixture(), async (_exe, args) => args[0] === '--version' ? '56' : '{"teams":[]}');
  assert.deepEqual(await empty.state(), { status: 'no-teams', teams: [] });
});

test('Vercel-login åbner browseren via CLI og tillader kun ét login ad gangen', async () => {
  let finish, calls = 0;
  const setup = new VercelSetup(storeFixture(), async (_exe, args, options) => {
    if (args[0] === 'login') {
      calls++;
      assert.deepEqual(args, ['login', '--no-color']);
      assert.equal(options.extra.CI, '', 'CI=1 ville få Vercel til at springe browseråbning over.');
      return new Promise(resolve => { finish = resolve; });
    }
    return args[0] === '--version' ? '56' : '{"teams":[]}';
  });
  const wait = setup.login();
  await assert.rejects(setup.login(), /allerede/);
  finish('Logget ind');
  assert.equal((await wait).status, 'no-teams');
  assert.equal(calls, 1);
  assert.equal(setup.pending, null);
});

test('Vercel-valg kræver det konkrete GitHub-link og gemmer ingen andre kontofelter', async () => {
  const store = storeFixture();
  let remote = selected, calls = 0;
  const setup = new VercelSetup(store, async (_exe, args) => { calls++; assert.equal(args[1], '/v9/projects/prj_test'); return JSON.stringify(remote); });
  assert.deepEqual(await setup.save('/projekt', { scope: config.scope, project: config.project, repository: config.repository, token: 'hemmelig' }), config);
  assert.equal((await store.project('/projekt')).draft, 'Brugerens tekst');
  assert.doesNotMatch(JSON.stringify(await store.project('/projekt')), /hemmelig/);
  for (const bad of [{ ...selected, id: 'prj_forkert' }, { ...selected, link: null }, { ...selected, link: { type: 'github', org: 'en-anden', repo: 'webside' } }]) {
    remote = bad;
    await assert.rejects(setup.save('/projekt', { scope: config.scope, project: config.project, repository: config.repository }), /matcher ikke/);
    assert.deepEqual(await setup.saved('/projekt'), config);
  }
  const beforeReset = calls;
  await setup.reset('/projekt');
  assert.equal(await setup.saved('/projekt'), null);
  assert.equal(calls, beforeReset);
  assert.deepEqual((await store.project('/projekt')).deploymentConfig, { provider: 'azure' });
});

test('Vercel-status matcher projekt, repository, Git-kilde, SHA, gren og miljø', async () => {
  assert.deepEqual(deployment(build(), config), { id: 'dpl_test', state: 'READY', sha, branch: 'main', environment: 'production', url: 'https://webside-test.vercel.app', at: '2026-10-20T10:00:00.000Z' });
  for (const bad of [
    build({ source: 'cli' }), build({ source: 'redeploy' }), build({ projectId: 'prj_forkert' }),
    build({ meta: { ...build().meta, githubRepo: 'et-andet' } }),
    build({ meta: { ...build().meta, githubCommitSha: 'kort' } }),
    build({ url: 'https://webside-test.vercel.app.evil.invalid' }), build({ deleted: 1 }), build({ createdAt: 'ukendt' })
  ]) assert.equal(deployment(bad, config), null);
  assert.equal(deployment(build(), config, { sha: 'b'.repeat(40) }), null);
  assert.equal(deployment(build(), config, { branch: 'test' }), null);
  const store = storeFixture(); await store.saveProject('/projekt', { vercelGit: config });
  const calls = [];
  const setup = new VercelSetup(store, async (_exe, args) => {
    calls.push(args);
    return JSON.stringify(args[1].startsWith('/v9/projects') ? selected : { deployments: [build({ source: 'cli', createdAt: 1792490500000 }), build()] });
  });
  const result = await setup.latestStatus('/projekt', { sha, branch: 'main' });
  assert.equal(result.latest.sha, sha);
  assert.equal(result.latest.environment, 'production');
  assert.match(calls[1][1], /projectId=prj_test.*sha=aaaa.*branch=main/);
  assert.doesNotMatch(JSON.stringify(result), /privat|hemmelig/);
});

test('Vercel viser ikke en tidligere status når Git-linket ændres eller statuslisten er tom', async () => {
  const store = storeFixture(); await store.saveProject('/projekt', { vercelGit: config });
  let remote = selected;
  const setup = new VercelSetup(store, async (_exe, args) => JSON.stringify(args[1].startsWith('/v9/projects') ? remote : { deployments: [] }));
  assert.equal((await setup.latestStatus('/projekt')).latest, null);
  remote = { ...selected, link: { ...selected.link, productionBranch: 'release' } };
  assert.equal((await setup.latestStatus('/projekt')).config.productionBranch, 'release');
  assert.equal((await store.project('/projekt')).vercelGit.productionBranch, 'main', 'Statuslæsning ændrer ikke brugerens gemte valg.');
  remote = { ...selected, link: null };
  await assert.rejects(setup.latestStatus('/projekt'), /matcher ikke/);
  assert.equal((await store.project('/projekt')).vercelGit.repository, config.repository);
  assert.equal(portal('mit-team', 'webside'), config.portal);
  assert.equal(importURL(), 'https://vercel.com/new');
  assert.throws(() => portal('https://example.invalid', 'webside'), /Vercel/);
});
