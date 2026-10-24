const { setTimeout: delay } = require('node:timers/promises');

const IDLE_LIMIT = 120_000, GRACE_LIMIT = 180_000, TOTAL_LIMIT = 20 * 60_000;
const RETRY_DELAYS = [1000, 3000];
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
function transportError(kind, status = null) { return Object.assign(new Error('Model transport failed'), { kind, status }); }
function retryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

// Retries belong to ONE immutable model request. Never replay an already delivered
// stream: OpenCode may already have executed a tool from it. Heartbeats carry no
// model content and can be consumed locally until the first actual SSE event.
async function forwardModel({ url, headers, payload, res, signal, progress, onRecovery = () => {},
  idleLimit = IDLE_LIMIT, graceLimit = GRACE_LIMIT, totalLimit = TOTAL_LIMIT, retryDelays = RETRY_DELAYS }) {
  const deadline = AbortSignal.timeout(totalLimit), lifetime = AbortSignal.any([signal, deadline]);
  let committed = false;
  const notify = state => { try { onRecovery(state); } catch { /* Observers cannot affect delivery. */ } };
  for (let attempt = 0; ; attempt++) {
    const idle = new AbortController(); let timer, extended = false, response, pause = retryDelays[attempt];
    const touch = () => {
      clearTimeout(timer); extended = false;
      timer = setTimeout(function check() {
        if (!extended && graceLimit > 0) {
          extended = true; notify({ phase: 'waiting', attempt: attempt + 1, kind: 'idle' });
          timer = setTimeout(check, graceLimit);
        } else idle.abort();
      }, idleLimit);
    };
    try {
      lifetime.throwIfAborted(); touch();
      response = await fetch(url, { method: 'POST', headers, body: payload, redirect: 'error', signal: AbortSignal.any([lifetime, idle.signal]) });
      if (!response.ok) {
        const suggested = retryAfter(response.headers.get('retry-after'));
        pause = Math.max(pause || 0, suggested);
        await response.body?.cancel();
        // Long quota waits are not hidden behind an automatic retry loop.
        const error = transportError(TRANSIENT.has(response.status) ? 'transient' : 'rejected', response.status);
        error.retryable = TRANSIENT.has(response.status) && suggested <= 60_000;
        throw error;
      }
      const type = response.headers.get('content-type') || 'application/json', sse = type.includes('text/event-stream');
      let prefix = '', terminal = false, scan = '';
      const decoder = new TextDecoder();
      const write = chunk => {
        if (!committed) { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); committed = true; }
        res.write(chunk);
      };
      for await (const chunk of response.body) {
        lifetime.throwIfAborted(); touch();
        try { progress.write(chunk, sse); } catch { /* Progress is best effort. */ }
        if (!sse) { write(chunk); continue; }
        const text = decoder.decode(chunk, { stream: true });
        scan += text;
        const lines = scan.split(/\r?\n/); scan = lines.pop();
        for (const line of lines) if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') terminal = true;
          else { try { const event = JSON.parse(data); if (event.type === 'message_stop' || ['response.completed', 'response.incomplete'].includes(event.type) || event.choices?.some(choice => choice.finish_reason)) terminal = true; } catch {} }
        }
        if (scan.length > 4_000_000) throw transportError('stream');
        if (!committed) {
          prefix += text;
          // Only discard complete comment/blank frames. Unknown frames are content.
          while (/^(?:(?::[^\r\n]*)?\r?\n)*\r?\n/.test(prefix)) prefix = prefix.replace(/^(?:(?::[^\r\n]*)?\r?\n)*\r?\n/, '');
          if (!prefix) continue;
          if (!prefix.includes('\n\n') && !prefix.includes('\r\n\r\n') && prefix.length < 65_536) continue;
          write(prefix); prefix = '';
        } else write(text);
      }
      if (sse && (!committed || !terminal)) throw transportError('stream');
      if (!committed) throw transportError('network');
      try { progress.end(sse); } catch {}
      res.end();
      if (attempt || extended) notify({ phase: 'recovered', attempt: attempt + 1 });
      return;
    } catch (cause) {
      clearTimeout(timer);
      if (signal.aborted) throw signal.reason;
      const error = cause.kind ? cause : transportError(idle.signal.aborted ? 'idle' : 'network');
      if (deadline.aborted) throw transportError('deadline');
      if (committed || attempt >= retryDelays.length || error.retryable === false) throw error;
      // An incomplete comment-only stream has not been delivered either.
      notify({ phase: 'retrying', attempt: attempt + 2, kind: error.kind, status: error.status, delay: pause });
      try { await delay(pause, undefined, { signal: lifetime }); }
      catch (error) { if (deadline.aborted && !signal.aborted) throw transportError('deadline'); throw error; }
    } finally { clearTimeout(timer); }
  }
}
module.exports = { forwardModel, retryAfter, IDLE_LIMIT, GRACE_LIMIT, TOTAL_LIMIT, RETRY_DELAYS };
