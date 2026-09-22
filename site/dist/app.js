'use strict';

const byId = (id) => document.getElementById(id);
let catalog;
let selectedTool;
let selectedFile;

function announce(message) {
  byId('status').textContent = message;
}

function showFile(name) {
  selectedFile = selectedTool.files.find((file) => file.name === name) || selectedTool.files[0];
  byId('filename').textContent = selectedFile.name;
  byId('file-content').textContent = selectedFile.content;
  byId('file-content').scrollTop = 0;
  byId('single-download').href = selectedFile.url;
  byId('single-download').download = selectedFile.name;
  byId('single-download').setAttribute('aria-label', `Hent ${selectedFile.name}`);
  document.querySelectorAll('#file-tabs button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.file === selectedFile.name));
  });
}

function selectTool(id) {
  selectedTool = catalog.tools.find((tool) => tool.id === id) || catalog.tools[0];
  document.querySelectorAll('input[name="tool"]').forEach((input) => { input.checked = input.value === selectedTool.id; });
  byId('pack-title').textContent = selectedTool.name;
  byId('pack-summary').textContent = selectedTool.summary;
  byId('download').href = selectedTool.archive;
  byId('download').download = selectedTool.archive.split('/').pop();
  byId('download').setAttribute('aria-label', `Hent pakken til ${selectedTool.name}`);
  byId('guide-file').textContent = selectedTool.file;
  byId('verification').textContent = selectedTool.verification;
  byId('caveat').textContent = selectedTool.caveat;
  byId('source').href = selectedTool.source;
  byId('source').hidden = false;
  byId('file-tabs').replaceChildren(...selectedTool.files.map((file) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.file = file.name;
    button.textContent = file.name;
    button.addEventListener('click', () => showFile(file.name));
    return button;
  }));
  showFile(selectedTool.file);
  announce(`Pakken til ${selectedTool.name} er valgt.`);
}

async function copy(text, button, fallback) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Kopieret';
    announce('Teksten er kopieret.');
    setTimeout(() => { button.textContent = label; }, 1800);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(fallback);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = 'Markering klar – kopiér manuelt';
    announce('Automatisk kopiering er ikke tilgængelig. Teksten er markeret; brug din computers kopifunktion.');
    setTimeout(() => { button.textContent = label; }, 5000);
  }
}

byId('copy-prompt').addEventListener('click', (event) => copy(byId('test-prompt').textContent, event.currentTarget, byId('test-prompt')));
byId('copy-file').addEventListener('click', (event) => {
  if (selectedFile) copy(selectedFile.content, event.currentTarget, byId('file-content'));
});
document.querySelectorAll('input[name="tool"]').forEach((input) => input.addEventListener('change', () => {
  if (catalog) selectTool(input.value);
}));

fetch('catalog.json').then((response) => {
  if (!response.ok) throw new Error('Filoversigten kunne ikke hentes');
  return response.json();
}).then((data) => {
  catalog = data;
  byId('version').textContent = `Grundregler · v${catalog.version}`;
  selectTool(document.querySelector('input[name="tool"]:checked').value);
  byId('content').hidden = false;
}).catch(() => {
  byId('load-error').hidden = false;
}).finally(() => {
  byId('loading').hidden = true;
});
