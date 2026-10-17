import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import saveSetup from "@salesforce/apex/ImportController.saveSetup";
import {
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
  workbookFile
} from "c/shoreshImportEngine";
import { errorMessage } from "c/shoreshErrors";

const LAYOUT_WORDS = {
  allCamp: "All camp: a page per day, groups across",
  byGroup: "By group: a page per group, days across",
  byActivity: "By activity: the groups doing each activity listed in its cell"
};

/**
 * Import last year (slice 4b), following Shoresh desktop's import (ImportScreen.jsx,
 * ReconciliationScreen.jsx): choose the files, see what was found ("Nothing added yet"),
 * answer every question, then save; a summary says what was added, what was left out, and what
 * is noted but not set up yet. The files are read here, in the browser; nothing is saved until
 * "Use this setup".
 *
 * setup: the season setup (SeasonSetupController.getSeasonSetup); terms: the camp's words.
 * Fires: imported (after a save, so the page reloads the season), close.
 */
export default class ShoreshImport extends LightningElement {
  @api setup;
  @api terms;

  stage = "pick"; // pick | reading | preview | review | saving | done
  files = [];
  answers = {};
  layouts = {};
  proposal;
  error;
  result;
  dragging = false;
  sheetJsLoaded = false;

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
      this.answers = {};
      this.layouts = {};
      this.recompute();
      this.stage = this.foundNothing ? "pick" : "preview";
      if (this.foundNothing) {
        this.error = `${chosen.map((f) => f.name).join(", ")}: no schedule found (no day columns or time rows). Nothing was imported.`;
      }
    } catch (e) {
      this.stage = "pick";
      this.error = `That file could not be read. ${errorMessage(e)}`;
    }
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
  }

  get foundNothing() {
    return !this.proposal || this.proposal.reading.placements.length === 0;
  }

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
      answerLabel: chosen ? chosen.label : "",
      className: `import-card import-card_${card.lane}${chosen ? " import-card_answered" : ""}`,
      options: card.options.map((o) => ({
        ...o,
        key: `${card.id}::${o.value}`,
        variant: o.value === LEAVE_OUT ? "neutral" : "brand-outline"
      }))
    };
  }

  get previewCards() {
    return this.cards.filter((c) => c.stage === "preview");
  }
  get hasPreviewCards() {
    return this.previewCards.length > 0;
  }
  get previewOpen() {
    return this.previewCards.filter((c) => !c.answered).length;
  }
  get reviewCards() {
    return this.cards.filter((c) => c.stage === "review");
  }
  get hasReviewCards() {
    return this.reviewCards.length > 0;
  }
  get answeredCount() {
    return this.reviewCards.filter((c) => c.answered).length;
  }
  get progressText() {
    return `${this.answeredCount} of ${this.reviewCards.length} questions answered`;
  }
  get progressStyle() {
    const total = this.reviewCards.length || 1;
    return `width: ${Math.round((this.answeredCount * 100) / total)}%;`;
  }

  handleAnswer(event) {
    const [id, value] = event.currentTarget.dataset.key.split("::");
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
  }

  handleChangeAnswer(event) {
    const answers = { ...this.answers };
    delete answers[event.currentTarget.dataset.id];
    this.answers = answers;
    this.recompute();
  }

  // ---------- what was found ----------

  get fileRows() {
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
      return {
        file,
        layout,
        pageCount: pages.length === 1 ? "1 page" : `${pages.length} pages`,
        unsure: pages.some((p) => !p.confident),
        options: LAYOUTS.map((value) => ({ label: LAYOUT_WORDS[value], value }))
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

  get lists() {
    return this.proposal
      ? foundLists(this.proposal, this.terms).map((list) => ({
          ...list,
          items: list.items.map((item) => ({
            ...item,
            tagClass: `import-tag import-tag_${item.tag.replace(/ /g, "-")}`
          }))
        }))
      : [];
  }

  get places() {
    return this.proposal
      ? this.proposal.offeredPlaces.map((p) => ({
          ...p,
          usedByText: `Named with ${p.usedBy.join(", ")}`
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

  get notes() {
    return this.proposal ? importNotes(this.proposal, this.terms) : [];
  }
  get hasNotes() {
    return this.notes.length > 0;
  }

  // ---------- moving between steps ----------

  get isPick() {
    return this.stage === "pick" || this.stage === "reading";
  }
  get isReading() {
    return this.stage === "reading";
  }
  get isPreview() {
    return this.stage === "preview";
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
    return this.dragging ? "import-drop import-drop_over" : "import-drop";
  }
  get fileNames() {
    return this.files.map((f) => f.name).join(", ");
  }

  get reviewLabel() {
    return this.previewOpen > 0
      ? `Answer the ${this.previewOpen === 1 ? "question" : `${this.previewOpen} questions`} above first`
      : "Review";
  }
  get reviewDisabled() {
    return this.previewOpen > 0;
  }

  get saveLabel() {
    const open = this.reviewCards.length - this.answeredCount;
    return open > 0
      ? `${open} ${open === 1 ? "question" : "questions"} left`
      : "Use this setup";
  }
  get saveDisabled() {
    return this.isSaving || this.answeredCount < this.reviewCards.length;
  }
  get saveHint() {
    if (!this.hasReviewCards) {
      return "Nothing needed a decision.";
    }
    return this.answeredCount === this.reviewCards.length
      ? `All ${this.reviewCards.length} decided.`
      : "Every question needs an answer. Leave it out for now is an answer too.";
  }

  handleReview() {
    this.stage = "review";
  }

  handleBackToPreview() {
    this.stage = "preview";
  }

  handleStartAgain() {
    this.stage = "pick";
    this.files = [];
    this.proposal = null;
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
      const plan = planFor(this.proposal, this.setup, this.setup.season.Id);
      this.result = await saveSetup({ plan: JSON.stringify(plan) });
      this.stage = "done";
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.stage = "review";
      this.error = errorMessage(e);
    }
  }

  // ---------- after saving ----------

  countLines(counts) {
    const t = this.terms;
    return Object.keys(counts || {})
      .sort()
      .map((term) => {
        const n = counts[term];
        return {
          key: term,
          text: `${n} ${n === 1 ? t.sIn(term) : t.pIn(term)}`
        };
      });
  }

  get addedLines() {
    return this.countLines(this.result && this.result.added);
  }
  get changedLines() {
    return this.countLines(this.result && this.result.changed);
  }
  get hasChanged() {
    return this.changedLines.length > 0;
  }
  get leftOutLines() {
    return this.cards
      .filter((c) => c.answer === LEAVE_OUT)
      .map((c) => ({ key: c.id, text: c.subject }));
  }
  get hasLeftOut() {
    return this.leftOutLines.length > 0;
  }
  get notedList() {
    const list = this.lists.find((l) => l.key === "noted");
    return list ? list.items : [];
  }
  get hasNoted() {
    return this.notedList.length > 0;
  }
}
