// Status-only presentation; never sends messages or grants permissions.
(() => {
  const el = id => document.getElementById(id);
  const revealed = new WeakMap();
  // Keep the existing iframe mounted, including its form and scroll state.
  const area = node('div', undefined, 'calm-preview-area');
  const surface = el('preview-surface'); surface.before(area); area.append(surface);
  const status = node('div', undefined, 'calm-preview-status'); status.hidden = true;
  const statusText = node('span'); statusText.setAttribute('role', 'status');
  const statusAction = node('button', 'Vis arbejdsstatus', 'text-button'); statusAction.type = 'button';
  statusAction.id = 'preview-work-status'; status.append(statusText, statusAction); area.before(status);
  const veil = node('div', undefined, 'calm-preview-veil'); veil.id = 'preview-work-veil'; veil.hidden = true;
  const card = node('div', undefined, 'calm-work-note');
  const orbit = node('span', undefined, 'calm-work-orbit'); orbit.setAttribute('aria-hidden', 'true');
  const logo = node('img'); logo.src = 'onboarding-aura-mark.svg'; logo.alt = ''; orbit.append(logo);
  const heading = node('h2', 'Din idé tager form'), note = node('p');
  const waitingButton = node('button', 'Se dit ventende valg'); waitingButton.type = 'button'; waitingButton.id = 'preview-work-waiting'; waitingButton.hidden = true;
  const revealButton = node('button', 'Vis forhåndsvisningen →'); revealButton.type = 'button'; revealButton.id = 'preview-work-reveal';
  card.append(orbit, heading, note, waitingButton, revealButton); veil.append(card); area.append(veil);

  function currentRun() {
    let saved = revealed.get(view);
    if (!saved || saved.started !== view.runStartedAt) { saved = { started: view.runStartedAt, reveal: false }; revealed.set(view, saved); }
    return saved;
  }
  function setText(target, text) { if (target.textContent !== text) target.textContent = text; }
  function render() {
    const active = view.running === true, waiting = active && view.waitingFor.length > 0;
    const saved = currentRun(), covered = active && !saved.reveal;
    const hadFocus = veil.contains(document.activeElement);
    status.hidden = !active; veil.hidden = !covered;
    // Prevent keyboard interaction with the obscured preview, never alter its sandbox.
    surface.inert = covered;
    area.dataset.state = waiting ? 'waiting' : active ? 'working' : 'idle';
    setText(statusText, waiting ? `Venter på dig: ${view.waitingFor[0].title}` : window.ChatDisplay.phase(view) || view.statusDetail || 'Aura arbejder …');
    setText(heading, waiting ? 'Et valg, før vi fortsætter' : 'Din idé tager form');
    setText(note, waiting ? 'Aura venter på dit svar i samtalen. Planer og godkendelser gælder fortsat.' : 'Aura arbejder på næste skridt. Du kan se forhåndsvisningen imens; den kan ændre sig under arbejdet.');
    waitingButton.hidden = !waiting;
    setText(statusAction, waiting ? 'Se dit valg' : covered ? 'Se aktivitet' : 'Vis arbejdsstatus');
    statusAction.setAttribute('aria-controls', waiting ? 'chat-panel' : covered ? 'panel-activity' : 'preview-work-veil');
    if (hadFocus && !covered) (active ? statusAction : el('tab-preview')).focus();
  }
  function goToWaiting() { window.calmWorkspace?.showChat(); el('agent-activity-jump').click(); }
  waitingButton.onclick = goToWaiting;
  revealButton.onclick = () => { currentRun().reveal = true; render(); statusAction.focus(); };
  statusAction.onclick = () => {
    if (view.waitingFor.length) return goToWaiting();
    if (!veil.hidden) window.workspace.show('activity', { focus: true });
    else { currentRun().reveal = false; render(); revealButton.focus(); }
  };
  window.previewWorking = { render };
  render();
})();
