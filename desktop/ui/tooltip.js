// SPDX-License-Identifier: EUPL-1.2
// ÉN tooltip-mekanisme (T8, audit pkt. 9). Looket bor i .aura-tooltip
// (components.css, oven på .menu-material): tekst 12/16, radius 8, menu-
// materiale med uigennemsigtig fallback — og bevægelsen dér: ind 40 ms,
// ud 80 ms (@starting-style + allow-discrete). Denne modulejer OPFØRSELSEN:
//
//   · hover åbner efter 400 ms forsinkelse (én konstant, også genåbnings-
//     vagten ved klik udenfor),
//   · tastaturfokus åbner straks — uden musehover (WCAG 1.4.13: fokus kan
//     ikke afblænde eller skjule indholdet; laget følger PopoverLayer),
//   · fokus-tab og muse-afgang lukker — når hverken fokus eller hover står
//     på afbryderen,
//   · click: 'toggle' gør fladen også til klik/touch-kontrol (samme 400 ms
//     genåbningsvagt, så et lukkende klik udenfor ikke straks åbner igen),
//   · aria: laget bindes med aria-describedby (og role=tooltip i markuppen),
//     så assistive teknologier læser det samme, hover og fokus viser.
//
// Kendelse — native title (S1-review Minor-2): native title-attributter
// forbliver appens LETTE lag (Send, projekt-rækker, skillelinjer, ikon-knapper).
// Chromium tegner dem ikke ved tastaturfokus; det er accepteret, fordi
// mekanismen her dækker hover OG fokus for sine egne flader (.status-line-help
// og .info-pop), og de native titlers flader bærer deres tilstand andetvejs:
// form + tegn visuelt, aria-label til skærmlæseren, og klik åbner dialogen.
// At migrere hver eneste title-attribut ville fjerne det oprindelige lag
// eller dobbelt-tegne — uden funktionel gevinst.
(function (scope) {
  'use strict';
  const DELAY = 400;

  function wire({ layer, invoker, open, close, delay = DELAY, hover = true, focus = true, click = false }) {
    if (!layer || !invoker || typeof open !== 'function') return null;
    const doClose = typeof close === 'function' ? close : () => window.PopoverLayer?.close();
    let timer = null, closedAt = 0;
    layer.addEventListener('beforetoggle', event => { if (event.newState === 'closed') closedAt = performance.now(); });
    const show = () => { clearTimeout(timer); if (!layer.matches(':popover-open')) open(); };
    const hideIfGone = () => {
      if (!layer.matches(':popover-open')) return;
      if (document.activeElement === invoker || invoker.matches(':hover')) return;
      doClose();
    };
    if (hover) {
      invoker.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(show, delay); });
      invoker.addEventListener('mouseleave', () => { clearTimeout(timer); hideIfGone(); });
    }
    if (focus) {
      // Fokus åbner uden forsinkelse: tastaturbrugeren har allerede bevæget sig.
      invoker.addEventListener('focus', show);
      invoker.addEventListener('blur', hideIfGone);
    }
    if (click === 'toggle') {
      invoker.addEventListener('click', () => {
        if (layer.matches(':popover-open')) doClose();
        else if (performance.now() - closedAt > delay) show();
      });
    }
    // aria-describedby: fokus-fladens tekst er den samme, hover viser — og
    // linket sættes kun, hvis fladen ikke allerede peger på laget.
    if (layer.id && !invoker.getAttribute('aria-describedby')?.includes(layer.id)) {
      invoker.setAttribute('aria-describedby', layer.id);
    }
    return { layer, invoker };
  }

  scope.Tooltip = { wire, DELAY };
})(typeof window === 'object' ? window : globalThis);
