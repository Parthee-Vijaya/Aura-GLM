(function (root) {
  // Kontrollen gælder kun det seneste katalogkald i denne appsession, aldrig en kodeopgave.
  function tracker() {
    const checks = new Map();
    return {
      get: id => checks.get(id),
      clear: id => checks.delete(id),
      begin(id) { const check = { status: 'checking' }; checks.set(id, check); return check; },
      finish(id, check, result) {
        if (checks.get(id) !== check) return false;
        checks.set(id, { ...result, checkedAt: Date.now() }); return true;
      }
    };
  }
  function page(connections, definitions, query = '', index = 0) {
    const search = query.trim().toLocaleLowerCase('da-DK');
    const found = connections.filter(c => [c.name, definitions[c.kind]?.name, definitions[c.kind]?.provider, c.account?.organisationName].filter(Boolean).join(' ').toLocaleLowerCase('da-DK').includes(search));
    const pages = Math.max(1, Math.ceil(found.length / 4));
    const current = Math.max(0, Math.min(Number.isInteger(index) ? index : 0, pages - 1));
    return { items: found.slice(current * 4, current * 4 + 4), total: found.length, pages, index: current };
  }
  const api = { tracker, page };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ConnectionOverview = api;
})(globalThis);
