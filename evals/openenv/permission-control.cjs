// Evaluator only. Every decision still goes through ChatSession's unchanged guards.
function bindingFor(bench, id, seen) {
  if (typeof id !== 'string' || seen.has(id)) return null;
  seen.add(id);
  const chat = bench.chat, engine = chat?.engine, record = chat?.approvals?.get(id);
  if (!record || chat.running !== true || chat.runStopped || engine?.closed || record.engine !== engine || record.generation !== chat.generation || engine?.pending?.get(id) !== record.request) return null;
  return { bench, chat, engine, record, id, generation: chat.generation, sessionID: engine.session?.id, promptID: engine.promptID, epoch: engine.promptEpoch };
}
function current(b) {
  const pending = b.engine.pending.get(b.id), approval = b.chat.approvals.get(b.id);
  return b.bench.chat === b.chat && b.chat.running === true && !b.engine.closed && b.chat.engine === b.engine && b.chat.generation === b.generation && !b.chat.runStopped &&
    b.engine.session?.id === b.sessionID && b.engine.promptID === b.promptID && b.engine.promptEpoch === b.epoch &&
    (!pending || pending === b.record.request) && (!approval || approval === b.record);
}
async function alreadyRejected(error, b, allow) {
  const source = b.record.p?.tool, kind = b.record.p?.permission, request = b.record.request;
  const safeID = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id);
  const gone = error?.status === 404 || error?.message === 'Godkendelsen findes ikke længere.';
  if (allow || !gone || !['read', 'grep'].includes(kind) || !current(b) ||
    ![b.id, b.sessionID, source?.messageID, source?.callID].every(safeID) ||
    request.id !== b.id || request.sessionID !== b.sessionID || request.permission !== kind ||
    request.tool?.messageID !== source.messageID || request.tool?.callID !== source.callID) return false;
  try {
    // Read authoritative state. Never retry a decision, prompt or tool, and
    // never interpret an arbitrary 404 or an empty local cache as a rejection.
    const pending = await b.engine.request('/permission');
    if (!current(b) || !Array.isArray(pending) || pending.some(p => !p || typeof p.id !== 'string' || p.sessionID !== b.sessionID || p.id === b.id)) return false;
    const message = (await b.engine.wire(`/api/session/${b.sessionID}/message/${source.messageID}`))?.data;
    if (!current(b) || message?.id !== source.messageID || message.type !== 'assistant' ||
      message.sessionID !== undefined && message.sessionID !== b.sessionID || !Array.isArray(message.content)) return false;
    const parts = message.content.filter(p => p?.type === 'tool' && p.id === source.callID);
    if (parts.length !== 1 || parts[0].name !== kind || parts[0].state?.status !== 'error' || parts[0].state?.error?.type !== 'permission.rejected') return false;
    // Same cache reconciliation as EngineEvents, without inventing a grant or
    // classifying feedback as a new user rejection. Real decisions stay intact.
    if (b.engine.pending.has(b.id) || b.chat.approvals.has(b.id)) b.engine.handleEvent({ type: 'permission.replied', recovered: true, properties: { sessionID: b.sessionID, requestID: b.id } });
    return true;
  } catch { return false; } // Incomplete proof remains a genuine driver failure.
}
async function replyPermission({ bench, id, seen, review, message, onDecision = () => {} }) {
  const binding = bindingFor(bench, id, seen);
  if (!binding) return { status: 'skipped', reason: 'duplicate-or-no-longer-pending' };
  const { chat, engine, record } = binding;
  const allow = await review(record) === true;
  if (!current(binding) || chat.approvals.get(id) !== record || engine.pending.get(id) !== record.request) return { status: 'skipped', reason: 'changed-during-policy-review' };
  onDecision(record, allow);
  try { await bench.reply({ id, allow, scope: 'once', message: allow ? undefined : message }); }
  catch (error) {
    if (await alreadyRejected(error, binding, allow)) return { status: 'already-rejected', proof: 'exact-native-permission.rejected', statusCode: Number.isInteger(error.status) ? error.status : null };
    throw error;
  }
  return { status: 'answered' };
}
module.exports = { replyPermission };
