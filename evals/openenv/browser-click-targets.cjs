// Read-only discovery for independent QA. No DOM attributes or app state are changed.
// CDP listener inspection complements semantic controls and CSS pointer hints.
async function discoverClickTargets(page, { limit = 120 } = {}) {
  const session = await page.context().newCDPSession(page);
  const objectGroup = 'aura-independent-click-discovery';
  try {
    const { result } = await session.send('Runtime.evaluate', {
      expression: `Array.from(document.querySelectorAll('body *')).filter(e => {
        const r=e.getBoundingClientRect(), s=getComputedStyle(e);
        return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
      }).slice(0, ${Math.max(1, Math.min(limit, 200))})`, objectGroup
    });
    const { result: entries } = await session.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
    const targets = [];
    for (const entry of entries.filter(e => /^\d+$/.test(e.name) && e.value?.objectId)) {
      const objectId = entry.value.objectId;
      const { listeners } = await session.send('DOMDebugger.getEventListeners', { objectId, depth: 0 });
      const { result: details } = await session.send('Runtime.callFunctionOn', {
        objectId, returnByValue: true, functionDeclaration: `function() {
          const semantic=this.matches('button,a[href],input[type="submit"],input[type="button"],[role="button"],[role="link"]');
          const pointer=getComputedStyle(this).cursor==='pointer';
          let path='',node=this;
          while(node&&node.nodeType===1&&node!==document.body) {
            if(node.id){path='#'+CSS.escape(node.id)+(path?' > '+path:'');break;}
            const tag=node.tagName.toLowerCase(), siblings=[...node.parentElement.children].filter(x=>x.tagName===node.tagName);
            path=tag+(siblings.length>1?':nth-of-type('+(siblings.indexOf(node)+1)+')':'')+(path?' > '+path:'');node=node.parentElement;
          }
          const r=this.getBoundingClientRect();
          return {selector:path,tag:this.tagName.toLowerCase(),role:this.getAttribute('role'),semantic,pointer,tabIndex:this.tabIndex,label:(this.getAttribute('aria-label')||this.textContent||'').trim().slice(0,120),rect:{x:r.x,y:r.y,width:r.width,height:r.height},insideSemantic:Boolean(this.parentElement?.closest('button,a[href],[role="button"],[role="link"]'))};
        }`
      });
      const item = details.value, events = listeners.map(l => l.type);
      if (item && !item.insideSemantic && (item.semantic || item.pointer || events.includes('click'))) targets.push({ ...item, events, detectedBy: [item.semantic && 'semantics', item.pointer && 'cursor', events.includes('click') && 'event-listener'].filter(Boolean) });
    }
    // Pointer cursors inherit into text descendants; retain the outer actual target.
    return targets.filter(item => !targets.some(parent => parent !== item && item.selector.startsWith(parent.selector + ' > ') && (parent.semantic || parent.pointer || parent.events.includes('click'))));
  } finally { await session.send('Runtime.releaseObjectGroup', { objectGroup }).catch(() => {}); await session.detach(); }
}
module.exports = { discoverClickTargets };
