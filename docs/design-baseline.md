# Design som fast grundpakke i Aura 1

Brugerens bestilling af 25. oktober 2026 gør de leverede designinstruktioner obligatoriske ved idéhjælp, planlægning og bygning.

## De to leverede grundlag

- **Aura Design** af Parthee Vijayamohan: [hovedskill og referencebibliotek](../profiles/skills/harness-aura-design/SKILL.md), herunder brandkilder, designretninger, typografi, farver, temaer, komponenter og visuel kvalitet.
- **Design og byg gennemarbejdede webapps og hjemmesider**: [den fulde leverede vejledning](../profiles/skills/harness-aura-design/references/webapp-craft.md). Metoden er indarbejdet i hovedskillens kerne, så modellen får kravene med i første forespørgsel.

Den eksisterende [design- og tilgængelighedsskill](../profiles/skills/harness-design-og-tilgaengelighed/SKILL.md) er også altid tilgængelig.

## Adfærd

**Altid slået til** viser: “Gennemarbejdet design fra første udkast: Aura-design og din byggevejledning med typografi, farver, brugervenlighed, tilgængelighed og visuel kontrol.”

Design har ingen afbryder i opsætningen eller funktionsdialogen. Vælg selv ved første start ændrer alene de valgfrie funktioner. Ældre globale fravalg og projektundtagelser ignoreres for design, også efter genstart. Øvrige indstillinger bevares.

Hovedskillen indlæses før første modelkald i idéhjælp, Planlæg, Byg og Byg den valgte plan. Det gælder på tværs af udbydere, herunder Mistral og Corti. Manglende eller ugyldig hovedskill stopper byggeforespørgslen. En lokal projekttilpasning supplerer den fælles kerne, og den samlede tekst indgår i gennemgangen før afsendelse.

Almindelig samtale får ikke automatisk byggeinstruktioner. Opgaver uden brugerflade får ikke påtvunget en hjemmeside. Eksport til andre kodeværktøjer bevarer brugerens valgte skilludvalg. Alle 23 eksportpakker er genbygget med den opdaterede vejledning.

Designmetoden giver ingen ekstra rettigheder til filændringer, kommandoer, netværk eller private data. Idéhjælp har fortsat ingen værktøjer, planlægning bygger ikke, og plan- og værktøjsgodkendelser er adskilt. Godkendte designs må ikke ændres på egen hånd.

## Afprøvning

Automatiske prøver dækker gamle fravalg, genstart, projekttilpasning uden tab af grundmetoden, manglende/ugyldige instruktioner, eksport og uændrede adgangsregler.

Syv transportforløb kører den rigtige Workbench og OpenCode 1.18.33 mod en kontrolleret lokal HTTP-server. Den faktiske første forespørgsel kontrolleres for den nøjagtige gennemgåede kerne med Mistral- og Corti-protokoller, ældre fravalg, CLI og almindelig samtale. Idéhjælpens tests kontrollerer også afsendt tekst og fravær af værktøjer.

Ti kontroller i rigtig Electron afprøver opsætning, funktioner, IPC, genstart, øvrige fravalg, vandret layout og rendererfejl. Screenshots er fra denne appprøve.

    node --test --test-concurrency=1 desktop/tests/*.test.cjs
    node --test --test-concurrency=1 cli/tests/*.test.cjs
    node desktop/scripts/verify-primary-build-skill.cjs
    node desktop/scripts/verify-design-baseline.cjs

Prøverne beviser indlæsning, afsendelse og brugerfladens adfærd. Der er ikke kørt en ny ekstern Mistral-/Corti-opgave eller vurderet nye modelgenererede apps. Instruktioner er ikke en garanti for ens designkvalitet på alle modeller. Ændringen er endnu ikke udgivet i en ny DMG.
