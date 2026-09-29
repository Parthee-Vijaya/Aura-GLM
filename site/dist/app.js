'use strict';

const byId = (id) => document.getElementById(id);
let catalog;
let selectedTool;
let selectedFile;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function announce(message) {
  byId('status').textContent = message;
}

// Hvert filindhold står kun én gang i kataloget; værktøjernes filer henviser til det.
function fileContent(file) {
  if (file.ref) return catalog.contents[file.ref];
  return catalog.skills.find((skill) => skill.name === file.skill).files.find((item) => item.path === file.file).content;
}

function showFile(path) {
  selectedFile = selectedTool.files.find((file) => file.path === path) || selectedTool.files[0];
  byId('file-select').value = selectedFile.path;
  byId('filename').textContent = selectedFile.path;
  byId('file-content').textContent = fileContent(selectedFile);
  byId('file-content').scrollTop = 0;
}

function renderFiles() {
  const groups = [['Regler og vejledning', (file) => !file.skill], ['Skills', (file) => Boolean(file.skill)]];
  byId('file-select').replaceChildren(...groups.map(([label, test]) => {
    const group = element('optgroup');
    group.label = label;
    group.append(...selectedTool.files.filter(test).map((file) => { const option = element('option', file.path); option.value = file.path; return option; }));
    return group;
  }).filter((group) => group.children.length));
  byId('file-count').textContent = `${selectedTool.files.length} filer`;
  showFile(selectedTool.files.find((file) => !file.skill)?.path);
}

function selectTool(id) {
  selectedTool = catalog.tools.find((tool) => tool.id === id) || catalog.tools[0];
  document.querySelectorAll('input[name="tool"]').forEach((input) => { input.checked = input.value === selectedTool.id; });
  byId('pack-title').textContent = selectedTool.name;
  byId('pack-summary').textContent = selectedTool.summary;
  byId('pack-status').textContent = catalog.statuses[selectedTool.status];
  byId('pack-status').title = selectedTool.testedWith || '';
  byId('verification').textContent = selectedTool.verification;
  byId('caveat').textContent = selectedTool.caveat;
  byId('sources').replaceChildren(...selectedTool.sources.flatMap((source, index) => {
    const link = element('a', `${source.title} ↗`);
    link.href = source.url;
    return index ? [document.createTextNode(' · '), link] : [link];
  }));
  const installable = selectedTool.installable;
  byId('download').hidden = !installable;
  byId('download-note').hidden = !installable;
  byId('knowledge').hidden = installable;
  byId('content').classList.toggle('without-files', !installable);
  byId('pack-included').replaceChildren(...(installable
    ? ['Fælles grundregler på dansk', `${catalog.skills.length} skills i ${selectedTool.dirs.join(' og ')}`, 'Afsnit til .gitignore', 'Vejledning til dig og til din kodeagent', 'Versions- og indholdsoversigt']
    : ['Grundregler og en oversigt over arbejdsgangene', 'Til platformens felt til projektets viden']).map((text) => element('li', text)));
  byId('pack-warnings').replaceChildren(...(selectedTool.warnings || []).map((text) => element('li', text)));
  if (installable) {
    byId('download').href = selectedTool.archive;
    byId('download').download = selectedTool.archive.split('/').pop();
    byId('download').setAttribute('aria-label', `Hent pakken til ${selectedTool.name}`);
    renderFiles();
  }
  byId('file-select').closest('.file-panel').hidden = !installable;
  announce(`Pakken til ${selectedTool.name} er valgt.`);
}

function renderTools() {
  byId('tool-picker').replaceChildren(...Object.entries(catalog.categories).map(([category, label]) => {
    const fieldset = element('fieldset', undefined, 'tool-picker');
    fieldset.append(element('legend', label));
    for (const tool of catalog.tools.filter((item) => item.category === category)) {
      const option = element('label', undefined, 'tool');
      const input = element('input');
      input.type = 'radio'; input.name = 'tool'; input.value = tool.id;
      input.addEventListener('change', () => selectTool(tool.id));
      const text = element('span');
      text.append(element('strong', tool.name), element('small', `${tool.vendor} · ${catalog.statuses[tool.status]}`));
      option.append(input, text, element('span', undefined, 'radio-mark'));
      option.querySelector('.radio-mark').setAttribute('aria-hidden', 'true');
      fieldset.append(option);
    }
    return fieldset;
  }));
}

function renderSkills() {
  byId('skill-count').textContent = catalog.skills.length;
  byId('skill-list').replaceChildren(...catalog.skills.map((skill, index) => {
    const details = element('details');
    const summary = element('summary');
    summary.append(element('span', String(index + 1).padStart(2, '0')), document.createTextNode(skill.title));
    const more = element('a', 'Læs mere →');
    more.href = `skills.html#${skill.name}`;
    const text = element('p', `${skill.summary} `);
    text.append(more);
    details.append(summary, text);
    return details;
  }));
}

async function copy(text, button, fallback) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Kopieret';
    announce('Teksten er kopieret.');
    setTimeout(() => { button.textContent = label; }, 1800);
  } catch {
    if (fallback) {
      const range = document.createRange();
      range.selectNodeContents(fallback);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    button.textContent = 'Markér og kopiér manuelt';
    announce('Automatisk kopiering er ikke tilgængelig. Brug din computers kopifunktion.');
    setTimeout(() => { button.textContent = label; }, 5000);
  }
}

byId('file-select').addEventListener('change', (event) => showFile(event.target.value));
byId('copy-prompt').addEventListener('click', (event) => copy(byId('test-prompt').textContent, event.currentTarget, byId('test-prompt')));
byId('copy-agent-prompt').addEventListener('click', (event) => copy(byId('agent-prompt').textContent, event.currentTarget, byId('agent-prompt')));
byId('copy-file').addEventListener('click', (event) => { if (selectedFile) copy(fileContent(selectedFile), event.currentTarget, byId('file-content')); });
byId('copy-knowledge').addEventListener('click', (event) => copy(selectedTool.knowledge, event.currentTarget));

fetch('catalog.json').then((response) => {
  if (!response.ok) throw new Error('Filoversigten kunne ikke hentes');
  return response.json();
}).then((data) => {
  catalog = data;
  byId('version').textContent = `Version ${catalog.version} · kontrolleret ${catalog.checkedAt}`;
  byId('footer-version').textContent = `Grundregler og skills ${catalog.version} · Filplaceringer kontrolleret ${catalog.checkedAt}. Modeladfærd er ikke certificeret.`;
  byId('agent-prompt').textContent = catalog.agentPrompt;
  byId('control-note').textContent = `Forvent kontrolordet ${catalog.controlWord} og skills, der begynder med harness-. Et korrekt svar tyder på, at filerne er indlæst. Det viser ikke, om agenten følger dem i praksis.`;
  renderTools();
  renderSkills();
  const requested = new URLSearchParams(location.search).get('vaerktoej');
  selectTool(catalog.tools.some((tool) => tool.id === requested) ? requested : catalog.tools[0].id);
  byId('content').hidden = false;
}).catch(() => {
  byId('load-error').hidden = false;
}).finally(() => {
  byId('loading').hidden = true;
});
