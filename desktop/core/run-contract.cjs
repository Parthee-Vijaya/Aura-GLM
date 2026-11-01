// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Fælles datakontrakt for tur-udfald, beviser og hændelsesidentitet mellem kerne og UI.
// Kernen validerer formerne her, før de sendes videre: intet felt opfindes, og 'ukendt'
// forbliver ukendt i stedet for at blive til en gætten tekst. kode 0 er kun en succes,
// når hverken timeout, stop eller signal er sket samtidig.
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\x00-\x1f]/.test(value);

function identity(value = {}) {
  if (!isId(value.root) || !isId(value.chat) || !isId(value.task)) throw new Error('Hændelsen mangler projekt, samtale eller opgave.');
  return { root: value.root, chat: value.chat, task: value.task };
}

function outcome(value = {}) {
  const result = {
    exitCode: Number.isSafeInteger(value.exitCode) ? value.exitCode : null,
    signal: typeof value.signal === 'string' && value.signal ? value.signal.slice(0, 15) : null,
    timedOut: value.timedOut === true,
    cancelled: value.cancelled === true,
    durationMs: Number.isSafeInteger(value.durationMs) && value.durationMs >= 0 ? value.durationMs : null
  };
  if (result.exitCode === null && !result.signal && !result.timedOut && !result.cancelled) result.unknown = true;
  return result;
}

// Sandheden om udfaldet: kun et rent exitCode 0 uden andre samtidige fakta er en succes.
function succeeded(value) { const o = outcome(value); return !o.unknown && !o.timedOut && !o.cancelled && !o.signal && o.exitCode === 0; }

function describeOutcome(value) {
  const o = outcome(value);
  if (o.cancelled) return 'Stoppet af dig';
  if (o.timedOut) return 'Tidsgrænse nået';
  if (o.signal) return `Afbrudt af signal ${o.signal}`;
  if (o.exitCode === 0) return 'Afsluttet';
  if (o.exitCode !== null) return `Afsluttet med fejl (kode ${o.exitCode})`;
  return 'Udfald ukendt';
}

// Bevisblokken på resultatkortet: Auras egne målinger, aldrig modellens egen tekst.
function evidence(value = {}) {
  const count = entry => Number.isSafeInteger(entry) && entry >= 0 ? entry : null;
  return {
    files: { count: count(value?.files?.count), source: ['disk', 'git'].includes(value?.files?.source) ? value.files.source : null },
    commands: { run: count(value?.commands?.run), failed: count(value?.commands?.failed), unknown: value?.commands?.unknown === true },
    quality: { ran: value?.quality?.ran === true, findings: count(value?.quality?.findings) }
  };
}

// Kommandoer med faktiske udfald fra værktøjspartene: kørt, fejlet (kode != 0) og om nogen
// mangler exitkode. Kald uden afsluttet status tæller ikke; intet opfindes.
function commandEvidence(parts) {
  const commands = [...parts].filter(part => part?.tool === 'bash' && ['completed', 'error'].includes(part?.state?.status));
  const withExit = commands.filter(part => Number.isInteger(part?.state?.metadata?.exit));
  return { run: commands.length, failed: withExit.filter(part => part.state.metadata.exit !== 0).length, unknown: commands.length > withExit.length };
}

module.exports = { identity, outcome, succeeded, describeOutcome, evidence, commandEvidence };
