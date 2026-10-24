const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { usesResponses, assertSupported } = require('./connections.cjs');
const { StreamProgress } = require('./stream-progress.cjs');

const { forwardModel, IDLE_LIMIT, GRACE_LIMIT, TOTAL_LIMIT, RETRY_DELAYS } = require('./model-transport.cjs');
// Kun agentmotoren får en midlertidig adgangskode. Den rigtige modelnøgle bliver i hovedprocessen.
async function startGateway(connection, model, key, route, onFailure = () => {}, { idleLimit = IDLE_LIMIT, graceLimit = GRACE_LIMIT, totalLimit = TOTAL_LIMIT, retryDelays = RETRY_DELAYS, onRecovery = () => {}, onProgress = () => {}, root = '', effort: initialEffort = null } = {}) {
  // Brugerens valgte indsats kan skifte mellem beskeder uden at starte en ny modelsession.
  let effort = initialEffort, images = [];
  assertSupported(connection);
  const token = randomBytes(32).toString('hex');
  const active = new Set();
  let failed = false, stopped = false;
  // Fejlen får en type, så appen kan vise den rigtige vej videre, fx nøgle, kvote eller forbindelse.
  function fail(message, kind, status) { if (!failed && !stopped) { failed = true; onFailure(message, { kind, status: status || null }); } }
  let origin;
  const server = http.createServer(async (req, res) => {
    if (req.headers.host !== new URL(origin).host || (req.headers.authorization !== `Bearer ${token}` && req.headers['x-api-key'] !== token)) { res.writeHead(401); return res.end(); }
    if (failed || stopped) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Forbindelsen er stoppet. Start selv en ny opgave i appen.', type: 'api_error' } })); }
    const controller = new AbortController(); active.add(controller);
    res.on('close', () => { controller.abort(); active.delete(controller); });
    try {
      const responses = usesResponses(connection);
      const anthropic = connection.kind === 'anthropic' || connection.kind === 'zen' && /^claude-/.test(model.id);
      if (req.method !== 'POST' || req.url !== (responses ? '/v1/responses' : anthropic ? '/v1/messages' : '/v1/chat/completions')) throw new Error('Ukendt modelhandling.');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4_000_000) throw new Error('Beskeden er for stor.'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.model !== model.id) throw new Error('Modelskift kræver et nyt valg i appen.');
      if (images.length) {
        if (!require('./model-support.cjs').imageAllowed(model, route)) throw Error('Billedinput er ikke dokumenteret for den valgte model/rute.');
        require('./chat-media.cjs').addImages(body, images, { responses, anthropic, mistral: connection.kind === 'mistral' });
      }
      delete body.models; delete body.route; delete body.plugins;
      if (responses) {
        body.store = false;
        // Samtalen bor i Aura. Modellen får kun den historik, agenten faktisk sender i dette kald.
        delete body.previous_response_id; delete body.conversation; delete body.background;
      }
      if (connection.kind === 'openrouter') {
        if (!route?.id) throw new Error('Vælg en konkret OpenRouter-udbyder.');
        body.provider = { only: [route.id], allow_fallbacks: false };
        if (model.id.endsWith(':free')) body.provider.max_price = { prompt: 0, completion: 0, request: 0, image: 0 };
      }
      // Brugerens valgte indsats sættes, som udbyderen forventer. Uden et valg sendes udbyderens eget udgangspunkt uændret.
      if (effort) {
        if (anthropic) body.output_config = { ...(body.output_config || {}), effort };
        else if (responses || connection.kind === 'openrouter') body.reasoning = { ...(body.reasoning || {}), effort };
        else body.reasoning_effort = effort;
      }
      const base = connection.kind === 'ollama' ? `${connection.baseURL}/v1` : connection.baseURL;
      const headers = { 'content-type': 'application/json' };
      if (anthropic) { headers['anthropic-version'] = '2023-06-01'; if (key) headers['x-api-key'] = key; }
      else if (key) { if (connection.kind === 'azure') headers['api-key'] = key; else headers.authorization = `Bearer ${key}`; }
      // Serialize once: every attempt uses exactly the same model, route, history,
      // attachments and effort. Only this transport can retry a model request.
      await forwardModel({ url: `${base}${responses ? '/responses' : anthropic ? '/messages' : '/chat/completions'}`, headers, payload: JSON.stringify(body), res, signal: controller.signal,
        progress: new StreamProgress({ emit: onProgress, root }), idleLimit, graceLimit, totalLimit, retryDelays, onRecovery });
    } catch (error) {
      if (controller.signal.aborted || stopped) { res.destroy(); return; }
      const status = error.status || null;
      const kind = { 401: 'key', 403: 'access', 402: 'quota', 404: 'notfound', 429: 'limit' }[status] || (status >= 500 ? 'server' : error.kind || 'network');
      const advice = { 401: 'API-nøglen blev afvist. Kontrollér eller udskift den under AI-forbindelser.', 403: 'Din konto har ikke adgang til modellen. Kontrollér adgangen hos udbyderen.', 402: 'Udbyderen afviste kaldet på grund af saldo eller kvote. Kontrollér kontoen; appen vælger ikke en betalt erstatning.', 404: 'Modellen eller adressen blev ikke fundet. Hent modellisten igen, og kontrollér forbindelsen.', 429: 'Udbyderens forbrugsgrænse er nået. Prøv igen, når kvoten er tilgængelig.' }[status];
      const message = status ? `Modelserveren afviste kaldet (HTTP ${status}). ${advice || 'Forbindelsen kunne ikke genoptages efter de tilladte forsøg. Samtalen er bevaret.'}`
        : res.headersSent ? 'Modelsvar blev afbrudt efter modtaget indhold. Aura gentager ikke mulige værktøjshandlinger. Samtalen og ændringerne er bevaret.'
        : 'Modelforbindelsen kunne ikke genoptages inden for tids- og forsøgsgrænsen. Samtalen er bevaret. Prøv igen, når forbindelsen er klar.';
      fail(message, kind, status);
      // Never disguise a truncated response as success, or let the engine add an
      // independent retry loop after the gateway has exhausted its budget.
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(status || 502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: message + ' Ingen reserveudbyder blev brugt.', type: 'api_error' } }));
    } finally { active.delete(controller); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}/v1`, token, setImages: value => { images = structuredClone(value); }, setEffort: value => { effort = value || null; }, abort: () => { stopped = true; for (const controller of active) controller.abort(); }, close: () => new Promise(resolve => { stopped = true; for (const controller of active) controller.abort(); server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startGateway };
