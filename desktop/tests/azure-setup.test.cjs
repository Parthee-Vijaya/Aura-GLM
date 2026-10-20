const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AzureSetup, subscriptions, apps } = require('../core/azure-setup.cjs');
const { AzureDeployment } = require('../core/deployment-providers.cjs');

const sub = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const subscription = (id = sub, name = 'Organisationens abonnement') => ({ id, name, state: 'Enabled', environmentName: 'AzureCloud', user: { name: 'privat@example.invalid' }, token: 'privat-token' });
const app = (name = 'webside', group = 'Drift(Øst)') => ({ id: `/subscriptions/${sub}/resourceGroups/${group}/providers/Microsoft.Web/staticSites/${name}`, name, defaultHostname: `${name}.azurestaticapps.net`, location: 'westeurope', identity: { principalId: 'privat-principal' }, tags: { intern: 'privat-tag' } });

test('Azure viser kun aktive abonnementer med felter, som bruges til valget', () => {
  const result = subscriptions([subscription(other, 'Zebra'), subscription(), subscription(), { ...subscription(), id: 'forkert' }, { ...subscription(other), state: 'Disabled' }, { ...subscription(other), environmentName: 'AzureUSGovernment' }]);
  assert.deepEqual(result, [{ id: sub, name: 'Organisationens abonnement' }, { id: other, name: 'Zebra' }]);
  assert.doesNotMatch(JSON.stringify(result), /privat|principal|token|user/);
  assert.throws(() => subscriptions({}), /liste/);
});

test('Azure-forbindelsen opdager værktøjer før login og skelner manglende abonnementer', async () => {
  const calls = [], run = async (exe, args) => {
    calls.push({ exe, args });
    if (args.includes('version')) return '{}';
    if (args.includes('--version')) return '2.0.7';
    if (args[0] === 'account') return JSON.stringify([subscription()]);
    throw Error('Ukendt kommando');
  };
  const setup = new AzureSetup(run), ready = await setup.state();
  assert.deepEqual(ready, { status: 'ready', tools: { azureCli: true, swaCli: true }, subscriptions: [{ id: sub, name: 'Organisationens abonnement' }] });
  assert.ok(calls.find(call => call.args.join(' ').startsWith('account list --refresh')));
  assert.equal(calls.some(call => call.args.includes('set') || call.args.includes('secrets') || call.args.includes('create')), false);
  const missing = new AzureSetup(async () => { throw Error('sti med privat indhold'); });
  assert.deepEqual(await missing.state(), { status: 'tools-required', tools: { azureCli: false, swaCli: false }, subscriptions: [] });
  const loggedOut = new AzureSetup(async (exe, args) => { if (args[0] === 'account') throw Error('privat-token'); return args[0] === 'version' ? '{}' : '2.0.7'; });
  assert.equal((await loggedOut.state()).status, 'login-required');
  const empty = new AzureSetup(async (exe, args) => args[0] === 'account' ? '[]' : args[0] === 'version' ? '{}' : '2.0.7');
  assert.equal((await empty.state()).status, 'no-subscriptions');
  const noSwa = new AzureSetup(async (exe, args) => { if (args[0] === '--version') throw Error('mangler'); return run(exe, args); });
  assert.equal((await noSwa.state()).status, 'tools-required');
});

test('Azure login startes særskilt uden at ændre CLI-indstillinger og dubleres ikke', async () => {
  let finish, loginOptions, calls = 0;
  const setup = new AzureSetup(async (_exe, args, options) => {
    if (args[0] === 'login') { calls++; loginOptions = options; return new Promise(resolve => { finish = resolve; }); }
    return args[0] === 'account' ? JSON.stringify([subscription()]) : args[0] === 'version' ? '{}' : '2.0.7';
  });
  const waiting = setup.login();
  await assert.rejects(setup.login(), /allerede/);
  assert.equal(calls, 1);
  assert.deepEqual(loginOptions.extra, { AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off' });
  finish(JSON.stringify([subscription()]));
  assert.equal((await waiting).status, 'ready');
  assert.equal(setup.pending, null);
  const failure = new AzureSetup(async () => { throw Error('privat token fra CLI'); });
  await assert.rejects(failure.login(), error => /Login blev ikke afsluttet/.test(error.message) && !error.message.includes('privat'));
  assert.equal(failure.pending, null);
});

test('Azure-appvalg udleder ressourcegruppen fra ID og afviser fremmede destinationer', async () => {
  const wrong = { ...app(), id: app().id.replace(sub, other) };
  const result = apps([app(), app(), wrong, { ...app(), name: 'et-andet-navn' }, { ...app(), defaultHostname: 'webside.azurestaticapps.net.evil.invalid' }, { ...app(), id: app().id + '/child' }], sub);
  assert.deepEqual(result, [{ id: app().id, name: 'webside', group: 'Drift(Øst)', subscription: sub, location: 'westeurope', host: 'webside.azurestaticapps.net' }]);
  assert.doesNotMatch(JSON.stringify(result), /privat|principal|tags/);
  let calls = 0;
  const setup = new AzureSetup(async (_exe, args) => { calls++; assert.deepEqual(args, ['staticwebapp', 'list', '--subscription', sub, '--only-show-errors', '--output', 'json']); return JSON.stringify([app()]); });
  assert.equal((await setup.apps(sub))[0].group, 'Drift(Øst)');
  await assert.rejects(setup.apps('--debug'), /listen/);
  assert.equal(calls, 1);
  const failed = new AzureSetup(async () => { throw Error('privat token'); });
  await assert.rejects(failed.apps(sub), error => /kunne ikke hentes/.test(error.message) && !error.message.includes('privat'));
  const empty = new AzureSetup(async () => '[]');
  assert.deepEqual(await empty.apps(sub), []);
});

test('Azure accepterer eksisterende ressourcegrupper med parenteser og danske tegn uden argumentinjektion', () => {
  const provider = new AzureDeployment();
  assert.ok(provider.args({ project: 'webside', group: 'Drift(Øst)', subscription: sub }).includes('--resource-group=Drift(Øst)'));
  assert.ok(provider.args({ project: 'webside', group: '--debug', subscription: sub }).includes('--resource-group=--debug'));
  for (const group of ['andet/projekt', 'gruppe.', 'gruppe\n--debug', 'gruppe;kommando', 'a'.repeat(91)]) {
    assert.throws(() => provider.args({ project: 'webside', group, subscription: sub }), /ressourcegruppe/);
  }
});
