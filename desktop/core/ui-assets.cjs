// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Manifest over de UI-filer, harness://-protokollen må servere. Én kilde: en ny UI-fil skal
// både ligge her og indlæses i index.html; ui-assets.test.cjs afviser glemsler begge veje,
// så en ny fil ikke længere giver en stille 404 fra protokollen.
const PROVIDER_ASSETS = /^provider-(alexandra|anthropic|azure|compatible|corti|komplai|mistral|ollama|openai|openrouter|zen|promte|github-pages|cloudflare|vercel)\.svg$/;
const ONBOARDING_ASSETS = ['onboarding-aura-mark.svg', 'onboarding-aura-mark-light.svg', 'onboarding-provider-claude.svg', 'onboarding-provider-mistral.svg'];
// Det ene serverede navn uden for ui/: brugerens egne profilbillede, som lever i
// appens private harness-mappe. Tilladelsen gælder netop dette navn — protokollen
// bliver aldrig en generel fillæser — og kun appens egen renderer kan bede om det.
const DYNAMIC_ASSETS = Object.freeze(['avatar.png']);
const FILES = [
  'aura-tokens.css', 'input-modality.js',
  'feedback-layout.js', 'feedback-layout.css', 'connection-removal.js', 'privacy-gate.js', 'privacy-gate.css',
  'app-version.js', 'preview-working.js', 'preview-working.css', 'idea-refinement.css', 'conversation-permission.css',
  'workspace-calm.js', 'workspace-calm.css', 'idea-refinement.js', 'conversation-permission.js', 'onboarding-compact.css',
  'history-pages.js', 'chat-materials.js', 'chat-materials.css', 'index.html', 'history-search.js', 'markdown.js',
  'project-settings.js', 'aura-icon.png', 'app.js', 'updates.js', 'workspace.js', 'plan-view.js', 'planning.js',
  'approval-view.js', 'approvals.js', 'preview-edit.js', 'history.js', 'chats.js', 'palette.js', 'model-advice.js',
  'provider-brand.js', 'connection-overview.js', 'chat-display.js', 'context-display.js', 'status-line.js', 'conversation-mode.js',
  'live-work.js', 'server.js', 'viewport.js', 'share-view.js', 'hosting.js', 'deployment-setup.js',
  'promte-preview.js', 'komplai-preview.js', 'deployment.js', 'styles.css', 'demo.css', 'onboarding-b.js', 'onboarding-b.css',
  'run-state.js', 'diff-review.js', 'shortcuts.js', 'request-log-view.js', 'profile-icons.js', 'profile-save.js', 'profile-chip.js', 'popover-layer.js', 'tooltip.js', 'slash-commands.js', 'permission-pill.js', 'composer-help.js', 'settings.js', 'settings.css', 'components.css',
  'onboarding-simple.css'
];
function allowed(name) {
  return DYNAMIC_ASSETS.includes(name) || PROVIDER_ASSETS.test(name) || ONBOARDING_ASSETS.includes(name) || name === 'provider-cloudflare.png' || FILES.includes(name);
}
function contentType(name) {
  if (name === 'aura-icon.png' || name === 'avatar.png') return 'image/png';
  if (PROVIDER_ASSETS.test(name) || ONBOARDING_ASSETS.includes(name)) return 'image/svg+xml';
  if (name.endsWith('.js')) return 'text/javascript';
  if (name.endsWith('.css')) return 'text/css';
  return 'text/html; charset=utf-8';
}
module.exports = { FILES, ONBOARDING_ASSETS, DYNAMIC_ASSETS, allowed, contentType };
