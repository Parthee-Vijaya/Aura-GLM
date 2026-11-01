// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Én egen deadline pr. operation, holdt adskilt fra brugerens upstream-Stop. Abort-årsagen
// kan altid skelnes bagefter, så et tidsgrænsebrud aldrig fremstår som en frivillig stop
// (eller omvendt). Operationen selv beslutter, hvad en afbrydelse betyder for resultatet.
function deadline({ signal, milliseconds, operation = 'operationen' }) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error('Ugyldig tidsgrænse.');
  const controller = new AbortController();
  let stopped = false, timedOut = false;
  const abort = timeout => {
    if (controller.signal.aborted) return;
    // Brugerens Stop vinder over en samtidig tidsgrænse: samme reglen som udfaldskontrakten.
    timedOut = timeout && !stopped;
    stopped = stopped || !timeout;
    controller.abort(timeout && !stopped ? Error(`Tidsgrænse nået for ${operation}`) : Error('Stoppet af dig'));
  };
  const onUpstream = () => abort(false);
  signal?.addEventListener('abort', onUpstream, { once: true });
  if (signal?.aborted) onUpstream();
  const timer = setTimeout(() => abort(true), milliseconds);
  timer.unref?.();
  return {
    signal: controller.signal,
    isStopped: () => stopped && !timedOut,
    isTimeout: () => timedOut,
    done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onUpstream); }
  };
}

module.exports = { deadline };
