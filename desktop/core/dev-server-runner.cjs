// Køres af almindelig Node.js i en separat proces, først efter brugerens godkendelse.
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const [root, kind] = process.argv.slice(2);
let server;
// komplai Run-appens SDK på /_komplai/run/, som Run serverer det på appens egen adresse. Aura leverer filen.
let asked = 0;
const waiting = new Map();
process.on('message', message => { if (message?.type === 'komplai-sdk' && waiting.has(message.id)) { waiting.get(message.id)(message.script); waiting.delete(message.id); } });
const komplaiSdk = route => new Promise(resolve => { const id = ++asked; waiting.set(id, resolve); process.send?.({ type: 'komplai-sdk', id, route }); setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 20000).unref(); });
const komplai = { name: 'aura-komplai-sdk', configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
  const route = (req.url || '').split('?')[0];
  if (!['/_komplai/run/v1.js', '/_komplai/run/v1.mjs'].includes(route)) return next();
  const script = await komplaiSdk(route);
  if (typeof script !== 'string') { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(script);
}); } };
async function close() { try { await (kind === 'vite' ? server?.close() : server?.stop()); } finally { process.exit(0); } }
process.on('disconnect', close);
process.on('SIGTERM', close);
process.on('SIGINT', close);
(async () => {
  const requireProject = createRequire(path.join(root, 'package.json'));
  const entry = requireProject.resolve(kind);
  if (!entry.startsWith(path.join(root, 'node_modules') + path.sep)) throw new Error('Projektets egen framework-installation mangler.');
  const framework = await import(pathToFileURL(entry).href);
  let port, base = '/';
  if (kind === 'vite') {
    server = await framework.createServer({ root, clearScreen: false, plugins: [komplai], server: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
    await server.listen();
    const address = server.httpServer.address();
    if (address.address !== '127.0.0.1') throw new Error('Serveren skal lytte på loopback.');
    port = address.port; base = server.config.base;
  } else if (kind === 'astro') {
    server = await framework.dev({ root, server: { host: '127.0.0.1', port: 0, open: false }, vite: { clearScreen: false, plugins: [komplai], server: { strictPort: true, open: false } }, integrations: [{ name: 'aura-preview', hooks: { 'astro:config:done': ({ config }) => { base = config.base; } } }] });
    if (server.address.address !== '127.0.0.1') throw new Error('Serveren skal lytte på loopback.');
    port = server.address.port;
  } else throw new Error('Ukendt framework.');
  process.send?.({ type: 'ready', url: `http://127.0.0.1:${port}${base.startsWith('/') ? base : '/'}` });
})().catch(error => { console.error(error.message); process.exitCode = 1; process.exit(1); });
