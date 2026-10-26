// SPDX-License-Identifier: EUPL-1.2
// Real Electron renderer/preload/IPC/IdeaRefinement/PrivacyService acceptance.
// The only model is a controlled loopback HTTP server; no API keys or paid AI.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { createHash } = require('node:crypto');
const helpers = require('./ui-test-helpers.cjs');
const { launchTestApp } = require('./electron-test-launch.cjs');

(async () => {
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-review-ui-')));
  const reports = process.env.AURA_PRIVACY_REPORT || await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-review-report-'));
  await fs.mkdir(reports, { recursive: true });
  const documents = path.join(temp, 'Documents'); await fs.mkdir(documents);
  const calls = [], localCalls = [], checks = [], errors = [];
  const server = http.createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.method === 'GET' && ['/v1/models','/local/v1/models'].includes(request.url)) { response.end(JSON.stringify({ data: [{ id: 'synthetic-review-model', name: 'Synthetic review model' }] })); return; }
    if (request.method !== 'POST' || !['/v1/chat/completions','/local/v1/chat/completions'].includes(request.url)) { response.statusCode = 404; response.end('{}'); return; }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const local=request.url.startsWith('/local/');
    (local?localCalls:calls).push(Buffer.concat(chunks).toString('utf8'));
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ description: local?'LOCAL-ONLY-ANSWER: Et lokalt idéforslag.':'CLOUD-ONLY-ANSWER: Et kontrolleret offentligt idéforslag.', plan: 'Afklar, byg og afprøv.', questions: [] }) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let app, page, launch, exited = false;
  const ok = result => { assert.equal(result?.ok, true, result?.error || 'Expected successful application IPC'); return result.value; };
  try {
    ({ app, evidence: launch } = await launchTestApp({ electron, profile: path.join(temp, 'profile') }));
    await helpers.isolateDocuments(app, documents);
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await helpers.skipIntroduction(page); await helpers.toOnboarding(page);
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    const saved = ok(await page.evaluate(value => window.harness.saveConnection(value), { kind: 'compatible', name: 'Synthetic review server', baseURL: endpoint }));
    const connection = saved.connections.find(value => value.baseURL === endpoint); assert(connection);
    ok(await page.evaluate(() => window.harness.privacyConfigure({ scope: 'idea', settings: { enabled: true, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: true, protectedSources: [] } })));
    const begin = async label => {
      const prepared = ok(await page.evaluate(value => window.harness.ideaPrepare(value), { name: 'Synthetic ' + label, idea: 'Byg en offentlig tilmeldingsside. Kontakt alice@example.invalid.', connectionID: connection.id, modelID: 'synthetic-review-model' }));
      // Keep a handle to the real pending IPC result without blocking browser
      // interaction with the real modal. No production handler is substituted.
      await page.evaluate(token => { window.__privacyReviewResult = window.harness.ideaSend({ token }); }, prepared.token);
      await page.waitForSelector('#privacy-sharing-dialog[open]');
      const payload = await page.locator('#privacy-payload').textContent();
      assert(payload && JSON.parse(payload).messages.length > 0);
      assert.doesNotMatch(payload, /alice@example\.invalid/);
      assert.match(await page.locator('#privacy-sharing-dialog').innerText(), /Præcis, hvad der sendes|Exactly what will be sent/);
      const status = ok(await page.evaluate(() => window.harness.privacyGet({ scope: 'idea' })));
      assert.equal(status.pending.length, 1);
      const review = ok(await page.evaluate(id => window.harness.privacyReview({ id }), status.pending[0].id));
      assert.equal(payload, review.body);
      return { payload, id: review.id };
    };
    for (const decision of ['cancel', 'local']) {
      const before = calls.length, review = await begin(decision);
      assert.equal(calls.length, before);
      await page.screenshot({ path: path.join(reports, `review-${decision}.png`), fullPage: true });
      await page.locator(`[data-privacy-decision="${decision}"]`).click();
      const result = await page.evaluate(() => window.__privacyReviewResult);
      assert.equal(result.ok, false); assert.equal(calls.length, before);
      assert.equal((await page.evaluate(id => window.harness.privacyDecide({ id, decision: 'approve' }), review.id)).ok, false);
      checks.push({ scenario: decision, sent: calls.length - before, replayRejected: true });
    }
    const beforeApproval = calls.length, approved = await begin('approve');
    assert.equal(calls.length, beforeApproval);
    await page.screenshot({ path: path.join(reports, 'review-exact-payload.png'), fullPage: true });
    await page.locator('[data-privacy-decision="approve"]').click();
    ok(await page.evaluate(() => window.__privacyReviewResult));
    assert.equal(calls.length, beforeApproval + 1); assert.equal(calls.at(-1), approved.payload);
    assert.equal((await page.evaluate(id => window.harness.privacyDecide({ id, decision: 'approve' }), approved.id)).ok, false);
    assert.equal(calls.length, beforeApproval + 1);
    checks.push({ scenario: 'approve', sent: 1, exactReviewedBytes: true, sha256: createHash('sha256').update(approved.payload).digest('hex'), replayRejected: true });
    const beforeStale = calls.length, staleReview = await begin('stale-destination');
    ok(await page.evaluate(value => window.harness.saveConnection(value), { id: connection.id, kind: 'compatible', name: 'Changed synthetic recipient', baseURL: endpoint.replace('/v1', '/changed') }));
    await page.locator('[data-privacy-decision="approve"]').click();
    const stale = await page.evaluate(() => window.__privacyReviewResult);
    assert.equal(stale.ok, false); assert.match(stale.error, /ændret|gennemgå/i); assert.equal(calls.length, beforeStale);
    assert.equal((await page.evaluate(id => window.harness.privacyDecide({ id, decision: 'approve' }), staleReview.id)).ok, false);
    checks.push({ scenario: 'changed-destination', sent: 0, staleRejected: true });
    // Use an explicitly documented local destination; loopback alone is not
    // enough. The host-owned registry is a test fixture, never renderer input.
    ok(await page.evaluate(value=>window.harness.saveConnection(value),{id:connection.id,kind:'compatible',name:'Synthetic review server',baseURL:endpoint}));
    const localEndpoint=endpoint.replace('/v1','/local/v1');
    const localState=ok(await page.evaluate(value=>window.harness.saveConnection(value),{kind:'compatible',name:'Synthetic local model',baseURL:localEndpoint}));
    const localConnection=localState.connections.find(value=>value.baseURL===localEndpoint);assert(localConnection);
    const privateDir=path.join(temp,'profile','harness','privacy');await fs.mkdir(privateDir,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(privateDir,'destinations.json'),JSON.stringify({[localConnection.id]:{endpoint:localEndpoint,locality:'device',revision:'native-local-proof'}}),{mode:0o600});
    ok(await page.evaluate(value=>window.harness.privacyConfigure({scope:'idea',settings:{enabled:true,workMode:'cloud-controlled',defaultClass:'public',requireApproval:true,protectedSources:[],hybridPair:value}}),{local:{connectionID:localConnection.id,modelID:'synthetic-review-model'},external:{connectionID:connection.id,modelID:'synthetic-review-model'}}));
    ok(await page.evaluate(id=>window.harness.models(id),localConnection.id));
    await page.evaluate(()=>{window.__privacyLocalEvents=[];window.harness.onEvent(event=>{if(event.type==='idea.local-processing')window.__privacyLocalEvents.push(event);});});
    await begin('approve');await page.locator('[data-privacy-decision="approve"]').click();ok(await page.evaluate(()=>window.__privacyReviewResult));
    const beforeLocal=calls.length, localReview=await begin('approve'); // same original idea with existing CLOUD history
    assert.match(localReview.payload,/CLOUD-ONLY-ANSWER/);
    await page.locator('[data-privacy-decision="local"]').click();
    const localResult=ok(await page.evaluate(()=>window.__privacyReviewResult));
    assert.match(localResult.description,/LOCAL-ONLY-ANSWER/);assert.equal(localResult.processing.locality,'device');assert.equal(localResult.selection.connectionID,localConnection.id);
    assert.equal(calls.length,beforeLocal);assert.equal(localCalls.length,1);
    assert.match(localCalls[0],/alice@example\.invalid/);assert.doesNotMatch(localCalls[0],/CLOUD-ONLY-ANSWER/);
    const localEvents=await page.evaluate(()=>window.__privacyLocalEvents);assert.equal(localEvents.length,1);assert.equal(localEvents[0].connectionID,localConnection.id);
    assert.equal((await page.evaluate(id=>window.harness.privacyDecide({id,decision:'approve'}),localReview.id)).ok,false);
    const continued=ok(await page.evaluate(value=>window.harness.ideaPrepare(value),{name:'Synthetic approve',idea:'Byg en offentlig tilmeldingsside. Kontakt alice@example.invalid.',message:'Gør forslaget kortere.',connectionID:localConnection.id,modelID:'synthetic-review-model'}));
    assert.match(JSON.stringify(continued.content),/LOCAL-ONLY-ANSWER/);assert.doesNotMatch(JSON.stringify(continued.content),/CLOUD-ONLY-ANSWER/);
    ok(await page.evaluate(token=>window.harness.ideaSend({token}),continued.token));assert.equal(localCalls.length,2);assert.equal(calls.length,beforeLocal);
    const cloudHistory=ok(await page.evaluate(value=>window.harness.ideaPrepare(value),{name:'Synthetic approve',idea:'Byg en offentlig tilmeldingsside. Kontakt alice@example.invalid.',connectionID:connection.id,modelID:'synthetic-review-model'}));
    assert.match(JSON.stringify(cloudHistory.content),/CLOUD-ONLY-ANSWER/);assert.doesNotMatch(JSON.stringify(cloudHistory.content),/LOCAL-ONLY-ANSWER/);
    ok(await page.evaluate(()=>window.harness.ideaStop()));
    checks.push({scenario:'actual-local-handoff',cloudRequests:0,localRequests:localCalls.length,separateHistory:true,originalLocalInput:true,localStatusEvent:true,planStillProposal:true,replayRejected:true});
    assert.deepEqual(errors, []);
    const report = { ok: true, launch, coverage: 'Native Electron UI, real preload/IPC, IdeaRefinement, PrivacyService and actual controlled HTTP transport. No OpenCode task or paid model.', checks, modelRequests: calls.length, localModelRequests:localCalls.length, rendererErrors: errors, screenshots: ['review-cancel.png', 'review-local.png', 'review-exact-payload.png'] };
    await fs.writeFile(path.join(reports, 'review-ui-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, reports }));
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(reports, 'review-ui-failure.png'), fullPage: true }).catch(() => {});
    console.error(JSON.stringify({ reports, launch: launch || error.testLaunch, modelRequests: calls.length, errors })); throw error;
  } finally {
    if (app) { const process = app.process(); const done = process.exitCode !== null ? Promise.resolve() : new Promise(resolve => process.once('exit', resolve)); await app.close(); await done; exited = true; }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (!app || exited) await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
