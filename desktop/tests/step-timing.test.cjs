// D5a: trinregistret bag tok/s i statuslinjen. Én monoton klokke (hrtime.bigint),
// binding til samtale/tur/motor/forbindelse+model+rute, og en indholdsfri DTO til
// renderer. Ingen tider fra recovery-snapshots, gamle ture eller dubletter.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StepTiming, toDTO } = require('../core/step-timing.cjs');
const { EventAdapter } = require('../core/engine-opencode2.cjs');
const { OpenCodeEngine } = require('../core/engine.cjs');
const { createMetricsBuffer } = require('../core/run-metrics.cjs');

const ms = value => BigInt(value) * 1_000_000n;
const sessionID = 'session-a';
const binding = { chatID: 'chat-a', generation: 3, engineID: 'opencode@1.18.33', connectionID: 'chosen', modelID: 'vendor/model', routeID: 'exact', sessionID };

function register(options = {}) {
  let at = 0n;
  const timing = new StepTiming({ ...binding, now: () => at, ...options });
  return { timing, at: nanoseconds => { at = nanoseconds; } };
}
const started = (id, at = sessionID) => ({ type: 'message.updated', properties: { info: { id, role: 'assistant', sessionID: at } } });
const content = (id, text = 'Hej') => ({ type: 'message.part.updated', properties: { part: { id: `${id}:text:0`, messageID: id, sessionID, type: 'text', text } } });
const delta = (id, text = 'x') => ({ type: 'message.part.delta', properties: { sessionID, messageID: id, partID: `${id}:text:0`, field: 'text', delta: text } });
const toolInput = (id, input = '{"filePath":"x"}') => ({ type: 'message.part.updated', properties: { part: { id: `${id}:tool:t1`, messageID: id, sessionID, type: 'tool', state: { status: 'pending', input } } } });
const streamed = id => ({ type: 'message.part.streamed', properties: { sessionID, messageID: id } });
const finished = (id, tokens) => ({ type: 'message.part.updated', properties: { part: { id: `${id}:step:finish`, messageID: id, sessionID, type: 'step-finish', tokens } } });

// Ét fuldt trin: start → første indhold → strømmet → afsluttet med udbydertal.
function step(timing, at, id, { firstContent = 500, streamedAt = 2500, tokens = { output: 100, reasoning: 50 } } = {}) {
  timing.observe(started(id));
  at(ms(firstContent)); timing.observe(content(id));
  at(ms(streamedAt)); timing.observe(streamed(id));
  timing.observe(finished(id, tokens));
  return at;
}

test('formlen: Σ(output+reasoning) / Σ(streamed − første indhold) over turens gyldige trin', () => {
  const { timing, at } = register();
  step(timing, at, 'msg_1', { firstContent: 500, streamedAt: 2500, tokens: { output: 100, reasoning: 50 } });
  step(timing, at, 'msg_2', { firstContent: 3000, streamedAt: 4000, tokens: { output: 50, reasoning: 0 } });
  const dto = timing.dto();
  assert.equal(dto.known, true);
  assert.equal(dto.value, Math.round(200 / 3), 'to trin: (100+50+50)/(2s+1s) afrundet');
  assert.equal(dto.stepCount, 2);
  assert.equal(dto.unit, 'tok/s');
  assert.equal(dto.quality, 'observed');
  assert.deepEqual({ chatID: dto.chatID, connectionID: dto.connectionID, modelID: dto.modelID, routeID: dto.routeID, engineID: dto.engineID, sessionID: dto.sessionID },
    { chatID: 'chat-a', connectionID: 'chosen', modelID: 'vendor/model', routeID: 'exact', engineID: 'opencode@1.18.33', sessionID: 'session-a' }, 'DTO bærer sin binding, intet indhold');
});

test('dubletter: gentagne hændelser sætter hverken nye mærker eller tokens', () => {
  const { timing, at } = register();
  step(timing, at, 'msg_1');
  timing.observe(streamed('msg_1')); timing.observe(streamed('msg_1'));
  timing.observe(finished('msg_1', { output: 100, reasoning: 50 }));
  timing.observe(content('msg_1'));
  const dto = timing.dto();
  assert.equal(dto.value, 75, '(100+50)/2s — førstemærket og førstetælling gælder');
  assert.equal(dto.stepCount, 1);
});

test('ren værktøjstrin tæller med observeret tool-input og udbydertal', () => {
  const { timing, at } = register();
  timing.observe(started('msg_tool'));
  at(ms(100)); timing.observe(toolInput('msg_tool'));
  at(ms(1100)); timing.observe(streamed('msg_tool'));
  timing.observe(finished('msg_tool', { output: 20, reasoning: 0 }));
  const dto = timing.dto();
  assert.equal(dto.known, true);
  assert.equal(dto.value, 20, '20 output på 1 s værktøjsstrøm');
});

test('trin uden streamed eller uden første indhold udelades fra BEGGE summer', () => {
  const one = register();
  step(one.timing, one.at, 'msg_ok', { tokens: { output: 90, reasoning: 0 } });
  one.timing.observe(started('msg_streaming'));
  one.timing.observe(content('msg_streaming'));
  one.timing.observe(finished('msg_streaming', { output: 900, reasoning: 900 }));
  assert.equal(one.timing.dto().value, 45, 'det ufuldendte trins 1800 tokens lækkere ikke ind i tælleren');
  const two = register();
  two.timing.observe(started('msg_nostream'));
  two.timing.observe(finished('msg_nostream', { output: 5, reasoning: 0 }));
  assert.equal(two.timing.dto().known, false, 'ingen streamed-tid giver ingen opdigtet hastighed');
});

test('ikke-positive intervaller og ufuldstændige tællere udelades fra begge summer', () => {
  const { timing, at } = register();
  step(timing, at, 'msg_ok', { firstContent: 500, streamedAt: 2500, tokens: { output: 60, reasoning: 0 } });
  timing.observe(started('msg_backwards'));
  at(ms(9000)); timing.observe(content('msg_backwards'));
  at(ms(8000)); timing.observe(streamed('msg_backwards'));
  timing.observe(finished('msg_backwards', { output: 600, reasoning: 600 }));
  timing.observe(started('msg_partial'));
  at(ms(9000)); timing.observe(content('msg_partial'));
  at(ms(9500)); timing.observe(streamed('msg_partial'));
  timing.observe(finished('msg_partial', { output: NaN, reasoning: 0 }));
  const dto = timing.dto();
  assert.equal(dto.value, 30, 'kun det sunde trin indgår: 60 tokens på 2 s');
  assert.equal(dto.stepCount, 1);
});

test('recovery-snapshots giver aldrig nye tider; kun reelle tællere tælles — og kun én gang', () => {
  const { timing, at } = register();
  timing.observe({ ...started('msg_live'), recovered: true });
  timing.observe({ ...content('msg_live'), recovered: true });
  timing.observe({ ...streamed('msg_live'), recovered: true });
  timing.observe({ ...finished('msg_live', { output: 40, reasoning: 0 }), recovered: true });
  assert.equal(timing.dto().known, false, 'et trin set kun gennem recovery har ingen tider');
  // Samme trin lever igen med reelle hændelser: tælleren er den samme (udbyderens
  // tal), men kun de levende tider må indgå — og tællingen må ikke dblære.
  timing.observe(started('msg_live'));
  at(ms(200)); timing.observe(content('msg_live'));
  at(ms(1200)); timing.observe(streamed('msg_live'));
  timing.observe({ ...finished('msg_live', { output: 40, reasoning: 0 }), recovered: true });
  const once = timing.dto();
  assert.equal(once.value, 40);
  timing.observe({ ...finished('msg_live', { output: 40, reasoning: 0 }), recovered: true });
  timing.observe(finished('msg_live', { output: 40, reasoning: 0 }));
  assert.equal(timing.dto().value, once.value, 'gentagne afslutninger tæller ikke dobbelt');
});

test('fremmed session og ugyldige trin-id afvises uden fejl', () => {
  const { timing, at } = register();
  timing.observe(started('msg_other', 'session-b'));
  timing.observe(content('msg_other'));
  timing.observe({ type: 'message.part.updated', properties: { part: { messageID: 'msg_other', sessionID: 'session-b', type: 'text', text: 'Hej' } } });
  timing.observe(streamed('msg_other'));
  timing.observe(finished('msg_other', { output: 10, reasoning: 0 }));
  timing.observe({ type: 'message.updated', properties: { info: { id: '', role: 'assistant', sessionID } } });
  timing.observe({ type: 'message.updated', properties: { info: { id: 'x'.repeat(400), role: 'assistant', sessionID } } });
  timing.observe({ type: 'message.updated', properties: { info: { id: 'bad\x00id', role: 'assistant', sessionID } } });
  timing.observe({ type: 'message.part.streamed', properties: { sessionID } });
  timing.observe({ type: 'message.part.updated', properties: { part: { type: 'text', text: 'ingen ejer' } } });
  timing.observe('not-an-event');
  assert.equal(timing.dto().known, false);
});

test('bindingen kan sættes én gang og registraturen holder sig til sin egen tur', () => {
  const late = new StepTiming({ ...binding, sessionID: '' });
  assert.equal(late.bindSession('session-a').sessionID, 'session-a');
  assert.equal(late.bindSession('session-b').sessionID, 'session-a', 'en senere session overskriver ikke den første binding');
  for (let index = 0; index < 4200; index++) {
    const id = `msg_${index}`;
    late.observe(started(id)); late.observe(content(id)); late.observe(streamed(id)); late.observe(finished(id, { output: 1, reasoning: 0 }));
  }
  assert.ok(late.dto().stepCount <= 4096, 'registret er begrænset og fejler aldrig på mængden');
});

test('to samtidige samtaler: hvert register ejer sine egne trin og sin egen binding', () => {
  const first = register(), second = register({ chatID: 'chat-b', connectionID: 'other', modelID: 'other/model' });
  step(first.timing, first.at, 'msg_shared', { tokens: { output: 30, reasoning: 0 } });
  step(second.timing, second.at, 'msg_shared', { tokens: { output: 10, reasoning: 0 } });
  const one = first.timing.dto(), two = second.timing.dto();
  assert.equal(one.value, 15); assert.equal(two.value, 5);
  assert.equal(one.chatID, 'chat-a'); assert.equal(two.chatID, 'chat-b');
  assert.equal(one.modelID, 'vendor/model'); assert.equal(two.modelID, 'other/model');
});

test('close(): en afsluttet tur tager imod ingen sene mærker', () => {
  const { timing, at } = register();
  step(timing, at, 'msg_1');
  const dto = timing.dto();
  timing.close();
  timing.observe(started('msg_late')); timing.observe(content('msg_late')); timing.observe(streamed('msg_late'));
  timing.observe(finished('msg_late', { output: 999, reasoning: 999 }));
  assert.equal(timing.dto().value, dto.value, 'sene hændelser ændrer ikke det afsluttede resultat');
});

test('toDTO: kun velkendte, indholdsfrie felter overlever genindlæsning', () => {
  const { timing, at } = register();
  step(timing, at, 'msg_1');
  const dto = timing.dto();
  assert.deepEqual(toDTO(JSON.parse(JSON.stringify({ ...dto, ttftMs: 1234 }))), { ...dto, ttftMs: 1234 });
  for (const bad of [null, 'x', 7, [], {}, { ...dto, known: true, value: null }, { ...dto, known: 'true' },
    { ...dto, value: -3 }, { ...dto, stepCount: '2' }, { ...dto, unit: 's' }, { ...dto, quality: 'vildt' },
    { ...dto, source: 'file' }, { ...dto, ttftMs: 'x' }, { ...dto, modelID: 'bad\nid' }, { ...dto, chatID: 'x'.repeat(400) }]) {
    assert.equal(toDTO(bad), null, `ugyldig DTO afvises: ${JSON.stringify(bad).slice(0, 60)}`);
  }
  const unknown = JSON.parse(JSON.stringify(register().timing.dto()));
  assert.equal(unknown.known, false);
  assert.deepEqual(toDTO(unknown), unknown, 'ukendt måling overlever som ukendt — aldrig som 0-registrering');
});

test('motoren oversætter session.step.streamed som message.part.streamed', () => {
  const adapter = new EventAdapter('/projekt');
  const events = adapter.normalize({ type: 'session.step.streamed', data: { sessionID: 'session-a', assistantMessageID: 'msg_1' } });
  assert.deepEqual(events, [{ type: 'message.part.streamed', properties: { sessionID: 'session-a', messageID: 'msg_1' } }]);
  assert.deepEqual(adapter.normalize({ type: 'session.step.streamed', data: {} }), []);
});

test('motorlets ejerskab: gamle trin og fremmede sessioner når aldrig registraturet', () => {
  const engine = new OpenCodeEngine({ root: '/synthetic', directory: '/synthetic-engine', model: { id: 'synthetic' }, mode: 'chat' });
  engine.session = { id: 'session-a' };
  engine.turnBaseline = { ids: new Set(['msg_old']) };
  assert.deepEqual(engine.decodeEvent({ type: 'session.step.streamed', data: { sessionID: 'session-b', assistantMessageID: 'msg_1' } }), [], 'fremmed session afvises');
  assert.deepEqual(engine.decodeEvent({ type: 'session.step.streamed', data: { sessionID: 'session-a', assistantMessageID: 'msg_old' } }), [], 'trin fra før turen afvises');
  const delivered = [];
  engine.onEvent = event => delivered.push(event);
  engine.promptID = 'msg_user'; engine.currentMessageIDs = new Set(['msg_user', 'msg_1']);
  engine.handleEvent({ type: 'message.part.streamed', properties: { sessionID: 'session-a', messageID: 'msg_1' } });
  assert.equal(delivered.length, 1, 'turiets eget trin leveres videre');
  engine.handleEvent({ type: 'message.part.streamed', properties: { sessionID: 'session-a', messageID: 'msg_not_turn' } });
  assert.equal(delivered.length, 1, 'et trin udenfor turen leveres ikke');
  engine.completedPromptID = engine.promptID;
  engine.handleEvent({ type: 'message.part.streamed', properties: { sessionID: 'session-a', messageID: 'msg_1' } });
  assert.equal(delivered.length, 1, 'senere hændelser efter afsluttet tur leveres ikke');
});

test('run-metrics gemmer tps ved siden af ttft_ms og aldrig efter afslutning', () => {
  const buffer = createMetricsBuffer({ now: () => 0 });
  const measurement = buffer.create({ mode: 'chat', origin: 'conversation' });
  const { timing, at } = register();
  step(timing, at, 'msg_1');
  const dto = timing.dto();
  measurement.speed(dto);
  assert.equal(measurement.snapshot().tps, 75);
  assert.equal(measurement.snapshot().tpsSteps, 1);
  measurement.finish('completed');
  const before = measurement.snapshot();
  measurement.speed({ ...dto, value: 999, stepCount: 9 });
  assert.deepEqual(measurement.snapshot(), before, 'afsluttede målinger er terminale');
  const fresh = buffer.create({ mode: 'chat' });
  fresh.speed(timing.dto());
  assert.equal(fresh.snapshot().tpsSteps, 1);
  fresh.speed(null); fresh.speed({ known: false, value: null, stepCount: 0 });
  assert.equal(fresh.snapshot().tpsSteps, 1, 'ukendte målinger overskriver ikke en kendt');
  assert.equal(JSON.stringify(buffer.snapshots()).includes('PRIVATE'), false);
});

// ---------- ChatSession: register, DTO, hændelser og gemning ----------

const { Workbench } = require('../core/workbench.cjs');
const { ChatSession } = require('../core/chat-session.cjs');
const contextEngine = 'opencode@' + require('../runtime-lock.json').opencode;

async function bench(t, name) {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-step-timing-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const emitted = [];
  const workbench = new Workbench({ directory, profiles: path.resolve(__dirname, '../../profiles'), safeStorage: {}, emit: event => emitted.push(event) });
  await workbench.activate({ root: path.join(directory, 'project'), name });
  t.after(() => workbench.close());
  return { workbench, emitted };
}
function arm(chat, options = {}) {
  let at = 0n;
  chat.runStepTiming = new StepTiming({ chatID: chat.id, engineID: contextEngine, connectionID: 'chosen', modelID: 'vendor/model', routeID: 'exact', sessionID: 'session-a', now: () => at, ...options });
  chat.running = true;
  return nanoseconds => { at = nanoseconds; };
}
const engineStep = (type, extra = {}) => ({ type, properties: { ...extra, sessionID: 'session-a' } });

test('ChatSession: turens måling når view og usage-hændelsen og overlever genåbning', async t => {
  const { workbench, emitted } = await bench(t, 'Hastighedsprøve');
  const chat = workbench.chat;
  const at = arm(chat);
  chat.event(engineStep('message.updated', { info: { id: 'msg_1', role: 'assistant' } }));
  at(ms(500));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:text:0', messageID: 'msg_1', type: 'text', text: 'Svar undervejs' } }));
  at(ms(2500));
  chat.event(engineStep('message.part.streamed', { messageID: 'msg_1' }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:step:finish', messageID: 'msg_1', type: 'step-finish', tokens: { input: 10, output: 100, reasoning: 50 } } }));
  const usageEvents = emitted.filter(event => event.type === 'usage');
  assert.equal(usageEvents.length, 1, 'stepafslutningen udsender forbrug');
  assert.equal(usageEvents[0].speed.value, 75);
  assert.equal(usageEvents[0].speed.known, true);
  assert.equal(chat.view().speed.value, 75);
  assert.equal(chat.view().speed.connectionID, 'chosen', 'DTO bærer turens modelbinding');
  // Dubleret afslutning: hverken tokens eller hastighed dblærer.
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:step:finish', messageID: 'msg_1', type: 'step-finish', tokens: { input: 10, output: 100, reasoning: 50 } } }));
  assert.equal(emitted.filter(event => event.type === 'usage').length, 1);
  assert.equal(chat.view().speed.value, 75);
  // Fremmed session når aldrig registraturet gennem samtalen.
  chat.event({ type: 'message.part.streamed', properties: { sessionID: 'session-b', messageID: 'msg_1' } });
  assert.equal(chat.view().speed.value, 75);
  // Turen afsluttes: værdien står fast og gemmes med samtalen.
  await chat.finishTask('idle', null); chat.running = false;
  assert.equal(chat.view().speed.value, 75, 'efter turen vises turens eget resultat');
  chat.runUser = { id: 'user-a', role: 'user', text: 'Et syntetisk spørgsmål.' };
  await chat.saveHistory('idle');
  await workbench.newConversation();
  assert.equal(workbench.chat.view().speed, null, 'en ny samtale starter uden måling — 0 er visningsværdi');
  await workbench.openChat(chat.id);
  const reopened = workbench.chat.view().speed;
  assert.equal(reopened.value, 75, 'genåbnet samtale viser den gemte måling');
  assert.equal(reopened.known, true);
});

test('ChatSession: ny tur nulstiller målingen; stop midt i turen viser kun færdige trin', async t => {
  const { workbench } = await bench(t, 'Stopprøve');
  const chat = workbench.chat;
  const at = arm(chat);
  const finish = (id, tokens) => chat.event(engineStep('message.part.updated', { part: { id: `${id}:step:finish`, messageID: id, type: 'step-finish', tokens } }));
  // Ét færdigt trin og ét, der aldrig blev strømmet færdigt.
  chat.event(engineStep('message.updated', { info: { id: 'msg_1', role: 'assistant' } }));
  at(ms(500)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:text:0', messageID: 'msg_1', type: 'text', text: 'Første del' } }));
  at(ms(2500)); chat.event(engineStep('message.part.streamed', { messageID: 'msg_1' }));
  finish('msg_1', { input: 10, output: 90, reasoning: 0 });
  chat.event(engineStep('message.updated', { info: { id: 'msg_2', role: 'assistant' } }));
  at(ms(3000)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_2:text:0', messageID: 'msg_2', type: 'text', text: 'Ufuldendt' } }));
  finish('msg_2', { input: 5, output: 900, reasoning: 900 });
  assert.equal(chat.view().speed.value, 45, 'kun det færdige trin: 90 tokens på 2 s');
  await chat.finishTask('stopped', null); chat.running = false;
  assert.equal(chat.view().speed.value, 45, 'stop midt i turen bevare det målte');
});

test('ChatSession: en afbrudt eller mislykket tur fryser SIN EGEN måling — aldrig den forrige turs', async t => {
  const { workbench } = await bench(t, 'Afbrudtprøve');
  const chat = workbench.chat;
  const buffer = createMetricsBuffer({ now: () => 0 });
  // Tur 1: færdig og målt til 75 (150 tokens på 2 s).
  const first = arm(chat);
  chat.event(engineStep('message.updated', { info: { id: 'msg_1', role: 'assistant' } }));
  first(ms(500)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:text:0', messageID: 'msg_1', type: 'text', text: 'Første svar' } }));
  first(ms(2500)); chat.event(engineStep('message.part.streamed', { messageID: 'msg_1' }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:step:finish', messageID: 'msg_1', type: 'step-finish', tokens: { input: 10, output: 150, reasoning: 0 } } }));
  await chat.finishTask('idle', null); chat.running = false;
  assert.equal(chat.view().speed.value, 75);
  // Tur 2: målt 50 undervejs (100 tokens på 2 s) — men afbrudt, som
  // closeCurrentRun (:1224) gør det: flagene er sat fra, FØR finishTask kaldes.
  const measurement = buffer.create({ mode: 'chat', origin: 'conversation' });
  chat.runMeasurement = measurement;
  const second = arm(chat);
  chat.event(engineStep('message.updated', { info: { id: 'msg_2', role: 'assistant' } }));
  second(ms(100)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_2:text:0', messageID: 'msg_2', type: 'text', text: 'Andet svar' } }));
  second(ms(2100)); chat.event(engineStep('message.part.streamed', { messageID: 'msg_2' }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_2:step:finish', messageID: 'msg_2', type: 'step-finish', tokens: { input: 10, output: 100, reasoning: 0 } } }));
  assert.equal(chat.view().speed.value, 50, 'turens delmåling står undervejs');
  chat.running = false;
  await chat.finishTask('interrupted', null);
  const interrupted = chat.view().speed;
  assert.equal(interrupted.value, 50, 'afbrudt tur fryser sin egen måling — ikke den forrige turs 75');
  assert.equal(measurement.snapshot().tps, 50, 'run-metrics tildeles DENNE turs tal, ikke den forrige turs');
  assert.equal(measurement.snapshot().outcome, 'error', 'interrupt-registreringen er terminal');
  // Send-fejlstien (catch i sendPrepared): en tur uden gyldige trin efterlader
  // ukendt — 0 er visningsværdi, den forrige turs tal genindlæses aldrig.
  const failed = buffer.create({ mode: 'chat', origin: 'conversation' });
  chat.runMeasurement = failed;
  arm(chat); chat.running = false;
  await chat.finishTask('error', null);
  assert.equal(chat.view().speed.known, false, 'en tur uden måling gemmer ukendt');
  assert.equal(chat.view().speed.value, null);
  assert.equal(failed.snapshot().tps, null, 'ingen opdigtet tps til den mislykkede tur');
});

test('ChatSession: Privacy Gate-runtid giver ingen måling — 0 er visningsværdi', async t => {
  const { workbench, emitted } = await bench(t, 'Privacyprøve');
  const chat = workbench.chat;
  chat.runPrivacy = { mode: 'cloud-controlled' };
  chat.runStepTiming = null;
  chat.running = true;
  chat.event(engineStep('message.updated', { info: { id: 'msg_1', role: 'assistant' } }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:step:finish', messageID: 'msg_1', type: 'step-finish', tokens: { input: 10, output: 100, reasoning: 50 } } }));
  assert.equal(chat.view().speed, null, 'Privacy Gate-runtid har ingen kvalificeret timing');
  assert.equal(emitted.filter(event => event.type === 'usage').at(-1).speed, null);
  await chat.finishTask('idle', null);
  assert.equal(chat.view().speed, null, 'ukendt måling gemmes som ukendt — ikke som 0');
  // Den samme kontrakt gælder afbrudte Privacy Gate-ture (closeCurrentRun kalder
  // finishTask, mens running stadig er sand): ingen måling, aldrig den forrige turs tal.
  chat.runStepTiming = null; chat.running = true;
  await chat.finishTask('interrupted', null); chat.running = false;
  assert.equal(chat.view().speed, null, 'en afbrudt Privacy Gate-tur efterlader ukendt — ikke den forrige turs tal');
});

test('ChatSession: modelskift pr. tur binder målingen til den nye model', async t => {
  const { workbench } = await bench(t, 'Modelskifteprøve');
  const chat = workbench.chat;
  const first = arm(chat);
  chat.event(engineStep('message.updated', { info: { id: 'msg_1', role: 'assistant' } }));
  first(ms(500)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:text:0', messageID: 'msg_1', type: 'text', text: 'Hej' } }));
  first(ms(1500)); chat.event(engineStep('message.part.streamed', { messageID: 'msg_1' }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_1:step:finish', messageID: 'msg_1', type: 'step-finish', tokens: { input: 5, output: 40, reasoning: 10 } } }));
  assert.equal(chat.view().speed.modelID, 'vendor/model');
  await chat.finishTask('idle', null);
  // Næste tur vælger en anden model: registret binder på ny, og målingen starter forfra.
  const second = arm(chat, { modelID: 'other/model', connectionID: 'other' });
  assert.equal(chat.view().speed.known, false, 'den nye tur har ingen måling endnu — linjen viser 0');
  chat.event(engineStep('message.updated', { info: { id: 'msg_9', role: 'assistant' } }));
  second(ms(100)); chat.event(engineStep('message.part.updated', { part: { id: 'msg_9:text:0', messageID: 'msg_9', type: 'text', text: 'Svar' } }));
  second(ms(1100)); chat.event(engineStep('message.part.streamed', { messageID: 'msg_9' }));
  chat.event(engineStep('message.part.updated', { part: { id: 'msg_9:step:finish', messageID: 'msg_9', type: 'step-finish', tokens: { input: 5, output: 20, reasoning: 0 } } }));
  const dto = chat.view().speed;
  assert.equal(dto.modelID, 'other/model');
  assert.equal(dto.value, 20);
  assert.equal(dto.connectionID, 'other');
});
