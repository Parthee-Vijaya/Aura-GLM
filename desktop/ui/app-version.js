// Read the running application metadata; the label follows every packaged release.
(async () => {
  try {
    const result = await window.harness.updatesState(undefined, null);
    const version = result.ok && result.value?.current;
    // "0.6.0-beta.4" reads "0.6.0 beta 4", the same name as the GitHub release.
    const match = typeof version === 'string' && version.match(/^(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/);
    if (!match) return;
    const label = match[2] ? `${match[1]} beta ${match[2]}` : match[1];
    for (const element of document.querySelectorAll('[data-app-version]')) element.textContent = label;
    for (const logo of document.querySelectorAll('.brand .aura-logo, .aura-brand .aura-logo')) logo.title = `Aura Prime ${label}`;
  } catch { /* Version lookup must never block startup or project creation. */ }
})();
