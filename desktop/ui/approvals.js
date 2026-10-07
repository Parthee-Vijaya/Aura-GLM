// Godkendelser i samtalen: hvad AI'en vil gøre, hvorfor, og hvad det betyder, hvis du tillader det.
// Tekniske detaljer er foldet sammen. Afvis stopper opgaven; Afvis med en besked lader AI'en fortsætte med din besked.
(() => {
  const view = window.ApprovalView;
  const kinds = { edit: 'Filændring', bash: 'Kommando', webfetch: 'Hjemmeside', external_directory: 'Adgang uden for projektet', grep: 'Søgning i filer' };
  // Målet vises som en sti i projektet, når det er muligt. OpenCode regner mønstre ud fra Git-roden eller fra computerens rod.
  function target(p) {
    const file = typeof p.metadata?.filepath === 'string' ? p.metadata.filepath : '';
    const root = p.workspaceRoot || current?.workspaceRoot || current?.root || '';
    if (p.permission === 'edit' && file && root && (file.startsWith(root + '/') || file.startsWith(root + '\\'))) return { projectFile: true, text: file.slice(root.length + 1).replaceAll('\\', '/') };
    if (p.permission === 'bash') return { text: p.toolInput?.command || p.metadata?.command || (p.patterns || []).join('\n') };
    if (p.permission === 'webfetch') return { text: p.metadata?.url || p.toolInput?.url || (p.patterns || []).join('\n') };
    return { text: (p.patterns || []).join('\n') || file };
  }
  function explanation(p, where) {
    const texts = {
      edit: where.projectFile ? ['Må AI’en ændre filer i projektet?', 'Filen ændres på din computer. Du kan fortryde det med en version.'] : ['Må AI’en ændre en fil uden for projektet?', 'Filen ligger ikke i projektmappen. Tillad kun, hvis du ved, hvorfor den skal ændres.'],
      bash: ['Må AI’en køre en kommando?', 'Kommandoen kører med dine rettigheder. Tillad kun, hvis du forstår, hvad den gør.'],
      webfetch: ['Må AI’en åbne en hjemmeside?', 'Hjemmesiden får besked om besøget, og indholdet sendes videre til din AI.'],
      external_directory: ['Må AI’en se en mappe uden for projektet?', 'Mappen kan indeholde materiale, du ikke vil dele med din AI.'],
      grep: ['Må AI’en søge i projektets filer?', 'Det, AI’en finder, sendes videre til din AI.']
    };
    const [title, effect] = texts[p.permission] || ['Gennemgå denne handling', 'Læs de tekniske detaljer, før du tillader den.'];
    return { title, effect };
  }
  function diffRows(diff) {
    const box = node('div', undefined, 'diff approval-diff');
    for (const row of diff.rows.slice(0, 400)) {
      if (row.type === 'gap') { box.append(node('div', '⋯', 'diff-gap')); continue; }
      const kind = row.type === '+' ? 'add' : row.type === '-' ? 'del' : 'same';
      const line = node('div', undefined, `diff-row ${kind}`), sign = node('span', row.type === ' ' ? '' : row.type === '+' ? '+' : '−', 'sign'); sign.setAttribute('aria-hidden', 'true');
      const text = node('span', undefined, 'code'); if (kind !== 'same') text.append(node('span', kind === 'add' ? 'Tilføjet: ' : 'Fjernet: ', 'visually-hidden')); text.append(row.text || ' ');
      line.append(node('span', row.old ?? '', 'ln'), node('span', row.new ?? '', 'ln'), sign, text); box.append(line);
    }
    if (diff.rows.length > 400) box.append(node('div', 'Ændringen er lang. Resten ses under Ændringer, når den er gemt.', 'diff-gap'));
    return box;
  }
  const record = (v, text) => v.log.append(node('p', text, 'chat-message answer-record'));
  // v er samtalens visning. Kortet står i den samtale, hvis AI spurgte, også når en anden samtale er åben.
  function show(p, v = viewFor()) {
    const where = target(p), explanationText = explanation(p, where);
    const title = p.isolated && where.projectFile ? 'Må AI’en ændre filer i samtalens kopi?' : explanationText.title;
    const effect = p.isolated && where.projectFile ? 'Kun kopien ændres. Du gennemgår ændringerne, før de flettes ind i projektet.' : explanationText.effect;
    const box = node('section', undefined, 'approval'); box.dataset.id = p.id;
    box.append(node('p', `Godkendelse · ${kinds[p.permission] || 'Handling'}`, 'approval-kind'), node('strong', title, 'approval-title'));
    const facts = node('dl', undefined, 'approval-facts');
    const fact = (label, ...content) => { const dd = node('dd'); dd.append(...content); facts.append(node('dt', label), dd); return dd; };
    // Hvad: den konkrete fil, kommando eller adresse og omfanget af ændringen.
    const diff = p.permission === 'edit' && typeof p.metadata?.diff === 'string' ? view.parseUnifiedDiff(p.metadata.diff) : null;
    if (where.text) {
      const what = node(p.permission === 'bash' ? 'code' : 'span', where.text, 'action-target');
      const dd = fact('Hvad', what);
      if (diff) dd.append(node('span', diff.created ? ` · ny fil med ${diff.added} ${diff.added === 1 ? 'linje' : 'linjer'}` : !diff.added && !diff.removed ? ' · ingen ændring i indholdet' : ` · ${diff.added} ${diff.added === 1 ? 'linje' : 'linjer'} tilføjet, ${diff.removed} fjernet`, 'approval-scope-text'));
      if (p.permission === 'bash' && p.toolInput?.workdir && current?.root && p.toolInput.workdir !== current.root) dd.append(node('span', ` · i mappen ${p.toolInput.workdir.startsWith(current.root + '/') ? p.toolInput.workdir.slice(current.root.length + 1) : p.toolInput.workdir}`, 'approval-scope-text'));
      if (p.permission === 'webfetch') { try { what.textContent = new URL(where.text).hostname; dd.append(node('span', ` · ${where.text}`, 'approval-scope-text')); } catch {} }
      window.workspace?.linkify(what);
    }
    // Hvorfor: AI'ens egen begrundelse, markeret som AI'ens.
    const reason = p.toolInput?.description || p.metadata?.description;
    if (reason) fact('Hvorfor', node('span', `AI’ens begrundelse: ${reason}`));
    // Hvis du tillader: konsekvensen og for kommandoer et gæt på, hvad den gør.
    const effectDd = fact('Hvis du tillader', effect);
    if (p.permission === 'bash') {
      const guesses = view.commandHints(where.text);
      if (guesses.length) { const list = node('ul', undefined, 'approval-hints'); for (const guess of guesses) list.append(node('li', guess)); const note = node('span', 'Et gæt ud fra kommandoens tekst, ikke en kontrol.', 'hint'); note.append(info('gættet', 'Kommandoer kan ændre eller slette filer, installere programmer og kontakte andre tjenester med dine rettigheder. Aura læser kun kommandoens tekst og kan ikke se, hvad den faktisk gør.')); effectDd.append(list, note); }
    }
    box.append(facts);
    if (diff && (diff.added || diff.removed)) { const fold = node('details', undefined, 'approval-fold'); fold.append(node('summary', 'Se ændringen'), diffRows(diff)); box.append(fold); }
    const technical = node('details', undefined, 'approval-fold'); technical.append(node('summary', 'Tekniske detaljer'), node('pre', JSON.stringify({ tilladelse: p.permission, mønstre: p.patterns, detaljer: { ...p.metadata, ...(p.metadata?.diff ? { diff: '(se ændringen ovenfor)' } : {}) } }, null, 2))); box.append(technical);
    // Filændringer i projektet kan tillades for resten af opgaven. Alt andet spørger hver gang.
    const choices = where.projectFile ? [['Afvis', false], ['Kun denne fil', true], ['Tillad for denne opgave', true, 'task']] : [['Afvis', false], ['Tillad én gang', true]];
    const row = node('div', undefined, 'approval-actions');
    // Handlingen i almindeligt dansk til linjen i samtalen, fx "ændre filer i projektet: public/index.html".
    const label = `${title.replace(/\?$/, '').replace(/^Må AI’en /, '')}${where.text ? `: ${where.text.split('\n')[0].slice(0, 120)}` : ''}`;
    const reply = (allow, scope, message) => action(async () => {
      await call('reply', { id: p.id, allow, scope, chat: v.id, ...(message ? { message } : {}) });
      box.remove(); doneWaiting(p.id, v);
      if (!allow && !message) { v.rejectedThisRun = true; v.lastRejection = { title, target: where.text }; }
      record(v, !allow ? (message ? `Du afviste, at AI’en må ${label}, og skrev: ${message}` : `Du afviste, at AI’en må ${label}. AI’en stopper.`) : scope ? 'Du gav AI’en lov til at ændre filer i projektet resten af opgaven.' : `Du gav AI’en lov til at ${label}.`);
      setStatusDetail(!allow ? (message ? 'AI’en har fået din besked og fortsætter …' : 'Handlingen er afvist. AI’en stopper.') : 'Godkendelsen er sendt. AI’en fortsætter …', v);
    });
    for (const [text, allow, scope] of choices) { const button = node('button', text, scope ? 'primary' : undefined); button.type = 'button'; button.onclick = () => reply(allow, scope); row.append(button); }
    box.append(row);
    if (where.projectFile) { const scope = node('p', 'Tillad for denne opgave gælder kun filer i projektmappen, til opgaven slutter.', 'hint approval-scope'); scope.append(info('omfanget', 'Kommandoer, hjemmesider og filer uden for projektet spørger stadig hver gang. Tilladelsen ophører, når opgaven slutter eller stoppes.')); box.append(scope); }
    // Afvis med en besked: AI'en får beskeden og fortsætter i stedet for at stoppe.
    const other = node('button', 'Afvis med en besked', 'text-button approval-message-link'); other.type = 'button';
    other.onclick = () => {
      other.hidden = true;
      const form = node('form', undefined, 'approval-message'); const id = `afvis-${p.id}`;
      const text = node('label', 'Hvad skal AI’en gøre i stedet?'); text.htmlFor = id;
      const input = node('textarea'); input.id = id; input.rows = 2; input.maxLength = 2000; input.required = true; input.placeholder = 'Fx Brug ikke en ny pakke. Skriv det i almindelig JavaScript.';
      const send = node('button', 'Afvis og send beskeden', 'primary'); send.type = 'submit';
      form.append(text, input, send); form.onsubmit = event => { event.preventDefault(); if (input.value.trim()) reply(false, undefined, input.value.trim()); };
      box.append(form); input.focus();
    };
    box.append(other);
    v.approvals.append(box); if (v === viewFor()) box.scrollIntoView({ block: 'nearest' });
    waitFor(p.id, title, box, v);
  }
  window.harness.onEvent(event => {
    if (event.type === 'permission.replied') { const v = viewFor(event.chat), box = [...v.approvals.children].find(item => item.dataset.id === event.properties?.requestID); if (box) { box.remove(); doneWaiting(event.properties.requestID, v); } }
  });
  window.approvals = { show };
})();
