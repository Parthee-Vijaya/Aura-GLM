const choices = [...document.querySelectorAll('.download-choices a')];
const panels = [...document.querySelectorAll('.download-panel')];
const navigation = document.querySelector('.download-choices');
navigation.setAttribute('role', 'tablist');
choices.forEach(choice => choice.setAttribute('role', 'tab'));
panels.forEach(panel => panel.setAttribute('role', 'tabpanel'));

function selectPanel(id, focus = false) {
  const selected = choices.find(choice => choice.getAttribute('aria-controls') === id) || choices[0];
  for (const choice of choices) {
    const active = choice === selected;
    choice.setAttribute('aria-selected', String(active));
    choice.tabIndex = active ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.id !== selected.getAttribute('aria-controls');
  if (focus) selected.focus();
}
function navigate(choice) {
  history.pushState(null, '', choice.hash);
  selectPanel(choice.hash.slice(1), true);
}
for (const choice of choices) {
  choice.addEventListener('click', event => { event.preventDefault(); navigate(choice); });
  choice.addEventListener('keydown', event => {
    const index = choices.indexOf(choice);
    const next = { ArrowRight: (index + 1) % choices.length, ArrowLeft: (index + choices.length - 1) % choices.length, Home: 0, End: choices.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault(); navigate(choices[next]);
  });
}
window.addEventListener('hashchange', () => selectPanel(location.hash.slice(1)));
selectPanel(location.hash.slice(1));
if (['#app', '#terminal'].includes(location.hash)) window.addEventListener('load', () => window.scrollTo(0, 0), { once: true });
