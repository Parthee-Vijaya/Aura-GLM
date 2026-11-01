// Fork distribution; storage and credential identities are intentionally separate.
// The visible product name is Aura Prime. Repo and feed stay on Aura-GLM unless the
// GitHub repository itself is renamed (Parthee's separate call). Note: installed
// beta.15 clients validate update artifacts against the previous 'Aura-1' prefix;
// Parthee accepted on 2026-11-01 that they must reinstall manually once it changes.
module.exports = {
  displayName: 'Aura Prime',
  repository: 'Parthee-Vijaya/Aura-GLM',
  feed: 'https://github.com/Parthee-Vijaya/Aura-GLM/releases/',
  releases: 'https://github.com/Parthee-Vijaya/Aura-GLM/releases/',
  artifactPrefix: 'Aura-Prime'
};
