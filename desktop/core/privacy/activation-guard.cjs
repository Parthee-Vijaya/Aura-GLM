// SPDX-License-Identifier: EUPL-1.2
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PrivacyGateError } = require('./policy.cjs');

// Session-local knowledge, not a claim to discover arbitrary pre-existing host
// processes. A normal exit/process-group Stop cannot retire detached children
// from a previously uncontained engine, installer or development server.
class PrivacyActivationGuard {
  #uncontained = new Map();
  #wrapped = new WeakSet();
  root(value) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) throw new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Projektets procesgrænse kunne ikke kontrolleres.');
    try { return fs.realpathSync(value); } catch (error) { if (error.code === 'ENOENT') return path.resolve(value); throw error; }
  }
  record(root, kind) {
    if (!['agent', 'preview', 'installation', 'git'].includes(kind)) throw new Error('Unknown uncontained runtime.');
    const key = this.root(root), kinds = this.#uncontained.get(key) || new Set();
    kinds.add(kind); this.#uncontained.set(key, kinds);
  }
  trackEngine(engine, root) {
    if (!engine || typeof engine.start !== 'function' || this.#wrapped.has(engine)) return engine;
    const start = engine.start, guard = this;
    this.#wrapped.add(engine);
    engine.start = function (...args) { guard.record(typeof root === 'function' ? root() : root, 'agent'); return start.apply(this, args); };
    return engine;
  }
  activation(root, { enabled = true } = {}) {
    const key = root ? this.root(root) : null;
    const check = () => {
      if (enabled && key && this.#uncontained.has(key)) throw new PrivacyGateError('PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED', 'Dette projekt har kørt en agent, installation, server eller Git-handling uden Privacy Gates procesisolation i denne app-session. Aura kan ikke bekræfte, at eventuelle baggrundsprocesser er væk. Datakontrol er ikke aktiveret. Brug et nyt arbejdsområde, og slå datakontrol til før første kørsel.');
      return true;
    };
    check(); return check;
  }
}
module.exports = { PrivacyActivationGuard };
