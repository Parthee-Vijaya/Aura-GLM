const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pagesConfiguration, pagesWorkflow, validatePagesArtifact, GitHubPagesDeployment, CloudflarePagesDeployment, verifyMaterial, verifyCloudflare, siteURL, publicAddress, fetchSite } = require('../core/pages-publishing.cjs');
const head = 'a'.repeat(40), artifactHash = 'b'.repeat(64);
const base = { provider: 'github-pages', repository: 'organisation/blomst', branch: 'main', directory: 'public' };
const cf = { ...base, provider: 'cloudflare', accountId: 'c'.repeat(32), project: 'blomst' };
const artifact = { head, hash: artifactHash };

function github(config = base, overrides = {}) {
  const calls = [], workflow = pagesWorkflow(config);
  const provider = {
    calls,
    state: async () => ({ connected: true, expired: false, login: 'bruger' }),
    async api(route, options = {}) {
      calls.push({ route, options });
      if (overrides.api) { const answer = await overrides.api(route, options); if (answer !== undefined) return answer; }
      if (route === `/repos/${config.repository}`) return { id: 42, full_name: config.repository, private: false, permissions: { push: true } };
      if (route.includes('/branches/')) return { commit: { sha: overrides.head || head } };
      if (route.includes('/contents/')) return { type: 'file', encoding: 'base64', content: Buffer.from(overrides.content ?? workflow.content).toString('base64') };
      if (route.endsWith('/pages')) return { html_url: 'https://organisation.github.io/blomst/', public: true, build_type: overrides.buildType || 'workflow' };
      if (route.includes('/actions/secrets/')) return { name: 'CLOUDFLARE_API_TOKEN' };
      if (route.includes('/actions/workflows/') && !route.includes('/runs') && !route.endsWith('/dispatches')) return { id: 13, state: 'active' };
      if (route.endsWith('/dispatches')) return null;
      throw Error(`Uventet testkald: ${route}`);
    }
  };
  return provider;
}

test('Pages-konfiguration afviser kode, kommandotekst og usikre stier', () => {
  assert.equal(pagesConfiguration(base).mode, 'static');
  assert.throws(() => pagesConfiguration({ ...base, mode: 'source' }), /færdigbygget/);
  for (const directory of ['.', '../public', 'public/../dist', '/tmp/public', 'public;pwd', '${{ secrets.A }}', '.git', 'public//a']) assert.throws(() => pagesConfiguration({ ...base, directory }));
  for (const branch of ['main;pwd', '$(pwd)', '-delete', 'a..b', 'a//b']) assert.throws(() => pagesConfiguration({ ...base, branch }));
  assert.throws(() => pagesConfiguration({ ...cf, accountId: 'forkert' }));
  assert.throws(() => pagesConfiguration({ ...cf, project: '--version' }));
  assert.equal(siteURL('https://organisation.github.io/blomst/'), 'https://organisation.github.io/blomst/');
  for (const url of ['http://example.com', 'https://127.0.0.1/', 'https://user:secret@example.com/', 'https://example.com:444/']) assert.throws(() => siteURL(url));
  for (const file of ['_worker.js', 'functions/login.js', 'wrangler.jsonc', 'api/index.js', 'package.json']) assert.throws(() => validatePagesArtifact({ files: [{ file: 'index.html' }, { file }] }), /serverkode/);
});

test('Pages-workflows har kun eksplicit dispatch, fastlåste Actions og bevarer skjulte webfiler', () => {
  for (const c of [base, cf]) {
    const { path: file, content } = pagesWorkflow(c);
    const parsed = require('js-yaml').load(content);
    assert.deepEqual(Object.keys(parsed.on), ['workflow_dispatch']);
    assert.equal(parsed.jobs.publish.steps[0].with['persist-credentials'], false);
    assert.match(file, /^\.github\/workflows\/aura-/);
    assert.match(content, /^on:\n  workflow_dispatch:/m);
    assert.doesNotMatch(content, /^\s+(?:push|pull_request|schedule):/m);
    assert.match(content, /persist-credentials: false/);
    assert.match(content, /ref: \$\{\{ inputs.reviewed_sha \}\}/);
    assert.match(content, /GITHUB_SHA !== env.REVIEWED_SHA/);
    assert.match(content, /REVIEWED_HASH/);
    for (const action of content.matchAll(/uses: ([^\n]+)/g)) assert.match(action[1], /@[a-f0-9]{40}$/);
    assert.doesNotMatch(content, /git (?:commit|push)|contents: write/);
  }
  assert.match(pagesWorkflow(base).content, /tar --format=posix/);
  assert.doesNotMatch(pagesWorkflow(base).content, /--exclude=.*\./);
  assert.match(pagesWorkflow(cf).content, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(pagesWorkflow(cf).content, /workingDirectory: \$\{\{ runner.temp \}\}/);
});

test('Sidekontrol afviser private DNS-svar og fastholder den kontrollerede offentlige IP', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', '2001:db8::1', '2001:0db8::1', '2002:7f00:1::', 'fc00::1']) assert.equal(publicAddress(ip), false, ip);
  for (const ip of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(publicAddress(ip), true, ip);
  let requests = 0;
  await assert.rejects(fetchSite('https://example.com/', { lookup: async () => [{ address: '127.0.0.1', family: 4 }], request: () => { requests++; } }), /internt/);
  assert.equal(requests, 0);
  const { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream');
  const response = await fetchSite('https://example.com/path/', {
    lookup: async () => [{ address: '1.1.1.1', family: 4 }],
    request: (url, options, callback) => {
      assert.equal(url.href, 'https://example.com/path/');
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers.Cookie, undefined);
      options.lookup('example.com', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '1.1.1.1'); assert.equal(family, 4); });
      const req = new EventEmitter(); req.end = () => { const res = new PassThrough(); res.statusCode = 302; res.headers = { location: 'http://127.0.0.1/private' }; callback(res); res.end('flyttet'); };
      return req;
    }
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'http://127.0.0.1/private');
  assert.equal(await response.text(), '');
});

test('Opsætning læser kun GitHub og kræver præcis gennemgået workflow og version', async () => {
  const api = github(), provider = new GitHubPagesDeployment(api);
  const status = await provider.setup(base);
  assert.equal(status.ready, true);
  assert.equal(status.pages.url, 'https://organisation.github.io/blomst/');
  const target = await provider.inspect(base, artifact);
  assert.equal(target.id, '42');
  assert.ok(api.calls.every(c => !c.options.method));
  await assert.rejects(new GitHubPagesDeployment(github(base, { head: 'd'.repeat(40) })).inspect(base, artifact), /ikke den gennemgåede/);
  await assert.rejects(new GitHubPagesDeployment(github(base, { content: 'on: push' })).inspect(base, artifact), /Gem opsætningen/);
  await assert.rejects(new GitHubPagesDeployment(github(base, { buildType: 'legacy' })).inspect(base, artifact), /GitHub Actions/);
});

test('Cloudflare kræver secretnavn men læser og returnerer aldrig tokenværdien', async () => {
  const api = github(cf), provider = new CloudflarePagesDeployment(api);
  const target = await provider.inspect(cf, artifact);
  assert.match(target.validation, /kontrolleres før upload/);
  assert.equal(target.url, null);
  assert.ok(api.calls.every(c => !c.options.method));
  const missing = new CloudflarePagesDeployment(github(cf, { api: route => route.includes('/actions/secrets/') ? null : undefined }));
  assert.equal((await missing.setup(cf)).ready, false);
  await assert.rejects(missing.inspect(cf, artifact), /CLOUDFLARE_API_TOKEN/);
});

test('Dispatch binder version og filer og gemmer forespørgsels-ID før netværkskald', async () => {
  let saved = null;
  const api = github(base, { api: (route, options) => {
    if (!route.endsWith('/dispatches')) return undefined;
    assert.equal(saved.state, 'SUBMITTING');
    assert.equal(options.body.inputs.request_id, saved.id);
    assert.equal(options.body.inputs.reviewed_sha, head);
    assert.equal(options.body.inputs.reviewed_hash, artifactHash);
    return { workflow_run_id: 57 };
  } });
  const provider = new GitHubPagesDeployment(api), target = await provider.inspect(base, artifact);
  const result = await provider.deploy(base, artifact, target, { onUploaded: receipt => { saved = receipt; } });
  assert.equal(result.state, 'QUEUED');
  assert.equal(result.runId, 57);
  assert.equal(api.calls.filter(call => call.options.method === 'POST').length, 1);
  await assert.rejects(provider.deploy(base, { ...artifact, hash: 'ukendt' }, target), /Gennemgå/);
});

test('Et tabt dispatch-svar efterlader ID til sikker kontrol uden automatisk gentagelse', async () => {
  let saved;
  const api = github(base, { api: route => { if (route.endsWith('/dispatches')) throw Error('netværk'); } });
  const provider = new GitHubPagesDeployment(api), target = await provider.inspect(base, artifact);
  await assert.rejects(provider.deploy(base, artifact, target, { onUploaded: receipt => { saved = receipt; } }), /netværk/);
  assert.match(saved.id, /^[a-f0-9-]{36}$/);
  assert.equal(api.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('Status knyttes til konkret ID, workflow, version og et fuldført uploadtrin', async () => {
  const id = '12345678-1234-4234-8234-123456789012';
  const run = { id: 57, display_title: `Aura Pages ${id}`, head_sha: head, event: 'workflow_dispatch', path: pagesWorkflow(base).path, status: 'completed', conclusion: 'success' };
  const api = github(base, { api: route => {
    if (route.includes('/runs?')) return { workflow_runs: [{ ...run, display_title: 'Anden kørsel' }, run] };
    if (route.endsWith('/jobs?per_page=100')) return { jobs: [{ name: 'publish', conclusion: 'success', steps: [{ name: 'Udgiv de gennemgåede filer', conclusion: 'success' }] }] };
  } });
  const result = await new GitHubPagesDeployment(api).status(base, { id, head });
  assert.equal(result.state, 'READY');
  assert.equal(result.url, 'https://organisation.github.io/blomst/');
  const wrong = github(base, { api: route => route.includes('/actions/runs/') ? { ...run, head_sha: 'e'.repeat(40) } : undefined });
  await assert.rejects(new GitHubPagesDeployment(wrong).status(base, { id, head, runId: 57 }), /matcher ikke/);
  const skipped = github(base, { api: route => route.includes('/runs?') ? { workflow_runs: [run] } : route.includes('/jobs?') ? { jobs: [{ name: 'publish', conclusion: 'skipped' }] } : undefined });
  await assert.rejects(new GitHubPagesDeployment(skipped).status(base, { id, head }), /ikke bekræftet/);
});

test('Fejlede og afbrudte Pages-kørsler vises som terminale fejl i den fælles kvittering', async () => {
  const { receiptSummary } = require('../ui/share-view.js');
  const id = '12345678-1234-4234-8234-123456789012';
  for (const config of [base, cf]) {
    for (const [conclusion, expected] of [['failure', 'ERROR'], ['timed_out', 'ERROR'], ['cancelled', 'CANCELED']]) {
      const run = { id: 57, display_title: `Aura Pages ${id}`, head_sha: head, event: 'workflow_dispatch', path: pagesWorkflow(config).path, status: 'completed', conclusion };
      const api = github(config, { api: route => route.includes('/runs?') ? { workflow_runs: [run] } : undefined });
      const provider = config.provider === 'cloudflare' ? new CloudflarePagesDeployment(api) : new GitHubPagesDeployment(api);
      const status = await provider.status(config, { id, head });
      assert.equal(status.state, expected);
      assert.equal(status.url, null);
      const summary = receiptSummary({ ...status, id, config, checks: { provider: { status: 'checked' } } });
      assert.equal(summary.publication.tone, 'warning');
      assert.match(summary.publication.title, conclusion === 'cancelled' ? /annulleret/ : /fejlede/);
    }
  }
});

test('Cloudflare-destination kontrolleres før upload og afviser forkert branch og automatisk build', async () => {
  const env = { CLOUDFLARE_ACCOUNT_ID: cf.accountId, CLOUDFLARE_PROJECT: cf.project, CLOUDFLARE_API_TOKEN: 'kun-i-tests', AURA_BRANCH: 'main' };
  const request = project => async (url, options) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/pages/projects/blomst`);
    assert.equal(options.headers.Authorization, 'Bearer kun-i-tests');
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ success: true, result: project }) };
  };
  assert.equal(await verifyCloudflare(env, request({ name: 'blomst', production_branch: 'main' })), true);
  await assert.rejects(verifyCloudflare(env, request({ name: 'blomst', production_branch: 'production' })), /produktionsbranch/);
  await assert.rejects(verifyCloudflare(env, request({ name: 'blomst', production_branch: 'main', uses_functions: true })), /serverfunktioner/);
  await assert.rejects(verifyCloudflare(env, request({ name: 'blomst', production_branch: 'main', source: { config: { production_deployments_enabled: true } } })), /automatiske/);
  assert.equal(await verifyCloudflare(env, request({ name: 'blomst', production_branch: 'main', source: { config: { production_deployments_enabled: false, preview_deployment_setting: 'none' } } })), true);
});

test('Cloudflare bruger kun den faktiske adresse fra samme GitHub-kørsel', async () => {
  const id = '12345678-1234-4234-8234-123456789012';
  const run = { id: 57, display_title: `Aura Pages ${id}`, head_sha: head, event: 'workflow_dispatch', path: pagesWorkflow(cf).path, status: 'completed', conclusion: 'success' };
  let logURL = 'https://github.com/organisation/blomst/actions/runs/58/job/9';
  const api = github(cf, { api: route => {
    if (route.includes('/runs?')) return { workflow_runs: [run] };
    if (route.endsWith('/jobs?per_page=100')) return { jobs: [{ name: 'publish', conclusion: 'success', steps: [{ name: 'Udgiv de gennemgåede filer', conclusion: 'success' }] }] };
    if (route.includes('/deployments?')) return [{ id: 99, sha: head, environment: 'aura-cloudflare' }];
    if (route.includes('/deployments/99/statuses')) return [{ state: 'success', log_url: logURL, environment_url: 'https://456789.blomst-unik.pages.dev/' }];
  } });
  const provider = new CloudflarePagesDeployment(api);
  assert.equal((await provider.status(cf, { id, head })).state, 'AWAITING_UPDATE');
  logURL = 'https://github.com/organisation/blomst/actions/runs/57/job/9';
  const status = await provider.status(cf, { id, head });
  assert.equal(status.state, 'READY');
  assert.equal(status.url, 'https://456789.blomst-unik.pages.dev/');
});

test('Workflowets faktiske filkontrol køres på Auras gemte hjemmeside og afviser ændrede filer', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pages-material-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.resolve(__dirname, '../..');
  const workspace = path.join(root, 'workspace'), temporary = path.join(root, 'runner');
  await fs.mkdir(path.join(workspace, 'public'), { recursive: true }); await fs.mkdir(temporary);
  const files = [
    ['index.html', execFileSync('git', ['show', 'HEAD:site/dist/desktop.html'], { cwd: source })],
    ['desktop.css', execFileSync('git', ['show', 'HEAD:site/dist/desktop.css'], { cwd: source })],
    ['.well-known/security.txt', Buffer.from('Contact: mailto:sikkerhed@example.invalid\n')]
  ].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  for (const [file, data] of files) { const destination = path.join(workspace, 'public', file); await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, data); }
  const digest = createHash('sha256').update(JSON.stringify(files.map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]))).digest('hex');
  const env = { GITHUB_WORKSPACE: workspace, RUNNER_TEMP: temporary, GITHUB_SHA: head, REVIEWED_SHA: head, REVIEWED_HASH: digest, AURA_DIRECTORY: 'public' };
  const result = await verifyMaterial(env);
  assert.equal(result.files, 3);
  assert.deepEqual(await fs.readFile(path.join(result.directory, 'index.html')), files.find(([f]) => f === 'index.html')[1]);
  assert.equal(await fs.readFile(path.join(result.directory, '.well-known/security.txt'), 'utf8'), 'Contact: mailto:sikkerhed@example.invalid\n');
  await fs.writeFile(path.join(workspace, 'public/index.html'), 'ændret');
  await assert.rejects(verifyMaterial(env), /ikke den gennemgåede/);
  await assert.rejects(verifyMaterial({ ...env, GITHUB_SHA: 'e'.repeat(40) }), /Branchen er ændret/);
  await fs.writeFile(path.join(workspace, 'public/.env'), 'PRIVATE=yes');
  await assert.rejects(verifyMaterial(env), /private filer/);
  await fs.rm(path.join(workspace, 'public/.env'));
  await fs.symlink(path.join(workspace, 'public/index.html'), path.join(workspace, 'public/link.html'));
  await assert.rejects(verifyMaterial(env), /link/);
});
