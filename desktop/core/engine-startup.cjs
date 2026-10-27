// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Bounded, host-only startup records for the agent engine. The recorded fields
// are fixed constants and counters only: no environment values, credentials,
// executable paths, project paths or process output are ever retained. The
// ring and the retained file are capped, and records never reach the renderer,
// the network or the support report on their own.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');

const SCHEMA_VERSION = 1;
const MAX_EVENTS = 24;
const MAX_RETENTION = 200;
// Phase names are part of the record contract; unknown names are still kept
// so a suppression cannot hide that a phase ran.
const PHASES = new Set(['start', 'find-executable', 'prepare-dirs', 'skills', 'read-guard', 'command-isolation', 'spawn', 'privacy-attestation', 'url', 'health', 'config', 'session', 'plugins', 'guard-ready', 'ready']);
// System error codes and rejection status codes are fixed protocol values.
const ERROR_CODES = new Set(['EACCES', 'EAGAIN', 'EADDRINUSE', 'EBADF', 'EBUSY', 'ECHILD', 'EDEADLK', 'EDOM', 'EEXIST', 'EFAULT', 'EFBIG', 'EHOSTUNREACH', 'EINTR', 'EINVAL', 'EIO', 'EISDIR', 'ELOOP', 'EMFILE', 'EMLINK', 'ENAMETOOLONG', 'ENETUNREACH', 'ENFILE', 'ENOBUFS', 'ENODEV', 'ENOENT', 'ENOMEM', 'ENOTDIR', 'ENOTEMPTY', 'ENOTSOCK', 'ENOTSUP', 'ENOTTY', 'ENXIO', 'EOPNOTSUPP', 'EOVERFLOW', 'EPERM', 'EPIPE', 'ERANGE', 'EROFS', 'ESPIPE', 'ESRCH', 'ETIMEDOUT', 'EXDEV']);
// POSIX signals are a fixed protocol set; unknown names are dropped.
const SIGNALS = new Set(['SIGABRT', 'SIGALRM', 'SIGBUS', 'SIGCHLD', 'SIGCONT', 'SIGEMT', 'SIGFPE', 'SIGHUP', 'SIGILL', 'SIGINFO', 'SIGINT', 'SIGIO', 'SIGIOT', 'SIGKILL', 'SIGPIPE', 'SIGPOLL', 'SIGPROF', 'SIGQUIT', 'SIGSEGV', 'SIGSTOP', 'SIGSYS', 'SIGTERM', 'SIGTRAP', 'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGUSR1', 'SIGUSR2', 'SIGVTALRM', 'SIGWINCH', 'SIGXCPU', 'SIGXFSZ']);

let sink = null;

class StartupRecord {
  constructor({ mode = 'free', privacyIsolation = false, sandbox = false, detached = false }) {
    this.startupID = randomUUID();
    this.startedAt = new Date().toISOString();
    this.mode = typeof mode === 'string' ? mode.slice(0, 16) : 'free';
    this.privacyIsolation = privacyIsolation === true;
    this.sandbox = sandbox === true;
    this.detached = detached === true;
    this.events = [];
    this.outcome = null;
    this.errorPhase = null;
    this.errorName = null;
    this.errorCode = null;
    this.httpStatus = null;
    this.child = { pid: null, exitCode: null, signal: null, spawnErrorCode: null };
    this.url = { found: false, timedOut: false, stdoutBytes: null, stderrBytes: null };
    this._marks = new Map();
    this._t0 = performance.now();
  }
  phase(name) {
    if (this.events.length >= MAX_EVENTS) return;
    if (typeof name !== 'string') return;
    const phase = PHASES.has(name) ? name : 'unknown';
    if (this._marks.has(phase)) return;
    this._marks.set(phase, performance.now());
    this.events.push({ phase, ms: Math.round((performance.now() - this._t0) * 100) / 100 });
  }
  observeChild(child) {
    if (!child || typeof child !== 'object') return;
    if (Number.isSafeInteger(child.pid) && child.pid >= 0) this.child.pid = child.pid;
    if (Number.isSafeInteger(child.exitCode)) this.child.exitCode = child.exitCode;
    if (typeof child.signal === 'string' && SIGNALS.has(child.signal)) this.child.signal = child.signal;
    if (ErrorMessageCodes(child.spawnErrorCode)) this.child.spawnErrorCode = child.spawnErrorCode;
  }
  urlProgress({ found, timedOut, stdoutBytes, stderrBytes }) {
    if (found === true) this.url.found = true;
    if (timedOut === true) this.url.timedOut = true;
    if (Number.isSafeInteger(stdoutBytes) && stdoutBytes >= 0 && stdoutBytes <= 100_000_000) this.url.stdoutBytes = stdoutBytes;
    if (Number.isSafeInteger(stderrBytes) && stderrBytes >= 0 && stderrBytes <= 100_000_000) this.url.stderrBytes = stderrBytes;
  }
  fail(error) {
    this.outcome = 'error';
    if (this.errorPhase === null && typeof error === 'object' && error !== null) {
      this.errorName = typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(error.name) ? error.name : null;
      this.errorCode = ErrorMessageCodes(error.code) ? error.code : null;
      this.httpStatus = Number.isSafeInteger(error.status) && error.status >= 100 && error.status <= 599 ? error.status : null;
    }
  }
  failPhase(name, error) { this.errorPhase = typeof name === 'string' && PHASES.has(name) ? name : this.errorPhase; this.fail(error); }
  ready() { this.outcome ??= 'ready'; }
  record() {
    const { _marks, _t0, ...publicFields } = this;
    const events = this.events.slice(-MAX_EVENTS);
    return { schemaVersion: SCHEMA_VERSION, ...publicFields, events };
  }
}

function ErrorMessageCodes(code) { return typeof code === 'string' && ERROR_CODES.has(code); }

// A record only persists when a sink directory was installed by the trusted
// entry point. Without an installed sink the records stay in memory only.
function install({ directory, retention = MAX_RETENTION } = {}) {
  if (typeof directory !== 'string' || !directory) throw new Error('Startup diagnostics requires a directory.');
  sink = { directory, retention: Number.isSafeInteger(retention) && retention >= 1 && retention <= 1000 ? retention : MAX_RETENTION };
  return sink;
}

function write(record) {
  if (!sink) return;
  const file = path.join(sink.directory, 'engine-startup.jsonl');
  try {
    fs.mkdirSync(sink.directory, { recursive: true, mode: 0o700 });
    let lines = [];
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch {}
    lines.push(JSON.stringify(record));
    // Retention er en fast grænse på antal gemte opstarter; ældste linje fjernes først.
    if (lines.length > sink.retention) lines = lines.slice(-sink.retention);
    const temporary = path.join(sink.directory, `.engine-startup-${process.pid}.tmp`);
    fs.writeFileSync(temporary, lines.length ? lines.join('\n') + '\n' : '', { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch {
    // Diagnostics must never break or slow down the engine they observe.
  }
}

function createStartupRecord(options = {}) {
  const record = new StartupRecord(options);
  let lastSerialized = '';
  return {
    phase: name => record.phase(name),
    child: child => record.observeChild(child),
    urlProgress: progress => record.urlProgress(progress),
    failPhase: (name, error) => record.failPhase(name, error),
    fail: error => record.fail(error),
    ready: () => record.ready(),
    finalize: () => {
      const snapshot = record.record();
      const serialized = JSON.stringify(snapshot);
      // Re-finalization deduplicates identical states; changed state appends
      // a new line so a stop after a successful startup stays observable.
      if (serialized === lastSerialized) return null;
      lastSerialized = serialized;
      write(snapshot);
      return snapshot;
    },
  };
}

function sinkDirectory() { return sink ? sink.directory : null; }
function uninstall() { sink = null; }

module.exports = { createStartupRecord, install, sinkDirectory, uninstall, StartupRecord };
