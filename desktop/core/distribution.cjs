// Fork distribution; storage and credential identities are intentionally separate.
// The visible product name is Aura Prime, and the GitHub repository is renamed to
// Parthee-Vijaya/Aura-Prime (2. november 2026). Old repo URLs redirect on GitHub, so
// installed beta clients' update checks keep working. Note: installed beta.15 clients
// validate update artifacts against the previous 'Aura-1' prefix; Parthee accepted on
// 2026-11-01 that they must reinstall manually once it changes.
module.exports = {
  displayName: 'Aura Prime',
  repository: 'Parthee-Vijaya/Aura-Prime',
  feed: 'https://github.com/Parthee-Vijaya/Aura-Prime/releases/',
  releases: 'https://github.com/Parthee-Vijaya/Aura-Prime/releases/',
  artifactPrefix: 'Aura-Prime'
};
