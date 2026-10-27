// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAboutInfo } = require('../core/about-info.cjs');

test('Om-dialogens versioner godkender kun kendte formater og felter', () => {
  const about = buildAboutInfo({ appVersion: '1.0.0-beta.3', opencode: '2.1.4', electron: '45.0.0', chromium: '156.0.8078.48', nodeEmbedded: '24.22.0', nodeRuntime: '22.23.3', git: '2.53.0', platform: 'darwin', arch: 'arm64', osRelease: '25.6.0' });
  assert.equal(about.app, '1.0.0-beta.3');
  assert.equal(about.opencode, '2.1.4');
  assert.equal(about.electron, '45.0.0');
  assert.equal(about.chromium, '156.0.8078.48');
  assert.equal(about.nodeEmbedded, '24.22.0');
  assert.equal(about.nodeRuntime, '22.23.3');
  assert.equal(about.git, '2.53.0');
  assert.equal(about.platform, 'darwin');
  assert.equal(about.arch, 'arm64');
  assert.equal(about.osRelease, '25.6.0');
  const serialized = JSON.stringify(about);
  for (const forbidden of ['/', '..', 'env', 'Users', 'Library']) assert.equal(serialized.includes(forbidden), false, `fri tekst eller stier må aldrig optræde: ${forbidden}`);
});

test('Ugyldige versioner, platforme og systemudgaver afvises som null', () => {
  const about = buildAboutInfo({ appVersion: '1; rm -rf', opencode: '2.1.4 ', electron: 'v45/x', chromium: null, nodeEmbedded: [], nodeRuntime: '22.23.3\n', git: undefined, platform: 'sunos', arch: 'x86', osRelease: 'macOS femten' });
  assert.equal(about.app, null);
  assert.equal(about.opencode, null);
  assert.equal(about.electron, null);
  assert.equal(about.chromium, null);
  assert.equal(about.nodeEmbedded, null);
  assert.equal(about.nodeRuntime, null);
  assert.equal(about.git, null);
  assert.equal(about.platform, null);
  assert.equal(about.arch, null);
  assert.equal(about.osRelease, null);
});
