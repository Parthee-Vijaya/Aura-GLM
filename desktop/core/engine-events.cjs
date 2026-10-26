const { setTimeout: delay } = require('node:timers/promises');

// Event delivery is recoverable without re-running the prompt. The server owns
// the operation. Read its authoritative state; never recreate a tool invocation.
class EngineEvents {
  constructor(engine, { delays = [500, 1500, 3000], idleLimit = 45_000 } = {}) {
    this.engine = engine; this.delays = delays; this.idleLimit = idleLimit;
    this.controller = new AbortController(); this.snapshotMode = false; this.sync = Promise.resolve();
    this.ready = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.ready.catch(() => {});
  }
  close() { this.controller.abort(); this.reject(new Error('Forbindelsen blev lukket.')); clearTimeout(this.snapshotTimer); clearTimeout(this.terminalTimer); }
  current(epoch) { return !this.controller.signal.aborted && this.engine.active && epoch === this.engine.promptEpoch; }
  async snapshot() {
    const epoch = this.engine.promptEpoch, promptID = this.engine.promptID;
    const work = async () => {
      if (!this.current(epoch) || !promptID || this.engine.compaction) return [];
      const messages = await this.engine.request(`/session/${this.engine.session.id}/message`, 'GET', undefined, AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]));
      if (!this.current(epoch)) return [];
      if (!Array.isArray(messages)) throw new Error('Invalid message snapshot');
      const current = messages.filter(m => m.info?.id === promptID || m.info?.parentID === promptID);
      for (const message of current) {
        this.engine.handleEvent({ type: 'message.updated', recovered: true, properties: { info: message.info } });
        for (const part of message.parts || []) this.engine.handleEvent({ type: 'message.part.updated', recovered: true, properties: { part } });
      }
      return current;
    };
    const result = this.sync.then(work); this.sync = result.catch(() => {}); return result;
  }
  scheduleSnapshot() {
    if (this.snapshotTimer || this.controller.signal.aborted) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      this.snapshot().catch(() => this.connection?.abort());
    }, 250);
  }
  async reconcile() {
    const epoch = this.engine.promptEpoch, signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]);
    const [permissions, questions] = await Promise.all(['/permission', '/question'].map(url => this.engine.request(url, 'GET', undefined, signal)));
    if (!this.current(epoch)) return;
    if (!Array.isArray(permissions) || !Array.isArray(questions)) throw new Error('Invalid pending actions');
    const own = list => list.filter(p => p.sessionID === this.engine.session.id);
    const livePermissions = own(permissions), liveQuestions = own(questions);
    for (const id of this.engine.pending.keys()) if (!livePermissions.some(p => p.id === id)) this.engine.handleEvent({ type: 'permission.replied', recovered: true, properties: { sessionID: this.engine.session.id, requestID: id } });
    for (const id of this.engine.pendingQuestions.keys()) if (!liveQuestions.some(p => p.id === id)) this.engine.handleEvent({ type: 'question.replied', recovered: true, properties: { sessionID: this.engine.session.id, requestID: id } });
    for (const p of livePermissions) this.engine.handleEvent({ type: 'permission.asked', recovered: true, properties: p });
    for (const p of liveQuestions) this.engine.handleEvent({ type: 'question.asked', recovered: true, properties: p });
    await this.snapshot();
    if (!this.current(epoch)) return;
    await this.settle();
  }
  async settle() {
    if (this.engine.turnBaseline || this.engine.compaction?.baseline) return this.settleNative();
    const epoch = this.engine.promptEpoch, compaction = this.engine.compaction;
    const messages = compaction ? [] : await this.snapshot();
    const statuses = await this.engine.request('/session/status', 'GET', undefined, AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]));
    if (!this.current(epoch) || !statuses || Array.isArray(statuses) || typeof statuses !== 'object') return;
    const status = statuses[this.engine.session.id];
    if (status && status.type !== 'idle' || this.engine.pending.size || this.engine.pendingQuestions.size) return;
    if (compaction) {
      // Summaries have their own messages, not children of the last user prompt.
      // A successful summarize response plus idle proves completion even if its
      // final event was lost. An old assistant snapshot cannot prove that.
      if (this.engine.compaction === compaction && compaction.httpCompleted) this.engine.handleEvent({ type: 'session.idle', recovered: true, properties: { sessionID: this.engine.session.id } });
      return;
    }
    const last = messages.filter(m => m.info.role === 'assistant').at(-1)?.info;
    if (last?.error) this.engine.handleEvent({ type: 'session.error', properties: { sessionID: this.engine.session.id, error: last.error } });
    else if (last?.time?.completed && last.finish && last.finish !== 'tool-calls') this.engine.handleEvent({ type: 'session.idle', recovered: true, properties: { sessionID: this.engine.session.id } });
    // An idle server alone is not proof the user's prompt ran. Never fabricate
    // completion from an old message or "done" text.
  }
  async settleNative() {
    const engine = this.engine, epoch = engine.promptEpoch, operation = engine.compaction;
    const baseline = operation?.baseline || engine.turnBaseline;
    if (!baseline || operation && !operation.httpCompleted || !operation && engine.completedPromptID === engine.promptID) return;
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]);
    const [session, statuses] = await Promise.all([engine.wire(`/api/session/${encodeURIComponent(engine.session.id)}`, 'GET', undefined, signal), engine.request('/session/status', 'GET', undefined, signal)]);
    if (!this.current(epoch) || engine.compaction !== operation || session?.data?.id !== engine.session.id) return;
    const suspended = session.data.time?.suspended != null && JSON.stringify(session.data.time.suspended) !== (baseline.suspended ?? 'null');
    if (statuses[engine.session.id]?.type === 'busy') return;
    let outcome = suspended ? 'interrupted' : session.data.outcome;
    if (!suspended && JSON.stringify(session.data.time?.idle ?? null) === baseline.idle) {
      // V2 permission rejection can suspend without exposing a new idle or a
      // suspended timestamp in Session.Info. A completed aborted assistant
      // owned by this exact user message is authoritative; an old error is not.
      if (operation) return;
      const current = await this.snapshot();
      const last = current.filter(message=>message.info.role==='assistant').at(-1)?.info;
      if (!this.current(epoch) || last?.error?.name !== 'aborted' || !last.time?.completed || last.finish !== 'error') return;
      outcome = 'interrupted';
    }
    if (!['succeeded','failed','interrupted'].includes(outcome)) throw new Error('Agentens afslutning kunne ikke kontrolleres.');
    // Read after the durable idle/outcome transition. Queued SSE text must not
    // allow the host to finalize before the final answer and tool state exist.
    const [permissions, questions] = await Promise.all(['/permission','/question'].map(url => engine.request(url,'GET',undefined,signal)));
    if (!this.current(epoch) || permissions.some(p=>p.sessionID===engine.session.id) || questions.some(q=>q.sessionID===engine.session.id)) return;
    const messages = operation ? await engine.nativeMessages(signal) : await this.snapshot();
    if (!this.current(epoch) || engine.compaction !== operation) return;
    if (operation) {
      const compacted = messages.find(message=>message.info.id===operation.inputID && message.info.role==='compaction')?.info;
      if (!compacted || !['completed','failed'].includes(compacted.status)) return;
      if (compacted.status==='failed') { engine.handleEvent({type:'session.error',compacting:true,properties:{sessionID:engine.session.id,error:compacted.error || {name:'Error',data:{message:'Sammenfatningen kunne ikke gennemføres.'}}}}); return true; }
    }
    if (outcome === 'succeeded') {
      if (!operation && !messages.some(message=>message.info.id===engine.promptID && message.info.role==='user')) return;
      engine.handleEvent({type:'session.idle',recovered:true,properties:{sessionID:engine.session.id}});
    } else {
      const error = messages.findLast(message=>message.info.error)?.info.error || engine.nativeExecutionError || {name:'Error',data:{message:outcome==='interrupted'?'Agentmotoren afbrød opgaven.':'Agentmotoren kunne ikke fuldføre opgaven.'}};
      const rejected = engine.permissionRejection;
      const ownedDenial = !operation && outcome === 'interrupted' && rejected?.accepted && rejected.sessionID === engine.session.id && rejected.promptID === engine.promptID && rejected.epoch === epoch;
      engine.handleEvent({type:'session.error',recovered:true,...(ownedDenial ? {permissionRejected:true} : {}),properties:{sessionID:engine.session.id,error,...(ownedDenial ? {requestID:rejected.requestID} : {})}});
      if (!operation) engine.completedPromptID = engine.promptID;
    }
    return true;
  }
  async deliver(event) {
    if (this.controller.signal.aborted) return;
    if (event.nativeTerminal) {
      // The event can precede the committed idle snapshot. Wait for that exact
      // outcome; a rejected tool has no finished assistant message to poll.
      const epoch = this.engine.promptEpoch;
      clearTimeout(this.terminalTimer);
      const deadline = Date.now()+10_000;
      const poll = async () => {
        if (!this.current(epoch)) return;
        try { if (await this.settleNative()) return; } catch {}
        if (!this.current(epoch) || this.engine.completedPromptID === this.engine.promptID) return;
        if (Date.now()>=deadline) { this.engine.handleEvent({type:'engine.error',message:'Agentens afslutning kunne ikke bekræftes. Gennemgå resultatet før næste forsøg.',failure:{kind:'engine'}}); await this.engine.abort().catch(()=>{}); return; }
        this.terminalTimer=setTimeout(poll,100);
      };
      await poll(); return;
    }
    if (this.engine.compaction) { this.engine.handleEvent(event); return; }
    if (this.snapshotMode && event.type.startsWith('message.')) { this.scheduleSnapshot(); return; }
    if (this.snapshotMode && (event.type === 'session.idle' || event.type === 'session.status' && event.properties?.status?.type === 'idle')) {
      if (event.properties?.sessionID === this.engine.session.id) await this.settle();
      return;
    }
    if (this.snapshotMode && event.type === 'session.error') await this.snapshot();
    this.engine.handleEvent(event);
  }
  async run() {
    const { signal } = this.controller; let epoch = this.engine.promptEpoch;
    for (let attempt = 0; !signal.aborted && this.engine.active; attempt++) {
      const connection = this.connection = new AbortController(); let timer, pump;
      const touch = () => { clearTimeout(timer); timer = setTimeout(() => connection.abort(), this.idleLimit); };
      try {
        touch();
        const response = await fetch(`${this.engine.url}/api/event`, { headers: { authorization: this.engine.auth, 'x-opencode-directory': encodeURIComponent(this.engine.root) }, redirect: 'error', signal: AbortSignal.any([signal, connection.signal]) });
        if (!response.ok) throw new Error('Event connection rejected');
        // Subscribe before reading snapshots. Buffer changes while reconciling.
        const queued = []; let reconciling = this.snapshotMode;
        pump = (async () => {
          const decoder = new TextDecoder(); let buffer = '';
          for await (const chunk of response.body) {
            touch(); buffer += decoder.decode(chunk, { stream: true });
            const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n'); buffer = blocks.pop();
            if (buffer.length > 4_000_000) throw new Error('Event too large');
            for (const block of blocks) {
              if (signal.aborted || connection.signal.aborted) return;
              const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
              if (!data) continue;
              let event; try { event = JSON.parse(data); } catch { continue; }
              if (typeof event.type !== 'string') continue;
              if (reconciling) { if (queued.length >= 2000) throw new Error('Recovery queue full'); queued.push(event); }
              else for (const item of this.engine.decodeEvent(event)) await this.deliver(item);
            }
          }
          if (!signal.aborted && this.engine.active) throw new Error('Event stream ended');
        })();
        pump.catch(() => {});
        if (reconciling) {
          await this.reconcile();
          reconciling = false;
          for (const event of queued) for (const item of this.engine.decodeEvent(event)) await this.deliver(item);
          this.engine.handleEvent({ type: 'engine.recovery', recovery: { phase: 'recovered', attempt: attempt + 1 } });
        }
        this.resolve();
        await pump;
        return;
      } catch (error) {
        connection.abort(); clearTimeout(timer);
        await pump?.catch(() => {});
        if (signal.aborted || !this.engine.active) return;
        if (epoch !== this.engine.promptEpoch) { attempt = 0; epoch = this.engine.promptEpoch; }
        if (attempt >= this.delays.length) {
          this.reject(error);
          this.engine.handleEvent({ type: 'engine.error', message: 'Forbindelsen til agenten kunne ikke genoptages. Samtalen og ændringerne er bevaret; gennemgå resultatet før et nyt forsøg.', failure: { kind: 'engine' } });
          await this.engine.abort().catch(() => {}); this.engine.active = false; return;
        }
        this.snapshotMode = true;
        this.engine.handleEvent({ type: 'engine.recovery', recovery: { phase: 'retrying', attempt: attempt + 2 } });
        try { await delay(this.delays[attempt], undefined, { signal }); } catch { return; }
      } finally { clearTimeout(timer); }
    }
  }
}
module.exports = { EngineEvents };
