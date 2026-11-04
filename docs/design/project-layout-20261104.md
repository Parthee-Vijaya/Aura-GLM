# Nyt projekt og referencepalette

Kontrolleret 4. november 2026 for Aura Prime 0.6.0-beta.2. Brugeren bad om en projektformular uden unødvendig scrolling og de samme farver som den installerede DeepSeek Harness-app.

## Ændring

Den oprindelige opret-knap og placering har fået en fast bundrække uden for formularens rullende indhold. Knappen er stadig knyttet til `create-form` gennem HTML-attributten `form`, og den eksisterende submit-controller, validering og disabled-tilstand ejer handlingen. Returknappen er flyttet til headeren. Afstande er samlet, og idéfeltet starter på 96 px og kan stadig forstørres.

Ved normal tekststørrelse viser et native vindue på **980×720** hele standardformularen uden scroll. Navn, idé, hjælpeindgange, Flere valg, placering og Opret er synlige. Med og uden returknap er scrollhøjden lig panelets synlige højde: **493 CSS-px**. Opret-knappen slutter ved **y658,8**, mens rammen slutter ved **y684**. Udvidede tilvalg og længere indhold må rulle, mens bundrækken bliver synlig.

## Farver

Værdierne er læst fra theme-modulet i den faktisk installerede **DeepSeek Harness 0.2.1-rc.5**. Det aktuelle kildeklons nyere palette blev ikke brugt som erstatning for den installerede version. Der er ikke kopieret private samtaler eller referencebilleder ind i repositoryet.

| Rolle | Lyst | Mørkt |
| --- | --- | --- |
| Hovedflade | `#ffffff` | `#151517` |
| Sidebar | `#f9fafb` | `#1b1b1c` |
| Første hævede flade | `#ffffff` | `#232324` |
| Skrivefelt | `#ffffff` | `#2c2c2e` |
| Brugerboble | `#edf3fe` | `#2c2c2e` |
| Primær tekst | `#0f1115` | `#f9fafb` |
| Sekundær tekst | `#61666b` | `#cfd3d6` |
| Accent | `#4176e6` | `#7aaaff` |

De fælles Aura-tokens ejer farverne. De hvide felter har en synlig kant, og composeren har en diskret afgrænsning mod det hvide lærred. Auras eget logo, navn og semantiske statusfarver bevares. macOS' systemmaterialer kan påvirke, hvordan en flade ser ud på skærmen; tabellen angiver de statiske referenceværdier.

## Afprøvning

- Faktisk native Electron-app med isoleret profil og dokumentmappe. Eksternt netværk og modelkald var blokeret.
- Tom formular flyttede fokus til det obligatoriske navnefelt. To faktiske lokale projektoprettelser bestod, herunder med åbne tilvalg. Den oprindelige formtilknytning og returhandling blev kontrolleret.
- Native 980×720 er målt i lyst og mørkt tema. Standardvisning med returknap og åbne tilvalg er kontrolleret særskilt.
- Uafhængigt NodeTerm-review: **qualified APPROVE**, 228/228 rendererassertions over 56 tilstande, 22/22 referencefarveværdier og 99/99 målrettede Node-tests. Den uafhængige rendererprøve kontrollerer 980×720 og 1440×940, lys/mørk, returhandling, udvidelser, lange beskeder og større tekst. Den bruger appens faktiske HTML, stylesheets og onboarding-dekoration med syntetiske data; øvrige appcontrollere er afgrænset fra. Det er rendererbevis, mens native-kontrollen ovenfor dokumenterer den faktiske app.
- Samlet `scripts/check.cjs` med pinnet Node 22.23.3: **2.646 pass, 34 skips, 0 fail**. Efter versionsændringen til beta.2 bestod yderligere **57/57** målrettede metadata-, kontrast- og onboardingtests.

[Native målinger, referenceværdier og billedhashes](project-layout-20261104.json). [Tre nye native screenshots](../images/aura-prime-0.6.0-beta.2/) vises i [README](../../README.md). Tidligere beta.1-billeder er bevaret som historik. macOS' lilla delingsindikator og markør kan ses i optagelserne og indgår ikke i Aura.

Ved stor tekst, udvidede detaljer eller lange modelresultater kan indhold stadig kræve scroll. Det ændrer ikke formens adgangsgrænser eller dataflow. Der er ikke bygget en ny installer eller udført betalte modelkald, Windows-kvalifikation eller GitHub CI som del af denne rettelse.
