const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const nodes = new Map();
  const node = id => {
    if (nodes.has(id)) return nodes.get(id);
    const element = { id, hidden: false, disabled: false, open: false, value: '', options: [], dataset: {}, style: {}, listeners: {}, attributes: {},
      addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
      click() { this.fire('click'); }, fire(type) { for (const handler of this.listeners[type] || []) handler({}); },
      querySelectorAll() { return []; }, setAttribute(k,v) { this.attributes[k] = String(v); },
      matches() { return this.open; }, hidePopover() { this.open = false; this.fire('toggle'); }, focus() {},
      getBoundingClientRect() { return { width: 600 }; }
    }; nodes.set(id, element); return element;
  };
  let reviewClicks = 0;
  node('#work-mode').value = 'free';
  node('#yolo-toggle').click = () => reviewClicks++;
  const state = { current: { root: '/synthetic-project' }, view: { id: 'chat-1', conversationPermission: { active: false } }, running: false, projectLoading: false, activePlan: null };
  const layer = { current: null, open({layer}) { this.current = layer; layer.open = true; layer.fire('toggle'); }, close() { this.current?.hidePopover(); this.current = null; }, position() {} };
  const context = { ...state, $:node, innerWidth:1440, innerHeight:900, Event:class{}, selectedOwner:()=>({root:context.current.root,chat:context.view.id}), window:{PopoverLayer:layer,PermissionPill:require('../ui/permission-pill.js')} };
  const source = fs.readFileSync(path.join(__dirname,'../ui/feedback-layout.js'),'utf8');
  vm.runInNewContext(source.slice(source.indexOf('// Tilladelses-pillen bor her')),context);
  return { node, context, clicks:()=>reviewClicks };
}

test('the permission pill opens YOLO review directly without first opening the work-mode menu', () => {
  const f=fixture();f.node('#permission-pill').click();f.node('#composer-yolo').click();
  assert.equal(f.clicks(),1);assert.equal(f.node('#permission-menu').open,false);
});

test('a delayed work-mode close does not clear the permission menu conversation', () => {
  const f=fixture();f.context.window.ComposerWorkMode.open();f.node('#permission-pill').click();
  f.node('#composer-mode-menu').hidePopover();f.node('#composer-yolo').click();assert.equal(f.clicks(),1);
});

test('switching conversation or becoming busy refuses the stale permission menu action', () => {
  for(const change of [f=>f.context.view={...f.context.view,id:'chat-2'},f=>f.context.current={root:'/other-project'},f=>f.context.running=true]){
    const f=fixture();f.node('#permission-pill').click();change(f);f.node('#composer-yolo').click();assert.equal(f.clicks(),0);
  }
});

test('closing the permission menu clears its binding and read-only mode cannot expose activation', () => {
  const closed=fixture();closed.node('#permission-pill').click();closed.node('#permission-menu').hidePopover();closed.node('#composer-yolo').click();assert.equal(closed.clicks(),0);
  const read=fixture();read.node('#work-mode').value='chat';read.node('#permission-pill').click();assert.equal(read.node('#composer-yolo').hidden,true);read.node('#composer-yolo').click();assert.equal(read.clicks(),0);
});
