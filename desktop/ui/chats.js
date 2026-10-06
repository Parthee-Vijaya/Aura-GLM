// Sidepanelet: de seneste projekter med deres samtaler. Det åbne projekt er foldet ud; et klik på en samtale åbner den,
// og et klik på et andet projekt åbner det. + ved et projekt starter en ny samtale. En samtale, der arbejder, venter
// på dig eller er færdig, mens du så en anden, har en markering, så man kan se det uden at åbne den.
(() => {
  let projects = [], expanded = new Set(), showAll = new Set(), menuChat = null;
  try { expanded = new Set(JSON.parse(localStorage.getItem('aura.projects.open.v1')) || []); } catch { /* Kun visning. */ }
  const remember = () => { try { localStorage.setItem('aura.projects.open.v1', JSON.stringify([...expanded].slice(-20))); } catch { /* Kun visning. */ } };
  const visible = 6;
  // Kort tid: "nu", "i dag 14.32", "i går" eller "3. okt."
  function when(at) {
    const date = new Date(at); if (Number.isNaN(date.getTime())) return '';
    const day = new Date(); day.setHours(0, 0, 0, 0); const start = new Date(date); start.setHours(0, 0, 0, 0);
    const days = Math.round((day - start) / 86400000);
    return days === 0 ? date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : days === 1 ? 'i går' : date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
  }
  // Samtalens status lige nu. Den åbne samtales visning ved mere end hovedprocessens oversigt, fx om noget er ulæst.
  function status(chat) {
    const v = views.get(chat.id);
    if (v?.running || chat.running) return (v?.waitingFor.length || chat.waiting) ? { key: 'waiting', text: 'venter på dig' } : { key: 'running', text: 'arbejder' };
    if (v?.unread) return { key: 'unread', text: 'nyt resultat' };
    if (chat.status === 'interrupted') return { key: 'interrupted', text: 'afbrudt' };
    return null;
  }
  function render() {
    const list = $('#project-list'); if (!list) return;
    const focused = document.activeElement?.closest?.('#project-list') ? document.activeElement.dataset.key : '';
    list.replaceChildren(...projects.map(project => {
      const open = project.root === current?.root, folded = !(open || expanded.has(project.root));
      const item = node('li', undefined, `project-entry${open ? ' is-current' : ''}`);
      const row = node('div', undefined, 'project-row');
      const name = node('button', project.name, 'project-name'); name.type = 'button'; name.dataset.key = `p:${project.root}`;
      name.setAttribute('aria-expanded', String(!folded)); name.title = project.root;
      name.onclick = () => action(() => openProject(project));
      const add = node('button', '+', 'project-add'); add.type = 'button'; add.dataset.key = `a:${project.root}`;
      add.setAttribute('aria-label', `Ny samtale i ${project.name}`); add.title = 'Ny samtale';
      add.onclick = () => action(() => newChatIn(project));
      row.append(name, add); item.append(row);
      if (!folded) {
        const chats = node('ul', undefined, 'chat-list'); chats.setAttribute('aria-label', `Samtaler i ${project.name}`);
        const all = project.chats || [], shown = showAll.has(project.root) ? all : all.slice(0, visible);
        for (const chat of shown) {
          const li = node('li'), button = node('button', undefined, `chat-row${status(chat) ? ' has-status' : ''}`); button.type = 'button'; button.dataset.key = `c:${chat.id}`; button.dataset.chat = chat.id;
          const isOpen = open && view.id === chat.id, mark = status(chat);
          if (isOpen) button.setAttribute("aria-current", "true");
          const dot = node('span', '', `chat-status${mark ? ` is-${mark.key}` : ''}`); dot.setAttribute('aria-hidden', 'true');
          const title = node('span', chat.title || 'Ny samtale', 'chat-title');
          const meta = node('span', mark ? mark.text : when(chat.updatedAt), `chat-meta${mark ? ` is-${mark.key}` : ''}`);
          button.append(dot, title, meta);
          button.setAttribute('aria-label', `${chat.title || 'Ny samtale'}${mark ? `, ${mark.text}` : `, ${when(chat.updatedAt)}`}${isOpen ? ", åben" : ""}`);
          button.onclick = () => action(() => openChat(project, chat.id));
          const more = node('button', '•••', 'chat-more'); more.type = 'button'; more.dataset.key = `m:${chat.id}`;
          more.setAttribute('aria-label', `Flere valg for ${chat.title || 'Ny samtale'}`); more.title = 'Omdøb eller slet';
          more.hidden = !open; more.onclick = event => { event.stopPropagation(); showMenu(more, chat); };
          li.append(button, more); chats.append(li);
        }
        if (all.length > shown.length) { const li = node('li'), button = node('button', `Vis alle ${all.length} samtaler`, 'text-button chat-all'); button.type = 'button'; button.dataset.key = `s:${project.root}`; button.onclick = () => { showAll.add(project.root); render(); }; li.append(button); chats.append(li); }
        item.append(chats);
      }
      return item;
    }));
    // Fokus bliver på samme knap, når listen tegnes igen, fx når en samtale skifter status.
    if (focused) list.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus();
    $('#new-conversation').hidden = !current;
    const busy = anyRunning();
    for (const button of list.querySelectorAll('.project-entry:not(.is-current) .project-name, .project-entry:not(.is-current) .project-add, .project-entry:not(.is-current) .chat-row')) { button.disabled = busy; button.title = busy ? 'Vent, til AI-opgaverne er færdige, før du skifter projekt' : button.title; }
  }
  async function refresh() {
    try { projects = await call('recentProjects'); } catch { projects = []; }
    if (current && !projects.some(project => project.root === current.root)) projects.unshift({ id: '', root: current.root, name: current.name, chats: [] });
    render();
  }
  // Det åbne projekts samtaler opdateres med status fra hovedprocessen; andre projekter hentes ved næste opdatering.
  function update(event) {
    const project = projects.find(item => item.root === event.root);
    if (project) project.chats = event.chats; else return refresh();
    render();
  }
  async function openProject(project) {
    if (project.root === current?.root) { if (expanded.has(project.root)) expanded.delete(project.root); else expanded.add(project.root); remember(); render(); return; }
    if (!project.id) return;
    await saveChatDraft(); expanded.add(project.root); remember();
    await displayProject(await call('reopenProject', project.id));
  }
  async function openChat(project, id) {
    if (project.root !== current?.root) { await openProject(project); }
    if (view.id === id) { $('#prompt').focus(); return; }
    await saveChatDraft();
    await showChat(await call('chatOpen', id));
    $('#prompt').focus();
  }
  async function newChatIn(project) {
    if (project.root !== current?.root) await openProject(project);
    await newChat();
  }
  // Omdøb og slet ligger i en lille menu ved samtalen.
  function showMenu(anchor, chat) {
    menuChat = chat;
    const menu = $('#chat-menu'), box = anchor.getBoundingClientRect();
    menu.style.left = `${Math.round(box.left)}px`; menu.style.top = `${Math.round(box.bottom + 4)}px`;
    menu.showPopover(); $('#chat-rename').focus();
  }
  $('#chat-rename').onclick = () => {
    const chat = menuChat; $('#chat-menu').hidePopover(); if (!chat) return;
    const row = $('#project-list').querySelector(`.chat-row[data-chat="${CSS.escape(chat.id)}"]`); if (!row) return;
    const form = node('form', undefined, 'chat-rename'); const input = node('input'); input.value = chat.title || ''; input.maxLength = 80; input.setAttribute('aria-label', 'Samtalens navn');
    form.append(input); row.replaceWith(form); input.focus(); input.select();
    const done = save => action(async () => { if (save && input.value.trim() !== (chat.title || '')) await call('chatRename', { id: chat.id, title: input.value }); await refresh(); });
    form.onsubmit = event => { event.preventDefault(); done(true); };
    input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done(false); } });
    input.addEventListener('blur', () => { if (form.isConnected) done(true); });
  };
  $('#chat-delete').onclick = () => {
    const chat = menuChat; $('#chat-menu').hidePopover(); if (!chat) return;
    action(async () => {
      const wasOpen = view.id === chat.id;
      if (wasOpen) await saveChatDraft();
      const next = await call('chatDelete', { id: chat.id }); if (!next) return;
      views.delete(chat.id);
      if (wasOpen) await showChat(next); else await refresh();
    });
  };
  // Paletten bruger de samme projekter, markeringer og veje til at åbne en samtale.
  const meta = chat => status(chat)?.text || when(chat.updatedAt);
  window.chats = { refresh, render, update, projects: () => projects, meta, openChat, openProject: project => openProject(project) };
})();
