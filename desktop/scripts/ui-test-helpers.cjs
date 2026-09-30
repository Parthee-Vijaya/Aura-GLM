async function skipIntroduction(page) {
  page.setDefaultTimeout(20000);
  await page.waitForFunction(() => !document.querySelector('#create').disabled && !document.querySelector('#new').disabled);
  if (await page.locator('#welcome-dialog').evaluate(el => el.open)) await page.click('#welcome-skip');
}
async function menuClick(page, selector) {
  const toggles = {
    '#support-button': '#settings-toggle', '#setup-button': '#settings-toggle', '#connections-button': '#settings-toggle', '#skills-button': '#settings-toggle',
    '#git-button': '#project-menu-toggle', '#publish-button': '#project-menu-toggle', '#new-conversation': '#project-menu-toggle',
    '#attach-preview': '#preview-options'
  };
  if (!await page.locator(selector).isVisible()) await page.click(toggles[selector]);
  await page.click(selector);
  if (selector === '#attach-preview' && !await page.locator('#server-manual').evaluate(el => el.open)) await page.click('#server-manual > summary');
}
async function taskOptions(page) {
  if (!await page.locator('#task-dialog').evaluate(el => el.open)) await page.click('#model-chip');
  if (!await page.locator('#model-options').evaluate(el => el.open)) await page.click('#model-summary');
}
async function closeTaskOptions(page) {
  if (await page.locator('#task-dialog').evaluate(el => el.open)) await page.click('[data-close="task-dialog"]');
}
async function selectMode(page, mode) {
  await taskOptions(page);
  if (!await page.locator('#task-dialog .workflow').evaluate(el => el.open)) await page.click('#task-dialog .workflow > summary');
  await page.selectOption('#work-mode', mode); await closeTaskOptions(page);
}
async function previewOptions(page) {
  if (!await page.locator('#preview-menu').evaluate(el => el.matches(':popover-open'))) await page.click('#preview-options');
}
// Projektskærmens valgfrie sektioner ligger bag Flere valg.
async function projectOptions(page) { if (!await page.locator('#project-options').evaluate(el => el.open)) await page.click('#project-options > summary'); }
// Nye projekter lægges som standard i Dokumenter/AI Harness. Testene bruger deres egen midlertidige mappe.
async function isolateDocuments(app, folder) { await app.evaluate(({ app }, folder) => app.setPath('documents', folder), folder); }
// Vælg en anden placering til nye projekter gennem appens link, med en udfyldt mappedialog.
async function chooseLocation(app, page, folder) {
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, folder);
  await page.click('#choose-location');
  await page.waitForFunction(folder => document.querySelector('#project-location').title === folder, await require('node:fs/promises').realpath(folder));
}
module.exports = { skipIntroduction, menuClick, taskOptions, closeTaskOptions, selectMode, previewOptions, projectOptions, isolateDocuments, chooseLocation };
