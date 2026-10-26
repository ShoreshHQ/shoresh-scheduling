import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import saveSetup from "@salesforce/apex/ImportController.saveSetup";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
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
  undoMessage,
  unplacedLines,
  workbookFile
} from "c/shoreshImportEngine";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { rememberedByKey } from "c/shoreshRemembered";
import { comingIn, countTiles, miniCells, total } from "./summary";

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
  dragging = false;
  sheetJsLoaded = false;
  // The plan as it stands (what Add would save), for the counts; null until it can be made.
  plan = null;
  // The Comes in tile opened into its names (its kind), or null.
  openKind = null;
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
    return "";
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
      this.answers = await this.rememberedAnswers();
      this.layouts = {};
      this.openKind = null;
      this.recompute();
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

  recompute() {
    this.proposal = buildProposal({
      files: this.files,
      existing: this.setup,
      terms: this.terms,
      answers: this.answers,
      layouts: this.layouts
    });
    this.plan = this.planNow();
  }

  /** The plan Add would save, for the counts; null if it cannot be made yet. */
  planNow() {
    if (!this.proposal || this.foundNothing) {
      return null;
    }
    try {
      return planFor(this.proposal, this.setup, this.seasonId, {
        answers: this.answers,
        fileNames: this.files.map((f) => f.name)
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
    return questionCards(this.proposal, this.terms, this.answers).map((card) =>
      this.cardView(card)
    );
  }

  cardView(card) {
    const chosen = card.options.find((o) => o.value === card.answer);
    return {
      ...card,
      answered: !!chosen,
      open: !chosen,
      className: chosen ? "row shoresh-raised" : "row row_look shoresh-raised",
      fromMemory: !!chosen && this.remembered[card.id] === card.answer,
      memoryNote: this.rememberedNotes[card.id] || "Remembered",
      // A program or a division: a dropdown in the row.
      value: chosen ? card.answer : null,
      comboOptions: card.options.map((o) => ({
        label: o.label,
        value: o.value
      })),
      placeholder: card.placeholder || "Choose",
      options: card.options.map((o) => {
        const pressed = o.value === card.answer;
        return {
          ...o,
          key: `${card.id}::${o.value}`,
          pressed: pressed ? "true" : "false",
          className: pressed
            ? "shoresh-item choice shoresh-raised"
            : "shoresh-item choice"
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
    return this.cards.filter((c) => c.select === "division" && c.preselected);
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

  handleAnswer(event) {
    const key = event.currentTarget.dataset.key;
    const [id, value] = key.split("::");
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
    // The choice stays, pressed; if the answer took its row away, on to the next open question.
    this.focusNext = { key, after: id };
  }

  handleChoice(event) {
    this.answers = {
      ...this.answers,
      [event.target.dataset.id]: event.detail.value
    };
    this.recompute();
  }

  // ---------- what comes in ----------

  get comingInTiles() {
    return comingIn(this.plan, this.terms).map((tile) => ({
      ...tile,
      expanded: tile.key === this.openKind ? "true" : "false",
      className:
        tile.key === this.openKind
          ? "tile tile_button shoresh-raised tile_open"
          : "tile tile_button shoresh-raised"
    }));
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
            name
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

  /** The main button says what happens: "Add 61"; while a question is open, how many are. */
  get saveLabel() {
    const open = this.openCount;
    if (open > 0) {
      return `${open} ${open === 1 ? "question" : "questions"} left`;
    }
    return this.addCount > 0 ? `Add ${this.addCount}` : "Use this setup";
  }
  get saveDisabled() {
    return this.isSaving || this.openCount > 0;
  }

  handleStartAgain() {
    this.stage = "pick";
    this.focusNext = { selector: "[data-heading]" };
    this.undone = null;
    this.files = [];
    this.proposal = null;
    this.plan = null;
    this.openKind = null;
    this.answers = {};
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
      const plan = planFor(this.proposal, this.setup, this.seasonId, {
        answers: this.answers,
        fileNames: this.files.map((f) => f.name)
      });
      this.result = await saveSetup({ plan: JSON.stringify(plan) });
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
