// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Profilbilledet er hovedprocessens sag alene. Rendereren kan kun bede om
// filvælgeren og får kun udfaldet tilbage — aldrig stier, aldrig billeddata.
// Det valgte jpg/png størrelsestjekkes (~1 MB), afkodes med Electrons
// nativeImage, afvises over loftet på afkodede pixels og skaleres til højst
// 256x256 med bevaret sideforhold. PNG'en skrives atomisk under ét fast navn
// i appens private harness-mappe (tmp + omdøbning, rettigheder 0600), så et
// afbrudt skridt aldrig efterlader en trunkeret fil, der læses som et gyldigt
// valg. Filen og ikonvalget skifter altid sammen: en vellykket upload gemmer
// icon 'upload', en fjernelse sletter filen og rydder til initialerne.
// Billedet er ren UI-tilstand som navnet (designdokumentets anti-mål): det
// når aldrig prompts, modelloggen, diagnostik eller feedback, og protokollen
// serverer det kun til appens egen renderer.
const MAX_BYTES = 1024 * 1024; // ~1 MB input file
const MAX_EDGE = 256;          // avatar box, longest edge after the fit
const MAX_PIXELS = 4096;      // decoded image edge; larger pictures are rejected before any resize or write
const AVATAR_NAME = 'avatar.png';
const READ_ERROR = 'Billedet kunne ikke læses. Vælg et jpg- eller png-billede.';
const PIXEL_ERROR = 'Billedet er for stort. Vælg et billede på højst 4096 × 4096 pixels.';

function installProfileAvatar({ register, dialog, nativeImage, fs, path, directory, saveProfile, getWindow }) {
  const file = () => path.join(directory(), AVATAR_NAME);
  const temporary = () => path.join(directory(), `${AVATAR_NAME}.tmp`);
  async function store(source) {
    let info;
    try { info = await fs.stat(source); } catch { throw new Error(READ_ERROR); }
    if (info.size > MAX_BYTES) throw new Error('Billedet er for stort. Vælg et jpg- eller png-billede på højst 1 MB.');
    // nativeImage afkoder ved konstruktion, så de afkodede dimensioner loftes
    // straks: en lille fil med kæmpe deklarerede dimensioner når aldrig
    // skaleringen eller skrivningen.
    const image = nativeImage.createFromPath(source);
    if (image.isEmpty()) throw new Error(READ_ERROR);
    const { width, height } = image.getSize();
    if (width > MAX_PIXELS || height > MAX_PIXELS) throw new Error(PIXEL_ERROR);
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
    const fitted = scale < 1
      ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) })
      : image;
    // Skrivningen er atomisk: PNG'en lander under et midlertidigt navn og
    // omdøbes først, når den er færdig — et crash undervejs kan aldrig efterlade
    // en trunkeret avatar, som modellen læser som et gyldigt valg. En fejl
    // rydder tmp-filen op og lader den gamle avatar bestå.
    const tmp = temporary();
    try {
      await fs.mkdir(directory(), { recursive: true });
      await fs.writeFile(tmp, fitted.toPNG(), { mode: 0o600 });
      await fs.rename(tmp, file());
    } catch (error) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
    await fs.chmod(file(), 0o600);
  }
  async function upload() {
    // Rendereren har intet at sige her: ingen stier, ingen bytes, ingen valg.
    // dontAddToRecent holder brugerens foto ude af systemets seneste filer.
    const selection = await dialog.showOpenDialog(getWindow(), {
      title: 'Vælg et profilbillede',
      filters: [{ name: 'Billeder (jpg, png)', extensions: ['jpg', 'jpeg', 'png'] }],
      properties: ['openFile', 'dontAddToRecent'],
    });
    if (selection.canceled || !selection.filePaths?.length) return { canceled: true };
    await store(selection.filePaths[0]);
    return { canceled: false, ...(await saveProfile({ icon: 'upload' })) };
  }
  async function remove() {
    await fs.rm(file(), { force: true });
    return saveProfile({ icon: '' });
  }
  register('profile:upload-avatar', upload);
  register('profile:remove-avatar', remove);
}
module.exports = { installProfileAvatar, AVATAR_NAME, MAX_BYTES, MAX_EDGE, MAX_PIXELS };
