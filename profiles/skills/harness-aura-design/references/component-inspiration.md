# Vælg komponenter til opgaven

Den valgte AI-model bruger design-skillen til at vælge og udføre designet. Aura stiller relevante skills, brugerens materiale og dokumenterede brandkilder til rådighed. Der følger ingen obligatorisk palette, kortstruktur eller skærmskabelon med denne reference.

## Identitet før inspiration

Ved en kommune eller anden navngiven afsender: brug den valgte officielle designguide, godkendte lokale logoer, farver og fonte. Følg [brandresearch](brand-discovery.md), og registrér kilden til hvert identitetsvalg. En inspirationsside er ikke dokumentation for kommunens identitet. Hvis kilderne ikke kan læses med de tilladte værktøjer, sig hvad der mangler; udgiv ikke et gæt som en verificeret designguide.

## Mulige kilder

Disse er muligheder, ikke automatisk aktiverede pakker. Vælg efter brugerforløb, projektets teknologi og den godkendte retning. Officielle sider er kontrolleret 25. oktober 2026; genkontrollér den konkrete komponents kode, version, licens og installation ved faktisk genbrug.

- [Fisher UI](https://www.jakobfisker.dk/da/ui): visuel inspiration til komponenter og interaktioner, fx kvitteringer, opgaverækker og status. Undersøg den konkrete komponent frem for at kopiere hele sidens æstetik. Et vist preview eller en relativ installationssti beviser ikke, at en komplet komponentpakke kan installeres. Opfind ikke et registry, en kildefil eller en vellykket installation.
- [shadcn/ui](https://ui.shadcn.com/docs): komponentkode, som kan tilpasses projektets eget udtryk. Vælg kun relevante dele og kontrollér deres afhængigheder; en standardkomponent er et udgangspunkt for dit designarbejde.
- [Radix Primitives](https://www.radix-ui.com/primitives/docs/overview/introduction): ustilede interaktionsdele til blandt andet dialog, menu og tabs. Udform selv det visuelle udtryk efter brand og opgave; efterprøv fokus og tastatur i den samlede app.
- [Motion](https://motion.dev/docs/react): bevægelse og overgange, når de forklarer en ændring eller giver nyttig feedback. En almindelig CSS-overgang er ofte tilstrækkelig. Respektér reduceret bevægelse og vis reel arbejdsstatus.

Et statisk HTML/CSS/JavaScript-projekt kan bruge samme interaktionsprincipper med semantiske webelementer og egen CSS. Indfør ikke React eller et andet framework alene for en effekt, medmindre det er et begrundet og godkendt projektvalg. I et eksisterende React-projekt kan passende komponenter genbruges efter normale installations- og filgodkendelser.

## Udfør og efterprøv

Vælg komponenter ud fra funktion: fx en tilvalgsdialog, en kurv med synlig prisændring eller en læsbar liste over tidligere ordrer. Det er eksempler på adfærd, ikke påtvungne layouts. Forklar kort de væsentlige valg, implementér dem med det samme visuelle sprog, og prøv faktisk mobil, desktop, fokus, tomme tilstande og fejltilstande.

Kopiér ikke ukontrolleret kode eller aktive assets fra en reference. Netværk, downloads, pakker og nye licensvilkår følger projektets eksisterende regler. Hvis du selv implementerer et princip med inspiration fra en side, beskriv det som inspiration; påstå ikke, at sidens komponent er installeret eller testet.
