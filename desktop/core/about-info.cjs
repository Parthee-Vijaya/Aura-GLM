// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Fixed-field version information for the About dialog. Only known version
// shapes are admitted; no environment text, paths or credentials are ever
// part of the record. The "locked" values come from runtime-lock.json, and
// the running Electron/Node/Chromium values from the app process itself.
const VERSION = /^\d+(?:\.\d+){0,3}(?:[-.][0-9A-Za-z.]+)?$/;

function sanitizeVersion(value) {
  if (typeof value !== 'string' || !VERSION.test(value)) return null;
  return value.slice(0, 32);
}

function buildAboutInfo({ appVersion, opencode, electron, chromium, nodeEmbedded, nodeRuntime, git, platform, arch, osRelease }) {
  return {
    app: sanitizeVersion(appVersion),
    opencode: sanitizeVersion(opencode),
    electron: sanitizeVersion(electron),
    chromium: sanitizeVersion(chromium),
    nodeEmbedded: sanitizeVersion(nodeEmbedded),
    nodeRuntime: sanitizeVersion(nodeRuntime),
    git: sanitizeVersion(git),
    platform: ['darwin', 'linux', 'win32'].includes(platform) ? platform : null,
    arch: ['arm64', 'x64', 'ia32'].includes(arch) ? arch : null,
    osRelease: typeof osRelease === 'string' && /^\d+(\.\d+){0,3}/.test(osRelease) ? osRelease.slice(0, 16) : null,
  };
}

module.exports = { buildAboutInfo };
