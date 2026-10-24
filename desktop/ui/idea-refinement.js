// Pre-project text assistance. Uses the same native connection store; no tools.
(() => {
  const panel = $('#idea-refinement'), status = $('#idea-refine-status');
  const connection = $('#idea-connection'), model = $('#idea-model'), route = $('#idea-route');
  let busy = false, generation = 0, answer = null, accepted = null, review = null;
  const dialog = node('dialog'); dialog.id = 'idea-review-dialog'; dialog.setAttribute('aria-labelledby','idea-review-title');
  dialog.innerHTML = '<h2 id="idea-review-title">Gennemgå din AI-forbindelse</h2><p>Kun idéhjælp. Ingen projektfiler eller værktøjer åbnes.</p><dl id="idea-review-details"></dl><details><summary>Se præcis teksten, der sendes</summary><pre id="idea-review-content"></pre></details><div class="dialog-actions"><button type="button" id="idea-review-cancel">Annuller</button><button type="button" id="idea-review-send" class="primary">Send til idéhjælp</button></div>';
  document.body.append(dialog);
  function working(value, text) {
    busy=value;panel.setAttribute('aria-busy',String(value));status.textContent=text||'';status.classList.toggle('is-thinking',value);
    for(const el of panel.querySelectorAll('select,textarea,button'))el.disabled=value;
    $('#idea-refine-stop').hidden=!value;$('#idea-refine-stop').disabled=false;
    $('#idea-refine-open').disabled=value;$('#create').disabled=value;
  }
  const input = () => ({name:$('#name').value,idea:$('#purpose').value,message:$('#idea-refine-answer').value,connectionID:connection.value,modelID:model.value,routeID:route.value});
  async function loadModelsForIdea(){
    const ticket=++generation,id=connection.value;accepted=null;review=null;
    model.replaceChildren(option('',id?'Henter modeller …':'Vælg en forbindelse'));route.replaceChildren();$('#idea-route-row').hidden=true;
    if(!id)return;
    const models=await call('models',id,null);if(ticket!==generation||connection.value!==id||current)return;
    model.replaceChildren(option('','Vælg model'),...models.map(m=>option(m.id,m.name||m.id)));status.textContent=models.length?'Vælg den model, du vil bruge.':'Forbindelsen har ingen tilgængelige modeller.';
  }
  connection.onchange=()=>action(loadModelsForIdea);
  model.onchange=()=>action(async()=>{
    const ticket=++generation,id=connection.value,modelID=model.value;accepted=null;
    const isRouter=state?.connections.find(c=>c.id===id)?.kind==='openrouter';$('#idea-route-row').hidden=!isRouter;
    route.replaceChildren(option('','Vælg konkret udbyder'));if(!isRouter||!modelID)return;
    const routes=await call('routes',{connectionID:id,modelID},null);if(ticket!==generation||current)return;
    for(const item of routes)route.append(option(item.id,item.name||item.id));
  });
  route.onchange=()=>{accepted=null;};
  $('#idea-refine-open').onclick=()=>action(async()=>{
    if(!$('#name').reportValidity()||!$('#purpose').reportValidity())return;
    panel.hidden=false;
    const selected=$('#startup-connection').value;
    connection.replaceChildren(option('','Vælg forbindelse'),...(state?.connections||[]).map(c=>option(c.id,c.name)));
    if(selected)connection.value=selected;
    if(!connection.options.length||connection.options.length===1){status.textContent='Tilføj en AI-forbindelse under Indstillinger → AI-forbindelser. Din idé er gemt her.';return;}
    await loadModelsForIdea();connection.focus();
  });
  async function prepare(){
    if(busy||current)return;if(!$('#name').reportValidity()||!$('#purpose').reportValidity())return;
    if(!connection.value||!model.value||!$('#idea-route-row').hidden&&!route.value){status.textContent='Vælg forbindelse, model og eventuel udbyder først.';return;}
    const ticket=++generation;working(true,'Gør din idé klar til gennemgang …');
    try{
      const value=await call('ideaPrepare',input(),null);if(ticket!==generation||current)return;review={...value,ticket};
      const list=$('#idea-review-details');list.replaceChildren();
      for(const [key,label]of [['connection','Forbindelse'],['model','Model'],['recipients','Modtager'],['endpoint','Adresse'],['region','Behandlingssted'],['retention','Opbevaring'],['training','Træning'],['price','Pris'],['material','Indhold'],['security','Forbindelse']]){list.append(node('dt',label),node('dd',String(value.disclosure[key]||'Ikke oplyst')));}
      $('#idea-review-content').textContent='Instruktion til idéhjælpen:\n'+value.system+'\n\n'+value.content.map(m=>(m.role==='user'?'Du':'AI')+':\n'+m.content).join('\n\n');
      dialog.showModal();$('#idea-review-cancel').focus();
    }catch(error){status.textContent=error.message;}finally{if(ticket===generation)working(false,status.textContent);}
  }
  $('#idea-refine-send').onclick=prepare;$('#idea-refine-update').onclick=prepare;
  function cancelReview(){review=null;void call('ideaStop',undefined,null).catch(()=>{});status.textContent='Intet blev sendt. Din idé er bevaret.';}
  $('#idea-review-cancel').onclick=()=>{dialog.close();cancelReview();};dialog.addEventListener('cancel',cancelReview);
  $('#idea-review-send').onclick=async()=>{
    const item=review;if(!item||item.ticket!==generation||current)return;review=null;dialog.close();working(true,'AI’en forfiner din idé og foreslår en plan …');
    try{
      const result=await call('ideaSend',{token:item.token},null);if(item.ticket!==generation||current)return;
      answer={...result,selection:{connectionID:connection.value,modelID:model.value,routeID:route.value}};accepted=null;
      $('#idea-refine-description').value=result.description;$('#idea-refine-plan').textContent=result.plan||'Bed AI’en om et planforslag, når de sidste valg er afklaret.';
      const questions=$('#idea-refine-questions');questions.replaceChildren();if(result.questions.length){questions.append(node('h3','Lad os afklare det sidste'));const list=node('ol');for(const q of result.questions)list.append(node('li',q));questions.append(list);}
      $('#idea-refine-answer').value='';$('#idea-refine-result').hidden=false;status.textContent=result.questions.length?'AI’en afventer dine svar. Du kan skrive frit nedenfor.':'Forslaget er klar. Ret teksten, eller brug beskrivelsen.';
      $('#idea-refine-send').hidden=true;
    }catch(error){if(item.ticket===generation)status.textContent=error.message;}
    finally{if(item.ticket===generation)working(false,status.textContent);}
  };
  $('#idea-refine-stop').onclick=async()=>{++generation;await call('ideaStop',undefined,null).catch(()=>{});working(false,'Idéhjælpen er stoppet. Din tekst er bevaret.');};
  $('#idea-refine-use').onclick=()=>{
    if(!answer||busy||!$('#idea-refine-description').value.trim())return;
    const text=$('#idea-refine-description').value.trim();$('#purpose').value=text;$('#purpose').dispatchEvent(new Event('input',{bubbles:true}));
    accepted={name:$('#name').value,text,plan:answer.plan,selection:answer.selection};$('#startup-connection').value=answer.selection.connectionID;updateStartupSummary();
    panel.hidden=true;status.textContent='';message('Beskrivelsen er valgt. Opret projektet, og gennemgå planen i samtalen.');$('#create').focus();
  };
  const clear=()=>{++generation;void call('ideaStop',undefined,null).catch(()=>{});if(dialog.open)dialog.close();review=null;answer=null;accepted=null;panel.hidden=true;$('#idea-refine-result').hidden=true;$('#idea-refine-send').hidden=false;working(false,'');};
  window.addEventListener('aura:project',clear);
  window.IdeaRefinement={take:()=>accepted&&accepted.name===$('#name').value&&accepted.text===$('#purpose').value?structuredClone(accepted):null};
})();
