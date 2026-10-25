# YOLO under Byg

Vælg **Byg** ved skrivefeltet og derefter **YOLO · slå til …** under arbejdsmåden. Aura viser først en advarsel om filændringer, kommandoer, hjemmesider og brugerens ansvar. Afkryds bekræftelsen og vælg **Aktivér YOLO**. Det kan vælges før den første opgave eller under en igangværende byggeopgave.

YOLO gælder kun denne samtale, indtil det slås fra eller appen lukkes. Status vises over skrivefeltet med **Slå fra**. Andre samtaler starter uden YOLO. Skift til **Samtale** eller **Planlæg** giver ingen ekstra rettigheder; skift tilbage til **Byg** bruger samtalens eksisterende valg.

Almindelige godkendelser af konkrete filhandlinger, afgrænsede mapper og HTTP(S)-hjemmesider håndteres automatisk. Det omfatter almindelige filer uden for projektet. Kommandoer godkendes kun automatisk i projektets arbejdsmappe med Auras aktive kommandobeskyttelse; netværks- og filgrænser i denne beskyttelse udvides ikke af YOLO.

YOLO godkender ikke en plan eller deling af nyt materiale med AI’en. Nøgler, beskyttede referencer, Git-interne filer, ugyldige/uklare mål og faste regler beholder deres begrænsninger. Ukendte værktøjer får ikke automatisk adgang. Manglende kommandobeskyttelse forhindrer aktivering.

Tilladelsen opbevares kun i hukommelsen. En advarsel udløber efter fem minutter, og en ændret eller stoppet handling kan ikke genbruge dens bekræftelse. Tilbagekaldelse stopper fremtidige automatiske godkendelser; en handling, der allerede er godkendt eller udført, rulles ikke tilbage.

## Afprøvning

- Enhedsprøver: `desktop/tests/conversation-permission.test.cjs` og de eksisterende godkendelses-, plan- og motortests.
- Native prøve: `desktop/scripts/verify-yolo.cjs` bruger en separat profil uden credentials. Den kontrollerer placering under Byg, advarsel, annullering, aktivering, samtaleskift, tilbagekaldelse og genstart.
- Disse prøver dokumenterer tilladelsesflowet; de er ikke en vurdering af en models evne til at bygge en app.
