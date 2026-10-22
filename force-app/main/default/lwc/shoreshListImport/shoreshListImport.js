import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import LightningConfirm from "lightning/confirm";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import saveList from "@salesforce/apex/ImportController.saveList";
import saveWorkbook from "@salesforce/apex/ImportController.saveWorkbook";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import {
  BRING_BACK,
  csvFile,
  isCsv,
  isReadable,
  undoMessage,
  WEEKDAYS,
  workbookFile
} from "c/shoreshImportEngine";
import {
  CHANGE,
  KEEP,
  UNUSED,
  changeAllCounts,
  changeAllLabel,
  listPlan,
  listProposal,
  questionCards,
  rainAddKey,
  shownValue,
  waitingFor,
  listRows,
  workbookCards,
  workbookPlan,
  workbookProposal,
  workbookWaiting
} from "c/shoreshLists";
import { screenLabels } from "c/shoreshScreens";
import { failed, reasonOf } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

// What a camp workbook saves that has no camp word of its own (part D), in the camp's words.
const OWN_WORDS = {
  CampLabel: () => ["camp word", "camp words"],
  WeekException: (t) => [`${t.sIn("Week")} off`, `${t.pIn("Week")} off`]
};

/** Minutes after midnight as "9:00 AM". */
function timeText(minutes) {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/**
 * "Import a list" on a setup screen (slice 4c): choose an Excel or CSV file, see which column is
 * which, answer the questions, Keep or Change each difference, then save it all at once. Nothing
 * is saved before "Save". Every answer runs the list again (c/shoreshLists), so what is shown is
 * always what will be saved.
 *
 * With workbook (Roots, slice 4c part D) it imports the camp workbook instead: every sheet, in
 * one review, one save, and one Undo, each sheet's list shown as its own section.
 *
 * screenKey: which list (activities, locations, ...); setup: the season setup; terms: the
 * camp's words. Fires: imported (after a save or an Undo, so the page reloads the season).
 */
export default class ShoreshListImport extends LightningElement {
  @api screenKey;
  @api setup;
  @api terms;
  @api workbook = false;
  /**
   * "rail": closed, it is two quiet items on a setup screen's rail; open, it takes the rail's
   * whole width under them (the host is marked list-open, which the page's rail wraps).
   */
  @api variant;

  open = false;
  downloading = false;
  stage = "pick"; // pick | reading | review | saving | done
  file;
  sheet;
  answers = {};
  remembered = {};
  proposal;
  error;
  result;
  undone;
  undoing = false;
  sheetJsLoaded = false;
  // Where the cursor goes at the next render: { card } (that card), { after } (the next question
  // still open after that one), or { selector }.
  focusNext = null;
  // The file being read, named in the status line.
  readingName = null;

  renderedCallback() {
    if (!this.focusNext) {
      return;
    }
    const next = this.focusNext;
    this.focusNext = null;
    let target = null;
    if (next.selector) {
      target = this.template.querySelector(next.selector);
    } else {
      const cards = this.cards;
      let id = next.card;
      if (next.after) {
        const at = cards.findIndex((c) => c.id === next.after);
        const open = [...cards.slice(at + 1), ...cards.slice(0, at + 1)].find(
          (c) => !c.answered
        );
        id = open ? open.id : null;
      }
      const card = id
        ? [...this.template.querySelectorAll("[data-card]")].find(
            (el) => el.dataset.card === id
          )
        : null;
      // The card's first choice; with every question answered, Save.
      target = card
        ? card.querySelector(
            "lightning-button, lightning-checkbox-group, lightning-input"
          )
        : this.template.querySelector('[data-id="save"]');
    }
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  /** What is happening, for the status line screen readers hear. */
  get statusText() {
    if (this.stage === "reading") {
      return `Reading ${this.readingName || "the file"}`;
    }
    if (this.stage === "saving") {
      return "Saving";
    }
    if (this.stage === "done") {
      return this.undone || "Saved";
    }
    return "";
  }

  // ---------- opening and reading ----------

  get screenName() {
    return screenLabels(this.terms)[this.screenKey];
  }
  get title() {
    return this.workbook ? "Import worksheet" : `Import ${this.screenName}`;
  }
  /** Roots has its own "Download worksheet". */
  get showDownload() {
    return !this.workbook;
  }
  get openLabel() {
    return this.workbook ? "Import worksheet" : "Import a list";
  }

  get isRail() {
    return this.variant === "rail";
  }

  /** Opened: the cursor goes to its heading; closed: back to the button that opened it. */
  handleOpen() {
    this.open = true;
    this.classList.add("list-open");
    this.reset();
    this.focusNext = { selector: "[data-heading]" };
  }

  /** The screen's list, in the layout "Import a list" reads (an empty list is the template). */
  async handleDownload() {
    if (this.downloading) {
      return;
    }
    this.downloading = true;
    try {
      await downloadWorkbook(
        this,
        [
          {
            name: this.screenName,
            rows: listRows(this.screenKey, this.setup, this.terms)
          }
        ],
        fileNameOf(`${this.screenName} - ${this.setup.season.Name}`)
      );
    } catch (e) {
      this.dispatchEvent(
        new ShowToastEvent({
          title: "The list could not be downloaded",
          message: reasonOf(e),
          variant: "error"
        })
      );
    } finally {
      this.downloading = false;
    }
  }

  handleClose() {
    this.open = false;
    this.classList.remove("list-open");
    this.reset();
    this.focusNext = { selector: '[data-id="open"]' };
  }

  reset() {
    this.stage = "pick";
    this.file = null;
    this.sheet = null;
    this.proposal = null;
    this.error = null;
    this.result = null;
    this.undone = null;
  }

  handleChoose() {
    this.template.querySelector('input[data-id="file"]').click();
  }

  handleFileInput(event) {
    this.readFile(event.target.files && event.target.files[0]);
    // The same file can be chosen again after a change to it.
    event.target.value = null;
  }

  async ensureSheetJs() {
    if (!this.sheetJsLoaded) {
      await loadScript(this, SHEETJS);
      this.sheetJsLoaded = true;
    }
    return window.XLSX;
  }

  async readFile(chosen) {
    if (!chosen) {
      return;
    }
    if (!isReadable(chosen.name)) {
      this.error = `${chosen.name}: Shoresh reads Excel (.xlsx, .xls) and CSV files.`;
      return;
    }
    this.error = null;
    this.readingName = chosen.name;
    this.stage = "reading";
    try {
      this.file = isCsv(chosen.name)
        ? csvFile(chosen.name, await chosen.text())
        : workbookFile(
            await this.ensureSheetJs(),
            chosen.name,
            new Uint8Array(await chosen.arrayBuffer())
          );
      this.answers = await this.rememberedAnswers();
      this.sheet = null;
      this.recompute();
      this.stage = "review";
    } catch (e) {
      this.stage = "pick";
      this.error = failed("That file could not be read.", e);
    }
  }

  /** Column choices and answers this camp gave before (Greg: remembered per camp and screen). */
  async rememberedAnswers() {
    const campId =
      this.setup && this.setup.season && this.setup.season[FIELD.Season.Camp];
    let saved = [];
    try {
      saved = campId ? await getAnswers({ campId }) : [];
    } catch {
      // Without them the list still reads: everything is asked.
      saved = [];
    }
    const answers = {};
    (saved || []).forEach((row) => {
      answers[row.key] = row.answer;
    });
    this.remembered = { ...answers };
    return answers;
  }

  recompute() {
    if (this.workbook) {
      this.proposal = workbookProposal({
        file: this.file,
        setup: this.setup,
        terms: this.terms,
        labels: (this.setup && this.setup.labels) || [],
        answers: this.answers
      });
      return;
    }
    this.proposal = listProposal({
      screenKey: this.screenKey,
      file: this.file,
      sheet: this.sheet,
      setup: this.setup,
      terms: this.terms,
      answers: this.answers
    });
  }

  answer(id, value) {
    this.answers = { ...this.answers, [id]: value };
    this.recompute();
  }

  // ---------- the review ----------

  get isPick() {
    return this.stage === "pick" || this.stage === "reading";
  }
  get isReading() {
    return this.stage === "reading";
  }
  get isReview() {
    return this.stage === "review" || this.stage === "saving";
  }
  get isDone() {
    return this.stage === "done";
  }
  get fileName() {
    return this.file ? this.file.name : "";
  }

  get sheetOptions() {
    return ((this.proposal && this.proposal.sheets) || []).map((name) => ({
      label: name,
      value: name
    }));
  }
  get showSheetChoice() {
    return !this.workbook && this.sheetOptions.length > 1;
  }
  /** The sheet read: the one Shoresh picked, or the one the director chose. */
  get currentSheet() {
    return this.proposal ? this.proposal.sheet : null;
  }

  handleSheet(event) {
    this.sheet = event.detail.value;
    this.recompute();
  }

  /**
   * The review, part by part: one section for a screen's list; for a workbook, one per sheet
   * read (its name shown), and the sheets nothing reads.
   */
  get sections() {
    if (!this.proposal) {
      return [];
    }
    if (!this.workbook) {
      return [this.sectionOf(this.screenKey, "", this.proposal)];
    }
    const sections = this.proposal.sections.map((s) => {
      const section = this.sectionOf(
        s.key,
        s.label,
        s.extra ? { rows: s.rows } : s.proposal
      );
      // A workbook from another season: its weeks paired with this season's, by order.
      section.lists = (s.lists || [])
        .filter((list) => list.lines.length)
        .map((list) => ({
          key: `${s.key}-${list.key}`,
          heading: `${list.heading} (${list.lines.length})`,
          lines: list.lines.map((line, i) => ({
            key: `${list.key}-${i}`,
            text: line.pairing
          }))
        }));
      return section;
    });
    if (this.proposal.unused.length) {
      sections.push({
        ...this.sectionOf("unused", "Not read", { rows: [] }),
        unreadableRows: this.proposal.unused.map(({ name, why }) => ({
          key: `unused-${name}`,
          text: why ? `“${name}” · ${why}` : `“${name}”`
        })),
        hasUnreadable: true,
        unreadableHeading: `Sheets not read (${this.proposal.unused.length})`
      });
    }
    return sections;
  }

  /** The lists' proposals (a workbook's extra sheets are rows only). */
  get proposals() {
    if (!this.proposal) {
      return [];
    }
    return this.workbook
      ? this.proposal.sections.map((s) => {
          return s.extra ? { rows: s.rows } : s.proposal;
        })
      : [this.proposal];
  }

  sectionOf(key, label, p) {
    const alsoAdd = this.alsoAddOf(p);
    const newRows = this.newRowsOf(p);
    const changedRows = this.changedRowsOf(p);
    const unreadableRows = this.rowsOf(p, "unreadable").map((r) => ({
      key: `row-${r.rowNumber}`,
      text: `Row ${r.rowNumber}${r.name ? ` · ${r.name}` : ""} · ${r.problems.join("; ")}`
    }));
    const leftOutRows = this.leftOutRowsOf(p);
    const deletedRows = this.deletedRowsOf(p);
    return {
      key: `section-${key}`,
      label,
      showLabel: !!label,
      // Under a workbook's sheet title (h4), a sheet's own headings are one level down.
      level: label ? "5" : "4",
      hasMapping: !!p.mapping,
      headings: p.mapping ? this.headingsOf(p) : [],
      columnOptions: p.mapping ? this.columnOptionsOf(p) : [],
      alsoAdd,
      hasAlsoAdd: alsoAdd.length > 0,
      newRows,
      hasNew: newRows.length > 0,
      newHeading: `New (${newRows.length})`,
      changedRows,
      hasChanges: changedRows.length > 0,
      unchangedCount: this.rowsOf(p, "unchanged").length,
      unreadableRows,
      hasUnreadable: unreadableRows.length > 0,
      unreadableHeading: `Review here (${unreadableRows.length})`,
      leftOutRows,
      hasLeftOut: leftOutRows.length > 0,
      leftOutHeading: `Left out (${leftOutRows.length})`,
      deletedRows,
      hasDeleted: deletedRows.length > 0,
      lists: []
    };
  }

  columnOptionsOf(p) {
    return [
      { label: "Not used", value: UNUSED },
      ...p.screen.columns.map((c) => ({
        label: c.heading,
        value: c.key
      }))
    ];
  }

  /** Each heading in the file and the column it fills. */
  headingsOf(p) {
    return p.mapping.headings.map((h) => {
      const remembered =
        h.how === "chosen" && this.remembered[h.key] === this.answers[h.key];
      let note = "";
      if (h.how === "unknown") {
        note = "Not used";
      } else if (h.how === "clash") {
        note = "Not sure";
      } else if (remembered) {
        note = "Remembered";
      }
      return {
        key: h.key,
        text: h.text,
        tagClass:
          h.how === "unknown" || h.how === "clash"
            ? "list-tag list-tag_attention"
            : "list-tag",
        value: h.column || UNUSED,
        note,
        className:
          h.how === "unknown" || h.how === "clash"
            ? "list-heading list-heading_attention"
            : "list-heading"
      };
    });
  }

  handleColumn(event) {
    this.answer(event.target.dataset.id, event.detail.value);
  }

  get cards() {
    if (!this.proposal) {
      return [];
    }
    const cards = this.workbook
      ? workbookCards(this.proposal, this.answers)
      : questionCards(this.proposal, this.terms, this.answers);
    return cards.map((card) => {
      let chosen = card.options.find((o) => o.value === card.answer);
      if (!chosen && card.answer && card.daysQuestion) {
        chosen = { label: card.answer.split(",").join(", ") };
      } else if (!chosen && card.answer && card.timesQuestion) {
        const [start, end] = card.answer.split("-").map((hm) => {
          const [h, m] = hm.split(":").map(Number);
          return timeText(h * 60 + m);
        });
        chosen = { label: `${start}–${end}` };
      }
      return {
        ...card,
        answered: !!chosen,
        answerLabel: chosen ? chosen.label : "",
        fromMemory: !!chosen && this.remembered[card.id] === card.answer,
        // A new program starts as Monday to Friday, ticked (coordinator, #20 review).
        draftDays: this.draftDays(card.id),
        draftProblem: (this.drafts[card.id] || {}).problem || "",
        options: card.options.map((o) => ({
          ...o,
          key: `${card.id}::${o.value}`
        })),
        className: chosen ? "list-card list-card_done" : "list-card"
      };
    });
  }
  /** Questions still to answer (the heading never shows an attention zero: answered cards fold). */
  get openCount() {
    return this.cards.filter((c) => !c.answered).length;
  }
  get hasCards() {
    return this.cards.length > 0;
  }
  handleCardAnswer(event) {
    const [id, value] = event.currentTarget.dataset.key.split("::");
    this.answer(id, value);
    // The clicked button is gone with the answer: on to the next open question (WCAG 2.4.3).
    this.focusNext = { after: id };
  }
  handleCardChange(event) {
    const id = event.currentTarget.dataset.id;
    const answers = { ...this.answers };
    delete answers[id];
    this.answers = answers;
    this.recompute();
    // The card opens again: the cursor goes to its first choice.
    this.focusNext = { card: id };
  }

  /**
   * What is added with the list because rows name it: ticked, and can't be unticked (Greg, #4).
   */
  alsoAddOf(p) {
    const t = this.terms;
    const add = p.alsoAdd || {};
    const words = { location: "Location", locationType: "LocationType" };
    const lines = [];
    ["locationType", "location"].forEach((ref) => {
      (add[ref] || []).forEach((name) => {
        lines.push({
          key: `${ref}:${name}`,
          label: `${name} · ${t.sIn(words[ref])}`,
          checked: true,
          canUntick: false
        });
      });
    });
    (add.program || []).forEach((item) => {
      lines.push({
        key: `program:${item.name}`,
        label: `${item.name} · ${t.sIn("Program")} · ${item.days.join(", ")}`,
        checked: true,
        canUntick: false
      });
    });
    (add.programDays || []).forEach((item) => {
      lines.push({
        key: `days:${item.programId}`,
        label: `${item.days.join(", ")} → ${this.programName(item.programId)}`,
        checked: true,
        canUntick: false
      });
    });
    (add.division || []).forEach((item) => {
      lines.push({
        key: `division:${item.programId}:${item.name}`,
        label: `${item.name} · ${t.sIn("Division")} · ${this.programName(item.programId)}`,
        checked: true,
        canUntick: false
      });
    });
    (add.timeBlock || []).forEach((item) => {
      lines.push({
        key: `block:${item.programId}:${item.name}`,
        label: `${item.name} · ${t.sIn("TimeBlock")} · ${timeText(item.start)}–${timeText(item.end)}`,
        checked: true,
        canUntick: false
      });
    });
    (add.who || []).forEach((item) => {
      lines.push({
        key: item.key,
        label: `${item.name} · ${t.sIn(item.kind)}`,
        checked: true,
        canUntick: false
      });
    });
    (add.activity || []).forEach((item) => {
      lines.push({
        key: `activity:${item.name}`,
        label: `${item.name} · ${t.sIn("Activity")}`,
        rainPlan: item.name,
        checked: !item.skipped,
        canUntick: true
      });
    });
    return lines;
  }

  programName(programId) {
    const entry = ((this.setup && this.setup.programs) || []).find(
      (e) => e.program.Id === programId
    );
    return entry
      ? entry.program.Name
      : String(programId).replace(/^Program:/, "");
  }

  // ---------- questions that need more than a button: days, and times ----------

  drafts = {};

  get dayOptions() {
    return WEEKDAYS.map((d) => ({ label: d, value: d }));
  }

  draftDays(id) {
    const days = (this.drafts[id] || {}).days;
    return days === undefined ? [...WEEKDAYS] : days;
  }

  handleDraft(event) {
    const { id, part } = event.target.dataset;
    const value = event.detail.value;
    this.drafts = {
      ...this.drafts,
      [id]: { ...(this.drafts[id] || {}), [part]: value, problem: "" }
    };
  }

  /** Days: "Monday,Wednesday"; times: "09:00-10:00" (the time inputs give "09:00:00.000"). */
  handleDraftDone(event) {
    const { id, kind } = event.currentTarget.dataset;
    const draft = this.drafts[id] || {};
    const days = this.draftDays(id);
    if (kind === "days" && days.length) {
      this.answer(id, days.join(","));
      this.focusNext = { after: id };
    } else if (
      kind === "times" &&
      draft.start &&
      draft.end &&
      draft.end > draft.start
    ) {
      this.answer(id, `${draft.start.slice(0, 5)}-${draft.end.slice(0, 5)}`);
      this.focusNext = { after: id };
    } else {
      // Said on the card, never a click that does nothing.
      this.drafts = {
        ...this.drafts,
        [id]: {
          ...draft,
          problem:
            kind === "days" ? "No days" : "End is before Start, or missing"
        }
      };
    }
  }

  /**
   * A rain plan's tick (Greg, 2026-10-17): taken off, the rows naming it are saved without it.
   * The other ticks can't be taken off: the rows need what they name.
   */
  handleAlsoAdd(event) {
    const name = event.target.dataset.rainPlan;
    const answers = { ...this.answers };
    if (event.detail.checked) {
      delete answers[rainAddKey(name)];
    } else {
      answers[rainAddKey(name)] = "skip";
    }
    this.answers = answers;
    this.recompute();
  }

  /** Rows saved without the rain plan the file gave them, for the summary. */
  get droppedPlans() {
    return this.proposals
      .flatMap((p) => p.rows || [])
      .filter(
        (r) =>
          r.droppedPlan && ["new", "changed", "unchanged"].includes(r.status)
      )
      .map((r) => ({
        key: `dropped-${r.rowNumber}`,
        text: `${r.name} · ${r.status === "new" ? "no" : "unchanged"} ${this.terms.sIn("RainPlan")}`
      }));
  }

  rowsOf(p, status) {
    return (p.rows || []).filter((r) => r.status === status);
  }

  /** Rows of a status across every list. */
  rowsWith(status) {
    return this.proposals.flatMap((p) => this.rowsOf(p, status));
  }

  newRowsOf(p) {
    return this.rowsOf(p, "new").map((r) => ({
      key: `row-${r.rowNumber}`,
      name: r.name,
      // Blank cells it can't be without start as when added by hand.
      starting: (r.startingValues || []).length
        ? `starting value: ${r.startingValues.join(", ")}`
        : ""
    }));
  }
  leftOutRowsOf(p) {
    return this.rowsOf(p, "leftOut").map((r) => ({
      key: `row-${r.rowNumber}`,
      text: r.reason
        ? `Row ${r.rowNumber} · ${r.name} · ${r.reason}`
        : r.usedRow
          ? `Row ${r.rowNumber} · ${r.name} · row ${r.usedRow} used`
          : r.sameAs
            ? `Row ${r.rowNumber} · ${r.name} · same as ${r.sameAs}`
            : `Row ${r.rowNumber} · ${r.name}`
    }));
  }
  /**
   * What the camp deleted before and this list leaves out (Greg, decision 45), each with Bring
   * back: rows of the list, and places or kinds of place its rows name.
   */
  deletedRowsOf(p) {
    const t = this.terms;
    return (p.deleted || []).map((item) => {
      const detail = `${t.sIn(item.kind)}${item.program ? ` · ${item.program}` : ""}`;
      return {
        key: item.key,
        name: item.name,
        detail,
        bringBackLabel: `Bring back ${item.name}, ${detail}`
      };
    });
  }

  handleBringBack(event) {
    this.answer(event.currentTarget.dataset.key, BRING_BACK);
  }

  get askedCount() {
    return this.rowsWith("asked").length;
  }

  /**
   * Each difference: "times a week: at least 3 → 2", with Keep or Change; clears stand out. A
   * workbook's extra sheets give their own words (camp words, weeks, Runs in).
   */
  changedRowsOf(p) {
    const button = (on) => {
      return on
        ? "slds-button slds-button_brand"
        : "slds-button slds-button_neutral";
    };
    return this.rowsOf(p, "changed").map((r) => {
      const name = r.existingName || r.name;
      return {
        key: `row-${r.rowNumber}`,
        name,
        differences: r.differences.map((d) => {
          const text = p.screen
            ? `${d.heading}: ${shownValue(p, d.column, d.from)} → ${shownValue(p, d.column, d.to)}`
            : d.text || `${d.heading}: ${d.from} → ${d.to}`;
          // Each Keep and Change names its item and difference, and says which is chosen.
          return {
            id: d.id,
            text,
            clears: d.clears,
            keepClass: button(d.answer === KEEP),
            changeClass: button(d.answer === CHANGE),
            keepPressed: String(d.answer === KEEP),
            changePressed: String(d.answer === CHANGE),
            keepLabel: `Keep, ${name}: ${text}`,
            changeLabel: `Change, ${name}: ${text}`,
            className: d.clears ? "list-diff list-diff_clears" : "list-diff"
          };
        })
      };
    });
  }

  /** Every difference not yet answered, across the whole file. */
  get changeAll() {
    return this.proposals
      .map((p) => changeAllCounts(p))
      .reduce(
        (sum, c) => ({
          changes: sum.changes + c.changes,
          clears: sum.clears + c.clears,
          answered: sum.answered + c.answered,
          ids: [...sum.ids, ...c.ids]
        }),
        { changes: 0, clears: 0, answered: 0, ids: [] }
      );
  }
  /** Only differences not answered yet; clearing a value never hides inside it (it says how many). */
  get hasUnanswered() {
    return this.changeAll.changes > 0;
  }
  get changeAllLabel() {
    return changeAllLabel(this.changeAll);
  }

  handleKeep(event) {
    this.answer(event.currentTarget.dataset.id, KEEP);
  }
  handleChange(event) {
    this.answer(event.currentTarget.dataset.id, CHANGE);
  }
  handleChangeAll() {
    const answers = { ...this.answers };
    this.changeAll.ids.forEach((id) => {
      answers[id] = CHANGE;
    });
    this.answers = answers;
    this.recompute();
  }

  get waiting() {
    if (!this.proposal) {
      return [];
    }
    return this.workbook
      ? workbookWaiting(this.proposal, this.answers)
      : waitingFor(this.proposal, this.terms, this.answers);
  }
  get waitingLines() {
    return this.waiting.map((text, i) => ({ key: `w${i}`, text }));
  }
  get hasWaiting() {
    return this.waiting.length > 0;
  }
  /** The exit says what it does: "Add 3, change 2". */
  get saveLabel() {
    if (this.hasWaiting || !this.proposal || !this.proposals.length) {
      return "Save";
    }
    // Everything saving adds, the ticked extras with it.
    // Weeks an added item runs are counted with the item.
    const added =
      this.rowsWith("new").filter((r) => !r.withItem).length +
      this.proposals
        .flatMap((p) => this.alsoAddOf(p))
        .filter((item) => item.checked).length;
    const changed = this.rowsWith("changed").filter((r) =>
      r.differences.some((d) => d.answer === CHANGE)
    ).length;
    const parts = [];
    if (added) {
      parts.push(`Add ${added}`);
    }
    if (changed) {
      parts.push(`${parts.length ? "change" : "Change"} ${changed}`);
    }
    return parts.join(", ") || "Save";
  }

  get saveDisabled() {
    return this.hasWaiting || this.stage === "saving";
  }

  // ---------- saving and undo ----------

  async handleSave() {
    this.stage = "saving";
    this.error = null;
    try {
      if (this.workbook) {
        const plan = workbookPlan(
          this.proposal,
          this.answers,
          this.setup.season.Id
        );
        this.result = await saveWorkbook({ plan: JSON.stringify(plan) });
      } else {
        const plan = listPlan(
          this.proposal,
          this.answers,
          this.setup.season.Id,
          `${this.file.name} (${this.screenName})`
        );
        this.result = await saveList({ plan: JSON.stringify(plan) });
      }
      this.stage = "done";
      this.focusNext = { selector: '[data-id="saved"]' };
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.stage = "review";
      this.error = failed("Nothing was saved.", e);
    }
  }

  get summaryLines() {
    const t = this.terms;
    const lines = [];
    const add = (counts, verb) => {
      Object.keys(counts || {})
        .sort()
        .forEach((term) => {
          const n = counts[term];
          const own = OWN_WORDS[term] && OWN_WORDS[term](t);
          const word = own
            ? own[n === 1 ? 0 : 1]
            : n === 1
              ? t.sIn(term)
              : t.pIn(term);
          lines.push({
            key: `${verb}-${term}`,
            text: `${verb} ${n} ${word}`
          });
        });
    };
    add(this.result && this.result.added, "Added");
    add(this.result && this.result.changed, "Changed");
    return lines;
  }

  async handleUndo() {
    const ok = await LightningConfirm.open({
      label: `Undo ${this.fileName}?`,
      message: this.undoCounts,
      variant: "header",
      theme: "warning"
    });
    if (!ok || this.undoing) {
      return;
    }
    this.undoing = true;
    try {
      this.undone = undoMessage(
        await undoImport({ importId: this.result.importId })
      );
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.error = failed("That import could not be undone.", e);
    } finally {
      this.undoing = false;
    }
  }

  /** "Remove 5 · put back 2": what Undo does, in counts. */
  get undoCounts() {
    const total = (counts) =>
      Object.values(counts || {}).reduce((sum, n) => sum + n, 0);
    const parts = [];
    const added = total(this.result && this.result.added);
    const changed = total(this.result && this.result.changed);
    if (added) {
      parts.push(`Remove ${added}`);
    }
    if (changed) {
      parts.push(`${parts.length ? "put back" : "Put back"} ${changed}`);
    }
    return parts.join(" · ");
  }

  get questionsHeading() {
    return this.openCount
      ? `Questions for you (${this.openCount})`
      : "Questions for you";
  }

  get canUndo() {
    return !!(this.result && this.result.importId) && !this.undone;
  }
}
