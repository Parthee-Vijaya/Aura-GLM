// Afgrænset DOM-kontrol, ikke en WCAG-certificering. Kør i appens renderer.
function auditUI(selector) {
  const root = document.querySelector(selector);
  const visible = el => el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }) && el.getBoundingClientRect().width > 0;
  const textOf = id => document.getElementById(id)?.textContent.trim() || '';
  const name = el => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')?.split(/\s+/).map(textOf).join(' ') || [...(el.labels || [])].map(l => l.textContent.trim()).join(' ') || (el.matches('button,a,summary') ? el.textContent.trim() : '') || el.getAttribute('title') || '';
  const controls = [...root.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary')].filter(visible);
  const unnamed = controls.filter(el => !name(el)).map(el => ({ tag: el.tagName, id: el.id, type: el.type }));
  const dialogs = [...document.querySelectorAll('dialog[open]')].map(el => ({ id: el.id, name: name(el), visibleLabel: Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')?.split(/\s+/).some(id => { const label = document.getElementById(id); return label && visible(label); })) }));
  const duplicateIDs = [...document.querySelectorAll('[id]')].map(el => el.id).filter((id, i, ids) => ids.indexOf(id) !== i);
  return { unnamed, dialogs, duplicateIDs: [...new Set(duplicateIDs)], horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, width: innerWidth, height: innerHeight, focus: document.activeElement.id || document.activeElement.tagName };
}
module.exports = { auditUI };
