const { ExternalEgress } = require('./privacy/external-egress.cjs');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { run, protectedPath, secretContent } = require('./git.cjs');
const { defaultName } = require('./history.cjs');
const { hooksBlock } = require('./checkpoints.cjs');

class GitTransport {
  constructor(provider, { getPrivacy } = {}) { this.provider = provider; this.egress = new ExternalEgress(getPrivacy); }
  async guard(root) {
    let names = '';
    try { names = (await run(root, ['config', '--name-only', '--get-regexp', '^(url\\.|http\\.|credential\\.)'])).toString(); }
    catch (error) { if (error.code !== 1 && error.gitExitCode !== 1) throw error; }
    if (names.split('\n').some(key => /^url\./i.test(key) || /^http\..*(extraheader|sslverify|proxy|cookiefile|savecookies|sslcert|sslkey)$/i.test(key))) throw new Error('Git har særlige netværks- eller URL-regler. Gennemgå publicering i dit Git-værktøj; appen tilsidesætter dem ikke.');
  }
  async command(root, target, args) {
    const assertCurrent = await this.egress.legacyPermit(root);
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(target.gitURL)) throw new Error('Git-destinationen er ikke understøttet af denne adapter.');
    await this.guard(root);
    const token = await this.provider.credential();
    const config = [['http.followRedirects', 'false'], ['http.sslVerify', 'true'], ['credential.helper', ''], ['http.https://github.com/.extraHeader', 'Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64')]];
    // Nøglen ligger kun i barnets miljø; aldrig i argumenter, remote-URL, projektfiler eller fejloutput.
    assertCurrent(); this.egress.service()?.bench?.releaseFreshGitForPublishing(root, assertCurrent);
    return run(root, args(target.gitURL), undefined, config);
  }
  async head(root, target, branch) {
    const value = (await this.command(root, target, url => ['ls-remote', '--heads', url, `refs/heads/${branch}`])).toString().trim();
    if (!value) return null;
    const [sha, ref] = value.split(/\s+/); if (!/^[a-f0-9]{40,64}$/.test(sha) || ref !== `refs/heads/${branch}`) throw new Error('Git-serveren gav en uventet branchreference.');
    return sha;
  }
  async fetch(root, target, branch) { await this.command(root, target, url => ['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', url, `refs/heads/${branch}`]); }
  async push(root, target, branch, sha) { await this.command(root, target, url => ['-c', 'push.followTags=false', 'push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no', url, `${sha}:refs/heads/${branch}`]); }
}
class Publishing {
  constructor({ store, git, provider, getPrivacy, transport = new GitTransport(provider, { getPrivacy }) }) { this.egress = new ExternalEgress(getPrivacy); this.store = store; this.git = git; this.provider = provider; this.transport = transport; this.reviews = new Map(); }
  async local(root) {
    const repo = await this.git.repository(root);
    if (!repo.initialized || repo.block || !repo.head) throw new Error(repo.block || 'Gem en lokal version før publicering.');
    if (repo.files.length) throw new Error('Gem eller gennemgå dine lokale ændringer først. Publicering kræver et rent arbejdsområde.');
    if ((await run(root, ['rev-parse', '--is-shallow-repository'])).toString().trim() === 'true' || (await run(root, ['for-each-ref', '--format=%(refname)', 'refs/replace'])).length) throw new Error('Shallow historik eller erstatningsobjekter kræver gennemgang i dit Git-værktøj.');
    const grafts = (await run(root, ['rev-parse', '--git-path', 'info/grafts'])).toString().trim();
    try { await fs.access(require('node:path').resolve(root, grafts)); throw new Error('Ændret lokal forældrehistorik kræver gennemgang i dit Git-værktøj.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const block = await hooksBlock(repo); if (block) throw new Error(block);
    return repo;
  }
  async target(root) {
    const assertCurrent = await this.egress.legacyPermit(root);
    const selection = (await this.store.project(root)).publication;
    if (!selection || selection.provider !== this.provider.id) throw new Error('Vælg et repository til projektet.');
    assertCurrent(); const target = await this.provider.get(selection.fullName);
    if (target.id !== selection.id) throw new Error('Repositoryet er blevet erstattet eller flyttet. Vælg destinationen igen.');
    if (!target.writable || target.archived) throw new Error('Kontoen har ikke skriveadgang til dette repository.');
    return target;
  }
  async attach(root, fullName) {
    const assertCurrent = await this.egress.legacyPermit(root);
    const repo = await this.local(root); assertCurrent(); const target = await this.provider.get(fullName);
    if (!target.writable || target.archived) throw new Error('Repositoryet kan ikke modtage ændringer fra denne konto.');
    const remotes = (await run(repo.root, ['remote'])).toString().trim().split('\n').filter(Boolean);
    let remoteName = '';
    for (const remote of remotes) {
      const url = (await run(repo.root, ['remote', 'get-url', remote])).toString().trim();
      if (url === target.gitURL || url === `git@github.com:${target.fullName}.git`) { remoteName = remote; break; }
    }
    if (!remoteName) {
      remoteName = remotes.includes('origin') ? 'harness-github' : 'origin';
      if (remotes.includes(remoteName)) throw new Error('Remote-navnet harness-github er allerede i brug. Appen overskriver det ikke.');
      await run(repo.root, ['remote', 'add', remoteName, target.gitURL]);
    }
    await this.store.saveProject(root, { publication: { provider: this.provider.id, fullName: target.fullName, id: target.id, remoteName } });
    this.reviews.clear(); return target;
  }
  async version(root, head) {
    if (!head) return null;
    const [name, at] = (await run(root, ['log', '-1', '--format=%s%x00%cI', head])).toString().trim().split('\0');
    return { name: (await this.store.project(root)).versionNames?.[head] || defaultName(name), at };
  }
  async status(root) {
    const repo = await this.git.repository(root); const selected = (await this.store.project(root)).publication;
    return { version: await this.version(root, repo.head), branch: repo.branch || '', head: repo.head || '', changes: repo.files?.length || 0, selected: selected || null, message: selected ? 'Destination gemt. Kontrollér serveren for aktuel status.' : 'Kun lokalt · intet repository valgt.' };
  }
  async scan(root, commits) {
    const paths = new Set(), scanned = new Map(); let total = 0;
    for (const commit of commits) {
      const entries = (await run(root, ['ls-tree', '-rz', '--full-tree', commit])).toString().split('\0').filter(Boolean);
      if (entries.length > 2000) throw new Error('Historikken indeholder for mange filer til appens publiceringskontrol.');
      for (const entry of entries) {
        const tab = entry.indexOf('\t'), file = entry.slice(tab + 1), [mode, type, sha] = entry.slice(0, tab).split(' ');
        paths.add(file); if (paths.size > 2000) throw new Error('Publiceringen omfatter mere end 2.000 forskellige filer.');
        if (protectedPath(file) || type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Historikken indeholder en privat fil, et link eller et undermodul: ${file}. Gennemgå historikken før publicering.`);
        if (scanned.has(sha)) { if (scanned.get(sha) && !/\.(png|jpe?g|webp|gif|ico|woff2?)$/i.test(file)) throw new Error(`Ukendt binær filtype i historikken: ${file}.`); continue; }
        const size = Number((await run(root, ['cat-file', '-s', sha])).toString());
        total += size; if (size > 2 * 1024 * 1024 || total > 20 * 1024 * 1024) throw new Error('Historikken overstiger publiceringskontrollens grænse (2 MB pr. fil / 20 MB samlet).');
        const content = await run(root, ['cat-file', 'blob', sha]); scanned.set(sha, content.includes(0));
        if (/^version https:\/\/git-lfs.github.com\/spec\/v1\r?\n/.test(content.toString())) throw new Error('Git LFS kræver publicering i dit Git-værktøj, så filobjekterne også uploades.');
        if (secretContent(content.toString()) || (content.includes(0) && !/\.(png|jpe?g|webp|gif|ico|woff2?)$/i.test(file))) throw new Error(`Historikken indeholder muligt privat eller ukendt binært indhold: ${file}. Gennemgå filen uden for appen.`);
      }
    }
    return [...paths].sort();
  }
  async review(root) {
    const assertCurrent = await this.egress.legacyPermit(root);
    const repo = await this.local(root); const target = await this.target(root);
    assertCurrent(); const remoteHead = await this.transport.head(repo.root, target, repo.branch);
    const version = await this.version(root, repo.head), checkedAt = new Date().toISOString();
    if (remoteHead === repo.head) return { synchronized: true, version, checkedAt, target, branch: repo.branch, head: repo.head, files: [], commits: [] };
    if (remoteHead) {
      assertCurrent(); await this.transport.fetch(repo.root, target, repo.branch);
      assertCurrent(); if (await this.transport.head(repo.root, target, repo.branch) !== remoteHead) throw new Error('Serveren blev ændret under gennemgangen. Kontrollér igen.');
      try { await run(repo.root, ['merge-base', '--is-ancestor', remoteHead, repo.head]); }
      catch { throw new Error('Serverens historik er foran, anderledes eller divergeret. Gennemgå og integrér ændringerne i dit Git-værktøj. Appen merger eller force-pusher ikke.'); }
    }
    const commits = (await run(repo.root, ['rev-list', '--max-count=101', repo.head, ...(remoteHead ? ['^' + remoteHead] : [])])).toString().trim().split('\n').filter(Boolean);
    if (commits.length > 100) throw new Error('Publiceringen indeholder mere end 100 commits. Gennemgå den i dit Git-værktøj.');
    const files = await this.scan(repo.root, commits);
    const token = randomUUID(); this.reviews.clear(); this.reviews.set(token, { root: repo.root, head: repo.head, branch: repo.branch, remoteHead, target, version, expires: Date.now() + 300000 });
    return { token, version, checkedAt, target, branch: repo.branch, head: repo.head, remoteHead, commits, files, synchronized: false };
  }
  async push(root, token) {
    const assertCurrent = await this.egress.legacyPermit(root);
    const review = this.reviews.get(token); this.reviews.delete(token);
    if (!review || review.expires < Date.now() || review.root !== await fs.realpath(root)) throw new Error('Gennemgå publiceringen igen.');
    const repo = await this.local(root); const target = await this.target(root);
    if (repo.head !== review.head || repo.branch !== review.branch || target.id !== review.target.id || target.private !== review.target.private) throw new Error('Projekt eller destination har ændret sig. Gennemgå publiceringen igen.');
    assertCurrent(); if (await this.transport.head(repo.root, target, repo.branch) !== review.remoteHead) throw new Error('Serveren er ændret siden gennemgangen. Kontrollér igen.');
    try { assertCurrent(); await this.transport.push(repo.root, target, repo.branch, repo.head); }
    catch (error) { if (error.code?.startsWith('PRIVACY_')) throw error; throw new Error('Push blev ikke bekræftet. Kontrollér serverstatus før et nyt forsøg. Rettigheder, branchregler eller nye serverændringer kan have afvist det. Intet force-push blev forsøgt.'); }
    assertCurrent(); const confirmed = await this.transport.head(repo.root, target, repo.branch);
    if (confirmed !== repo.head) throw new Error('Push-resultatet kunne ikke bekræftes. Kontrollér serveren igen.');
    return { version: review.version, checkedAt: new Date().toISOString(), head: confirmed, branch: repo.branch, target, message: 'Versionen er bekræftet på Git-serveren. Applikationen er ikke deployet.' };
  }
}
module.exports = { Publishing, GitTransport };
