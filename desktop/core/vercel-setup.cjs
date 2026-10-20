const { command, publicURL } = require('./deployment-providers.cjs');

const id = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(value)) throw Error('Vælg et team og et projekt fra Vercel.');
  return value;
};
const text = value => typeof value === 'string' && value.length <= 250 && !/[\x00-\x1f\x7f]/.test(value) ? value : '';
const repository = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(value) || value.split('/')[1] === '.' || value.split('/')[1] === '..') throw Error('Vælg et GitHub-repository.');
  return value;
};
const portal = (scope, name) => `https://vercel.com/${id(scope)}/${id(name)}/settings/git`;
const importURL = () => 'https://vercel.com/new';

function project(value) {
  const result = { id: id(value?.id), name: id(value?.name), repository: null, productionBranch: text(value?.link?.productionBranch) || null, rootDirectory: text(value?.rootDirectory) || null, gitConnected: false };
  if (value.link?.type === 'github') {
    try { result.repository = repository(`${value.link.org}/${value.link.repo}`); result.gitConnected = true; } catch {}
  }
  return result;
}
function checkedConfig(value) {
  if (!value || value.provider !== 'vercel') throw Error('Vælg Vercel-projektet igen.');
  return { provider: 'vercel', scope: id(value.scope), project: id(value.project), repository: repository(value.repository), productionBranch: text(value.productionBranch) || null, name: id(value.name), portal: portal(value.scope, value.name) };
}
function deployment(value, config, filter = {}) {
  try {
    const meta = value?.meta || {};
    // Metadata alene er ikke nok: manuelle CLI-uploads kan have samme Git-felter.
    if (value.source !== 'git' || value.projectId !== config.project || value.deleted || value.softDeletedByRetention) return null;
    const repo = repository(`${meta.githubOrg || meta.githubCommitOrg}/${meta.githubRepo || meta.githubCommitRepo}`);
    if (repo.toLowerCase() !== config.repository.toLowerCase()) return null;
    const sha = meta.githubCommitSha, branch = text(meta.githubCommitRef);
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/i.test(sha) || !branch) return null;
    if (filter.sha && sha.toLowerCase() !== filter.sha.toLowerCase() || filter.branch && branch !== filter.branch) return null;
    const state = ['BUILDING', 'ERROR', 'INITIALIZING', 'QUEUED', 'READY', 'CANCELED', 'BLOCKED'].includes(value.readyState || value.state) ? value.readyState || value.state : 'UNKNOWN';
    const created = Number(value.createdAt ?? value.created);
    if (!Number.isFinite(created) || created <= 0 || Number.isNaN(new Date(created).valueOf())) return null;
    return { id: id(value.uid || value.id), state, sha: sha.toLowerCase(), branch, environment: value.target === 'production' ? 'production' : value.target == null || value.target === 'preview' ? 'preview' : 'unknown', url: value.url ? publicURL(value.url, '.vercel.app') : null, at: new Date(created).toISOString() };
  } catch { return null; }
}

class VercelSetup {
  constructor(store, run = command) { this.store = store; this.run = run; this.pending = null; }
  async api(route, scope) {
    const args = ['api', route, '--method', 'GET', '--raw', '--non-interactive'];
    if (scope) args.push('--scope', id(scope));
    try {
      const result = JSON.parse(await this.run(process.env.HARNESS_VERCEL_PATH || 'vercel', args));
      if (result?.error) throw Error();
      return result;
    } catch { throw Error('Vercel kunne ikke læses. Kontrollér login og adgang til teamet.'); }
  }
  async list(route, key, scope) {
    const values = [], cursors = new Set(); let next = null;
    for (let page = 0; page < 20; page++) {
      const response = await this.api(`${route}?limit=100${next ? '&until=' + encodeURIComponent(next) : ''}`, scope);
      const items = Array.isArray(response) ? response : response[key];
      if (!Array.isArray(items)) throw Error('Vercel gav en ukendt liste. Prøv igen.');
      values.push(...items);
      next = response.pagination?.next;
      if (next === undefined || next === null) return values;
      next = String(next);
      if (!/^\d{1,20}$/.test(next) || cursors.has(next)) throw Error('Vercels liste kunne ikke læses færdig.');
      cursors.add(next);
    }
    throw Error('Listen er for stor til at vise her. Åbn projektet hos Vercel.');
  }
  async state() {
    try { await this.run(process.env.HARNESS_VERCEL_PATH || 'vercel', ['--version']); }
    catch { return { status: 'tools-required', teams: [] }; }
    try {
      const items = await this.list('/v2/teams', 'teams'), seen = new Set();
      const teams = items.flatMap(item => {
        try {
          const value = { id: id(item.id), slug: id(item.slug), name: text(item.name) || item.slug };
          if (seen.has(value.id)) return []; seen.add(value.id); return [value];
        } catch { return []; }
      }).sort((a, b) => a.name.localeCompare(b.name, 'da'));
      return { status: teams.length ? 'ready' : 'no-teams', teams };
    } catch { return { status: 'login-required', teams: [] }; }
  }
  async login() {
    if (this.pending) throw Error('Vercel-login er allerede i gang.');
    // Vercel springer browseråbning over, hvis CI er sat. Der logges kun ind efter et konkret klik.
    this.pending = this.run(process.env.HARNESS_VERCEL_PATH || 'vercel', ['login', '--no-color'], { timeout: 180000, extra: { CI: '' } });
    try { await this.pending; return await this.state(); }
    catch { throw Error('Login blev ikke afsluttet. Prøv igen, eller log ind med Vercel CLI og vælg Kontrollér igen.'); }
    finally { this.pending = null; }
  }
  async projects(scope) {
    id(scope);
    const seen = new Set();
    return (await this.list('/v10/projects', 'projects', scope)).flatMap(item => {
      try { const p = project(item); if (seen.has(p.id)) return []; seen.add(p.id); return [p]; } catch { return []; }
    }).sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }
  async saved(root) {
    const config = (await this.store.project(root)).vercelGit;
    return config ? checkedConfig(config) : null;
  }
  async inspect(scope, projectID, expectedRepository) {
    id(scope); id(projectID); repository(expectedRepository);
    const selected = project(await this.api('/v9/projects/' + projectID, scope));
    if (selected.id !== projectID || !selected.gitConnected || selected.repository.toLowerCase() !== expectedRepository.toLowerCase()) throw Error('Vercel-projektets GitHub-forbindelse matcher ikke dit repository. Vælg projektet igen.');
    return selected;
  }
  async selection(input) {
    const selected = await this.inspect(input?.scope, input?.project, input?.repository);
    return checkedConfig({ provider: 'vercel', scope: input.scope, project: selected.id, repository: selected.repository, productionBranch: selected.productionBranch, name: selected.name });
  }
  async save(root, input) {
    const config = await this.selection(input);
    await this.store.saveProject(root, { vercelGit: config });
    return config;
  }
  async reset(root) { await this.store.saveProject(root, { vercelGit: null, deploymentTrackingSource: null }); return true; }
  async latestStatus(root, filter = {}) {
    let config = await this.saved(root);
    if (!config) return { config: null, latest: null };
    if (filter.sha !== undefined && (typeof filter.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(filter.sha))) throw Error('Git-versionen kan ikke kontrolleres.');
    if (filter.branch !== undefined && (!text(filter.branch) || filter.branch.length > 250)) throw Error('Git-grenen kan ikke kontrolleres.');
    const current = await this.inspect(config.scope, config.project, config.repository);
    config = { ...config, productionBranch: current.productionBranch, name: current.name, portal: portal(config.scope, current.name) };
    const query = new URLSearchParams({ projectId: config.project, limit: '100', ...(filter.sha ? { sha: filter.sha } : {}), ...(filter.branch ? { branch: filter.branch } : {}) });
    const response = await this.api('/v7/deployments?' + query, config.scope);
    if (!Array.isArray(response.deployments)) throw Error('Vercel gav ingen læsbar udgivelsesstatus.');
    const latest = response.deployments.map(value => deployment(value, config, filter)).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
    return { config, latest };
  }
}

module.exports = { VercelSetup, project, deployment, portal, importURL, checkedConfig };
