const $ = selector => document.querySelector(selector);
let current = null, revision = null, polling = false;
function message(text, error = false) { $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = false; }
async function call(method, value) {
  const result = await window.harness[method](value);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
async function action(fn) {
  $('#message').hidden = true;
  try { return await fn(); } catch (error) { message(error.message, true); }
}
function showAssets(assets) {
  $('#assets').replaceChildren();
  for (const asset of assets) {
    const item = document.createElement('li');
    item.append(document.createTextNode(`${asset.kind === 'logo' ? 'Logo' : 'Reference'}: ${asset.name} `));
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Fjern'; button.className = 'text-button';
    button.addEventListener('click', () => action(async () => showAssets(await call('removeAsset', asset.id))));
    item.append(button); $('#assets').append(item);
  }
}
function displayProject(project) {
  if (!project) return;
  current = project; revision = null;
  $('#view-title').textContent = 'Arbejdsområde'; $('#active-project').textContent = project.name; $('#active-project').classList.add('active');
  $('#onboarding').hidden = true; $('#workspace').hidden = false;
  $('#project-name').textContent = project.name; $('#project-purpose').textContent = project.purpose; $('#project-path').textContent = project.root;
  $('#preview').src = project.previewURL;
  $('#project-name').tabIndex = -1; $('#project-name').focus();
}
$('#color').addEventListener('input', event => { $('#color-value').value = event.target.value; });
for (const kind of ['logo', 'reference']) $(`#${kind}`).addEventListener('click', () => action(async () => showAssets(await call('chooseAssets', kind))));
$('#open').addEventListener('click', () => action(async () => displayProject(await call('openProject'))));
$('#new').addEventListener('click', () => action(async () => {
  await call('newProject'); current = null; revision = null;
  $('#preview').removeAttribute('src'); $('#workspace').hidden = true; $('#onboarding').hidden = false; $('#view-title').textContent = 'Projektopstart'; $('#active-project').textContent = 'Intet projekt åbent'; $('#active-project').classList.remove('active');
  $('#create-form').reset(); $('#color-value').value = $('#color').value; showAssets([]); $('#name').focus();
}));
$('#create-form').addEventListener('submit', event => {
  event.preventDefault();
  action(async () => {
    $('#create').disabled = true;
    try { displayProject(await call('createProject', { name: $('#name').value, purpose: $('#purpose').value, color: $('#color').value, links: $('#links').value.split('\n').map(line => line.trim()).filter(Boolean), tests: $('#tests').value })); }
    finally { $('#create').disabled = false; }
  });
});
$('#refresh').addEventListener('click', () => { if (current) $('#preview').src = current.previewURL; });
$('#narrow').addEventListener('click', () => { const narrow = $('#preview-surface').classList.toggle('narrow'); $('#narrow').setAttribute('aria-pressed', String(narrow)); });
setInterval(async () => {
  if (!current || polling) return;
  polling = true;
  const project = current;
  try {
    const next = await call('revision');
    if (current !== project) return;
    if (revision && next !== revision) $('#preview').src = current.previewURL;
    revision = next; $('#preview-status').textContent = 'Lokal forhåndsvisning';
  } catch { $('#preview-status').textContent = 'Kan ikke læse siden – kontrollér projektfilerne'; }
  finally { polling = false; }
}, 1500);
