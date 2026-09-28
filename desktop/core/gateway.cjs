const http = require('node:http');
const { randomBytes } = require('node:crypto');

// Kun agentmotoren får en midlertidig adgangskode. Den rigtige modelnøgle bliver i hovedprocessen.
async function startGateway(connection, model, key, route, onFailure = () => {}) {
  const token = randomBytes(32).toString('hex');
  const active = new Set();
  let failed = false, stopped = false;
  function fail(message) { if (!failed && !stopped) { failed = true; onFailure(message); } }
  let origin;
  const server = http.createServer(async (req, res) => {
    if (req.headers.host !== new URL(origin).host || (req.headers.authorization !== `Bearer ${token}` && req.headers['x-api-key'] !== token)) { res.writeHead(401); return res.end(); }
    if (failed || stopped) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Forbindelsen er stoppet. Start selv en ny opgave i appen.', type: 'api_error' } })); }
    const controller = new AbortController(); active.add(controller);
    res.on('close', () => { controller.abort(); active.delete(controller); });
    try {
      if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/messages'].includes(req.url)) throw new Error('Ukendt modelhandling.');
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 4_000_000) throw new Error('Beskeden er for stor.'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.model !== model.id) throw new Error('Modelskift kræver et nyt valg i appen.');
      delete body.models; delete body.route; delete body.plugins;
      if (connection.kind === 'openrouter') {
        if (!route?.id) throw new Error('Vælg en konkret OpenRouter-udbyder.');
        body.provider = { only: [route.id], allow_fallbacks: false };
        if (model.id.endsWith(':free')) body.provider.max_price = { prompt: 0, completion: 0, request: 0, image: 0 };
      }
      const anthropic = req.url === '/v1/messages';
      const base = connection.kind === 'ollama' ? `${connection.baseURL}/v1` : connection.baseURL;
      const headers = { 'content-type': 'application/json' };
      if (anthropic) { headers['anthropic-version'] = '2023-06-01'; if (key) headers['x-api-key'] = key; }
      else if (key) headers.authorization = `Bearer ${key}`;
      const response = await fetch(`${base}${anthropic ? '/messages' : '/chat/completions'}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]), redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        const advice = { 401: 'API-nøglen blev afvist. Kontrollér eller udskift den under AI-forbindelser.', 403: 'Din konto har ikke adgang til modellen. Kontrollér adgangen hos udbyderen.', 402: 'Udbyderen afviste kaldet på grund af saldo eller kvote. Kontrollér kontoen; appen vælger ikke en betalt erstatning.', 404: 'Modellen eller adressen blev ikke fundet. Hent modellisten igen, og kontrollér forbindelsen.', 429: 'Udbyderens forbrugsgrænse er nået. Prøv igen, når kvoten er tilgængelig.' }[response.status] || 'Kontrollér forbindelsen og modelvalget, og prøv igen.';
        const message = `Modelserveren afviste kaldet (HTTP ${response.status}). ${advice}`;
        fail(message);
        res.writeHead(response.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message, type: 'api_error' } }));
      }
      res.writeHead(200, { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      for await (const chunk of response.body) { if (res.destroyed) break; res.write(chunk); }
      res.end();
    } catch {
      fail('Modelforbindelsen blev afbrudt. Din besked er bevaret. Kontrollér forbindelsen, og prøv igen.');
      // En afbrudt strøm må ikke ligne et færdigt modelsvar for agentmotoren.
      if (res.headersSent) { res.destroy(); return; }
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
      if (!res.destroyed) res.end(JSON.stringify({ error: { message: 'Modelforbindelsen blev afbrudt. Ingen reserveudbyder blev brugt.', type: 'api_error' } }));
    } finally { active.delete(controller); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}/v1`, token, abort: () => { stopped = true; for (const controller of active) controller.abort(); }, close: () => new Promise(resolve => { stopped = true; for (const controller of active) controller.abort(); server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startGateway };
