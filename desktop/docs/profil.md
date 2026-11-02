# Din profil i Aura Prime

Profilen er dine grundindstillinger: hvem du er, og hvad Aura Prime skal bruge som udgangspunkt, når du starter noget nyt. Du udfylder den én gang under den guidede opstart og ser den aldrig igen, medmindre du selv går til den.

## Sådan udfyldes profilen

Den guidede opstart begynder med trinnet **Din profil**. Du kan skrive dit navn, vælge et af tolv ikoner og vælge, om appen skal følge systemets tema eller være lys eller mørk. Alle felter kan udelades, og **Vælg senere** er altid tilladt. Er din profil allerede udfyldt, springer trinnet over — du bliver aldrig spurgt igen.

## Det gemmer profilen

- **Navn og ikon.** Navnet bruges i appens egen visning; uden ikon vises dine initialer.
- **Standard-AI.** Hvilken forbindelse (og evt. model) nye projekter starter med. Vælges under Indstillinger eller med **Brug som standard** i modelvælgeren.
- **Standard arbejdsmåde.** Om helt nye samtaler starter i Samtale eller Planlæg.
- **Udseende.** Temaet (Følg system, Lyst, Mørkt) og om sidepanelet er åbent, når appen starter.
- **Projektstandarder.** Udgivelse, designpakke og tests, som forudfylder Flere valg, når du opretter et projekt.
- **Hjælpeniveau.** Fuld hjælp eller Minimal, der fjerner korte genvejs- og forklaringslinjer — aldrig advarsler eller vigtige beskeder.

## Sådan ændres profilen

Åbn **Indstillinger** i sidepanelet og vælg **Din profil** eller **Udseende**. Sektionerne viser dine nuværende værdier, og hver ændring gemmes med det samme. De andre indstillinger — AI-forbindelser, Funktioner, Opdateringer og Hjælp og feedback — ligger i samme dialog. Profilen gemmes i appens egen datamappe på din computer og følger med, når appen genstarter.

## Sådan anvendes standarderne

Nye projekter og helt nye samtaler starter med profilens valg: standard-AI'et, arbejdsmåden, temaet, panelstarten og projektstandarderne. Det, du allerede har i et åbent projekt, vinder altid: en gemt kladde eller en genoptaget samtalshistorik bevares, og det enkelte projekts egne valg ændrer aldrig profilen. Fjerner du en forbindelse eller designpakke, ryddes profilen med en forklaring — intet andet røres.

## Fortrolighed

Navn og ikon er ren UI-tilstand. De bliver i appen og i din egen datamappe og sendes aldrig til AI'en, prompts, modellog, diagnostik eller feedbackrapporter.

## Afprøvning

- Enhedsprøver: `desktop/tests/profile.test.cjs`, `profile-step.test.cjs`, `settings.test.cjs`, `settings-theme.test.cjs` og `profile-consumption.test.cjs`.
- Native prøve: `npm run test:desktop` i `desktop` gennemfører hele appforløbet og kontrollerer, at profilen udfyldes i onboarding, ændres under Indstillinger og genindlæses efter genstart.
