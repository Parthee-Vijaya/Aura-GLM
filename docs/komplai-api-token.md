# Historisk: Komplai som AI-forbindelse i Aura

**Udfaset 20. oktober 2026.** Komplai er fjernet som AI-forbindelse i den aktuelle kildekode. Dette dokument bevarer den tidligere kontrakt som historik og følger ikke med terminalpakken. Beskrivelserne nedenfor er ikke gældende vejledning til tilslutning. Komplai Run til udgivelse bevares og bruger en særskilt adgang.

Tidligere status: klienten var skrevet, og produktions-API'en var under udvikling hos Komplai. Ingen ændringer i Komplais backend blev foretaget i dette repository.

## Det skal Komplai-processen levere

1. En side, hvor et organisationsmedlem med adgang til kodeværktøjer kan oprette et **personligt**, organisationsbundet API-token med `coding:read`, `coding:complete` og en udløbsdato. Tokenet vises én gang. Administratorens adgangspolitik og organisationens fælles budget skal stadig gælde.
2. Metadata om det præsenterede token på `GET /v1/aura/account`, så Aura kan kontrollere begge rettigheder uden et betalt modelkald:

```json
{
  "credential": {
    "id": "ikke-hemmeligt-token-id",
    "scopes": ["coding:read", "coding:complete"],
    "expiresAt": "2026-12-01T12:00:00.000Z"
  }
}
```

Dette er en tilføjelse på svarets øverste niveau. Bevar de eksisterende felter `id`, `name`, `contract`, `balance.availableMicros` samt `data.recipients`, `region`, `training`, `retention`, `source`, `checkedAt`, `version`, `mode`, `accounting` og `platformStorage`. `credential.id` identificerer det indsendte token. Svaret må aldrig indeholde tokenets hemmelige værdi.

3. Det samme token skal virke mod de eksisterende Aura-endpoints: `GET /v1/aura/v1/models` og `POST /v1/aura/v1/chat/completions`. Bevar katalogets `account`, DKK-priser, streaming, værktøjskald, kontraktkontrol, request-id og kreditregnskab. Der skal ikke oprettes en separat betalingsvej.
4. Tilbagekaldelse i Komplai skal afvise efterfølgende kald. Kontrollér serverens egne regler om medlemskab, organisationsadgang, scopes, udløb og budget ved brug; Auras lokale kontrol erstatter dem ikke. Et token må ikke få adgang til en anden organisation via klientens parametre.

Hvis endpoints eller tokenformat skal ændres, skal vi koordinere det før udgivelse. Klienten bruger den eksisterende faste base `https://api.komplai.dk/v1/aura` og formatet `kp_live_` efterfulgt af 43 base64url-tegn. En API-adresse kan ikke indtastes sammen med et Komplai-token.

## Forløbet i Aura

- Brugeren vælger browserlogin eller API-token. Browserlogin er bevaret.
- Tokenet kontrolleres med et autentificeret GET-kald, som afviser redirects. Ingen projektfiler eller modelopgaver sendes.
- Organisation, fælles saldo og udløb vises; datavilkår kan åbnes. Brugeren bekræfter, at kommende opgaver må bruge organisationens kreditter.
- Umiddelbart før gemning kontrolleres oplysningerne igen. Ændret organisation, kontrakt, datavilkår, token-id, rettigheder eller udløb kræver en ny gennemgang. Ændret saldo alene gør ikke.
- Ufuldstændige metadata, forkert nøgle, manglende rettigheder, udløb og annullering gemmer ingen forbindelse. Den midlertidige gennemgang udløber efter fem minutter.
- Appen bruger systemets nøglebeskyttelse; CLI'en bruger sit krypterede nøglelager. Tokenet indgår ikke i projektfiler, terminalargumenter eller almindelige logbeskeder.
- **Fjern token fra Aura** fjerner kun den lokale kopi. Aura tilbagekalder ikke et manuelt indsat token, som kan være i brug andre programmer. Tilbagekaldelse sker i Komplai. Browserforbindelser beholder deres eksisterende tilbagekaldelse ved afkobling.

## Fælles acceptprøve, når API'en er klar

Opret et afgrænset testtoken i Komplai. Forbind det gennem app og CLI, og kontrollér organisation, udløb og saldo. Tilslutning må ikke trække kreditter. Gennemfør derefter en godkendt kodeændring med et aftalt forbrugsloft og kontroller organisationens faktiske regnskab.

Gentag med read-only-token, udløbet/tilbagekaldt token, manglende medlemskab, en anden organisation og utilstrækkeligt budget. Kontrollér både API-afvisningen og Auras fejlbesked. Et lokalt serverfixture beviser ikke, at disse kontroller findes i produktions-API'en.
