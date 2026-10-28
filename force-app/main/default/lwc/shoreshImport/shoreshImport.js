import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import saveSetup from "@salesforce/apex/ImportController.saveSetup";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import getImported from "@salesforce/apex/ImportController.getImported";
import getOpenFiles from "@salesforce/apex/ImportController.getOpenFiles";
import LightningConfirm from "lightning/confirm";
import {
  BRING_BACK,
  LAYOUTS,
  LEAVE_OUT,
  buildProposal,
  csvFile,
  foundLists,
  importNotes,
  isCsv,
  isReadable,
  planFor,
  questionCards,
  readAsGroups,
  undoMessage,
  unplacedLines,
  workbookFile
} from "c/shoreshImportEngine";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { rememberedByKey } from "c/shoreshRemembered";
import {
  autoAnswersFor,
  staleAuto,
  suggestionsFor,
  withLearning,
  autoAppliedIn
} from "c/shoreshPatterns";
import { comingIn, countTiles, miniCells, total } from "./summary";

/** A question that can wait: one with "Leave it out for now" (INGEST-5.5). */
function leaveable(card) {
  return card.options.some((o) => o.value === LEAVE_OUT);
}

/** Each layout in the camp's words. */
function layoutWords(t) {
  return {
    allCamp: `All camp: a page per day, ${t.pIn("Group")} across`,
    byGroup: `By ${t.sIn("Group")}: a page per ${t.sIn("Group")}, days across`,
    byActivity: `By ${t.sIn("Activity")}: the ${t.pIn("Group")} doing each ${t.sIn("Activity")} listed in its cell`
  };
}

/**
 * The Bring back that takes the cursor once one is clicked: the next one still listed, else the
 * one before it; null when none is left.
 */
function nextKeyOf(keysBefore, clicked, itemsAfter) {
  const left = new Set(itemsAfter.map((item) => item.key));
  const at = keysBefore.indexOf(clicked);
  const order = [
    ...keysBefore.slice(at + 1),
    ...keysBefore.slice(0, Math.max(at, 0)).reverse()
  ];
  return order.find((k) => left.has(k)) || null;
}

/**
 * Import last year (slice 4b; ADR 0006), drawn as Greg's approved mock-ups
 * (design-research/screens-r1 import-pick, import-review-a, import-done; wiki decision 56): drop
 * the files; then one page, what needs an answer first ("Check these first"), what comes in as
 * quiet counts, last year's schedule, and what is not set up yet; the main button says what
 * happens ("Add 61"); then the same page says what was added, with Undo. The files are read
 * here, in the browser; nothing is saved until Add.
 *
 * setup: the season setup (SeasonSetupController.getSeasonSetup); terms: the camp's words.
 * Fires: imported (after a save, so the page reloads the season), close.
 */
export default class ShoreshImport extends LightningElement {
  @api setup;
  @api terms;

  stage = "pick"; // pick | reading | review | saving | done
  files = [];
  answers = {};
  layouts = {};
  proposal;
  error;
  result;
  undone;
  undoing = false;
  remembered = {};
  rememberedNotes = {};
  // The camp's remembered answers as read before this import's answers: the patterns' source.
  savedRows = [];
  // What Shoresh filled in on its own in this import (MEMO-5.1), by question id, and the
  // questions undone here: asked again, never filled in again in this import.
  autoApplied = {};
  autoUndone = [];
  // What screen readers hear about auto-applied answers (WCAG 4.1.3).
  autoSaid = "";
  dragging = false;
  sheetJsLoaded = false;
  // The plan as it stands (what Add would save), for the counts; null until it can be made.
  plan = null;
  // The Comes in tile opened into its names (its kind), or null.
  openKind = null;
  // The "Read as" group opened into its lines (its key), or null.
  openReadAs = null;
  // Items an earlier import brought in, untouched since (INGEST-5.7, 5.8).
  imported = [];
  // Why any of them is still in use: kept, never offered for removal (INGEST-5.8).
  inUse = {};
  // Their cells in imports' own weeks, which this import may supersede (INGEST-5.8).
  versionUses = {};
  // The questions left open when Add was pressed, for the page after it (INGEST-5.5).
  savedOpen = [];
  // Where the cursor goes at the next render: { key } (that choice, if it is still there, else
  // the next question still open after { after }), { question }, { bringBack } or { selector }.
  focusNext = null;

  /** The screen's heading takes the cursor (the page calls this when the screen opens). */
  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) {
      heading.focus();
    }
  }

  renderedCallback() {
    if (!this.focusNext) {
      return;
    }
    const next = this.focusNext;
    this.focusNext = null;
    const target = this.focusTarget(next);
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  /** The element the cursor goes to after a render (WCAG 2.4.3). */
  focusTarget(next) {
    const find = (selector, test) =>
      [...this.template.querySelectorAll(selector)].find(test) || null;
    if (next.selector) {
      return this.template.querySelector(next.selector);
    }
    if (next.bringBack !== undefined) {
      return next.bringBack
        ? find(
            "[data-deleted] button",
            (el) => el.dataset.key === next.bringBack
          )
        : this.mainButton();
    }
    if (next.key) {
      // The choice clicked stays where it was, pressed now; it keeps the cursor.
      const same = find(
        "button[data-key]",
        (el) => el.dataset.key === next.key
      );
      if (same) {
        return same;
      }
    }
    let id = next.question;
    if (next.after !== undefined) {
      const cards = this.cards;
      const at = cards.findIndex((c) => c.id === next.after);
      const open = [...cards.slice(at + 1), ...cards.slice(0, at + 1)].find(
        (c) => !c.answered
      );
      id = open ? open.id : null;
    }
    if (!id) {
      return this.mainButton();
    }
    const row = find("[data-card]", (el) => el.dataset.card === id);
    return row
      ? row.querySelector("button, lightning-combobox")
      : this.mainButton();
  }

  /** Add while it can be pressed, else the heading. */
  mainButton() {
    const add = this.template.querySelector('[data-id="save"]');
    return add && !add.disabled
      ? add
      : this.template.querySelector("[data-heading]");
  }

  /** What is happening, for the status line screen readers hear. */
  get statusText() {
    if (this.stage === "reading") {
      return "Reading the files";
    }
    if (this.stage === "saving") {
      return "Saving";
    }
    if (this.stage === "done") {
      return this.undone || `Imported from ${this.fileNames}.`;
    }
    return this.stage === "review" ? this.autoSaid : "";
  }

  // ---------- reading the files ----------

  async ensureSheetJs() {
    if (!this.sheetJsLoaded) {
      await loadScript(this, SHEETJS);
      this.sheetJsLoaded = true;
    }
    // SheetJS puts itself on window when its script runs.
    return window.XLSX;
  }

  async readOne(file) {
    if (isCsv(file.name)) {
      return csvFile(file.name, await file.text());
    }
    const XLSX = await this.ensureSheetJs();
    return workbookFile(
      XLSX,
      file.name,
      new Uint8Array(await file.arrayBuffer())
    );
  }

  async readFiles(list) {
    const chosen = [...(list || [])];
    if (chosen.length === 0) {
      return;
    }
    const unreadable = chosen
      .filter((f) => !isReadable(f.name))
      .map((f) => f.name);
    if (unreadable.length) {
      this.error = `${unreadable.join(", ")}: Shoresh reads Excel (.xlsx, .xls) and CSV files. Nothing was imported.`;
      return;
    }
    this.error = null;
    this.stage = "reading";
    try {
      this.files = await Promise.all(chosen.map((f) => this.readOne(f)));
      await this.startReview();
      this.stage = this.foundNothing ? "pick" : "review";
      if (this.foundNothing) {
        this.files = [];
        this.error = `${chosen.map((f) => f.name).join(", ")}: no schedule found (no day columns or time rows). Nothing was imported.`;
      } else {
        // The page changed under the cursor: to its first question, else Add.
        const open = this.cards.find((c) => !c.answered);
        this.focusNext = open ? { question: open.id } : { after: null };
      }
    } catch (e) {
      this.stage = "pick";
      this.files = [];
      this.error = failed("That file could not be read.", e);
    }
  }

  /** The files read: what the camp answered before, what earlier imports brought in, the page. */
  async startReview() {
    this.answers = await this.rememberedAnswers();
    const before = await this.importedBefore();
    this.imported = before.untouched || [];
    this.inUse = before.inUse || {};
    this.versionUses = before.versionUses || {};
    this.layouts = {};
    this.openKind = null;
    this.openReadAs = null;
    this.autoApplied = {};
    this.autoUndone = [];
    this.autoSaid = "";
    this.recompute();
    this.applyOnItsOwn();
    const n = this.autoCount;
    if (n) {
      this.autoSaid = `${n} ${n === 1 ? "answer" : "answers"} auto-applied from earlier answers.`;
    }
  }

  /**
   * MEMO-5.1: a steady pattern that a name is a fixed activity fills in its kind question, listed
   * under "Auto-applied" with Undo. An answer can open another question, so this
   * follows a few deep. Same answers, same file, same result.
   */
  applyOnItsOwn() {
    for (let depth = 0; depth < 5 && this.proposal; depth++) {
      const cards = questionCards(this.proposal, this.terms, this.answers);
      const auto = autoAnswersFor(
        cards,
        this.savedRows,
        this.remembered,
        this.autoUndone
      );
      const ids = Object.keys(auto);
      if (ids.length === 0) {
        return;
      }
      const answers = { ...this.answers };
      ids.forEach((id) => {
        answers[id] = auto[id].value;
      });
      this.answers = answers;
      this.autoApplied = { ...this.autoApplied, ...auto };
      this.recompute();
    }
  }

  /** A question a person answers is theirs from then on, not filled in on its own. */
  ownAnswer(id) {
    if (this.autoApplied[id]) {
      const rest = { ...this.autoApplied };
      delete rest[id];
      this.autoApplied = rest;
    }
  }

  /** The answers filled in on its own and still standing, as rows for "Auto-applied". */
  get autoRows() {
    if (!this.proposal) {
      return [];
    }
    const byId = new Map(
      questionCards(this.proposal, this.terms, this.answers).map((c) => [
        c.id,
        c
      ])
    );
    return Object.keys(this.autoApplied)
      .filter(
        (id) => byId.has(id) && this.answers[id] === this.autoApplied[id].value
      )
      .sort()
      .map((id) => {
        const card = byId.get(id);
        const option = card.options.find((o) => o.value === this.answers[id]);
        return {
          id,
          title: card.title,
          name: card.subject || card.title,
          undoLabel: `Undo ${card.subject || card.title}`,
          answer: option ? option.label : this.answers[id],
          text: this.autoApplied[id].text
        };
      });
  }
  get hasAuto() {
    return this.autoRows.length > 0;
  }
  get autoCount() {
    return this.autoRows.length;
  }

  /** Undo for this import (MEMO-5.1): the question is asked again; nothing is forgotten. */
  undoAuto(ids) {
    const names = this.autoRows
      .filter((r) => ids.includes(r.id))
      .map((r) => r.name);
    const answers = { ...this.answers };
    const rest = { ...this.autoApplied };
    ids.forEach((id) => {
      delete answers[id];
      delete rest[id];
    });
    this.answers = answers;
    this.autoApplied = rest;
    this.autoUndone = [...new Set([...this.autoUndone, ...ids])].sort();
    this.recompute();
    if (names.length) {
      this.autoSaid = `Undone: ${names.join(", ")}. Asked again.`;
    }
  }

  /** The names whose kind was auto-applied and still stands, for the marks where they show. */
  get autoNames() {
    return new Set(this.autoRows.map((r) => r.name));
  }
  handleUndoAuto(event) {
    const id = event.currentTarget.dataset.id;
    this.undoAuto([id]);
    this.focusNext = { question: id };
  }
  handleUndoAllAuto() {
    const ids = this.autoRows.map((r) => r.id);
    this.undoAuto(ids);
    this.focusNext = ids.length ? { question: ids[0] } : null;
  }

  /**
   * The questions an earlier import left open, answered now (INGEST-5.5): its files as it read
   * them, with every answer the camp gave, so only those questions are left; Add saves what
   * their answers bring in, as a second import of the same files (INGEST-5.7).
   */
  @api
  async resume(importId) {
    this.handleStartAgain();
    this.stage = "reading";
    try {
      this.files = JSON.parse(await getOpenFiles({ importId }));
      await this.startReview();
      this.stage = "review";
      const open = this.cards.find((c) => !c.answered);
      this.focusNext = open ? { question: open.id } : { after: null };
    } catch (e) {
      this.stage = "pick";
      this.files = [];
      this.error = failed("Those questions could not be opened.", e);
    }
  }

  /** What earlier imports brought in and no one changed since; none if it cannot be read. */
  async importedBefore() {
    if (!this.seasonId) {
      return {};
    }
    try {
      return (await getImported({ seasonId: this.seasonId })) || {};
    } catch {
      // Without it, everything the camp has is asked about and nothing is listed: never changed.
      return {};
    }
  }

  /** The camp's answers from earlier imports (Greg: a similar file does not ask again). */
  async rememberedAnswers() {
    const campId =
      this.setup && this.setup.season && this.setup.season[FIELD.Season.Camp];
    let saved = [];
    try {
      saved = campId ? await getAnswers({ campId }) : [];
    } catch {
      // Without remembered answers the import still works: everything is asked.
      saved = [];
    }
    const { answers, notes } = rememberedByKey(saved);
    this.remembered = { ...answers };
    this.rememberedNotes = notes;
    this.savedRows = saved || [];
    return answers;
  }

  handleFileInput(event) {
    this.readFiles(event.target.files);
  }

  handleChoose() {
    this.template.querySelector('input[data-id="files"]').click();
  }

  handleDragOver(event) {
    event.preventDefault();
    this.dragging = true;
  }

  handleDragLeave() {
    this.dragging = false;
  }

  handleDrop(event) {
    event.preventDefault();
    this.dragging = false;
    this.readFiles(event.dataTransfer && event.dataTransfer.files);
  }

  // ---------- the proposal ----------

  proposalWith(answers) {
    return buildProposal({
      files: this.files,
      existing: this.setup,
      terms: this.terms,
      answers,
      layouts: this.layouts,
      imported: this.imported,
      inUse: this.inUse,
      versionUses: this.versionUses
    });
  }

  recompute() {
    this.proposal = this.proposalWith(this.answers);
    // An auto-applied answer whose question went away with another goes too: none stays hidden.
    for (let depth = 0; depth < 5; depth++) {
      const stale = staleAuto(
        this.autoApplied,
        questionCards(this.proposal, this.terms, this.answers)
      );
      if (stale.length === 0) {
        break;
      }
      const answers = { ...this.answers };
      const rest = { ...this.autoApplied };
      stale.forEach((id) => {
        delete answers[id];
        delete rest[id];
      });
      this.answers = answers;
      this.autoApplied = rest;
      this.proposal = this.proposalWith(this.answers);
    }
    this.plan = this.planNow();
  }

  /**
   * INGEST-5.5: what Add saves while questions are open. Each open question that can be left out
   * is left out, so nothing that depends on it is guessed (a question that opens another is
   * followed, a few deep); { proposal, open: [card] }.
   */
  settled() {
    const answers = { ...this.answers };
    const open = new Map();
    let proposal = this.proposal;
    for (let depth = 0; depth < 5; depth++) {
      const more = questionCards(proposal, this.terms, answers).filter(
        (c) => !c.answer && !open.has(c.id) && leaveable(c)
      );
      if (more.length === 0) {
        break;
      }
      more.forEach((c) => {
        open.set(c.id, c);
        answers[c.id] = LEAVE_OUT;
      });
      proposal = this.proposalWith(answers);
    }
    return { proposal, open: [...open.values()] };
  }

  /** The plan Add would save, for the counts; null if it cannot be made yet. */
  planNow(fileData) {
    if (!this.proposal || this.foundNothing) {
      return null;
    }
    try {
      const { proposal, open } = this.settled();
      return planFor(proposal, this.setup, this.seasonId, {
        answers: this.answers,
        fileNames: this.files.map((f) => f.name),
        open: open.map((c) => ({ key: c.id, title: c.title })),
        fileData
      });
    } catch {
      return null;
    }
  }

  get seasonId() {
    return this.setup && this.setup.season ? this.setup.season.Id : null;
  }

  get foundNothing() {
    return !this.proposal || this.proposal.reading.placements.length === 0;
  }

  /** Every question, in the engine's order (the file's names first, then held ones, the rest). */
  get cards() {
    if (!this.proposal) {
      return [];
    }
    const cards = questionCards(this.proposal, this.terms, this.answers);
    const suggestions = this.suggestionsOf(cards);
    return cards.map((card) => this.cardView(card, suggestions[card.id]));
  }

  /**
   * What a pattern in the camp's answers suggests for each question (MEMO-6.5): pre-selected,
   * still asked. From the answers as read before this import, so it stays while answering.
   */
  suggestionsOf(cards) {
    return suggestionsFor(cards, this.savedRows, this.remembered);
  }

  /** What a card filled in on its own says (MEMO-5.1), or "". */
  autoNote(card) {
    const auto = this.autoApplied[card.id];
    return auto && card.answer === auto.value ? auto.text : "";
  }

  cardView(card, suggestion) {
    const chosen = card.options.find((o) => o.value === card.answer);
    const suggested = !chosen && suggestion ? suggestion.value : null;
    return {
      ...card,
      answered: !!chosen,
      open: !chosen,
      className: chosen ? "row shoresh-raised" : "row row_look shoresh-raised",
      fromMemory: !!chosen && this.remembered[card.id] === card.answer,
      memoryNote: this.rememberedNotes[card.id] || "Remembered",
      autoText: this.autoNote(card),
      suggested: !!suggested,
      suggestedText: suggested ? suggestion.text : "",
      // A program or a division: a dropdown in the row.
      value: chosen ? card.answer : null,
      comboOptions: card.options.map((o) => ({
        label: o.label,
        value: o.value
      })),
      placeholder: card.placeholder || "Choose",
      options: card.options.map((o) => {
        const pressed = o.value === card.answer;
        let className = pressed
          ? "shoresh-item choice shoresh-raised"
          : "shoresh-item choice";
        if (o.value === suggested) {
          className += " choice_suggested";
        }
        return {
          ...o,
          key: `${card.id}::${o.value}`,
          pressed: pressed ? "true" : "false",
          className
        };
      })
    };
  }

  get labels() {
    const t = this.terms;
    return {
      programs: `${t.p("Program")} for these ${t.pIn("Group")}`,
      electives: t.p("ElectiveSet"),
      units: `${t.s("Division")} for each new ${t.sIn("Group")}`,
      locations: t.p("Location")
    };
  }

  /**
   * Check these first: every question, one raised row each, marked until it is answered. A
   * program or division Shoresh could choose itself (preselected) is not a question: it is
   * listed under its own heading below, where it can still be changed.
   */
  get questionRows() {
    return this.cards.filter((c) => !(c.select && c.preselected) && !c.flag);
  }
  /**
   * Electives read from the file (slice E9): each set as read, with its one escape, "Not
   * electives" (desktop: a flag, never a question). Listed with the choices Shoresh made itself.
   */
  get electiveRows() {
    return this.cards.filter((c) => c.flag);
  }
  get hasElectiveRows() {
    return this.electiveRows.length > 0;
  }
  get programChoices() {
    return this.cards.filter((c) => c.select === "program" && c.preselected);
  }
  get hasProgramChoices() {
    return this.programChoices.length > 0;
  }
  get unitChoices() {
    // A division of one is listed under "Read as" instead (review.md INGEST-5.3).
    const ownDivision = new Set(
      (this.proposal ? this.proposal.notes : [])
        .filter((n) => n.type === "ownDivision")
        .map((n) => n.id)
    );
    return this.cards.filter(
      (c) => c.select === "division" && c.preselected && !ownDivision.has(c.id)
    );
  }

  // ---------- read as (review.md, INGEST-5) ----------

  /** What Shoresh read without asking, grouped, as counts that open into their lines. */
  get readAsTiles() {
    if (!this.proposal) {
      return [];
    }
    return readAsGroups(this.proposal, this.terms, this.cards).map((g) => {
      const open = g.key === this.openReadAs;
      return {
        ...g,
        spoken: g.label,
        expanded: open ? "true" : "false",
        className: open
          ? "tile tile_button shoresh-raised tile_open"
          : "tile tile_button shoresh-raised",
        lines: g.lines.map((line) => ({
          ...line,
          auto:
            !!this.autoApplied[line.id] &&
            this.autoApplied[line.id].value === line.answer,
          comboOptions: line.options.map((o) => ({
            label: o.label,
            value: o.value
          })),
          options: line.options.map((o) => {
            const pressed = o.value === line.answer;
            return {
              ...o,
              key: `${line.id}::${o.value}`,
              pressed: pressed ? "true" : "false",
              className: pressed
                ? "shoresh-item choice shoresh-raised"
                : "shoresh-item choice"
            };
          })
        }))
      };
    });
  }
  get hasReadAs() {
    return this.readAsTiles.length > 0;
  }
  get openReadAsGroup() {
    return this.readAsTiles.find((g) => g.key === this.openReadAs) || null;
  }

  handleReadAsTile(event) {
    const key = event.currentTarget.dataset.readAs;
    this.openReadAs = this.openReadAs === key ? null : key;
  }

  /** A one-click change: the line may move to another group, which opens with the cursor kept. */
  handleReadAs(event) {
    const key = event.currentTarget.dataset.key;
    const [id, value] = key.split("::");
    this.ownAnswer(id);
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
    const moved = this.readAsTiles.find((g) =>
      g.lines.some((line) => line.id === id)
    );
    if (moved) {
      this.openReadAs = moved.key;
    }
    this.focusNext = { key };
  }
  get hasUnitChoices() {
    return this.unitChoices.length > 0;
  }
  get hasQuestions() {
    return this.questionRows.length > 0;
  }
  get questionCount() {
    return this.questionRows.length;
  }
  get openCount() {
    return this.cards.filter((c) => !c.answered).length;
  }
  /** Open questions Add cannot keep for later (no "Leave it out for now"): Add waits for them. */
  get mustAnswerCount() {
    return this.cards.filter((c) => !c.answered && !leaveable(c)).length;
  }

  handleAnswer(event) {
    const key = event.currentTarget.dataset.key;
    const [id, value] = key.split("::");
    this.ownAnswer(id);
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
    // The choice stays, pressed; if the answer took its row away, on to the next open question.
    this.focusNext = { key, after: id };
  }

  handleChoice(event) {
    this.ownAnswer(event.target.dataset.id);
    this.answers = {
      ...this.answers,
      [event.target.dataset.id]: event.detail.value
    };
    this.recompute();
  }

  // ---------- what comes in ----------

  get comingInTiles() {
    const autoNames = this.autoNames;
    return comingIn(this.plan, this.terms).map((tile) => {
      const auto = tile.names.filter((name) => autoNames.has(name)).length;
      return {
        ...tile,
        autoLabel: auto ? `${auto} auto-applied` : "",
        spoken: auto ? `${tile.spoken}, ${auto} auto-applied` : tile.spoken,
        expanded: tile.key === this.openKind ? "true" : "false",
        className:
          tile.key === this.openKind
            ? "tile tile_button shoresh-raised tile_open"
            : "tile tile_button shoresh-raised"
      };
    });
  }
  get hasComingIn() {
    return this.comingInTiles.length > 0;
  }
  get addCount() {
    return total(this.comingInTiles);
  }

  /** A tile opens into its names, and closes again (one open at a time). */
  handleTile(event) {
    const kind = event.currentTarget.dataset.tile;
    this.openKind = this.openKind === kind ? null : kind;
  }

  get openTile() {
    const tile = this.comingInTiles.find((x) => x.key === this.openKind);
    return tile
      ? {
          ...tile,
          nameItems: tile.names.map((name, i) => ({
            key: `${i}|${name}`,
            name,
            auto: this.autoNames.has(name)
          }))
        }
      : null;
  }

  // ---------- the files ----------

  get hasFiles() {
    return this.files.length > 0 && !this.isPick;
  }
  get firstFileName() {
    return this.files.length ? this.files[0].name : "";
  }
  get moreFiles() {
    return this.files.length > 1 ? this.files.length - 1 : 0;
  }

  get fileRows() {
    const words = layoutWords(this.terms);
    const byFile = new Map();
    for (const page of this.proposal ? this.proposal.reading.pages : []) {
      if (!byFile.has(page.file)) {
        byFile.set(page.file, []);
      }
      byFile.get(page.file).push(page);
    }
    return [...byFile].map(([file, pages]) => {
      const layouts = new Set(pages.map((p) => p.layout));
      const layout = layouts.size === 1 ? pages[0].layout : "";
      // Unclear until the director picks a layout for it.
      const unsure =
        pages.some((p) => !p.confident) &&
        !pages.some((p) => this.layouts[p.key]);
      return {
        file,
        layout,
        unsure,
        className: unsure
          ? "row row_look shoresh-raised"
          : "row shoresh-raised",
        layoutLabel: `Layout of ${file}`,
        pageCount: pages.length === 1 ? "1 page" : `${pages.length} pages`,
        options: LAYOUTS.map((value) => ({ label: words[value], value }))
      };
    });
  }

  handleLayout(event) {
    const file = event.target.dataset.file;
    const layouts = { ...this.layouts };
    this.proposal.reading.pages
      .filter((p) => p.file === file)
      .forEach((p) => {
        layouts[p.key] = event.detail.value;
      });
    this.layouts = layouts;
    this.recompute();
  }

  // ---------- places, deleted, noted, notes ----------

  get places() {
    return this.proposal
      ? this.proposal.offeredPlaces.map((p) => ({
          ...p,
          usedByText: p.usedBy.join(", "),
          fromMemory: p.ticked && this.remembered[p.id] === "add",
          memoryNote: this.rememberedNotes[p.id] || "Remembered"
        }))
      : [];
  }
  get hasPlaces() {
    return this.places.length > 0;
  }

  handlePlace(event) {
    const answers = { ...this.answers };
    if (event.target.checked) {
      answers[event.target.dataset.id] = "add";
    } else {
      delete answers[event.target.dataset.id];
    }
    this.answers = answers;
    this.recompute();
  }

  /**
   * What the camp deleted before and this import leaves out (Greg, decision 45), each with
   * Bring back. A place brought back is ticked, as the director means to add it.
   */
  get deletedItems() {
    const t = this.terms;
    return ((this.proposal && this.proposal.deleted) || []).map((item) => {
      const detail = `${t.sIn(item.kind)}${item.program ? ` · ${item.program}` : ""}`;
      return {
        ...item,
        detail,
        place: item.kind === "Location" ? `place|${item.name}` : "",
        bringBackLabel: `Bring back ${item.name}, ${detail}`
      };
    });
  }
  get hasDeleted() {
    return this.deletedItems.length > 0;
  }

  handleBringBack(event) {
    const { key, placeAnswer } = event.currentTarget.dataset;
    const keysBefore = this.deletedItems.map((item) => item.key);
    const openBefore = new Set(this.openIds());
    const answers = { ...this.answers, [key]: BRING_BACK };
    if (placeAnswer) {
      answers[placeAnswer] = "add";
    }
    this.answers = answers;
    this.recompute();
    // The clicked button is gone with the item (WCAG 2.4.3): to the question it opened (its
    // division, its program, its kind), else the next Bring back, else Add.
    const opened = this.openIds().find((id) => !openBefore.has(id));
    this.focusNext = opened
      ? { question: opened }
      : { bringBack: nextKeyOf(keysBefore, key, this.deletedItems) };
  }

  /** The questions still open, in the order shown. */
  openIds() {
    return this.cards.filter((c) => !c.answered).map((c) => c.id);
  }

  get notedList() {
    const list = this.proposal
      ? foundLists(this.proposal, this.terms).find((l) => l.key === "noted")
      : null;
    return list ? list.items : [];
  }
  get hasNoted() {
    return this.notedList.length > 0;
  }
  get notSetUpCount() {
    return this.notedList.length + this.deletedItems.length;
  }
  get hasNotSetUp() {
    return this.notSetUpCount > 0;
  }

  get notes() {
    return this.proposal ? importNotes(this.proposal, this.terms) : [];
  }
  get hasNotes() {
    return this.notes.length > 0;
  }

  // ---------- last year's schedule ----------

  get versionRows() {
    return (this.proposal ? this.proposal.versions : []).map((v) => {
      const mini = miniCells(v);
      const program = v.programName ? ` (${v.programName})` : "";
      return {
        key: v.key,
        name: v.name,
        weekName: `${v.weekName}${program}`,
        reviewLine: `Kept as a version, ${v.name}`,
        doneLine: `${v.weekName}${program}`,
        mini: mini.cells,
        miniStyle: `grid-template-columns: repeat(${Math.max(1, mini.columns)}, 1fr);`
      };
    });
  }
  get hasVersions() {
    return this.versionRows.length > 0;
  }

  // ---------- moving between steps ----------

  get isPick() {
    return this.stage === "pick" || this.stage === "reading";
  }
  get isReading() {
    return this.stage === "reading";
  }
  get isReview() {
    return this.stage === "review" || this.stage === "saving";
  }
  get isSaving() {
    return this.stage === "saving";
  }
  get isDone() {
    return this.stage === "done";
  }
  get dropClass() {
    return this.dragging ? "drop drop_over" : "drop";
  }
  get fileNames() {
    return this.files.map((f) => f.name).join(", ");
  }

  /**
   * The main button says what happens: "Add 61"; with questions open, how many wait for later
   * ("Add 58, 3 for later", INGEST-5.5); while one must be answered first, how many are left.
   */
  get saveLabel() {
    const open = this.openCount;
    if (this.mustAnswerCount > 0) {
      return `${open} ${open === 1 ? "question" : "questions"} left`;
    }
    const base = this.addCount > 0 ? `Add ${this.addCount}` : "Use this setup";
    return open > 0 ? `${base}, ${open} for later` : base;
  }
  get saveDisabled() {
    return this.isSaving || this.mustAnswerCount > 0 || !this.plan;
  }

  handleStartAgain() {
    this.stage = "pick";
    this.focusNext = { selector: "[data-heading]" };
    this.undone = null;
    this.files = [];
    this.proposal = null;
    this.plan = null;
    this.openKind = null;
    this.openReadAs = null;
    this.imported = [];
    this.inUse = {};
    this.versionUses = {};
    this.savedOpen = [];
    this.answers = {};
    this.autoApplied = {};
    this.autoUndone = [];
    this.autoSaid = "";
    this.layouts = {};
    this.error = null;
  }

  handleClose() {
    if (this.isDone) {
      // The next visit starts from the files again.
      this.handleStartAgain();
    }
    this.dispatchEvent(new CustomEvent("close"));
  }

  async handleSave() {
    this.stage = "saving";
    this.error = null;
    try {
      // The files as read go with open questions, so they can be answered later.
      const plan = this.planNow(JSON.stringify(this.files));
      if (!plan) {
        throw new Error("The plan could not be made.");
      }
      if (plan.open.length === 0) {
        delete plan.fileData;
      }
      const cards = questionCards(this.proposal, this.terms, this.answers);
      plan.autoApplied = autoAppliedIn(plan.remember, this.autoApplied);
      plan.remember = withLearning(
        plan.remember,
        cards,
        this.suggestionsOf(cards),
        this.autoApplied
      );
      this.result = await saveSetup({ plan: JSON.stringify(plan) });
      this.savedOpen = plan.open;
      this.stage = "done";
      this.focusNext = { selector: '[data-id="done"]' };
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.stage = "review";
      this.error = failed(
        "Nothing was saved, and your answers are still here.",
        e
      );
    }
  }

  // ---------- after saving ----------

  get addedTiles() {
    return countTiles(this.result && this.result.added, this.terms);
  }
  get addedTotal() {
    return total(this.addedTiles);
  }
  get changedTiles() {
    return countTiles(this.result && this.result.changed, this.terms);
  }
  get changedTotal() {
    return total(this.changedTiles);
  }
  get hasChanged() {
    return this.changedTiles.length > 0;
  }
  get unplaced() {
    return this.proposal ? unplacedLines(this.proposal, this.terms) : [];
  }
  get unplacedTitle() {
    const n = this.unplaced.reduce((sum, line) => sum + line.count, 0);
    return `${n} ${n === 1 ? "placement is" : "placements are"} not in last year's version`;
  }
  get hasUnplaced() {
    return this.unplaced.length > 0;
  }
  get leftOutLines() {
    return this.cards
      .filter((c) => c.answer === LEAVE_OUT)
      .map((c) => ({ key: c.id, text: c.subject }));
  }
  get hasLeftOut() {
    return this.leftOutLines.length > 0;
  }
  /** Updates the server left out: changed by hand since the files were read (INGEST-5.7). */
  get leftAsIsLines() {
    return ((this.result && this.result.leftAsIs) || []).map((name) => ({
      key: name,
      text: `${name} was changed since you opened the files; it was left as it is.`
    }));
  }
  get hasLeftAsIs() {
    return this.leftAsIsLines.length > 0;
  }
  /** Open questions that did not fit with the import (INGEST-5.5). */
  get notKeptLine() {
    const n = (this.result && this.result.openNotKept) || 0;
    if (!n) {
      return null;
    }
    return `${n} more ${n === 1 ? "question" : "questions"} will be asked next time you import these files.`;
  }

  /** The questions kept for later: they wait on Roots (INGEST-5.5). */
  get laterLines() {
    return this.savedOpen.map((q) => ({ key: q.key, text: q.title }));
  }
  get hasLater() {
    return this.laterLines.length > 0;
  }
  get hasLaterSection() {
    return this.hasLater || !!this.notKeptLine;
  }
  get laterTitle() {
    const n = this.laterLines.length;
    return `${n} import ${n === 1 ? "question" : "questions"} left`;
  }
  get removedTiles() {
    return countTiles(this.result && this.result.removed, this.terms);
  }
  get hasRemoved() {
    return this.removedTiles.length > 0;
  }

  // ---------- not in the new file (review.md INGEST-5.8) ----------

  /** What an earlier import brought in and these files lack: each Keep (pressed) or Remove. */
  get missingRows() {
    const t = this.terms;
    return ((this.proposal && this.proposal.missing) || []).map((m) => ({
      ...m,
      // Still used by something else: kept, with why, and no Remove.
      detail: m.inUse
        ? `${m.inUse}, so it stays`
        : `${t.sIn(m.kind)}${m.program ? ` · ${m.program}` : ""}${
            m.alsoOut.length
              ? ` · also taken out of ${m.alsoOut.join(", ")}`
              : ""
          }`,
      options: (m.inUse
        ? []
        : [
            { value: "keep", label: "Keep" },
            { value: "remove", label: "Remove" }
          ]
      ).map((o) => {
        const pressed = o.value === m.answer;
        return {
          ...o,
          key: `${m.key}::${o.value}`,
          pressed: pressed ? "true" : "false",
          className: pressed
            ? "shoresh-item choice shoresh-raised"
            : "shoresh-item choice"
        };
      })
    }));
  }
  get hasMissing() {
    return this.missingRows.length > 0;
  }

  handleMissing(event) {
    const key = event.currentTarget.dataset.key;
    const [id, value] = key.split("::");
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
    this.focusNext = { key };
  }
  get canUndo() {
    return (
      !!(this.result && this.result.importId) && !this.undone && !this.undoing
    );
  }

  async handleUndo() {
    const ok = await LightningConfirm.open({
      label: `Undo the import of ${this.fileNames}?`,
      message:
        "What this import added is removed, and what it changed goes back to how it was. Anything you have edited since the import stays as it is.",
      variant: "header",
      theme: "warning"
    });
    if (!ok || this.undoing) {
      return;
    }
    this.undoing = true;
    try {
      const result = await undoImport({ importId: this.result.importId });
      this.undone = undoMessage(result);
      // Undo is gone from the rail: the cursor goes to Done.
      this.focusNext = { selector: '[data-id="continue"]' };
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.error = failed("That import could not be undone.", e);
    } finally {
      this.undoing = false;
    }
  }
}
