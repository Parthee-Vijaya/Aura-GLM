// Native-reference shell. Product state, policy, draft saves and handlers stay in their owners.
(() => {
  const root = document.getElementById('workspace');
  const el = id => document.getElementById(id);
  const body = document.body, grid = root.querySelector('.work-grid');
  const narrow = matchMedia('(max-width: 720px)');
  const overlaySidebar = matchMedia('(max-width: 900px)');
  const compact = matchMedia('(max-width: 1100px)');
  const surfaceToggle = el('surface-toggle'), sidebarToggle = el('sidebar-toggle');
  const icon = paths => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24','aria-hidden':'true',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round'})) svg.setAttribute(key,value);
    for (const d of paths) { const p = document.createElementNS(svg.namespaceURI,'path'); p.setAttribute('d',d); svg.append(p); }
    return svg;
  };
  const panelIcon = () => icon(['M4 4.5h16v15H4z','M9.5 4.5v15']);
  const newIcon = () => icon(['M4.5 18.7 3 21l4.6-1.2A9 9 0 1 0 4.5 18.7Z','M12 7v10M7 12h10']);
  const setClass = (target,name,on) => { if(target.classList.contains(name)!==on)target.classList.toggle(name,on); };

  el('send').replaceChildren(icon(['M12 19V5','m6 11 6-6 6 6'])); el('send').setAttribute('aria-label','Send besked');
  el('stop').replaceChildren(icon(['M7 7h10v10H7z'])); el('stop').setAttribute('aria-label','Stop arbejdet');
  el('chat-materials-plus').replaceChildren(icon(['M12 5v14M5 12h14']));
  const newMark=el('new-chat').querySelector('span[aria-hidden]'); if(newMark)newMark.replaceChildren(newIcon());
  el('tools-button').querySelector('.nav-text').textContent='Kodeværktøjer';
  el('tools-button').title='Aura Harness i dit kodeværktøj';

  // The existing collapse button lives in the system titlebar area, above the large brand.
  const sidebarTitlebar=node('div',undefined,'native-sidebar-titlebar');
  sidebarTitlebar.append(sidebarToggle); el('sidebar').prepend(sidebarTitlebar);
  const version=el('sidebar').querySelector('[data-app-version]');
  if(version){ const meta=node('div',undefined,'native-version'); meta.append('Aura Prime ',version); el('project-menu').append(meta); }
  const more=node('details',undefined,'disclosure native-sidebar-more');
  const moreTitle=node('summary','Flere muligheder'); more.append(moreTitle);
  const moreBody=node('div',undefined,'native-sidebar-more-body');more.append(moreBody);
  el('sidebar').querySelector('nav').append(more);
  for(const id of ['tools-button','intro-button','version-status','project-menu-toggle','deployment-status','deploy-button']){
    const button=el(id);if(!button)continue;
    if(id==='project-menu-toggle')button.append(node('span','Projektmenu'));
    moreBody.append(button);
  }

  const navigation=node('button',undefined,'calm-navigation');navigation.id='workspace-navigation';navigation.type='button';navigation.append(panelIcon());
  navigation.setAttribute('aria-label','Vis sidepanelet');navigation.setAttribute('aria-controls','sidebar');
  const quickNew=node('button',undefined,'native-new-chat');quickNew.id='workspace-new-chat';quickNew.type='button';quickNew.append(newIcon());
  quickNew.setAttribute('aria-label','Ny samtale');quickNew.title='Ny samtale';quickNew.onclick=()=>el('new-chat').click();
  const headerTools=node('div',undefined,'native-header-navigation');headerTools.append(navigation,quickNew);root.querySelector('.workspace-bar').prepend(headerTools);
  const syncNew=()=>{quickNew.disabled=el('new-chat').disabled;};
  new MutationObserver(syncNew).observe(el('new-chat'),{attributes:true,attributeFilter:['disabled']});syncNew();

  // Keep the original welcome heading for mode-specific accessible copy; the visible brand is Aura's own.
  const heroBrand=node('div',undefined,'native-hero-brand');
  const heroMark=root.querySelector('.hero-mark');
  const brandMark=el('sidebar').querySelector('.brand-icon');
  if(brandMark)heroMark.src=brandMark.getAttribute('src');
  heroBrand.append(heroMark,node('span','Aura Prime'));
  el('conversation-hero').prepend(heroBrand);

  const conversationTabs=node('nav',undefined,'native-conversation-tabs');conversationTabs.setAttribute('aria-label','Samtalevisning');
  const transcriptButton=node('button','Samtale'),trajectoryButton=node('button','Arbejdsspor');
  transcriptButton.id='workspace-transcript';trajectoryButton.id='workspace-trajectory';
  for(const button of [transcriptButton,trajectoryButton])button.type='button';
  transcriptButton.setAttribute('aria-controls','chat-panel');trajectoryButton.setAttribute('aria-controls','panel-activity');
  conversationTabs.append(transcriptButton,trajectoryButton);grid.before(conversationTabs);
  transcriptButton.onclick=()=>{showPane(false);if(grid.dataset.surface==='on'&&(compact.matches||window.workspace?.active==='activity'))setSurface(false);el('prompt').focus();};
  trajectoryButton.onclick=()=>{setSurface(true);window.workspace.show('activity',{focus:true,reveal:false});showPane(true);};

  const mobile=node('nav',undefined,'calm-mobile-tabs');mobile.setAttribute('aria-label','Arbejdsvisning');
  const chatButton=node('button','Samtale'),surfaceButton=node('button','Arbejdsflade');
  chatButton.type=surfaceButton.type='button';chatButton.id='workspace-chat';surfaceButton.id='workspace-surface';
  chatButton.setAttribute('aria-controls','chat-panel');surfaceButton.setAttribute('aria-controls','work-surface');
  mobile.append(chatButton,surfaceButton);root.append(mobile);
  const dismissSurface=node('button',undefined,'calm-surface-dismiss');dismissSurface.type='button';dismissSurface.tabIndex=-1;dismissSurface.setAttribute('aria-label','Luk arbejdsfladen');grid.append(dismissSurface);
  dismissSurface.onclick=()=>{setSurface(false);surfaceToggle.focus();};
  const surfaceHeading=node('div',undefined,'calm-surface-heading');
  const surfaceBack=node('button',undefined,'text-button');surfaceBack.id='workspace-back-to-chat';surfaceBack.type='button';surfaceBack.setAttribute('aria-controls','chat-panel');
  surfaceBack.append(icon(['M19 12H5','m11 6-6 6 6 6']),document.createTextNode('Til samtalen'));
  surfaceHeading.append(node('span','Arbejdsflade'),surfaceBack);el('work-surface').prepend(surfaceHeading);
  surfaceBack.onclick=()=>{setSurface(false);showPane(false);el('prompt').focus();};

  // Profile remains the single theme source; the local hint only gives a synchronous first frame.
  const themeHintKey='aura.theme-hint.v1',systemDark=matchMedia('(prefers-color-scheme: dark)');
  function storedChoice(){try{const v=localStorage.getItem(themeHintKey);return['system','light','dark'].includes(v)?v:null;}catch{return null;}}
  function resolveTheme(){const v=storedChoice();return v==='light'||v==='dark'?v:systemDark.matches?'dark':'light';}
  let theme=resolveTheme(),mobileSurface=false;
  const themeButton=node('button','Mørk arbejdsvisning');themeButton.id='workspace-theme';themeButton.type='button';themeButton.setAttribute('role','switch');el('project-menu').append(themeButton);
  function applyTheme(){document.documentElement.dataset.workspaceTheme=theme;body.dataset.workspaceTheme=theme;themeButton.setAttribute('aria-checked',String(theme==='dark'));}
  function setTheme(choice){try{localStorage.setItem(themeHintKey,choice==='light'||choice==='dark'?choice:'system');}catch{}theme=resolveTheme();applyTheme();}
  async function invoke(method,value){const response=await window.harness[method](value);if(!response.ok)throw new Error(response.error);return response.value;}
  themeButton.onclick=()=>{const next=theme==='dark'?'light':'dark';setTheme(next);void window.profileSaveQueued.queued(async()=>{try{const result=await invoke('profileSave',{appearance:{theme:next}});window.profileSaveQueued.saved(result.profile);}catch{}});};
  systemDark.addEventListener('change',()=>{theme=resolveTheme();applyTheme();});

  // Reuse the established sidebar key. A small-window drawer never overwrites the desktop choice.
  const sidebarKey='aura.sidebar.v1';
  let collapsed=false;try{collapsed=localStorage.getItem(sidebarKey)==='collapsed';}catch{}
  let drawerOpen=false;
  function applySidebar(){
    const open=overlaySidebar.matches?drawerOpen:!collapsed;
    setClass(body,'sidebar-collapsed',!open);setClass(body,'sidebar-overlay',overlaySidebar.matches&&open);setClass(body,'calm-sidebar-open',overlaySidebar.matches&&open);
    const label=open?'Skjul sidepanelet':'Vis sidepanelet';
    sidebarToggle.setAttribute('aria-expanded',String(open));sidebarToggle.setAttribute('aria-label',label);sidebarToggle.title=label;
    navigation.setAttribute('aria-expanded',String(open));navigation.setAttribute('aria-label',label);navigation.title=label;
    el('sidebar').inert=!root.hidden&&!open;
    root.inert=!root.hidden&&overlaySidebar.matches&&open;
  }
  function closeSidebar({focus=false}={}){drawerOpen=false;applySidebar();if(focus)navigation.focus();}
  function toggleSidebar(){
    if(overlaySidebar.matches)drawerOpen=!drawerOpen;
    else{collapsed=!collapsed;try{localStorage.setItem(sidebarKey,collapsed?'collapsed':'open');}catch{}}
    applySidebar();
    if(overlaySidebar.matches&&drawerOpen)sidebarToggle.focus();
    else if(collapsed)navigation.focus();
  }
  navigation.onclick=toggleSidebar;
  // The legacy handler still owns other screens. Capture here only in the visible workspace.
  sidebarToggle.addEventListener('click',event=>{if(root.hidden)return;event.stopImmediatePropagation();toggleSidebar();},true);
  el('sidebar').addEventListener('click',event=>{if(overlaySidebar.matches&&event.target.closest('.chat-row,.project-name,nav button'))closeSidebar();});
  document.addEventListener('pointerdown',event=>{if(drawerOpen&&!event.target.closest('#sidebar,#workspace-navigation'))closeSidebar();});
  document.addEventListener('keydown',event=>{
    if(root.hidden||event.key!=='Escape')return;
    if(drawerOpen){closeSidebar({focus:true});return;}
    if(compact.matches&&grid.dataset.surface==='on'&&!document.querySelector('dialog[open],[popover]:popover-open')){setSurface(false);showPane(false);surfaceToggle.focus();}
  });
  overlaySidebar.addEventListener('change',()=>{drawerOpen=false;applySidebar();panes();});
  new MutationObserver(()=>{if(!root.hidden)applySidebar();}).observe(body,{attributes:true,attributeFilter:['class']});

  // New empty chats have a temporary closed panel. Never click the toggle or save profile/layout preferences here.
  const emptyChats=new WeakMap();let lastLog=null;
  function setSurface(open,{persist=true}={}){
    if(persist&&emptyChats.has(el('messages')))emptyChats.get(el('messages')).chosen=true;
    if(window.workspace?.setSurfaceOpen)window.workspace.setSurfaceOpen(open,{persist});
    else if(persist) {if((grid.dataset.surface!=='off')!==open)surfaceToggle.click();}
    else{grid.dataset.surface=open?'on':'off';surfaceToggle.setAttribute('aria-pressed',String(open));surfaceToggle.setAttribute('aria-label',open?'Skjul arbejdsfladen':'Vis arbejdsfladen');}
    if(!open)mobileSurface=false;panes();
  }
  el('new-chat').addEventListener('click',()=>{
    if(!root.hidden&&el('chat-panel').dataset.phase==='hero'){emptyChats.set(el('messages'),{chosen:false});setSurface(false,{persist:false});}
  },true);
  function syncPhase(){
    const panel=el('chat-panel'),empty=panel.dataset.phase==='hero',log=el('messages');
    setClass(body,'native-empty-chat',empty);
    if(log!==lastLog){lastLog=log;if(empty&&!emptyChats.has(log))emptyChats.set(log,{chosen:false});}
    if(empty&&!emptyChats.has(log))emptyChats.set(log,{chosen:false});
    if(empty&&!emptyChats.get(log).chosen&&grid.dataset.surface!=='off')setSurface(false,{persist:false});
    panes();
  }
  surfaceToggle.addEventListener('click',()=>{
    const log=el('messages');if(emptyChats.has(log))emptyChats.get(log).chosen=true;
    if(narrow.matches)mobileSurface=grid.dataset.surface==='on';panes();
    if(narrow.matches&&mobileSurface)root.querySelector('.work-tab[aria-selected="true"]')?.focus();
  });
  function panes(){
    const open=grid.dataset.surface!=='off';if(!open)mobileSurface=false;
    if(!surfaceToggle.querySelector('svg'))surfaceToggle.replaceChildren(icon(['M4 4.5h16v15H4z','M14.5 4.5v15']));
    setClass(root,'calm-mobile-surface',mobileSurface);
    chatButton.setAttribute('aria-pressed',String(!mobileSurface));surfaceButton.setAttribute('aria-pressed',String(mobileSurface));
    el('chat-panel').inert=(narrow.matches&&mobileSurface)||(compact.matches&&!narrow.matches&&open);
    el('work-surface').inert=!open||(narrow.matches&&!mobileSurface);
    dismissSurface.hidden=!compact.matches||narrow.matches||!open;
    const trajectory=open&&window.workspace?.active==='activity';
    transcriptButton.setAttribute('aria-pressed',String(!trajectory));trajectoryButton.setAttribute('aria-pressed',String(trajectory));
    window.previewLayout?.();
  }
  function showPane(showSurface,focus=false){if(showSurface&&grid.dataset.surface==='off')setSurface(true);mobileSurface=showSurface;panes();if(focus&&narrow.matches)(showSurface?root.querySelector('.work-tab[aria-selected="true"]'):el('prompt'))?.focus();}
  chatButton.onclick=()=>showPane(false,true);surfaceButton.onclick=()=>showPane(true,true);
  narrow.addEventListener('change',panes);compact.addEventListener('change',panes);
  let scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;syncPhase();});}
  new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-phase','data-surface']});
  new MutationObserver(records=>{if(root.hidden||!narrow.matches)return;if(records.some(r=>r.target.getAttribute('aria-selected')==='true'))showPane(true);}).observe(root.querySelector('.work-tabs'),{subtree:true,attributes:true,attributeFilter:['aria-selected']});
  window.addEventListener('aura:profile',schedule);
  function visibility(){setClass(body,'workspace-calm',!root.hidden);if(root.hidden){drawerOpen=false;root.inert=false;el('sidebar').inert=false;}else{applySidebar();syncPhase();}}
  new MutationObserver(visibility).observe(root,{attributes:true,attributeFilter:['hidden']});
  window.calmWorkspace={showSurface:()=>showPane(true),showChat:()=>showPane(false),setTheme,toggleSidebar};
  applyTheme();visibility();
})();
