// Køres af almindelig Node.js i en separat proces, først efter brugerens godkendelse.
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const [root, kind] = process.argv.slice(2);
let server;
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
    server = await framework.createServer({ root, clearScreen: false, server: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
    await server.listen();
    const address = server.httpServer.address();
    if (address.address !== '127.0.0.1') throw new Error('Serveren skal lytte på loopback.');
    port = address.port; base = server.config.base;
  } else if (kind === 'astro') {
    server = await framework.dev({ root, server: { host: '127.0.0.1', port: 0, open: false }, vite: { clearScreen: false, server: { strictPort: true, open: false } }, integrations: [{ name: 'ai-harness-preview', hooks: { 'astro:config:done': ({ config }) => { base = config.base; } } }] });
    if (server.address.address !== '127.0.0.1') throw new Error('Serveren skal lytte på loopback.');
    port = server.address.port;
  } else throw new Error('Ukendt framework.');
  process.send?.({ type: 'ready', url: `http://127.0.0.1:${port}${base.startsWith('/') ? base : '/'}` });
})().catch(error => { console.error(error.message); process.exitCode = 1; process.exit(1); });
