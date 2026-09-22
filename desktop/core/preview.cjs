const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };

async function publicFile(root, relative) {
  const parts = relative.split('/');
  if (parts.some(part => !part || part.startsWith('.') || part.includes('\\') || part.includes(':'))) throw new Error('Ugyldig sti.');
  let target = root;
  if (!(await fs.lstat(target)).isDirectory()) throw new Error('Ugyldig rodmappe.');
  for (const part of parts) {
    target = path.join(target, part);
    if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('Symbolske links serveres ikke.');
  }
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Filen kan ikke vises.');
  return target;
}
async function startPreview(projectRoot) {
  const root = path.join(projectRoot, 'public');
  const token = randomBytes(24).toString('hex');
  let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts");
    try {
      if (req.headers.host !== new URL(origin).host || !['GET', 'HEAD'].includes(req.method)) throw new Error('Afvist.');
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      if (!pathname.startsWith(`/${token}/`)) throw new Error('Afvist.');
      const relative = pathname.slice(token.length + 2) || 'index.html';
      const file = await publicFile(root, relative);
      res.setHeader('Content-Type', mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
      const data = await fs.readFile(file);
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Filen findes ikke i projektets offentlige mappe.');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { url: `${origin}/${token}/`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
module.exports = { startPreview, publicFile };
