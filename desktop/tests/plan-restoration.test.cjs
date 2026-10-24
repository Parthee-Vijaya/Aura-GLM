const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../ui/app.js'),'utf8');
test('startup restores the saved plan even when an event already created an empty view',()=>{
 const begin=app.indexOf('function fillChat(next, fresh)'),stop=app.indexOf("  $('#work-mode').value",begin);
 const source=app.slice(begin,stop)+'\n}';
 const elements=new Map(),owner={log:{children:[]},historyLoaded:false,plan:null};
 const plan={id:'saved-plan',text:'The current approved plan'};
 const context={view:owner,activePlan:null,window:{HistoryPages:{takePrevious:messages=>({older:[],recent:messages})}},
  $:key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);},
  appendMessage:()=>{const element={dataset:{}};owner.log.children.push(element);return element;},renderHistoryControls(){},updatePlanOffer(){}};
 vm.runInNewContext(source,context);
 context.fillChat({workspace:{messages:[{id:'stored',role:'assistant',text:'Saved reply'}],mode:'plan'},plan},false);
 assert.equal(context.activePlan,plan);assert.equal(owner.planCard,true);assert.equal(owner.historyLoaded,true);
 const livePlan={id:'newer-plan',text:'A newer plan in the open view'};owner.plan=livePlan;
 context.fillChat({workspace:{messages:[],mode:'plan'},plan},false);
 assert.equal(context.activePlan,livePlan,'an already loaded view keeps its current plan');
 assert.equal(owner.log.children.length,1);
});
