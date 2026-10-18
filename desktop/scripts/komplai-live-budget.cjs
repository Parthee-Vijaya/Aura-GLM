// Kun til den udtrykkeligt startede liveprøve. Beløbet er et loft i Komplai-kroner.
// Hele kaldets øvre pris tælles, også ved netværksfejl eller afbrudte svar.
class KomplaiLiveBudget {
  constructor({ organisationId, modelId, maxMicros = 10_000_000 }) {
    if (!organisationId || !modelId || !Number.isSafeInteger(maxMicros) || maxMicros <= 0 || maxMicros > 10_000_000) throw new Error('Liveprøven kræver organisation, model og et loft på højst 10 kr.');
    this.organisationId = organisationId; this.modelId = modelId; this.maxMicros = BigInt(maxMicros); this.reservedMicros = 0n; this.calls = 0;
  }
  catalogue(data) {
    this.rate = null;
    if (data.account?.id !== this.organisationId || !data.account?.contract) throw new Error('Modelkataloget tilhører ikke den valgte testorganisation.');
    const model = data.data?.find(m => m.id === this.modelId);
    const price = model?.pricing;
    const rate = value => {
      if (!['number', 'string'].includes(typeof value) || value === '') throw new Error('Prøven kræver oplyste DKK-priser.');
      const microsPerMillion = Math.ceil(Number(value) * 1e12);
      if (!Number.isSafeInteger(microsPerMillion) || microsPerMillion < 0) throw new Error('Prøven kræver oplyste DKK-priser.');
      return BigInt(microsPerMillion);
    };
    if (price?.currency !== 'DKK' || model?.capabilities?.function_calling !== true) throw new Error('Prøven kræver en kodemodel med oplyste DKK-priser.');
    this.rate = { input: rate(price.prompt), output: rate(price.completion), contract: data.account.contract };
  }
  reserve(body, headers) {
    if (!this.rate || body.model !== this.modelId || new Headers(headers).get('x-komplai-contract') !== this.rate.contract) throw new Error('Model eller aftale afviger fra den godkendte prøve.');
    const output = body.max_tokens ?? body.max_completion_tokens;
    if (!Number.isSafeInteger(output) || output <= 0 || !Array.isArray(body.messages) || !body.messages.length || (body.tools !== undefined && !Array.isArray(body.tools))) throw new Error('Kaldets maksimale forbrug kan ikke beregnes.');
    // Samme konservative inputgrænse som Komplais checkedCodingInput. Cache giver ingen rabat i dette loft.
    const input = Buffer.byteLength(JSON.stringify({ messages: body.messages, tools: body.tools }), 'utf8') + body.messages.length * 32 + (body.tools?.length ?? 0) * 64 + 256;
    const maximum = (BigInt(input) * this.rate.input + BigInt(output) * this.rate.output + 999_999n) / 1_000_000n;
    if (this.reservedMicros + maximum > this.maxMicros) throw new Error('Liveprøvens loft på 10 kr. stopper dette kald før afsendelse.');
    this.reservedMicros += maximum; this.calls++;
  }
  summary() { return { calls: this.calls, maximumDkk: Number(this.maxMicros) / 1e6, reservedUpperBoundDkk: Number(this.reservedMicros) / 1e6 }; }
}
function budgetedFetch(original, budget) {
  const apiRoutes = new Set(['GET /v1/aura/config', 'GET /v1/aura/organisations', 'GET /v1/aura/organisations?include=publishing', 'POST /v1/aura/connect', 'GET /v1/aura/account', 'GET /v1/aura/v1/models', 'POST /v1/aura/v1/chat/completions', 'DELETE /v1/aura/session']);
  return async (url, init = {}) => {
    const address = new URL(String(url)), method = (init.method || 'GET').toUpperCase();
    const local = address.protocol === 'http:' && address.hostname === '127.0.0.1';
    const api = address.origin === 'https://api.komplai.dk' && apiRoutes.has(`${method} ${address.pathname}${address.search}`);
    const login = address.href === 'https://auth.komplai.dk/oauth/v2/token' && method === 'POST';
    if (address.username || address.password || address.hash || (!local && !api && !login)) throw new Error('Liveprøven tillader kun Komplai-login, Komplais API og Auras lokale tjenester.');
    if (api && address.pathname === '/v1/aura/v1/chat/completions') budget.reserve(JSON.parse(init.body), init.headers);
    const response = await original(url, { ...init, redirect: 'error' });
    if (api && address.pathname === '/v1/aura/v1/models' && response.ok) budget.catalogue(await response.clone().json());
    return response;
  };
}
module.exports = { KomplaiLiveBudget, budgetedFetch };
