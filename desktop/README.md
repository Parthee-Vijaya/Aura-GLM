# AI Harness · desktop, POC 2

Første implementerede milepæl er lokal projektoprettelse og live-forhåndsvisning. Brugerfladen er dansk. AI-chat, modelnøgler, Claude-abonnement, Git-handlinger, værktøjsinstallation og hostingadaptere er endnu ikke tilsluttet. Der udføres ingen modelkald, commits eller deployments.

## Start fra kildekoden

Kræver Node.js 22.12 eller nyere og npm. Kør fra denne mappe:

```bash
npm ci
npm start
```

Electron 44 henter programmet ved første start, hvis det ikke allerede er hentet. Det kræver netadgang. Appens lokale startskabelon kræver ingen installationer i det projekt, brugeren opretter. Der er endnu ingen pakkekommando, signerede installationsfiler eller notariseret Mac-app. Windows og macOS er målplatforme; afprøvning på den ene verificerer ikke den anden.

## Afprøvning

```bash
npm test
```

Testene opretter rigtige projektfiler og en midlertidig server på loopback. De kontrollerer genåbning, bevaring af eksisterende mapper, profilkopier, input og blokering af adgang til private filer. Midlertidige testmapper fjernes efter testene.

Den automatiske desktop-brugerrejse kræver en grafisk session og starter den installerede Electron direkte, uden en separat browserdownload:

```bash
npm run test:desktop
```

Playwright styrer den rigtige brugerflade. Native fildialogers svar erstattes i testprocessen med teststier og annullering; selve operativsystemets dialoginteraktion afprøves derfor manuelt. Scriptet opretter isolerede mapper under systemets midlertidige mappe og udskriver deres placering. Projektfiler og skærmbilleder bevares der til inspektion. Ingen eksisterende projekter berøres.

Manuel desktopkontrol:

1. Opret et projekt med navn, idé, brandfarve og valgfrit logo/reference. Vælg placering i den almindelige mappedialog.
2. Se startsiden i højre side. Redigér `public/index.html` i det oprettede projekt; ændringen skal vises automatisk. Prøv smal visning og genindlæsning.
3. Luk appen, start igen og åbn projektmappen. Kontrollér navn og forhåndsvisning.
4. Prøv at oprette samme navn samme sted. Handlingen skal afvises, og filerne skal bevares. Prøv også at annullere mappedialogen.
5. Kontrollér, at referencefiler kun ligger i `references/`, og at logoer ligger i `public/assets/`. Ingen af filerne sendes til en model.

## Modulgrænser

- `core/projects.cjs`: oprettelse, indholdsvalidering, kopiering af materialer og fælles profiler fra `../profiles/`. Arbejder uden Electron.
- `core/preview.cjs`: midlertidig HTTP-server bundet til `127.0.0.1` med tilfældig adgangssti, værtskontrol og adgang alene til almindelige offentlige filer.
- `main.cjs`: native dialoger, validering af IPC-afsender, appens levetid og koordinering af projekt/server.
- `preload.cjs`: afgrænset bro med navngivne handlinger. Ingen generel shell-, fil- eller IPC-adgang fra brugerfladen.
- `ui/`: lokal brugerflade. Ingen agent- eller hostingudbyder er bundet til den.

Projektformatet `harness.json` har `schemaVersion: 1`. Denne milepæl understøtter den statiske webskabelon. Testønsket gemmes som projektkontekst, men der genereres ikke tests. Referencelinks gemmes uden at hente deres indhold. Kun projekter oprettet med dette format kan genåbnes. Appen kopierer både `AGENTS.md` og `CLAUDE.md` fra det fælles profilgrundlag; instruktionerne er ikke teknisk håndhævelse.

## Forhåndsvisningens grænser

Appen bruger en isoleret, sandboxet renderer uden Node-integration, en iframe uden samme-origin-adgang, CSP og validerede IPC-afsendere efter [Electrons sikkerhedsvejledning](https://www.electronjs.org/docs/latest/tutorial/security). Netværksanmodninger fra brugerfladen begrænses til appens egne filer og den aktive forhåndsvisning. Previewets netværkskald, formularafsendelse, popups, downloads og enhedstilladelser er blokeret i denne milepæl. Det betyder også, at eksterne skrifter, CDN'er, API'er og mange rigtige applikationer kræver en senere, eksplicit integrationsbeslutning.

Kun `public/` serveres. Skjulte filer og symbolske links afvises. Referencefiler holdes udenfor; en følsom fil, som nogen selv lægger i `public/` med et almindeligt navn, kan stadig vises. Dette er ikke en OS-sandbox for fremtidige kodeagenter eller npm-processer. Serverens filkontrol beskytter ikke mod en samtidig lokal proces, som udskifter mapper under en læsning. Brug kun betroede lokale projektmapper i denne milepæl.

Forhåndsvisningen undersøger filmetadata hvert 1,5 sekund og genindlæser ved ændringer. Det nulstiller sidens midlertidige tilstand og er ikke en rammespecifik HMR-server. Grænsen er 10 MB pr. serveret fil, højst cirka 2.000 filer og 12 mappeniveauer ved ændringskontrol. Ved afbrudt oprettelse bevares delvise filer til gennemgang; de slettes ikke automatisk.

## Verifikationsstatus · 22. september 2026

- **Skrevet:** Electron-app med kompakt projektnavigation, lokal opstart, fælles profiler og live-forhåndsvisning.
- **Automatisk testet:** Fire tests af projektfiler og den faktiske HTTP-server består, herunder forsøg på sti-traversering, symbolske links og læsning af skjulte/private filer.
- **Afprøvet på konkret materiale:** Desktop-brugerrejsen består i Electron 44.4.4 på macOS med et oprettet prøveprojekt, logo, referencefil, annulleret mappedialog, filændring på disk, genåbning efter genstart og afvist overskrivning. Fejlstatus ved manglende index-fil og efterfølgende gendannelse er afprøvet. Previewets manglende Node-/IPC-adgang og blokerede eksterne fetch er kontrolleret. Dialogsvar er simuleret som beskrevet ovenfor.
- **Ikke verificeret:** Windows, manuel betjening af native dialoger, signerede installationspakker, agent-/loginintegration, Git-handlinger, npm/Docker og hosting. Intet er sat i drift eller offentliggjort.
