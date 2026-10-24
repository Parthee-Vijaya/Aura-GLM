const { validateSkillText } = require('./library.cjs');
const PRIMARY_BUILD_SKILL = 'harness-aura-design';
// The effective, validated project skill is inserted before the first model call.
// No provider heuristics, tool grants or fallback to a disabled library default.
function primaryBuildGuidance(context, mode) {
  if (!['plan', 'build', 'free', 'idea'].includes(mode) || context.features?.design !== true) return '';
  const skill = context.skills?.find(item => item.name === PRIMARY_BUILD_SKILL);
  if (!skill) return '';
  const main = skill.files.find(file => file.path === 'SKILL.md');
  if (!main) throw new Error('Hovedskillens instruktioner mangler. Gennemgå designfunktionen igen.');
  const { body } = validateSkillText(PRIMARY_BUILD_SKILL, main.content);
  const scope = mode === 'idea'
    ? 'Brug designmetoden til beskrivelse og forslag alene. Du har ingen værktøjer i idéhjælpen. Bevar det krævede svarformat; opret ingen filer, og påstå ikke at referencer er læst eller noget er bygget eller testet.'
    : 'Brug denne hovedskill ved planlægning og bygning i brugerens projekt. Kernen er allerede indlæst; hent kun skillen med skill-værktøjet, hvis du behøver dens detaljerede referencer. Tilpas metoden til opgaven; opfind ikke en brugerflade til en opgave uden UI.';
  return `HOVEDSKILL TIL BYGNING: ${PRIMARY_BUILD_SKILL}\n${scope}\nAppens grundregler, den aktuelle arbejdsmåde, projektets dataregler og godkendelser gælder fortsat.\n\n${body.trim()}`;
}
module.exports = { PRIMARY_BUILD_SKILL, primaryBuildGuidance };
