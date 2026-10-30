const { validateSkillText } = require('./library.cjs');
const PRIMARY_BUILD_SKILL = 'harness-aura-design';
const BUILD_MODES = new Set(['plan', 'build', 'free', 'idea']);
// These short method references are useful before the first call, including in
// idea refinement which has no skill-reading tool. Never choose a visual recipe
// from provider identity or user-text keywords, and never inline the library.
const DESIGN_REFERENCE_PATHS = Object.freeze([
  'references/design-brief.md',
  'references/brand-discovery.md',
  'references/component-inspiration.md'
]);
const DESIGN_REFERENCE_LIMITS = Object.freeze({ fileBytes: 8 * 1024, totalBytes: 12 * 1024 });
const REFERENCE_INTRO = 'INDLÆSTE DESIGNREFERENCER\nDe følgende skillreferencer er allerede til stede før dette modelkald. Brug deres metode til den konkrete opgave; vælg selv kompositionen. De er ingen godkendelse, ingen installerede komponenter og ingen dokumentation for, at en ekstern kilde er besøgt. Læs kun øvrige nødvendige referencer med de eksisterende tilladte værktøjer; idéhjælp har ingen sådanne værktøjer.';
const omittedReferenceText = omitted => omitted.length ? `IKKE INDLÆST\n${omitted.map(item => `${item.path}: ${item.reason === 'unavailable' ? 'ikke tilgængelig' : 'ikke indlæst på grund af størrelsesgrænsen'}.`).join('\n')} Påstå ikke, at disse referencer er læst. Hovedmetoden gælder stadig.` : '';
function designReferenceBundle(context, mode) {
  const empty = { text: '', references: [], omitted: [], bytes: 0 };
  if (!BUILD_MODES.has(mode)) return empty;
  const skill = context.skills?.find(item => item.name === PRIMARY_BUILD_SKILL);
  if (!skill) return empty;
  const references = [], omitted = [], sections = [];
  const overhead = Buffer.byteLength(REFERENCE_INTRO + omittedReferenceText(DESIGN_REFERENCE_PATHS.map(path => ({ path, reason: 'total-budget' }))), 'utf8') + 8;
  let usedBytes = 0;
  for (const referencePath of DESIGN_REFERENCE_PATHS) {
    const files = skill.files.filter(file => file.path === referencePath);
    if (files.length !== 1 || typeof files[0].content !== 'string' || !files[0].content.trim()) {
      omitted.push({ path: referencePath, reason: 'unavailable' }); continue;
    }
    const content = files[0].content.trim(), bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > DESIGN_REFERENCE_LIMITS.fileBytes) { omitted.push({ path: referencePath, reason: 'file-budget' }); continue; }
    const section = `SKILLREFERENCE: ${PRIMARY_BUILD_SKILL}/${referencePath}\n${content}`;
    const sectionBytes = Buffer.byteLength(section, 'utf8') + (sections.length ? 2 : 0);
    if (usedBytes + sectionBytes + overhead > DESIGN_REFERENCE_LIMITS.totalBytes) { omitted.push({ path: referencePath, reason: 'total-budget' }); continue; }
    sections.push(section); usedBytes += sectionBytes;
    references.push({ path: referencePath, bytes });
  }
  // The bundle contains complete reference files. Over-budget files are omitted
  // explicitly, never sliced mid-instruction. Only fixed paths reach this text.
  const text = [
    REFERENCE_INTRO,
    ...sections,
    ...(omitted.length ? [omittedReferenceText(omitted)] : [])
  ].join('\n\n');
  return { text, references, omitted, bytes: Buffer.byteLength(text, 'utf8') };
}
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
  if (!BUILD_MODES.has(mode)) return '';
  const skill = context.skills?.find(item => item.name === PRIMARY_BUILD_SKILL);
  if (!skill) throw new Error('Hovedskillens instruktioner mangler. Gennemgå designfunktionen igen.');
  const main = skill.files.find(file => file.path === 'SKILL.md');
  if (!main) throw new Error('Hovedskillens instruktioner mangler. Gennemgå designfunktionen igen.');
  const { body } = validateSkillText(PRIMARY_BUILD_SKILL, main.content);
  const baseline = skill.baseline === undefined ? body : validateSkillText(PRIMARY_BUILD_SKILL, skill.baseline).body;
  const instructions = baseline === body ? body.trim() : `${baseline.trim()}\n\nPROJEKTETS DESIGNTILPASNING (supplerer grundmetoden; ophæver ikke krav til kvalitet, data eller godkendelser):\n${body.trim()}`;
  const scope = mode === 'idea'
    ? 'Brug designmetoden til beskrivelse og forslag alene. Du har ingen værktøjer i idéhjælpen. Bevar det krævede svarformat; opret ingen filer, og påstå ikke at yderligere referencer eller eksterne kilder er læst, eller at noget er bygget eller testet.'
    : 'Brug denne hovedskill ved planlægning og bygning i brugerens projekt. Kernen og de nedenfor indlæste referencer er allerede til stede; eksempelfilernes indhold er ikke. Følg læsetrinnet nedenfor ved et nyt UI, og hent ellers kun nødvendige detaljer. Før brugerens konkrete designforslag fra idébeskrivelsen videre i planen og det første udkast; det er ikke nok blot at gentage funktionerne. Tilpas metoden til opgaven; opfind ikke en brugerflade til en opgave uden UI.';
  const examples = ['references/open-design-landing.md', 'references/open-design-overview.md'].filter(reference => skill.files.some(file => file.path === reference && typeof file.content === 'string' && file.content.trim()));
  const exampleStep = mode !== 'idea' && designOptions.newInterface === true && examples.length
    ? `LÆS ÉT DESIGNEKSEMPEL FØRST\nFør du fastlægger et nyt UI-design eller skriver UI-filer: Kald skill-værktøjet med {"id":"harness-aura-design"}, så du får referencernes præcise filstier. Vælg selv ét relevant eksempel blandt ${examples.map(reference => reference.slice('references/'.length)).join(', ')}, og læs det med read-værktøjet på den præcise filsti fra skillresultatet. Relative navne her er ikke stier i projektmappen. Hvis eksemplet er allerede læst i denne samtale, genbrug det og undgå et gentaget kald. Tilpas eller forkast udtrykket efter opgaven og godkendt brand; læsning tvinger ingen skabelon. Notér kort den faktisk læste fil og de anvendte principper. Trinnet giver ingen nye tilladelser og ændrer ingen plan eller godkendelse.`
    : '';
  const references = designReferenceBundle(context, mode);
  return `HOVEDSKILL TIL BYGNING: ${PRIMARY_BUILD_SKILL}\n${scope}\nAppens grundregler, den aktuelle arbejdsmåde, projektets dataregler og godkendelser gælder fortsat.\n\n${exampleStep ? exampleStep + '\n\n' : ''}${instructions}\n\n${references.text}\n\n${designResponsibilityGuidance(designOptions)}\n\n${designQualityGuidance(mode)}`;
}
module.exports = { PRIMARY_BUILD_SKILL, DESIGN_QUALITY_CHECKS, DESIGN_REFERENCE_PATHS, DESIGN_REFERENCE_LIMITS, designReferenceBundle, primaryBuildGuidance };
