// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Profilbilledet er hovedprocessens sag alene. Rendereren kan kun bede om
// filvælgeren og får kun udfaldet tilbage — aldrig stier, aldrig billeddata.
// Det valgte jpg/png størrelsestjekkes (~1 MB), afkodes med Electrons
// nativeImage, skaleres til højst 256x256 med bevaret sideforhold og gemmes
// som PNG under ét fast navn i appens private harness-mappe med rettigheder
// 0600. Filen og ikonvalget skifter altid sammen: en vellykket upload gemmer
// icon 'upload', en fjernelse sletter filen og rydder til initialerne.
// Billedet er ren UI-tilstand som navnet (designdokumentets anti-mål): det
// når aldrig prompts, modelloggen, diagnostik eller feedback, og protokollen
// serverer det kun til appens egen renderer.
const MAX_BYTES = 1024 * 1024; // ~1 MB input file
const MAX_EDGE = 256;          // avatar box, longest edge after the fit
const AVATAR_NAME = 'avatar.png';
const READ_ERROR = 'Billedet kunne ikke læses. Vælg et jpg- eller png-billede.';

function installProfileAvatar({ register, dialog, nativeImage, fs, path, directory, saveProfile, getWindow }) {
  const file = () => path.join(directory(), AVATAR_NAME);
  async function store(source) {
    let info;
    try { info = await fs.stat(source); } catch { throw new Error(READ_ERROR); }
    if (info.size > MAX_BYTES) throw new Error('Billedet er for stort. Vælg et jpg- eller png-billede på højst 1 MB.');
    const image = nativeImage.createFromBuffer(await fs.readFile(source));
    if (image.isEmpty()) throw new Error(READ_ERROR);
    const { width, height } = image.getSize();
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height, 1));
    const fitted = scale < 1
      ? image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) })
      : image;
    await fs.mkdir(directory(), { recursive: true });
    await fs.writeFile(file(), fitted.toPNG(), { mode: 0o600 });
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
module.exports = { installProfileAvatar, AVATAR_NAME, MAX_BYTES, MAX_EDGE };
