const path = require('node:path');
const fs = require('node:fs');

// Appen hedder Aura. Før navneskiftet hed den AI Harness, og skiftet må ikke koste brugerne deres data.
const DISPLAY_NAME = 'Aura';
const LEGACY_NAME = 'AI Harness';

// Datamappen og navnet i nøgleringen bestemmes før opstart. En eksisterende installation beholder sin datamappe, så
// forbindelser, designpakker og projektlisten følger med. En valgt --user-data-dir, fx i testene, bruges som den er.
// Nøglerne er krypteret under "<appnavn> Safe Storage", og navnet låses ved opstart. Datamappen husker derfor, hvilket navn
// dens nøgler hører til. Appens data fra før navneskiftet har ikke den oplysning og hører til AI Harness.
function appIdentity({ appData, packaged, customUserData, userData, sessionData, files = fs }) {
  const legacyFolder = customUserData ? null : path.join(appData, packaged ? LEGACY_NAME : 'ai-harness-desktop');
  const legacy = Boolean(legacyFolder && files.existsSync(legacyFolder));
  const folder = legacy ? legacyFolder : userData;
  const marker = path.join(folder, 'harness', 'noeglering.json');
  let keychainName;
  try { keychainName = JSON.parse(files.readFileSync(marker, 'utf8')).navn; }
  catch { keychainName = files.existsSync(path.join(folder, 'harness')) ? LEGACY_NAME : DISPLAY_NAME; }
  if (![LEGACY_NAME, DISPLAY_NAME].includes(keychainName)) keychainName = DISPLAY_NAME;
  return { userData: folder, sessionData: legacy ? legacyFolder : sessionData, keychainName, marker };
}

// Husker navnet, så næste opstart vælger det samme. Uden skriveadgang bruges navnet alligevel i denne kørsel.
function rememberKeychain({ marker, keychainName }, files = fs) {
  try { files.mkdirSync(path.dirname(marker), { recursive: true }); files.writeFileSync(marker, JSON.stringify({ navn: keychainName }) + '\n'); return true; }
  catch { return false; }
}

// Nye projekter lægges i Dokumenter/Aura. Findes Dokumenter/AI Harness fra før navneskiftet, bruges den fortsat,
// så brugerens projekter bliver samlet ét sted.
function projectParent(documents, files = fs) {
  const earlier = path.join(documents, LEGACY_NAME);
  return files.existsSync(earlier) ? earlier : path.join(documents, DISPLAY_NAME);
}

module.exports = { appIdentity, rememberKeychain, projectParent, DISPLAY_NAME, LEGACY_NAME };
