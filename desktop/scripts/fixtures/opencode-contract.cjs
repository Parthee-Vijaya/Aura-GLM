// Sanitized observations of the real pinned OpenCode API, not a fake engine.
const { EventAdapter } = require('../../core/engine-opencode2.cjs');

const ID = /\b(?:ses|msg|evt|per|frm|req)_[a-zA-Z0-9_-]+/g;
const SECRET_FIELD = /^(?:authorization|proxy-authorization|headers|cookie|set-cookie|password|api[-_]?key|token|accessToken|refreshToken|stack)$/i;
const TIME_FIELD = /^(?:created|updated|started|streamed|completed|idle|suspended|at|ran)$/;
const HTTP_PATH = /^\/api\/(?:info|session(?:\/[^/?]+(?:\/(?:message|permission|form|prompt|instructions)(?:\/[^/?]+(?:\/reply)?)?)?)?)(?:\?|$)/;

function sanitizeContract(value, { roots = [], secrets = [] } = {}) {
  const identifiers = new Map(), timestamps = new Map(), cursors = new Map();
  const identify = id => {
    if (!identifiers.has(id)) identifiers.set(id, `${id.split('_')[0]}_recorded_${identifiers.size + 1}`);
    return identifiers.get(id);
  };
  const cursor = value => { if (!cursors.has(value)) cursors.set(value, 'cursor_recorded_' + (cursors.size + 1)); return cursors.get(value); };
  function visit(item, key = '', parent = '') {
    if (SECRET_FIELD.test(key)) return '[redacted]';
    if (Array.isArray(item)) return item.map(entry => visit(entry, '', key));
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([name, child]) => [name.replace(ID, identify), visit(child, name, key)]));
    if (typeof item === 'number' && TIME_FIELD.test(key) && item > 1000000000000) {
      if (!timestamps.has(item)) timestamps.set(item, 1000 + timestamps.size);
      return timestamps.get(item);
    }
    if (typeof item !== 'string') return item;
    if (parent === 'paths') return '/synthetic/paths/' + key;
    if (parent === 'cursor' && item) return cursor(item);
    if (key === 'projectID') return 'project_recorded';
    let text = item;
    for (const root of [...roots].sort((a, b) => b.length - a.length)) if (root) text = text.replaceAll(root, '/synthetic/contract');
    for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[redacted]');
    text = text.replace(/\b(?:Basic|Bearer) [a-zA-Z0-9._~+/=-]+/g, '[redacted authorization]');
    text = text.replace(/https?:\/\/127\.0\.0\.1:\d+/g, 'http://127.0.0.1:PORT');
    text = text.replace(/([?&]cursor=)([^&]+)/g, (_, prefix, value) => prefix + cursor(decodeURIComponent(value)));
    return text.replace(ID, identify);
  }
  const result = visit(value);
  const serialized = JSON.stringify(result);
  if (/\/(?:Users|private\/var|var\/folders)\//.test(serialized)) {
    const fields = [];
    const locate = (item, at) => { if (typeof item === 'string' && /\/(?:Users|private\/var|var\/folders)\//.test(item)) fields.push(at); else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) locate(child, `${at}.${key}`); };
    locate(result, 'contract');
    throw new Error('An unsanitized host path remains in fields: ' + fields.slice(0, 4).join(', '));
  }
  if (Buffer.byteLength(serialized) > 500000) throw new Error('The synthetic contract exceeded its bounded recording size.');
  return result;
}

function observeEngine(engine, { synthetic = false } = {}) {
  if (synthetic !== true) throw new Error('Engine contract observation is restricted to explicitly synthetic runs.');
  const observations = [];
  const wire = engine.wire.bind(engine), decode = engine.decodeEvent.bind(engine);
  engine.wire = async (url, method = 'GET', body, signal) => {
    const response = await wire(url, method, body, signal);
    // Config/plugin endpoints include authority and are never recorded. These
    // are parsed HTTP JSON responses; headers, credentials and raw logs are absent.
    if (HTTP_PATH.test(url)) observations.push({ transport: 'http-json', method, path: url, ...(body === undefined ? {} : { request: structuredClone(body) }), response: structuredClone(response) });
    return response;
  };
  engine.decodeEvent = event => {
    // These objects are parsed by the real SSE reader before the V2 adapter.
    // Instruction-hash events are irrelevant to the consumer contract.
    if (event.data?.sessionID === engine.session?.id && !/instructions\.updated|agent\.selected/.test(event.type)) observations.push({ transport: 'sse-data', event: structuredClone(event) });
    return decode(event);
  };
  return observations;
}

function replayEvents(scenario) {
  const adapter = new EventAdapter('/synthetic/contract/project');
  return scenario.observations.filter(item => item.transport === 'sse-data').flatMap(item => adapter.normalize(item.event));
}

module.exports = { sanitizeContract, observeEngine, replayEvents };
