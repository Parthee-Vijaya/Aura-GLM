// Native first-start geometry. This stores presentation only, never identity or access.
class OnboardingWindow {
  constructor(store) { this.store = store; this.compact = false; }
  async initialize() {
    const data = await this.store.read();
    const complete = typeof data.desktopWelcomeComplete === 'boolean'
      ? data.desktopWelcomeComplete
      : Boolean(data.profile?.migrated || data.connections?.length || Object.keys(data.projects || {}).length);
    if (typeof data.desktopWelcomeComplete !== 'boolean') {
      await this.store.update(state => { state.desktopWelcomeComplete = complete; });
    }
    this.compact = !complete;
  }
  options() {
    return this.compact
      ? { width: 600, height: 700, minWidth: 520, minHeight: 620, resizable: false, maximizable: false, fullscreenable: false }
      : {};
  }
  async finish(window) {
    if (!this.compact) return { compact: false };
    await this.store.update(state => { state.desktopWelcomeComplete = true; });
    this.compact = false;
    if (window && !window.isDestroyed()) {
      window.setResizable(true); window.setMaximizable(true); window.setFullScreenable(true);
      // Review 4.11: the first project opens in a calm, centred 1440×940 window
      // instead of jumping to full screen around a small setup card.
      window.setMinimumSize(980, 720); window.setSize(1440, 940); window.center();
    }
    return { compact: false };
  }
}
module.exports = { OnboardingWindow };
