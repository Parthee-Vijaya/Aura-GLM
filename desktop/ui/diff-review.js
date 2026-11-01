// Diff-rækker til Ændringer: én renderer for den enkelte fils linje-diff. Rækkerne er rene
// tekstknuder; omdøbninger fra tur-snapshots vises som 'gammel → ny sti'. n og p flytter
// mellem filerne, når gennemgangen har fokus — aldrig globalt, så tastaturvejene ikke støder
// sammen med skrivefeltet eller dialogerne.
(function (root) {
  // Omdøbningens label: gammel sti → ny sti; uden omdøbning bare stien.
  function renameLabel(entry) {
    return entry?.renamedFrom ? `${entry.renamedFrom} → ${entry.file}` : entry?.file || '';
  }

  // Rækkerne for én fil. helpers er { node, visuallyHidden, plural } — i rendereren de
  // globale fra app.js; testene giver deres egne stubs.
  function rows(detail, helpers) {
    const node = helpers.node, visuallyHidden = helpers.visuallyHidden, plural = helpers.plural;
    const out = [];
    const gap = count => node('div', `⋯ ${plural(count, 'uændret linje', 'uændrede linjer')}`, 'diff-gap');
    for (const hunk of detail.hunks || []) {
      if (hunk.skippedBefore > 0) out.push(gap(hunk.skippedBefore));
      for (const line of hunk.lines || []) {
        const kind = line.type === '+' ? 'add' : line.type === '-' ? 'del' : 'same';
        const row = node('div', undefined, `diff-row ${kind}`);
        const sign = node('span', line.type === ' ' ? '' : line.type === '+' ? '+' : '−', 'sign'); sign.setAttribute('aria-hidden', 'true');
        const text = node('span', undefined, 'code');
        if (kind !== 'same') text.append(visuallyHidden(kind === 'add' ? 'Tilføjet: ' : 'Fjernet: '));
        text.append(line.text || ' ');
        row.append(node('span', line.old ?? '', 'ln'), node('span', line.new ?? '', 'ln'), sign, text);
        out.push(row);
      }
    }
    if ((detail.hunks || []).length && detail.skippedAfter > 0) out.push(gap(detail.skippedAfter));
    return out;
  }

  // n/p-navigation i fillisten: kun når fokus står inde i Ændringspanelet, uden modifier og
  // uden tekstfelt. Flytningen sker gennem knapperne, så den normale visning følger med.
  function bindNavigation(container, fileList) {
    container.addEventListener('keydown', event => {
      if (event.key !== 'n' && event.key !== 'p') return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) return;
      const active = document.activeElement;
      if (!active || !container.contains(active) || active.closest('input, textarea, select')) return;
      if (document.querySelector('dialog[open], [popover]:popover-open')) return;
      const buttons = [...fileList.querySelectorAll('.file-row')];
      if (!buttons.length) return;
      event.preventDefault();
      const current = buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true');
      const next = event.key === 'n' ? Math.min(buttons.length - 1, current + 1) : Math.max(0, current < 0 ? 0 : current - 1);
      buttons[next].click();
    });
  }

  const api = { rows, renameLabel, bindNavigation };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.DiffReview = api;
})(typeof window === 'object' ? window : globalThis);
