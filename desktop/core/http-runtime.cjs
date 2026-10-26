// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Electron/Node may bundle an older Undici than Aura's audited dependency.
// Install explicitly at the trusted application entry points, before core
// imports capture fetch. Importing this module does not modify test doubles,
// offline workers, renderer networking, dispatchers or destination policies.
const version = require('undici/package.json').version;
const VERSION = '7.30.1';
let installed = false;

function install() {
  if (version !== VERSION) throw new Error('Auras HTTP-runtime matcher ikke den afprøvede version.');
  if (!installed) {
    // Keep Request, Response, Headers and FormData in the same implementation.
    // Replacing fetch alone can mix incompatible WHATWG object identities.
    require('undici').install();
    installed = true;
  }
  return { version, installed };
}

module.exports = { install, VERSION };
