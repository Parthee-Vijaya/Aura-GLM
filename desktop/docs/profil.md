# Din profil i Aura Prime

Profilen er dine grundindstillinger: hvem du er, og hvad Aura Prime skal bruge som udgangspunkt, når du starter noget nyt. Du udfylder den én gang under den guidede opstart og ser den aldrig igen, medmindre du selv går til den.

## Sådan udfyldes profilen

Den guidede opstart begynder med trinnet **Din profil**. Du kan skrive dit navn, vælge dit ikon — dine initialer (standardvalget), én af tre Aura-ikoner eller et eget billede — og vælge, om appen skal følge systemets tema eller være lys eller mørk. Alle felter kan udelades, og **Vælg senere** er altid tilladt. Er din profil allerede udfyldt, springer trinnet over — du bliver aldrig spurgt igen.

## Funktioner vælges ad gangen

Introduktionen spørger ikke om funktioner. En helt ny installation starter med grundpakken: grundreglerne og designhjælpen, som altid er aktiv. Øvrige funktioner og skills vælges til og fra ad gangen under **Indstillinger › Funktioner**. Har du brugt appen fra før, beholder du automatisk alle funktioner — intet slås fra af sig selv.

## Det gemmer profilen

- **Navn og ikon.** Navnet bruges i appens egen visning. Som standard vises dine initialer; du kan vælge én af tre Aura-ikoner eller uploade et eget billede (jpg eller png, højst 1 MB). Billedet gemmes i appens egen datamappe, og **Fjern billedet** sletter det igen.
- **Standard-AI.** Hvilken forbindelse (og evt. model) nye projekter starter med. Vælges under Indstillinger eller med **Brug som standard** i modelvælgeren.
- **Standard arbejdsmåde.** Om helt nye samtaler starter i Samtale eller Planlæg.
- **Udseende.** Temaet (Følg system, Lyst, Mørkt), om sidepanelet er åbent, når appen starter, og skriftstørrelsen (10–16 px, standard 13), som skalerer hele appen.
- **Projektstandarder.** Udgivelse, designpakke og tests, som forudfylder Flere valg, når du opretter et projekt.
- **Hjælpeniveau.** Tre trin: Fuld hjælp (forklaringer undervejs), Hjælp ved behov (hintene samles bag en "?"-knap ved skrivefeltet) og Ingen hjælp. Advarsler, godkendelser, Før du sender og privacyvalg vises altid.

## Sådan ændres profilen

Åbn **Indstillinger** i sidepanelet og vælg **Din profil** eller **Udseende**. Sektionerne viser dine nuværende værdier, og hver ændring gemmes med det samme. De andre indstillinger — AI-forbindelser, Funktioner, Opdateringer og Hjælp og feedback — ligger i samme dialog. Profilen gemmes i appens egen datamappe på din computer og følger med, når appen genstarter.

## Sådan anvendes standarderne

Nye projekter og helt nye samtaler starter med profilens valg: standard-AI'et, arbejdsmåden, temaet, panelstarten og projektstandarderne. Det, du allerede har i et åbent projekt, vinder altid: en gemt kladde eller en genoptaget samtalshistorik bevares, og det enkelte projekts egne valg ændrer aldrig profilen. Fjerner du en forbindelse eller designpakke, ryddes profilen med en forklaring — intet andet røres.

## Fortrolighed

Navn, ikon og billede er ren UI-tilstand. De bliver i appen og i din egen datamappe og sendes aldrig til AI'en, prompts, modellog, diagnostik eller feedbackrapporter.

## Afprøvning

- Enhedsprøver: `desktop/tests/profile.test.cjs`, `profile-avatar.test.cjs`, `profile-step.test.cjs`, `profile-chip.test.cjs`, `profile-save.test.cjs`, `settings.test.cjs`, `settings-theme.test.cjs`, `settings-fontsize.test.cjs`, `composer-help.test.cjs` og `profile-consumption.test.cjs`.
- Native prøve: `npm run test:desktop` i `desktop` gennemfører hele appforløbet og kontrollerer, at profilen udfyldes i onboarding, ændres under Indstillinger og genindlæses efter genstart.
