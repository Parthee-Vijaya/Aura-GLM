// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { nativeTestProduct } = require('../scripts/native-test-product.cjs');

test('default native qualification resolves the existing source modules, runtime and profiles', () => {
  const product = nativeTestProduct({ packagePath: '' });
  assert.equal(product.identity.packaged, false);
  assert.equal(product.require('./core/runtime.cjs'), require('../core/runtime.cjs'));
  assert.equal(product.runtimeRoot, path.resolve(__dirname, '../.runtime', `${process.platform}-${process.arch}`));
  assert.equal(product.profilesRoot, path.resolve(__dirname, '../../profiles'));
});

test('native product imports cannot escape to source fallback, absolute files or unrelated packages', () => {
  const product = nativeTestProduct({ packagePath: '' });
  for (const request of ['../core/runtime.cjs', './core/../package.json', '/tmp/core/runtime.cjs', 'electron', './scripts/verify-package.cjs', './core/runtime.cjs\0']) {
    assert.throws(() => product.require(request), /direkte fra det valgte produkt/);
  }
});

test('a requested package fails in ordinary Node instead of silently testing source', { skip: process.versions.electron ? 'This rejection specifically exercises ordinary Node.' : false }, () => {
  assert.throws(() => nativeTestProduct({ packagePath: '/synthetic/does-not-exist/Aura 1.app' }), process.platform === 'darwin' ? /almindelig Node er ikke en pakket prøve/ : /macOS/);
});
