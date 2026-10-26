# Fælles beskyttelse af filnavne

Harness-reviewets P1-7 er efterprøvet mod den aktuelle fork. Listerne var fortsat forskellige: certifikater som `.p12` og `.pfx` blev udeladt af Git og snapshots, men ikke af læsevagten; kommandosandboxen manglede bl.a. `.gnupg`, `.kube` og `.azure`. Privacy Gates snapshot og genoprettelsesjournal var også uenige om store/små bogstaver. `chat-session.cjs` brugte allerede filvisningens kontrol, så reviewets særskilte regex dér var forældet.

`desktop/core/protected-paths.cjs` er nu fælles kilde til navneklasser, case- og Windows-aliasnormalisering samt mønstre til OpenCode og kommandosandboxen. Filværktøjer, automatiske godkendelser, filvisning, Git, ændringssnapshot, deploy-eksport og Privacy Gates projekt-/genoprettelseskontrol bruger den.

Der skelnes mellem adgangsoplysninger, beskyttet metadata, private referencer og genererede mapper. Genererede mapper beholder deres formålsafhængige behandling: et bygget `dist`-resultat er eksempelvis stadig muligt i et beskyttet arbejdsforløb. En præcist valgt reference kan læses gennem det eksisterende referenceforløb; den kan ikke gøre en legitimationsfil tilladt. Et ændret symlinkmål afvises stadig. Terminalen får ingen referenceundtagelse.

POSIX-filer med kolon vurderes både som hele navne og som mulige Windows-streamnavne. Dermed kan `public:credentials.json` ikke skjule den beskyttede del. Navne, der slutter med punktum eller mellemrum, afvises som tvetydige på tværs af platforme. Almindelige navne som `references.md`, `.git.notes` og `certificate.p12.backup` forbliver tilladt.

## Kontrol før filværktøjer

En afprøvning af den faktiske OpenCode 2.1.4 viste, at dens tidlige globregler ikke var nok: store bogstaver i bl.a. `.KUBE/config` kunne nå en skrivegodkendelse. Den betroede hook kontrollerer derfor nu read, write, edit og patch før værktøjet forbereder indhold eller diff. Alle patchkilder og destinationer kontrolleres samlet. En valgt reference tillader fortsat kun læsning.

Patchformatet følger den fastlåste motors verificerede formater, herunder heredoc, CRLF og Environment ID. Tvetydigt indrykkede kontrolheaders afvises; en native prøve viste ellers, at en anden beskyttet målfil kunne skjules dér. Almindelige patchlinjer er fortsat data. Nye filer kontrolleres gennem nærmeste eksisterende mappe, og hængende symlinks afvises.

Review fandt også, at kanonisering af en patchsletning eller -flytning gennem et symlink kunne fjerne målfilen i stedet for linket. Disse to operationer afvises nu, når den sidste stikomponent er et symlink. Normale read/write/edit og validerede mappelinks bevarer deres tidligere mål. Det er en snæver fail-closed begrænsning, ikke generel understøttelse af enhver patchsyntaks.

Reglerne er en navnebeskyttelse, ikke en indholdsklassifikation. Realpath, indholdsdetektion, dataklasser, destinationskontrol, konkrete godkendelser og netværksisolation bevares. De fundne navneforskelle var ikke i sig selv dokumentation for cloudlækage. Oplysninger i almindeligt navngivne filer kræver fortsat Privacy Gate.

## Afprøvning

Før rettelsen fejlede den fælles regression på de manglende navneklasser. Den første fælles efterprøve bestod 102/102 tests; senere regressioner tilføjer kolonnavne, almindelige filnavne, mutationer, eksport og symlinks. Den samlede aktuelle kontrol står i [opfølgningsrapporten](2026-10-26-backlog-followup.md).

- 42 beskyttede stier gennem de konkrete læse-, godkendelses-, Git-, filvisnings- og snapshotfunktioner, plus NTFS-streams og punktum-/mellemrumsaliaser.
- Almindelige filer bevares i snapshots; valgt/uvalgt reference og ændret symlinkmål kontrolleres særskilt.
- SRTs faktiske globfortolker sammenlignes med den fælles klassifikation.
- En rigtig macOS-isoleret proces afvises ved læsning og skrivning til alle prøvefilerne; en underproces kan heller ikke læse dem. Almindeligt projektarbejde fungerer stadig.
- Faktisk OpenCode med en kontrolleret lokal modelserver bruges til at efterprøve beskyttede mutationer før godkendelse, almindelige mutationer med én godkendelse, referenceadgang og de understøttede patchvarianter.
- Eksisterende kommandosandbox-, fil-plugin- og Privacy Gate-genoprettelsestests indgår i den samlede kontrol.

Alle filer og indhold er syntetiske. Ingen modelnøgle eller brugerprofil er brugt. Windows-navne er testet som input; native Windows/Linux-isolation er ikke afprøvet. OpenCodes tidlige globregler suppleres af den betroede filhooks kontrol af case, navnealiaser og faktisk mål.

Rå testoutput ligger i `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/backlog-followup/`, bl.a. `protected-paths-before.tap`, `protected-paths-native.tap`, `protected-tools-native-review.md` og `file-guard-symlink-eof-before.tap`/`file-guard-symlink-eof-after.tap`. De tidligere fejlbeviser bevares. Arbejdet er lokalt og endnu ikke udgivet.
