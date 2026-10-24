// Permission belongs to the captured conversation, never the current UI by accident.
(() => {
  const dialog = node('dialog'); dialog.id = 'conversation-permission-dialog'; dialog.setAttribute('aria-labelledby','conversation-permission-title');
  dialog.innerHTML = '<p class="eyebrow">KUN DENNE SAMTALE</p><h2 id="conversation-permission-title">Lad Aura fortsætte med fuld tilladelse?</h2><p>AI’en kan arbejde videre uden at spørge om hver enkelt tilladt værktøjshandling i denne samtale.</p><ul><li>Projektfiler kan oprettes, ændres og slettes.</li><li>Kommandoer kan køres inden for Auras tekniske afgrænsning, fx installation af pakker og tests.</li><li>Adgang til nye mapper og tjenester følger fortsat projektets regler.</li></ul><div class="permission-boundary"><strong>Planer og dataregler gælder stadig.</strong><p>Valget godkender ikke en plan eller ny datadeling. Beskyttede filer og handlinger uden for afgrænsningen kræver fortsat gennemgang.</p></div><p>Tilladelsen gælder, indtil du slår den fra eller lukker appen. Den gælder ikke andre samtaler og gemmes ikke til næste opstart.</p><label class="check-label"><input type="checkbox" id="conversation-permission-ack">Jeg forstår, at AI’en kan lave fejl, og at jeg selv har ansvar for at gennemgå resultatet.</label><p id="conversation-permission-feedback" role="status"></p><div class="dialog-actions"><button type="button" id="conversation-permission-cancel">Annuller</button><button type="button" id="conversation-permission-confirm" class="primary" disabled>Tillad i denne samtale</button></div>';
  document.body.append(dialog);
  const bar = node('div'); bar.id='conversation-permission-status'; bar.hidden=true;
  bar.append(node('span','Fuld tilladelse · denne samtale'));
  const revoke=node('button','Slå fra');revoke.type='button';bar.append(revoke);$('#chat-form').before(bar);
  let pending=null,busy=false;
  const ack=dialog.querySelector('input'), confirm=$('#conversation-permission-confirm'), cancel=$('#conversation-permission-cancel'), feedback=$('#conversation-permission-feedback');
  const same=owner=>current?.root===owner.root&&view.id===owner.chat;
  function sync(){bar.hidden=!view.conversationPermission?.active;if(pending&&!same(pending.owner)&&dialog.open){dialog.close();pending=null;}}
  async function open(v,id){const owner={root:v.root||current?.root,chat:v.id};if(!same(owner))return;const review=await call('permissionReview',{chat:v.id,id},owner);if(!same(owner))return;pending={review,owner,v};ack.checked=false;confirm.disabled=true;feedback.textContent='';dialog.showModal();cancel.focus();}
  ack.onchange=()=>confirm.disabled=busy||!ack.checked;
  cancel.onclick=()=>{if(busy)return;pending=null;dialog.close();};
  dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}pending=null;});
  confirm.onclick=async()=>{const item=pending;if(!item||!ack.checked||busy||!same(item.owner))return;busy=true;cancel.disabled=true;confirm.disabled=true;try{const result=await call('permissionConfirm',{chat:item.owner.chat,token:item.review.token,acknowledged:true},item.owner);item.v.conversationPermission=result;pending=null;dialog.close();sync();}catch(error){feedback.textContent=error.message;}finally{busy=false;cancel.disabled=false;confirm.disabled=!ack.checked;}};
  revoke.onclick=()=>action(async()=>{const v=view,owner=selectedOwner();v.conversationPermission=await call('permissionRevoke',{chat:v.id},owner);sync();});
  window.ConversationPermission={open,sync};
})();
