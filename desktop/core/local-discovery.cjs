const { requestJSON } = require('./connections.cjs');
const OLLAMA_URL = 'http://127.0.0.1:11434';
// Kun den kendte loopback-adresse. Ingen netværkssøgning, nøgler eller modelkald.
async function discoverLocalModels(read = requestJSON) {
  try {
    const data = await read(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!Array.isArray(data.models)) return { status: 'invalid', models: [] };
    const models = data.models.filter(m => typeof m?.name === 'string' && /^[a-zA-Z0-9_./:@+-]{1,200}$/.test(m.name)).slice(0, 100).map(m => ({
      name: m.name, remote: Boolean(m.remote_host || /:.*cloud/.test(m.name))
    }));
    return { status: models.length ? 'found' : 'empty', baseURL: OLLAMA_URL, models };
  } catch { return { status: 'unavailable', models: [] }; }
}
module.exports = { discoverLocalModels, OLLAMA_URL };
