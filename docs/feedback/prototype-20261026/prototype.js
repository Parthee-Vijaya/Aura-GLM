(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let scene = 'working', timer, toastTimer, yolo = false, mode = 'Byg';
  const scenes = {
    question: ['Ét valg hjælper mig med at forme den første version. Resten kan jeg foreslå ud fra din beskrivelse.', 'Venter på dit svar', 'Spørgsmålet står i samtalen.'],
    plan: ['Her er et forslag til den første version. Du kan rette planen, inden du godkender den.', 'Byggeplanen afventer dig', 'Godkend eller ret planen ovenfor.'],
    working: ['Jeg arbejder videre med din godkendte plan. Første version bruger fiktive møder og sender ingen tilmeldinger.', 'Tilføjer tilmeldingen', 'Seneste signal: netop nu · simuleret'],
    quiet: ['Den seneste forhåndsvisning bliver stående, mens vi afventer modellen.', 'Afventer modellen', 'Ingen nye signaler i 30 sekunder · simuleret'],
    complete: ['Første version er klar til din gennemgang. Prøv et møde og tilmeldingsforløbet i forhåndsvisningen.', 'Klar til din gennemgang', 'Resultat og kontroller kan ses til højre.'],
    stopped: ['Det simulerede arbejde er stoppet. Din besked og den seneste visning bliver stående.', 'Stoppet af dig', 'Du kan sende en ny besked, når du er klar.']
  };
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
  function closeMenus() { for (const name of ['plus', 'mode']) { $(name + '-menu').hidden = true; $(name + '-button').setAttribute('aria-expanded', 'false'); } }
  function info(title, paragraphs) {
    $('info-title').textContent = title; $('info-body').replaceChildren();
    for (const value of paragraphs) { const p = document.createElement('p'); p.textContent = value; $('info-body').append(p); }
    $('info-dialog').showModal();
  }
  function setScene(value) {
    clearTimeout(timer); scene = value;
    const [text, title, detail] = scenes[value];
    $('assistant-text').textContent = text; $('status-title').textContent = title; $('status-detail').textContent = detail;
    $('question-card').hidden = value !== 'question'; $('plan-card').hidden = value !== 'plan';
    $('activity-card').hidden = !['working', 'quiet', 'complete', 'stopped'].includes(value);
    $('result-card').hidden = value !== 'complete';
    $('composer').classList.toggle('working', value === 'working');
    $('work-status').classList.toggle('quiet', value !== 'working');
    $('preview-work').hidden = !['working', 'quiet'].includes(value);
    $('preview-work').classList.toggle('quiet', value === 'quiet');
    $('stop-button').hidden = !['working', 'quiet'].includes(value);
    $('send-button').hidden = ['working', 'quiet'].includes(value);
    $('active-title').textContent = value === 'complete' ? 'Tilmeldingsforløbet er afprøvet' : value === 'quiet' ? 'Afventer næste signal' : value === 'stopped' ? 'Arbejdet er stoppet' : 'Tilføjer tilmeldingen';
    $('active-detail').textContent = value === 'complete' ? 'Tilmelding og tomme felter · simuleret kontrol.' : value === 'quiet' ? 'Ingen ny fremdrift registreret i eksemplet.' : value === 'stopped' ? 'Ingen yderligere handlinger udføres i eksemplet.' : 'Felter og bekræftelse til den første version.';
    $('activity-count').textContent = value === 'complete' ? '3 trin afsluttet · eksempel' : '2 trin afsluttet · eksempel';
    $('activity-list').lastElementChild.classList.toggle('done', value === 'complete');
    $('activity-list').lastElementChild.querySelector('span').className = value === 'working' ? 'pulse-dot' : '';
    $('activity-list').lastElementChild.querySelector('span').textContent = value === 'complete' ? '✓' : value === 'working' ? '' : '·';
    document.querySelectorAll('[data-scene]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === value)));
    $('waiting-banner').hidden = true;
    closeMenus();
    if (value === 'question') requestAnimationFrame(() => updateQuestionVisibility());
  }
  function updateQuestionVisibility() {
    if (scene !== 'question') { $('waiting-banner').hidden = true; return; }
    const box = $('question-card').getBoundingClientRect(), container = $('messages').getBoundingClientRect();
    const visible = Math.min(box.bottom, container.bottom) - Math.max(box.top, container.top);
    $('waiting-banner').hidden = visible >= Math.min(box.height, container.height) * .45;
  }
  function answer(text) {
    if (!text.trim()) { $('own-answer').focus(); return; }
    setScene('plan'); toast('Svar gemt i prøven: ' + text.trim().slice(0, 120));
    $('messages').scrollTop = 0;
  }
  function setPanel(name) {
    document.querySelectorAll('[data-panel]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.panel === name)));
    $('preview-panel').hidden = name !== 'preview'; $('document-panel').hidden = name === 'preview';
    const panel = $('document-panel'); panel.replaceChildren();
    if (name === 'preview') return;
    const h = document.createElement('h1'); h.textContent = { plan: 'Den aftalte første version', changes: 'Ændringer i dit projekt', activity: 'Arbejdets forløb' }[name]; panel.append(h);
    const descriptions = {
      plan: ['Mødeoversigt → vælg møde → tilmelding → bekræftelse.', 'Fiktive møder, ingen rigtige tilmeldinger eller betaling. Mobilvenligt design og afprøvning af hovedforløbet.', 'Planen er tilgængelig her gennem arbejdet. Godkendelse af planen giver ikke flere rettigheder til data eller værktøjer.'],
      changes: ['Her findes filoversigt, diff, tidligere versioner og fortrydelse. De er bevaret i forslaget.', 'Eksempel: public/index.html · tilmeldingsformular og bekræftelse.', 'Denne prototype ændrer ingen filer. En rigtig ændringsoversigt vil vise de faktiske ændringer.'],
      activity: ['Planen gennemgået → mødeoversigt klar → tilmelding under arbejde → afprøvning.', 'Tilstandene i denne prøve er simulerede. I Aura skal de komme fra faktisk registrerede hændelser.', 'Tekniske detaljer, kommandoer og godkendelser bevares her.']
    };
    for (const text of descriptions[name]) { const p = document.createElement('p'); p.textContent = text; panel.append(p); }
    if (name === 'plan') { const button = document.createElement('button'); button.textContent = 'Ret planen i samtalen'; button.onclick = () => { setScene('plan'); document.body.classList.remove('mobile-surface'); $('prompt').focus(); }; panel.append(button); }
  }
  document.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => { setScene(b.dataset.scene); $('messages').scrollTop = 0; });
  document.querySelectorAll('[data-panel]').forEach(b => b.onclick = () => setPanel(b.dataset.panel));
  document.querySelectorAll('[data-answer]').forEach(b => b.onclick = () => answer(b.dataset.answer));
  $('answer-form').onsubmit = event => { event.preventDefault(); answer($('own-answer').value); };
  function sendOnEnter(event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); event.target.form.requestSubmit(); } }
  $('own-answer').addEventListener('keydown', sendOnEnter); $('prompt').addEventListener('keydown', sendOnEnter);
  $('prompt').addEventListener('input', () => { $('prompt').style.height = 'auto'; $('prompt').style.height = Math.min(128, $('prompt').scrollHeight) + 'px'; });
  $('approve-plan').onclick = () => { setScene('working'); $('messages').scrollTop = $('messages').scrollHeight; toast('Planen er valgt i prøven. Tilladelser ændres ikke.'); };
  $('change-plan').onclick = () => { $('prompt').value = 'Ret planen: '; $('prompt').focus(); };
  $('plan-button').onclick = () => setPanel('plan');
  $('try-result').onclick = () => { setPanel('preview'); document.body.classList.add('mobile-surface'); document.querySelector('.meeting-button').focus(); };
  $('composer').onsubmit = event => {
    event.preventDefault(); if (['working', 'quiet'].includes(scene)) { toast('Tryk Stop, før du sender i denne prøve. Din tekst bliver stående.'); return; }
    const value = $('prompt').value.trim(); if (!value) return;
    if (mode === 'Byg') { setScene('plan'); toast('Ændringen er foreslået. Byggeplanen afventer din gennemgang.'); }
    else info(mode === 'Planlæg' ? 'Planforslag' : 'Samtale', ['Eksempelbesked: ' + value, 'Denne arbejdsmåde ændrer ingen filer. Valget er bevaret fra Aura.']);
    $('prompt').value = ''; $('prompt').style.height = 'auto';
  };
  $('stop-button').onclick = () => setScene('stopped');
  $('waiting-banner').onclick = () => { $('question-card').scrollIntoView({ block: 'start' }); $('own-answer').focus({ preventScroll: true }); updateQuestionVisibility(); };
  $('show-work').onclick = () => { const target = scene === 'question' ? $('question-card') : scene === 'plan' ? $('plan-card') : $('activity-card'); target.open = true; target.scrollIntoView({ block: 'nearest' }); };
  $('messages').addEventListener('scroll', updateQuestionVisibility); new ResizeObserver(updateQuestionVisibility).observe($('messages'));
  for (const name of ['plus', 'mode']) $(name + '-button').onclick = () => { const open = $(name + '-menu').hidden; closeMenus(); $(name + '-menu').hidden = !open; $(name + '-button').setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', event => { if (!event.target.closest('.menu-anchor')) closeMenus(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenus(); });
  document.querySelectorAll('[data-material]').forEach(b => b.onclick = () => { $('material-chip').hidden = false; $('material-chip').textContent = b.dataset.material + ' · eksempel'; closeMenus(); });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; $('mode-button').textContent = mode + ' ⌄'; closeMenus(); });
  $('model-button').onclick = () => info('Forbindelse og model', ['Eksempelmodel: Mistral. Modellen, forbruget og kontekstvinduet er fortsat synlige under samtalen.', 'Prøven skifter ingen rigtig forbindelse og sender ingen data.']);
  $('connection-button').onclick = () => $('remove-dialog').showModal();
  $('confirm-remove').onclick = () => { $('remove-dialog').close(); $('connection-button').disabled = true; toast('Den fiktive forbindelse er fjernet.'); };
  $('yolo-button').onclick = () => { closeMenus(); if (yolo) { yolo = false; updateYolo(); toast('YOLO er slået fra i prøven.'); } else $('yolo-dialog').showModal(); };
  function updateYolo() { $('permission-label').textContent = yolo ? 'YOLO · denne samtale' : 'Almindelige godkendelser'; $('yolo-button').textContent = yolo ? 'Slå YOLO fra' : 'YOLO for denne samtale …'; }
  $('confirm-yolo').onclick = () => { yolo = true; updateYolo(); $('yolo-dialog').close(); toast('YOLO valgt til eksempelsamtalen. Ingen rigtig tilladelse er ændret.'); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
  $('info-dialog').addEventListener('click', event => { const r = $('info-dialog').getBoundingClientRect(); if (event.target === $('info-dialog') && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) $('info-dialog').close(); });
  $('settings-button').onclick = () => info('Indstillinger', ['Forslag: Enter sender i chat og svar på AI-spørgsmål. Shift+Enter indsætter en ny linje.', 'Almindelige formularer, flerlinjebeskrivelser og godkendelser får ikke automatisk Enter-afsendelse.', 'Prøven gemmer ikke indstillinger eller credentials.']);
  $('notes-button').onclick = () => info('Forslaget i korte træk', ['Mere plads til samtalen: et mindre skrivefelt i hvile og en sidebar, der kan justeres med mus eller tastatur.', 'Arbejdsstatus tæt ved skrivefeltet. Rolig bevægelse ved faktiske signaler; tydelig ventestatus, når der mangler nye signaler.', 'Et frit svarfelt er synligt med det samme. Banneret vises kun, når spørgsmålet er ude af syne. Spørgsmålet forbliver ubesvaret, indtil du svarer.', 'En kort byggeplan med tekniske detaljer foldet væk. Eksisterende Byg/Planlæg/Samtale, planvalg, dataregler og YOLO-grænser bevares.', 'Forbindelser kræver bekræftelse ved fjernelse. Sikkerhedsvalg godkendes aldrig ved et klik uden for dialogen.', 'Forhåndsvisningen her er håndlavet. Automatisk serverstart er ikke implementeret eller godkendt gennem dette preview.']);
  $('new-chat').onclick = () => { yolo = false; updateYolo(); setScene('question'); $('own-answer').value = ''; $('prompt').value = ''; toast('Ny eksempelsamtale. YOLO er slået fra.'); };
  $('current-conversation').onclick = () => { document.body.classList.remove('mobile-surface'); $('prompt').focus(); };
  $('theme-button').onclick = () => { const light = document.documentElement.dataset.theme !== 'light'; document.documentElement.dataset.theme = light ? 'light' : 'dark'; $('theme-button').textContent = light ? 'Mørkt tema' : 'Lyst tema'; };
  $('mobile-button').onclick = () => { const narrow = $('demo-app').classList.toggle('narrow'); $('mobile-button').setAttribute('aria-pressed', String(narrow)); };
  document.querySelectorAll('.meeting-button').forEach(b => b.onclick = () => info('Tilmelding · demo', ['Her åbner tilmeldingen i den færdige app. Møderne og tiderne i denne designprøve er fiktive.', 'Intet tilmeldes, gemmes eller sendes fra prøven.']));
  $('mobile-chat').onclick = () => document.body.classList.remove('mobile-surface');
  $('mobile-preview').onclick = () => document.body.classList.add('mobile-surface');
  function sidebarWidth(width) { const value = Math.max(170, Math.min(280, width)); document.documentElement.style.setProperty('--side-width', value + 'px'); $('sidebar-divider').setAttribute('aria-valuenow', String(Math.round(value))); }
  let pointer = null;
  $('sidebar-divider').onpointerdown = event => { if (event.button !== 0) return; pointer = event.pointerId; event.currentTarget.setPointerCapture(pointer); event.preventDefault(); };
  $('sidebar-divider').onpointermove = event => { if (event.pointerId === pointer) sidebarWidth(event.clientX); };
  $('sidebar-divider').onpointerup = $('sidebar-divider').onpointercancel = $('sidebar-divider').onlostpointercapture = () => { pointer = null; };
  $('sidebar-divider').ondblclick = () => sidebarWidth(202);
  $('sidebar-divider').onkeydown = event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); sidebarWidth(event.key === 'Home' ? 170 : event.key === 'End' ? 280 : Number(event.currentTarget.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -10 : 10)); };
  const before = [
    ['Arbejder · mørk', '01-working-dark-1280x800.png'], ['Arbejder · lys', '02-working-light-1280x800.png'],
    ['Spørgsmål', '05-question-dark-1440x900.png'], ['Forbindelse', '08-connection-remove-light.png']
  ];
  function showBefore(file) { $('before-image').src = 'before/' + file; $('before-caption').textContent = 'Aktuel kode · Electron på Mac · kontrollerede lokale hændelser · ingen rigtig AI.'; }
  before.forEach(([label, file]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => showBefore(file); $('before-links').append(b); });
  $('before-button').onclick = () => { $('before-view').hidden = false; $('after-view').hidden = true; $('before-button').setAttribute('aria-pressed', 'true'); $('after-button').setAttribute('aria-pressed', 'false'); showBefore(before[0][1]); };
  $('after-button').onclick = () => { $('before-view').hidden = true; $('after-view').hidden = false; $('before-button').setAttribute('aria-pressed', 'false'); $('after-button').setAttribute('aria-pressed', 'true'); };
  setScene('working');
})();
