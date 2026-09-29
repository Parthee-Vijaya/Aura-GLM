// Afprøver en AI Harness-installation i den rigtige OpenCode-motor med en kontrolleret lokal modelserver.
// Prøven viser, hvad OpenCode faktisk sender til modellen: grundreglerne fra AGENTS.md, listen over skills og
// indholdet af en skill, når modellen beder om den. Ingen ekstern model eller nøgle bruges.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const opencode = process.env.HARNESS_OPENCODE_PATH || path.join(os.homedir(), '.opencode', 'bin', 'opencode');

function server(script) {
  const requests = [];
  const instance = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      if (request.method === 'GET') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'model', object: 'model' }] })); return; }
      const json = JSON.parse(body || '{}');
      requests.push(json);
      const reply = script(json, requests.length);
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = delta => response.write(`data: ${JSON.stringify({ id: 'proeve', object: 'chat.completion.chunk', created: 1, model: 'model', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      if (reply.tool) chunk({ role: 'assistant', tool_calls: [{ index: 0, id: `kald-${requests.length}`, type: 'function', function: { name: reply.tool, arguments: JSON.stringify(reply.args) } }] });
      else chunk({ role: 'assistant', content: reply.text });
      response.write(`data: ${JSON.stringify({ id: 'proeve', object: 'chat.completion.chunk', created: 1, model: 'model', choices: [{ index: 0, delta: {}, finish_reason: reply.tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
      response.end('data: [DONE]\n\n');
    });
  });
  return new Promise(resolve => instance.listen(0, '127.0.0.1', () => resolve({ instance, requests, url: `http://127.0.0.1:${instance.address().port}/v1` })));
}

function run(project, home, config, message) {
  return new Promise((resolve, reject) => {
    const env = { PATH: process.env.PATH, HOME: home, TERM: 'dumb', OPENCODE_CONFIG_CONTENT: JSON.stringify(config) };
    for (const [key, sub] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state' })) env[key] = path.join(home, sub);
    // Som appens motor: ingen baggrundshentninger. Projektets egen konfiguration og skills er stadig slået til.
    for (const flag of ['DISABLE_DEFAULT_PLUGINS', 'DISABLE_CLAUDE_CODE', 'DISABLE_AUTOUPDATE', 'DISABLE_MODELS_FETCH', 'DISABLE_LSP_DOWNLOAD', 'DISABLE_SHARE', 'DISABLE_EMBEDDED_WEB_UI']) env[`OPENCODE_${flag}`] = 'true';
    const child = spawn(opencode, ['run', ...(process.env.HARNESS_OPENCODE_LOGS ? ['--print-logs', '--log-level', 'DEBUG'] : []), '--format', 'json', message], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', data => { out += data; }); child.stderr.on('data', data => { err += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`OpenCode svarede ikke i tide.\n${err.slice(-3000)}`)); }, Number(process.env.HARNESS_OPENCODE_TIMEOUT || 120000));
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const text = request => JSON.stringify(request.messages || []);
const toolNames = request => (request.tools || []).map(tool => tool.function?.name || tool.name);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-opencode-'));
  const project = path.join(root, 'projekt');
  const home = path.join(root, 'hjem');
  await fs.mkdir(project); await fs.mkdir(home);
  await fs.writeFile(path.join(project, 'README.md'), '# Mødelokaler\n\nEn opdigtet app til at finde mødelokaler.\n');
  execFileSync('git', ['init', '-q'], { cwd: project });
  execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'harness.cjs'), 'install', '--tools', 'opencode', '--project', project, '--yes']);
  const version = execFileSync(opencode, ['--version']).toString().trim();

  const fake = await server((request, count) => {
    if (!toolNames(request).includes('skill')) return { text: 'Mødelokaler' };
    const results = (request.messages || []).filter(item => item.role === 'tool');
    if (!results.length) return { tool: 'skill', args: { name: 'harness-udgivelse-og-gendannelse' } };
    return { text: 'Kontrolordet er FÆLLES-GRUNDLAG-02. Før udgivelsen gennemgår vi version, miljø, data og vejen tilbage.' };
  });
  try {
    const config = { $schema: 'https://opencode.ai/config.json', model: 'proeve/model', small_model: 'proeve/model', enabled_providers: ['proeve'],
      provider: { proeve: { npm: '@ai-sdk/openai-compatible', name: 'Prøve', options: { baseURL: fake.url, apiKey: 'ikke-en-rigtig-noegle' }, models: { model: { name: 'Prøvemodel', tool_call: true, limit: { context: 32768, output: 4096 } } } } },
      permission: { '*': 'deny', read: 'allow', skill: 'allow', list: 'allow', glob: 'allow' }, share: 'disabled', autoupdate: false, snapshot: false, plugin: [], mcp: {} };
    const result = await run(project, home, config, 'Jeg vil sætte appen i drift. Hvad er kontrolordet, og hvad skal vi gennemgå først? Ændr ingen filer.');
    const main = fake.requests.filter(request => toolNames(request).includes('skill'));
    assert.ok(main.length >= 2, `OpenCode sendte ${fake.requests.length} forespørgsler, heraf ${main.length} med skill-værktøjet. Exitkode ${result.code}.\n${result.err.slice(-1200)}`);
    const first = main[0];
    assert.match(text(first), /FÆLLES-GRUNDLAG-02/, 'grundreglerne fra AGENTS.md når modellen');
    assert.match(text(first), /Skills fra AI Harness/, 'oversigten over skills fra AGENTS.md når modellen');
    const skillTool = (first.tools || []).find(tool => (tool.function?.name || tool.name) === 'skill');
    const described = JSON.stringify(skillTool);
    const names = ['harness-ide-og-afgraensning', 'harness-sikkerhedsgennemgang', 'harness-udgivelse-og-gendannelse', 'harness-overdragelse-og-drift'];
    for (const name of names) assert.ok(described.includes(name) || text(first).includes(name), `${name} vises for modellen`);
    const toolResult = JSON.stringify((main[1].messages || []).filter(item => item.role === 'tool'));
    assert.match(toolResult, /Udgivelse og gendannelse/, 'skillens indhold sendes til modellen, når den bliver brugt');
    assert.match(toolResult, /references\/udgivelsestjekliste\.md|udgivelsestjekliste/, 'henvisningen til skillens tjekliste følger med');
    const events = result.out.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    assert.ok(events.some(event => event.type === 'tool_use' && event.part?.tool === 'skill'), 'OpenCode registrerer skill-kaldet');
    assert.match(events.filter(event => event.type === 'text').map(event => event.part?.text).join(''), /FÆLLES-GRUNDLAG-02/);
    assert.equal(await fs.readFile(path.join(project, 'README.md'), 'utf8'), '# Mødelokaler\n\nEn opdigtet app til at finde mødelokaler.\n', 'projektets egne filer er uændrede');
    console.log(JSON.stringify({ status: 'bestået', opencode: version, root, forespoergsler: fake.requests.length, checks: ['installation med scripts/harness.cjs', 'grundregler og kontrolord fra AGENTS.md sendes til modellen', 'alle Harness-skills står i skill-værktøjets beskrivelse', 'skillens indhold sendes, når modellen kalder den', 'ingen ekstern model eller nøgle'] }, null, 2));
  } finally { fake.instance.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
