'use strict';

const { isDeepStrictEqual } = require('node:util');

const reasons = Object.freeze({
  subagents: 'Undersessioners godkendelser, Stop og datakontrol er endnu ikke bundet sikkert til Aura.',
  websearch: 'Websøgning er slået fra. OpenCode 2.1.4 sender søgeord direkte til eksterne søgetjenester uden Auras datagennemgang. En Aura-styret søgetjeneste med godkendelse af præcist søgeord og modtager samt tilbagekaldelse er endnu ikke tilsluttet.',
  shell: 'Terminalgrænser er slået fra. OpenCode 2.1.4 har ingen global timeoutgrænse. Auras runner mangler et samlet outputfil-loft; timeout og Stop af løsrevne efterkommerprocesser er kun kvalificeret på macOS.',
  lsp: 'Sprogserveres processer og filadgang er endnu ikke dækket af Auras kommandosandbox og filbeskyttelse.',
  local: 'Lokal MCP er slået fra. En låst server mangler et eget miljø uden net- og filadgang, godkendelse af hvert kald med præcise argumenter og Stop, der bekræfter nul efterkommerprocesser. Brugerdefinerede servere gemmes uden at blive startet.',
  remote: 'Remote MCP sender data til en ekstern server. Destination, værktøjsdata og tilbagekaldelse er endnu ikke koblet til Privacy Gate.',
});
const definitions = [
  { id: 'subagents', group: 'builtin', title: 'Subagenter', summary: 'Lad AI delegere delopgaver med godkendelse.', available: false, reason: reasons.subagents, default: false },
  { id: 'webfetch', group: 'builtin', title: 'Hent websider', summary: 'Spørg før AI henter en webside i Byg, eller slå hentning fra.', available: true, default: 'ask', settings: [{ key: 'value', type: 'select', options: ['ask', 'deny'] }] },
  { id: 'websearch', group: 'builtin', title: 'Websøgning', summary: 'Søg på nettet gennem en ekstern søgetjeneste.', available: false, reason: reasons.websearch, default: false },
  { id: 'shell', group: 'builtin', title: 'Terminalgrænser', summary: 'Indstil tidsgrænse og outputloft for terminalkommandoer.', available: false, reason: reasons.shell, default: {}, settings: [{ key: 'timeoutSeconds', type: 'number', min: 30, max: 1800 }, { key: 'outputLimitKB', type: 'number', min: 16, max: 1024 }] },
  { id: 'lsp', group: 'builtin', title: 'Sprogservere', summary: 'Brug sprogservere til at undersøge kode.', available: false, reason: reasons.lsp, default: false },
  { id: 'mcp', group: 'experimental', title: 'MCP-servere', summary: 'Gem serverdefinitioner til senere sikker tilkobling. Ingen server startes.', available: false, reason: `${reasons.local} ${reasons.remote}`, default: false },
  { id: 'contextHud', group: 'experimental', title: 'Kontekstvisning', summary: 'Vis hvor meget af modellens kontekstvindue samtalen bruger, som en lille måler ved modelvalget. Ændrer ingen rettigheder.', available: true, default: false },
];
const defaults = () => Object.fromEntries(definitions.map(item => [item.id, structuredClone(item.default)]));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Ukendte eller ugyldige pluginfelter.');
}
function text(value, max = 256) { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]|\{(?:env|file):/.test(value); }
function validateValue(id, value) {
  const definition = definitions.find(item => item.id === id);
  if (!definition) throw new Error('Ukendt plugin.');
  if (id === 'webfetch') {
    if (!['ask', 'deny'].includes(value)) throw new Error('Webhentning skal være ask eller deny.');
  } else if (id === 'shell') {
    keys(value, ['timeoutSeconds', 'outputLimitKB']);
    for (const setting of definition.settings) if (Object.hasOwn(value, setting.key) && (!Number.isInteger(value[setting.key]) || value[setting.key] < setting.min || value[setting.key] > setting.max)) throw new Error('Terminalgrænsen ligger uden for det tilladte interval.');
  } else if (typeof value !== 'boolean') throw new Error('Pluginvalget skal være sandt eller falsk.');
  if (!definition.available && !isDeepStrictEqual(value, definition.default)) throw new Error(definition.reason);
  return structuredClone(value);
}
function validateServer(input) {
  keys(input, ['id', 'name', 'type', 'command', 'args', 'url', 'enabled']);
  if (typeof input.id !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(input.id) || ['constructor', 'prototype'].includes(input.id)) throw new Error('MCP-serveren skal have et id med 2 til 40 små bogstaver, tal eller bindestreger.');
  if (input.name !== undefined && !text(input.name, 100)) throw new Error('Ugyldigt MCP-servernavn.');
  if (input.enabled !== undefined && input.enabled !== false) throw new Error('MCP-servere kan gemmes, men endnu ikke aktiveres sikkert.');
  const result = { id: input.id, ...(input.name === undefined ? {} : { name: input.name }), type: input.type, enabled: false };
  if (input.type === 'local') {
    if (!text(input.command, 1024) || !/^(?:\/[A-Za-z0-9_./ -]+|[A-Za-z0-9_.-]+)$/.test(input.command) || input.url !== undefined || !Array.isArray(input.args) || input.args.length > 64 || input.args.some(arg => typeof arg !== 'string' || arg.length > 4096 || /[\x00-\x1f\x7f]|\{(?:env|file):/.test(arg))) throw new Error('Angiv en lokal MCP-kommando og en liste med argumenter uden kontroltegn eller variabelhenvisninger.');
    result.command = input.command; result.args = [...input.args];
  } else if (input.type === 'remote') {
    if (!text(input.url, 2048) || input.command !== undefined || input.args !== undefined) throw new Error('Angiv kun en HTTPS-adresse til remote MCP.');
    let url; try { url = new URL(input.url); } catch { throw new Error('Ugyldig MCP-adresse.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.search || url.hash || /\s|\\/.test(input.url)) throw new Error('Remote MCP kræver HTTPS uden login, parametre eller fragment. Gem ikke nøgler i adressen.');
    result.url = url.href;
  } else throw new Error('MCP-typen skal være local eller remote.');
  return result;
}
function normalize(input = {}) {
  keys(input, ['values', 'mcp']);
  const values = defaults();
  if (input.values !== undefined) {
    keys(input.values, Object.keys(values));
    for (const [id, value] of Object.entries(input.values)) values[id] = validateValue(id, value);
  }
  const servers = input.mcp?.servers === undefined ? [] : input.mcp.servers;
  if (input.mcp !== undefined) keys(input.mcp, ['servers']);
  if (!Array.isArray(servers) || servers.length > 32) throw new Error('Der kan gemmes højst 32 MCP-servere.');
  const validated = servers.map(validateServer);
  if (new Set(validated.map(item => item.id)).size !== validated.length) throw new Error('MCP-servernes id skal være unikke.');
  return { values, mcp: { servers: validated } };
}
function snapshot(input) {
  const state = normalize(input);
  return { definitions: structuredClone(definitions), values: state.values, mcp: { servers: state.mcp.servers.map(server => ({ ...server, available: false, reason: reasons[server.type] })) } };
}
function applyPermissions(permission, mode, values = {}) {
  // Apply only the supported restriction. Never forward arbitrary persisted authority.
  if (!['free', 'build'].includes(mode)) return permission;
  return { ...permission, webfetch: values.webfetch === 'deny' ? 'deny' : 'ask', task: 'deny', websearch: 'deny', lsp: 'deny' };
}
class Plugins {
  constructor(store) { this.store = store; }
  async get() { await this.store.queue; return snapshot((await this.store.read()).plugins); }
  async save(input) {
    keys(input, ['id', 'value', 'mcp']);
    if (Object.hasOwn(input, 'mcp') === Object.hasOwn(input, 'id')) throw new Error('Gem enten et pluginvalg eller en MCP-server.');
    await this.store.update(state => {
      const next = normalize(state.plugins);
      if (Object.hasOwn(input, 'id')) next.values[input.id] = validateValue(input.id, input.value);
      else {
        if (Object.hasOwn(input, 'value')) throw new Error('Ugyldig MCP-handling.');
        keys(input.mcp, ['add', 'update', 'remove']);
        const operations = Object.keys(input.mcp);
        if (operations.length !== 1) throw new Error('Vælg én MCP-handling ad gangen.');
        const action = operations[0], servers = next.mcp.servers;
        const server = action === 'remove' ? null : validateServer(input.mcp[action]);
        const id = server?.id || input.mcp.remove, index = servers.findIndex(item => item.id === id);
        if (action === 'add') {
          if (index !== -1 || servers.length >= 32) throw new Error('MCP-serveren findes allerede, eller lageret er fyldt.');
          servers.push(server);
        } else {
          if (index === -1) throw new Error('MCP-serveren findes ikke.');
          if (action === 'remove') servers.splice(index, 1); else servers[index] = server;
        }
      }
      state.plugins = normalize(next);
    });
    return this.get();
  }
}
module.exports = { Plugins, definitions, defaults, validateValue, validateServer, normalize, applyPermissions };
