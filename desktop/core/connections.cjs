const { randomUUID, createHash } = require('node:crypto');
const definitions = {
  corti: { name: 'Corti S1 · EU', baseURL: 'https://ai.eu.corti.app/v1', protocol: 'openai', keyRequired: true, source: 'https://docs.corti.ai/models/regions', checkedAt: '2026-09-25', training: 'Corti oplyser, at EU-modeldata ikke bruges til træning. Kontrollér aftalen for jeres projekt.', region: 'EU ifølge Cortis dokumentation. Denne adapter bruger kun EU-endpointet; den konkrete installation er ikke uafhængigt verificeret.' },
  mistral: { name: 'Mistral API', baseURL: 'https://api.mistral.ai/v1', protocol: 'openai', keyRequired: true, source: 'https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models', checkedAt: '2026-09-25', training: 'Afhænger af abonnement, model og træningsvalg i Mistral Studio. Gratis adgang og Labs/Preview kan have andre vilkår. Appen kontrollerer ikke kontoens fravalg.', retention: 'Afhænger af konto, endpoint og eventuel Zero Data Retention-aftale. Træningsfravalg er ikke det samme som ingen opbevaring.' },
  anthropic: { name: 'Anthropic API', baseURL: 'https://api.anthropic.com/v1', protocol: 'anthropic', keyRequired: true, source: 'https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training', training: 'Anthropic oplyser: API-data bruges ikke som standard til træning; aftaler og aktivt tilvalg kan ændre dette.' },
  openrouter: { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', protocol: 'openai', keyRequired: true, source: 'https://openrouter.ai/docs/guides/privacy/provider-logging', training: 'Afhænger af den valgte modeludbyder og kontoens indstillinger.' },
  zen: { name: 'OpenCode Zen', baseURL: 'https://opencode.ai/zen/v1', protocol: 'openai', keyRequired: false, source: 'https://opencode.ai/docs/en/zen/#privacy', training: 'Modelafhængigt. Flere gratis modeller kan bruge data til forbedring eller træning.', region: 'USA ifølge Zen-dokumentationen; ikke uafhængigt verificeret.' },
  ollama: { name: 'Ollama', baseURL: 'http://127.0.0.1:11434', protocol: 'openai', keyRequired: false, source: 'https://docs.ollama.com/api/introduction', training: 'Afhænger af den valgte lokale modelserver og eventuel cloud-videresendelse.' },
  compatible: { name: 'Egen server / DGX Spark', baseURL: '', protocol: 'openai', keyRequired: false, source: '', training: 'Ukendt. Kontroller serverens konfiguration og eventuel videresendelse.' }
};
function endpoint(value) {
  let url; try { url = new URL(value); } catch { throw new Error('Angiv en fuld serveradresse med http:// eller https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Serveradressen må ikke indeholde login, parametre eller fragmenter.');
  return url.href.replace(/\/$/, '');
}
function normalize(input) {
  if (!input || !definitions[input.kind]) throw new Error('Vælg en understøttet forbindelsestype.');
  const def = definitions[input.kind];
  const baseURL = endpoint(['compatible', 'ollama'].includes(input.kind) ? input.baseURL : def.baseURL);
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100) throw new Error('Angiv et forbindelsesnavn på højst 100 tegn.');
  if (input.apiKey && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) throw new Error('API-nøglen er ugyldig.');
  return { id: input.id || randomUUID(), name: input.name.trim(), kind: input.kind, baseURL };
}
async function requestJSON(url, { key = '', kind, method = 'GET', body, signal } = {}) {
  const headers = { accept: 'application/json' };
  if (key) Object.assign(headers, kind === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` });
  if (body) headers['content-type'] = 'application/json';
  let response;
  try { response = await fetch(url, { method, headers, body: body && JSON.stringify(body), signal: signal || AbortSignal.timeout(15000), redirect: 'error' }); }
  catch { throw new Error('Serveren svarer ikke. Kontrollér adresse, port, netværk og eventuelt Tailscale.'); }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Serveren afviste adgangen. Kontrollér API-nøglen og tilladelserne.' : `Serveren svarede med HTTP ${response.status}. Ingen anden forbindelse blev valgt.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 8_000_000) throw new Error('Serverens svar er for stort.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(text); } catch { throw new Error('Serveren returnerede ikke gyldige modeloplysninger.'); }
}
async function listModels(connection, key) {
  if (definitions[connection.kind].keyRequired && !key) throw new Error('Denne forbindelse kræver en API-nøgle.');
  const ollama = connection.kind === 'ollama';
  const response = await requestJSON(`${connection.baseURL}${ollama ? '/api/tags' : '/models'}`, { key, kind: connection.kind });
  const models = response[ollama ? 'models' : 'data'];
  if (!Array.isArray(models)) throw new Error('Serveren returnerede ingen læsbar modelliste.');
  return models.slice(0, 5000).filter(model => model && model.capabilities?.completion_chat !== false && !(connection.kind === 'corti' && /embedding/.test(model.id))).map(model => ({
    id: ollama ? model.name : model.id, name: model.name || model.display_name || model.id,
    price: model.pricing || null, capabilities: { tools: model.capabilities?.function_calling ?? model.supported_parameters?.includes('tools') ?? null },
    local: ollama && !model.remote_host && !/:.*cloud/.test(model.name) ? 'Ikke verificeret' : null
  })).filter(model => typeof model.id === 'string');
}
async function routes(connection, key, model) {
  if (connection.kind !== 'openrouter') return [];
  const data = await requestJSON(`${connection.baseURL}/models/${model.split('/').map(encodeURIComponent).join('/')}/endpoints`, { key });
  return (data.data?.endpoints || []).map(item => ({ id: item.tag || item.provider_name, name: item.provider_name, price: item.pricing || null, policy: item.data_policy || null })).filter(route => route.id);
}
function disclosure(connection, model, route = null) {
  const def = definitions[connection.kind];
  const url = new URL(connection.baseURL);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const price = route?.price || model.price;
  const free = price && Number(price.prompt) === 0 && Number(price.completion) === 0;
  const data = {
    connection: connection.name, model: model.id, endpoint: connection.baseURL,
    recipients: connection.kind === 'openrouter' ? `OpenRouter → ${route?.name || 'Ukendt modeludbyder'}` : `${def.name} · ${url.hostname}`,
    region: def.region || (loopback ? 'Forbindelsen går til denne computer. Selve modellens behandlingssted er endnu ikke verificeret.' : 'Ukendt; serveradressen dokumenterer ikke behandlingsstedet.'),
    retention: def.retention || 'Ikke verificeret for denne forbindelse. Konto-, model- og servervilkår kan variere.',
    training: def.training, price: free ? '0 i oplyst pris for input/output. Kvoter, øvrige gebyrer og senere prisændringer kan gælde.' : price ? `Oplyst API-pris: ${JSON.stringify(price)}` : 'Ukendt pris eller egen drift. Ingen garanti om gratis brug.',
    capabilities: model.capabilities?.tools === true ? 'Kataloget angiver værktøjskald; faktisk kodearbejde er ikke verificeret for denne model.' : model.capabilities?.tools === false ? 'Kataloget angiver ikke værktøjsunderstøttelse. Modellen kan være uegnet som kodeagent.' : 'Værktøjsunderstøttelse er ukendt. Modelkataloget er ikke et kompatibilitetsbevis.',
    material: 'Beskeder, samtalehistorik, fælles regler, projektkontekst og de filer/værktøjsresultater agenten læser. Referencefiler kræver særskilt tilvalg. Modelskift starter en ny session.',
    security: url.protocol === 'http:' && !loopback ? 'HTTP uden TLS. Tailscale-kryptering er kun gældende, hvis forbindelsen faktisk går gennem Tailscale; det er ikke verificeret her.' : 'Forbindelsesadressen er kontrolleret. Det er ikke en sikkerhedsgodkendelse af tjenesten.',
    source: def.source || 'Ingen leverandørkilde registreret; oplysninger skal kontrolleres hos serverens ejer.', checkedAt: def.checkedAt || '2026-09-22', evidence: 'Leverandørdokumentation og modelkatalog; ikke uafhængig revision.', route: route?.id || null
  };
  return { ...data, fingerprint: createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
function engineProvider(connection, model, gatewayURL, token) {
  const anthropic = connection.kind === 'anthropic' || (connection.kind === 'zen' && /^claude-/.test(model.id));
  return { npm: anthropic ? '@ai-sdk/anthropic' : '@ai-sdk/openai-compatible', name: connection.name,
    options: { baseURL: gatewayURL, apiKey: token },
    models: { [model.id]: { name: model.name, tool_call: true, limit: { context: 32768, output: 4096 } } } };
}
module.exports = { definitions, endpoint, normalize, requestJSON, listModels, routes, disclosure, engineProvider };
