const { validateSkillText } = require('./library.cjs');
const PRIMARY_BUILD_SKILL = 'harness-aura-design';
// The model applies the installed skills. Aura does not select a visual theme
// from purpose keywords or provider identity; explicit project choices remain.
function designResponsibilityGuidance({ newInterface, primaryColor } = {}) {
  const scope = newInterface === true
    ? 'Et nyt UI: udarbejd selv et konkret designforslag gennem de aktiverede design-skills ud fra brugerens opgave og dokumenterede brandkilder. Brug ikke en fast opgavetypepalette eller layoutopskrift. Forslaget giver ingen tilladelse til at bygge og erstatter ikke brugerens godkendelse.'
    : 'Genbrug det eksisterende, godkendte design, tokens og komponenter. Indfør ikke en ny palette eller komposition som følge af denne vejledning. Ved en opgave uden UI tilføjes ingen brugerflade.';
  const selectedColor = typeof primaryColor === 'string' && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(primaryColor)
    ? ` Projektets udtrykkeligt valgte primærfarve er ${primaryColor}; bevar valget og afprøv relevante kontraster.`
    : '';
  return `DESIGN GENNEM SKILLS\n${scope}${selectedColor} Brugerens konkrete farve-, typografi- og layoutvalg samt godkendte designforslag har forrang. Brug kun et kommunelogo eller en officiel identitet som verificeret, når kilden faktisk er kontrolleret. Markér forslag og usete kilder tydeligt; opfind ikke provenance.`;
}
// Stable review IDs for prompt guidance and observational QA. These criteria are
// not a test runner, a design score or evidence that a rendered page was inspected.
const DESIGN_QUALITY_CHECKS = Object.freeze([
  { id: 'direction', label: 'Retning', acceptance: 'Følg godkendt design og opgaven. Et nyt UI har konkrete farver med roller, typografi og komposition, der passer til indholdet; ingen fast hero, kortgitter eller generisk tema til alle produkter. Billeder er relevante og tilgængelige; emoji er ikke primært billedindhold.' },
  { id: 'hierarchy', label: 'Hierarki', acceptance: 'På første relevante skærm ses formål, vigtigste indhold og én tydelig primær handling for det aktuelle trin. Brug meningsfulde størrelser, grupper og tæthed; undgå tomme dekorative flader og lige fremhævede handlinger.' },
  { id: 'system', label: 'Sammenhæng', acceptance: 'Genbrug ét sæt semantiske farver, tekststørrelser, afstande og komponenter. Læsbar tekst, synligt tastaturfokus og målte kontrastpar: normal tekst mindst 4,5:1, stor tekst og relevante UI-dele 3:1. Bevar eksisterende godkendte tokens.' },
  { id: 'flow', label: 'Hovedforløb', acceptance: 'Gennemfør brugerens primære forløb fra start til resultat, inklusive tilbage og gentaget valg. Alle synlige knapper virker; ingen uncaught browserfejl, opdigtet succes eller kunstig første-fejl. Data og aktuelle valg er stadig korrekte efter genrendering.' },
  { id: 'responsive', label: 'Vindue og betjening', acceptance: 'Se den kørende app ved 390 × 844 og 1440 × 900, eller projektets relevante størrelser. Ingen vandret siderulning, afskåret tekst eller skjult nødvendig handling. Prøv tastatur og 200 % zoom; berøringsmål sigter mod 44 px.' },
  { id: 'evidence', label: 'Bevis og rettelse', acceptance: 'Undersøg faktisk renderede skærme og udfør handlingerne. Notér kort bestået, fejl eller ikke afprøvet med observation pr. kontrol. Ret observerede fejl inden for opgaven og test det berørte forløb igen; rapportér resterende begrænsninger ærligt.' }
].map(Object.freeze));
function designQualityGuidance(mode) {
  const scope = ['idea', 'plan'].includes(mode)
    ? 'I denne arbejdsmåde foreslår du design og planlægger kontrollen. Du udfører den ikke og må ikke markere noget som bestået uden faktisk bevis. Bevar arbejdsmådens krævede svarformat.'
    : 'Ved UI-bygning gennemfører du kontrollen med de tilgængelige, tilladte værktøjer før du kalder opgaven færdig. Se appen, ret konkrete fejl inden for den godkendte opgave, og efterprøv rettelsen. Mangler et værktøj, markér den berørte kontrol som ikke afprøvet; opfind ikke testresultater.';
  return `FØRSTEUDKAST-KONTROL\n${scope}\nFor opgaver uden UI anvendes kun de relevante kontroller; opfind ikke en skærm. Kontrollen giver ingen nye tilladelser og ændrer ikke den godkendte plan eller visuelle retning.\n${DESIGN_QUALITY_CHECKS.map(check => `[${check.id}] ${check.label}: ${check.acceptance}`).join('\n')}`;
}
// The effective, validated project skill is inserted before the first model call.
// No provider heuristics or tool grants. Project additions retain the mandatory core.
function primaryBuildGuidance(context, mode, designOptions = {}) {
  if (!['plan', 'build', 'free', 'idea'].includes(mode)) return '';
  const skill = context.skills?.find(item => item.name === PRIMARY_BUILD_SKILL);
  if (!skill) throw new Error('Hovedskillens instruktioner mangler. Gennemgå designfunktionen igen.');
  const main = skill.files.find(file => file.path === 'SKILL.md');
  if (!main) throw new Error('Hovedskillens instruktioner mangler. Gennemgå designfunktionen igen.');
  const { body } = validateSkillText(PRIMARY_BUILD_SKILL, main.content);
  const baseline = skill.baseline === undefined ? body : validateSkillText(PRIMARY_BUILD_SKILL, skill.baseline).body;
  const instructions = baseline === body ? body.trim() : `${baseline.trim()}\n\nPROJEKTETS DESIGNTILPASNING (supplerer grundmetoden; ophæver ikke krav til kvalitet, data eller godkendelser):\n${body.trim()}`;
  const scope = mode === 'idea'
    ? 'Brug designmetoden til beskrivelse og forslag alene. Du har ingen værktøjer i idéhjælpen. Bevar det krævede svarformat; opret ingen filer, og påstå ikke at referencer er læst eller noget er bygget eller testet.'
    : 'Brug denne hovedskill ved planlægning og bygning i brugerens projekt. Kernen er allerede indlæst; hent kun skillen med skill-værktøjet, hvis du behøver dens detaljerede referencer. Før brugerens konkrete designforslag fra idébeskrivelsen videre i planen og det første udkast; det er ikke nok blot at gentage funktionerne. Tilpas metoden til opgaven; opfind ikke en brugerflade til en opgave uden UI.';
  return `HOVEDSKILL TIL BYGNING: ${PRIMARY_BUILD_SKILL}\n${scope}\nAppens grundregler, den aktuelle arbejdsmåde, projektets dataregler og godkendelser gælder fortsat.\n\n${instructions}\n\n${designResponsibilityGuidance(designOptions)}\n\n${designQualityGuidance(mode)}`;
}
module.exports = { PRIMARY_BUILD_SKILL, DESIGN_QUALITY_CHECKS, primaryBuildGuidance };
