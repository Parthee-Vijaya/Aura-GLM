// Afprøver en Aura Harness-installation i den rigtige Claude Code med en kontrolleret lokal server i Anthropics format.
// Prøven viser, hvad Claude Code faktisk sender til modellen: CLAUDE.md med den importerede AGENTS.md,
// listen over skills og indholdet af en skill, når modellen beder om den. Ingen konto, nøgle eller rigtig model bruges.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const claude = process.env.HARNESS_CLAUDE_PATH || 'claude';

function sse(response, events) {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of events) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  response.end();
}

function message(content, stop) {
  return { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: 'claude-proeve', content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
}

function server(script) {
  const requests = [];
  const instance = http.createServer((request, response) => {
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.endsWith('/count_tokens')) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ input_tokens: 100 })); return; }
      if (!url.pathname.endsWith('/v1/messages')) { response.writeHead(404, { 'content-type': 'application/json' }); response.end('{"type":"error","error":{"type":"not_found_error","message":"ukendt"}}'); return; }
      const json = JSON.parse(body || '{}');
      requests.push(json);
      const reply = script(json);
      const content = reply.tool ? [{ type: 'tool_use', id: `toolu_${requests.length}`, name: reply.tool, input: reply.input }] : [{ type: 'text', text: reply.text }];
      const stop = reply.tool ? 'tool_use' : 'end_turn';
      if (!json.stream) { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(message(content, stop))); return; }
      const block = reply.tool ? { type: 'tool_use', id: content[0].id, name: reply.tool, input: {} } : { type: 'text', text: '' };
      const delta = reply.tool ? { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) } : { type: 'text_delta', text: reply.text };
      sse(response, [
        { type: 'message_start', message: message([], null) },
        { type: 'content_block_start', index: 0, content_block: block },
        { type: 'content_block_delta', index: 0, delta },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } },
        { type: 'message_stop' }
      ]);
    });
  });
  return new Promise(resolve => instance.listen(0, '127.0.0.1', () => resolve({ instance, requests, url: `http://127.0.0.1:${instance.address().port}` })));
}

function run(project, home, url, prompt) {
  return new Promise((resolve, reject) => {
    // Rent miljø med egen hjemmemappe: ingen personlige indstillinger, hooks, skills eller login indgår.
    const env = { PATH: process.env.PATH, HOME: home, TERM: 'dumb', LANG: 'da_DK.UTF-8', ANTHROPIC_BASE_URL: url, ANTHROPIC_API_KEY: 'ikke-en-rigtig-noegle', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
    const child = spawn(claude, ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '4', '--no-session-persistence', '--allowedTools', 'Read Glob Grep Skill', '--disallowedTools', 'Edit Write Bash WebFetch WebSearch'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', data => { out += data; }); child.stderr.on('data', data => { err += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Claude Code svarede ikke i tide.\n${err.slice(-2000)}`)); }, Number(process.env.HARNESS_CLAUDE_TIMEOUT || 120000));
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

const flat = value => JSON.stringify(value || '');
const toolNames = request => (request.tools || []).map(tool => tool.name);

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-claude-'));
  const project = path.join(root, 'projekt');
  const home = path.join(root, 'hjem');
  await fs.mkdir(project); await fs.mkdir(home);
  const readme = '# Mødelokaler\n\nEn opdigtet app til at finde mødelokaler.\n';
  await fs.writeFile(path.join(project, 'README.md'), readme);
  execFileSync('git', ['init', '-q'], { cwd: project });
  execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'harness.cjs'), 'install', '--tools', 'claude-code', '--project', project, '--yes']);
  const version = execFileSync(claude, ['--version'], { env: { PATH: process.env.PATH, HOME: home } }).toString().trim();

  const fake = await server(request => {
    if (!toolNames(request).includes('Skill')) return { text: 'Mødelokaler' };
    const used = (request.messages || []).some(item => Array.isArray(item.content) && item.content.some(part => part.type === 'tool_result'));
    if (!used) {
      const schema = request.tools.find(tool => tool.name === 'Skill').input_schema || {};
      const key = Object.keys(schema.properties || {}).find(name => /skill|command|name/i.test(name)) || 'skill';
      return { tool: 'Skill', input: { [key]: 'harness-udgivelse-og-gendannelse' } };
    }
    return { text: 'Kontrolordet er FÆLLES-GRUNDLAG-02. Før udgivelsen gennemgår vi version, miljø, data og vejen tilbage.' };
  });
  try {
    const result = await run(project, home, fake.url, 'Jeg vil sætte appen i drift. Hvad er kontrolordet, og hvad skal vi gennemgå først? Ændr ingen filer.');
    const main = fake.requests.filter(request => toolNames(request).includes('Skill'));
    assert.ok(main.length >= 2, `Claude Code sendte ${fake.requests.length} forespørgsler, heraf ${main.length} med Skill-værktøjet. Exitkode ${result.code}.\n${result.err.slice(-1500)}\n${result.out.slice(-1500)}`);
    const first = main[0];
    const context = flat(first.system) + flat(first.messages);
    assert.match(context, /FÆLLES-GRUNDLAG-02/, 'grundreglerne fra den importerede AGENTS.md når modellen');
    assert.match(context, /Skills fra Aura Harness/, 'oversigten over skills fra AGENTS.md når modellen');
    const listing = context + flat(first.tools);
    for (const name of ['harness-ide-og-afgraensning', 'harness-sikkerhedsgennemgang', 'harness-udgivelse-og-gendannelse', 'harness-overdragelse-og-drift']) assert.ok(listing.includes(name), `${name} vises for modellen`);
    const followUp = flat(main[main.length - 1].messages);
    assert.match(followUp, /Udgivelse og gendannelse/, 'skillens indhold sendes til modellen, når den bliver brugt');
    const events = result.out.split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    assert.ok(events.some(event => event.type === 'assistant' && flat(event.message?.content).includes('"name":"Skill"')), 'Claude Code registrerer Skill-kaldet');
    const final = events.find(event => event.type === 'result');
    assert.match(final?.result || '', /FÆLLES-GRUNDLAG-02/);
    assert.equal(await fs.readFile(path.join(project, 'README.md'), 'utf8'), readme, 'projektets egne filer er uændrede');
    console.log(JSON.stringify({ status: 'bestået', claude: version, root, forespoergsler: fake.requests.length, checks: ['installation med scripts/harness.cjs', 'CLAUDE.md importerer AGENTS.md, og kontrolordet når modellen', 'alle Harness-skills vises for modellen', 'skillens indhold sendes, når modellen kalder Skill', 'ingen konto, nøgle eller rigtig model'] }, null, 2));
  } finally { fake.instance.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
