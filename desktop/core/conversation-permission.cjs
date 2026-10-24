// App-lifetime permission. Never serialized into history, prompts or project settings.
const { randomUUID } = require('node:crypto');
class ConversationPermission {
  constructor({ now = Date.now } = {}) { this.active = false; this.revision = 0; this.pending = null; this.now = now; }
  review(binding) {
    this.pending = { token: randomUUID(), revision: this.revision, expires: this.now() + 300000, binding };
    return { token: this.pending.token, expires: this.pending.expires };
  }
  check(token, acknowledged) {
    const p = this.pending;
    if (acknowledged !== true || !p || p.token !== token || p.revision !== this.revision || this.now() >= p.expires) throw new Error('Gennemgå advarslen om fuld tilladelse igen.');
    return p;
  }
  activate(review) {
    if (this.check(review.token, true) !== review) throw new Error('Tilladelsen er ændret.');
    this.active = true; this.pending = null; this.revision++;
  }
  revoke() { this.active = false; this.pending = null; this.revision++; }
  state() { return { active: this.active }; }
}
module.exports = { ConversationPermission };
