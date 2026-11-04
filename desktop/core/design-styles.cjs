// SPDX-License-Identifier: EUPL-1.2
'use strict';

// S5 · /stil-anvendelse — GradientDeck-stilen lander i brugerens PROJEKT som
// DESIGN.md (GradientDecks egen mekanisme; build-design.cjs har læst filen
// siden S3, så den altid-aktive designhjælp møder stilen fra første afsendelse).
//
// VÆRTEN skriver filen gennem Auras fil-tilladelsesmodel: rendereren sender
// kun stilens slug og sit valg — aldrig stier, indhold eller transport. Stilens
// tekst læses udelukkende fra appens private cache (GradientDeck.styleState)
// og tørkøres FRISK mod den gældende datapolitik ved selve anvendelsen —
// datareglerne kan have ændret sig siden hentningen, og anvendelsen må ikke
// maskere det.
//
// Eksisterer der et DESIGN.md i forvejen (fx fra idé-forfinelse), kræves et
// valg: Bevar afviser skrivningen og efterlader alt urørt; Erstat erstatter
// VERSIONERET — gennem Auras versionsystem, når versionsfunktionen er tilvalgt
// (det forrige indhold gemmes som en version, hvis det ikke allerede står i
// historikken), ellers ved sidst-skrevne-omdøbelse à la «DESIGN (forrige).md».
// Et optaget navn nummereres — intet overskrives nogensinde. Kan
// versionsgemningen ikke gennemføres (Git-mappen er fx midt i en handling),
// træder omdøbelsen ærligt til i stedet: det forrige indhold bliver aldrig
// tabt, og kvitteringen siger, hvorfor.
//
// Fortryd virker gennem det eksisterende spor: ændringen registreres med
// recordEdit (before/after pr. fil — også omdøbelsen), så Ændringer › Fortryd
// sætter projektet byte-identisk tilbage gennem ChatSession.undoTask.

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { lineDiff } = require('./diff.cjs');
const { readProjectDesignDocument, styleDocument } = require('./build-design.cjs');

const isoDate = at => new Date(at).toISOString().slice(0, 10);

// Atomisk skrivning i brugerens projektmappe: tmp + rename, tmp ryddes altid.
// Tilstanden kontrolleres lige før skrivningen — et symlink skrives aldrig
// gennem (readProjectDesignDocument afviste det allerede; dette lukker
// vinduet mellem læsning og skrivning). Filen er brugerens egen: ingen
// særlige rettigheder, almindelig umask.
async function writeAtomicProject(file, content) {
  const stat = await fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) throw new Error('Projektets DESIGN.md skal være en almindelig fil i arbejdsområdets rod.');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

class DesignStyleApply {
  // deck: GradientDeck-tjenesten (styleState — cache + frisk tørkørsel).
  // features: async root => ({ versioner: boolean }) — projektets effektive valg.
  // git: Auras GitVersions, når versionsfunktionen kan bruges.
  // chat: den samtale, anvendelsen registreres i ({ copy, ensureBaseline, recordEdit }).
  // busyRoot: ægtentavheden i projektmappen — AI'en må ikke være i gang.
  constructor({ deck, features, git, chat, busyRoot = () => false } = {}) {
    if (!deck || typeof deck.styleState !== 'function') throw new TypeError('DesignStyleApply kræver GradientDeck-tjenesten.');
    this.deck = deck;
    this.features = typeof features === 'function' ? features : async () => ({});
    this.git = git || null;
    this.chat = chat || null;
    this.busyRoot = typeof busyRoot === 'function' ? busyRoot : () => false;
  }

  #conflict(style, existing, document) {
    const diff = lineDiff(existing.content, document.content);
    return {
      status: 'conflict', name: style.name, slug: style.slug,
      expected: existing.hash,
      diff: { added: diff.added, removed: diff.removed, oldLines: diff.oldLines, newLines: diff.newLines, truncated: diff.truncated, approximate: diff.approximate, hunks: diff.hunks },
      message: 'Der findes allerede et DESIGN.md i projektet. Gennemgå forskellen, og vælg Bevar eller Erstat.',
    };
  }

  // Det forrige indhold gennem Auras versionsystem: er DESIGN.md ændret i
  // forhold til HEAD (eller endnu aldrig gemt), gemmes det FØRST som en
  // version — ellers står det allerede i den seneste, og intet ekstra gemmes.
  // Enhver afvisning er ærlig og fører til omdøbelses-tilbagefaldet udenfor.
  async #preserveThroughVersions(root, name) {
    try {
      const repo = await this.git.repository(root);
      if (!repo.initialized || repo.block) return { ok: false, reason: repo.block || 'projektet har ingen Git-historik endnu' };
      if (!repo.files.some(file => file.file === 'DESIGN.md')) return { ok: true, preserved: 'history' };
      const review = await this.git.review(root);
      const entry = review.files.find(file => file.file === 'DESIGN.md');
      if (!entry || entry.blocked) return { ok: false, reason: 'DESIGN.md kræver manuel Git-gennemgang' };
      await this.git.commit(root, { token: review.token, files: ['DESIGN.md'], message: `DESIGN.md før «${name}» fra GradientDeck` });
      return { ok: true, preserved: 'version' };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'versionsgemningen kunne ikke gennemføres' };
    }
  }

  // Sidst-skrevne-omdøbelse: den forrige fil bevares under et frit, nummereret
  // navn — et eksisterende (forrige)-navn overskrives ALDRIG.
  async #renamePrevious(root) {
    let name = 'DESIGN (forrige).md', index = 2;
    while (await fs.lstat(path.join(root, name)).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false; })) name = `DESIGN (forrige ${index++}).md`;
    await fs.rename(path.join(root, 'DESIGN.md'), path.join(root, name));
    return name;
  }

  async apply({ root, slug, choice = 'apply', expected = null } = {}) {
    if (!root || typeof root !== 'string') return { status: 'error', message: 'Åbn et projekt først.' };
    if (!['apply', 'replace', 'keep'].includes(choice)) return { status: 'error', message: 'Ukendt valg for anvendelsen.' };
    if (this.chat?.copy) return { status: 'error', message: 'Samtalen arbejder i en isoleret kopi. Anvend stilen fra en samtale, der arbejder i projektet.' };
    if (this.busyRoot(root)) return { status: 'error', message: 'Vent, til AI’en er færdig, før du anvender stilen.' };
    // Stilens tilstand: frisk læsning fra cachen med frisk tørkørsel.
    const style = await this.deck.styleState({ root, slug });
    if (style.status !== 'ok') return { status: 'error', message: style.message };
    if (!style.sendable) {
      return { status: 'blocked', name: style.name, slug: style.slug, message: 'Datakontrollen vil afvise den ved afsendelse (indholdet ligner kodet data). Stilen er ikke skrevet til projektet.' };
    }
    const document = styleDocument({ name: style.name, slug: style.slug, text: style.text, fetchedAt: isoDate(style.fetchedAt), hash: style.sha256 });
    // Det eksisterende DESIGN.md læses med samme hårde læsning som en
    // afsendelse: almindelig fil i roden, intet symlink, loft, striks UTF-8.
    let existing = null;
    try { existing = await readProjectDesignDocument(root); }
    catch (error) { return { status: 'error', message: error.message }; }
    if (choice === 'keep') return { status: 'kept', name: style.name, message: 'Eksisterende DESIGN.md er bevaret. Intet er ændret.' };
    if (existing && choice !== 'replace') return this.#conflict(style, existing, document);
    if (existing && choice === 'replace' && expected !== existing.hash) {
      // Filen er ændret, siden forskellen blev gennemgået — intet skrives, og
      // den NYE forskel skal ses, før der kan vælges igen.
      return this.#conflict(style, existing, document);
    }
    // …fra her skrives der. Baseline først, så Fortryd-sporet har sit udgangspunkt.
    await this.chat?.ensureBaseline?.();
    let preserved = null, previousName = null, reason = '';
    if (existing) {
      const versions = (await this.features(root)).versioner === true;
      if (versions && this.git) {
        const attempt = await this.#preserveThroughVersions(root, style.name);
        if (attempt.ok) preserved = attempt.preserved;
        else reason = attempt.reason;
      } else reason = versions ? 'versionsystemet er ikke tilgængeligt' : 'versionsfunktionen er ikke tilvalgt';
      if (!preserved) { previousName = await this.#renamePrevious(root); preserved = 'rename'; }
    }
    await writeAtomicProject(path.join(root, 'DESIGN.md'), document.content);
    const files = [{ file: 'DESIGN.md', before: existing ? existing.content : null, after: document.content }];
    if (previousName) files.push({ file: previousName, before: null, after: existing.content });
    const task = this.chat?.recordEdit?.({
      kind: 'direct', what: 'stil-anvendelsen',
      label: `Stil anvendt: «${style.name}» (GradientDeck)`,
      files,
      title: 'Du anvendte en designstil i projektet',
      target: 'DESIGN.md',
      detail: `${style.name} · ${style.sourceUrl}${existing ? ' · erstattede eksisterende DESIGN.md' : ' · ny DESIGN.md'}`,
    }) || null;
    const parts = [`«${style.name}»-stilen er anvendt · DESIGN.md ${existing ? 'erstattet' : 'oprettet'}`];
    if (preserved === 'version') parts.push('det forrige indhold er gemt som en version');
    else if (preserved === 'history') parts.push('det forrige indhold findes i den seneste version');
    else if (preserved === 'rename') parts.push(`det forrige indhold er bevaret som ${previousName}`);
    if (preserved === 'rename' && reason) parts.push(`(versionen kunne ikke gemmes: ${reason})`);
    parts.push('Fortryd under Ændringer');
    return { status: 'applied', name: style.name, slug: style.slug, preserved, previousName, task: task?.id || null, message: parts.join(' · ') };
  }
}

module.exports = { DesignStyleApply, writeAtomicProject };
