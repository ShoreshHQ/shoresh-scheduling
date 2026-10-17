import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import LightningConfirm from "lightning/confirm";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import saveList from "@salesforce/apex/ImportController.saveList";
import getAnswers from "@salesforce/apex/ImportController.getAnswers";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import {
  csvFile,
  isCsv,
  isReadable,
  undoMessage,
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
  waitingFor
} from "c/shoreshLists";
import { screenLabels } from "c/shoreshScreens";
import { errorMessage } from "c/shoreshErrors";

/**
 * "Import a list" on a setup screen (slice 4c): choose an Excel or CSV file, see which column is
 * which, answer the questions, Keep or Change each difference, then save it all at once. Nothing
 * is saved before "Save". Every answer runs the list again (c/shoreshLists), so what is shown is
 * always what will be saved.
 *
 * screenKey: which list (activities, locations, ...); setup: the season setup; terms: the
 * camp's words. Fires: imported (after a save or an Undo, so the page reloads the season).
 */
export default class ShoreshListImport extends LightningElement {
  @api screenKey;
  @api setup;
  @api terms;

  open = false;
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

  // ---------- opening and reading ----------

  get screenName() {
    return screenLabels(this.terms)[this.screenKey];
  }

  handleOpen() {
    this.open = true;
    this.reset();
  }

  handleClose() {
    this.open = false;
    this.reset();
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
      this.error = `That file could not be read. ${errorMessage(e)}`;
    }
  }

  /** Column choices and answers this camp gave before (Greg: remembered per camp and screen). */
  async rememberedAnswers() {
    const campId = this.setup && this.setup.season && this.setup.season.Camp__c;
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
    return this.sheetOptions.length > 1;
  }
  handleSheet(event) {
    this.sheet = event.detail.value;
    this.recompute();
  }

  get hasMapping() {
    return !!(this.proposal && this.proposal.mapping);
  }

  get columnOptions() {
    return [
      { label: "Not used", value: UNUSED },
      ...this.proposal.screen.columns.map((c) => ({
        label: c.heading,
        value: c.key
      }))
    ];
  }

  /** Each heading in the file and the column it fills. */
  get headings() {
    return this.proposal.mapping.headings.map((h) => {
      const remembered =
        h.how === "chosen" && this.remembered[h.key] === this.answers[h.key];
      let note = "";
      if (h.how === "unknown") {
        note = "Not used";
      } else if (h.how === "clash") {
        note = "Choose";
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
    return questionCards(this.proposal, this.terms, this.answers).map(
      (card) => {
        const chosen = card.options.find((o) => o.value === card.answer);
        return {
          ...card,
          answered: !!chosen,
          answerLabel: chosen ? chosen.label : "",
          fromMemory: !!chosen && this.remembered[card.id] === card.answer,
          options: card.options.map((o) => ({
            ...o,
            key: `${card.id}::${o.value}`
          })),
          className: chosen ? "list-card list-card_done" : "list-card"
        };
      }
    );
  }
  get hasCards() {
    return this.cards.length > 0;
  }
  handleCardAnswer(event) {
    const [id, value] = event.currentTarget.dataset.key.split("::");
    this.answer(id, value);
  }
  handleCardChange(event) {
    const answers = { ...this.answers };
    delete answers[event.currentTarget.dataset.id];
    this.answers = answers;
    this.recompute();
  }

  /**
   * What is added with the list because rows name it: ticked, and can't be unticked (Greg, #4).
   */
  get alsoAdd() {
    const t = this.terms;
    const add = (this.proposal && this.proposal.alsoAdd) || {};
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
    return ((this.proposal && this.proposal.rows) || [])
      .filter(
        (r) =>
          r.droppedPlan && ["new", "changed", "unchanged"].includes(r.status)
      )
      .map((r) => ({
        key: `dropped-${r.rowNumber}`,
        text: `${r.name} · no ${this.terms.sIn("RainPlan")}`
      }));
  }

  get hasAlsoAdd() {
    return this.alsoAdd.length > 0;
  }

  rowsWith(status) {
    return ((this.proposal && this.proposal.rows) || []).filter(
      (r) => r.status === status
    );
  }

  get newRows() {
    return this.rowsWith("new").map((r) => ({
      key: `row-${r.rowNumber}`,
      name: r.name
    }));
  }
  get unchangedCount() {
    return this.rowsWith("unchanged").length;
  }
  get unreadableRows() {
    return this.rowsWith("unreadable").map((r) => ({
      key: `row-${r.rowNumber}`,
      text: `Row ${r.rowNumber}${r.name ? ` · ${r.name}` : ""} · ${r.problems.join("; ")}`
    }));
  }
  get leftOutRows() {
    return this.rowsWith("leftOut").map((r) => ({
      key: `row-${r.rowNumber}`,
      text: r.sameAs
        ? `Row ${r.rowNumber} · ${r.name} · same as ${r.sameAs}`
        : `Row ${r.rowNumber} · ${r.name}`
    }));
  }
  get askedCount() {
    return this.rowsWith("asked").length;
  }

  /** Each difference: "times a week: at least 3 → 2", with Keep or Change; clears stand out. */
  get changedRows() {
    return this.rowsWith("changed").map((r) => ({
      key: `row-${r.rowNumber}`,
      name: r.existingName,
      differences: r.differences.map((d) => ({
        id: d.id,
        text: `${d.heading}: ${shownValue(this.proposal, d.column, d.from)} → ${shownValue(this.proposal, d.column, d.to)}`,
        clears: d.clears,
        keepVariant: d.answer === KEEP ? "brand" : "neutral",
        changeVariant: d.answer === CHANGE ? "brand" : "neutral",
        className: d.clears ? "list-diff list-diff_clears" : "list-diff"
      }))
    }));
  }

  get changeAll() {
    return changeAllCounts(this.proposal);
  }
  get hasChanges() {
    return this.changedRows.length > 0;
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
    return this.proposal
      ? waitingFor(this.proposal, this.terms, this.answers)
      : [];
  }
  get waitingLines() {
    return this.waiting.map((text, i) => ({ key: `w${i}`, text }));
  }
  get hasWaiting() {
    return this.waiting.length > 0;
  }
  /** The exit says what it does: "Add 3, change 2". */
  get saveLabel() {
    if (this.hasWaiting || !this.proposal || !this.proposal.rows) {
      return "Save";
    }
    const added = this.rowsWith("new").length;
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
      const plan = listPlan(
        this.proposal,
        this.answers,
        this.setup.season.Id,
        `${this.file.name} (${this.screenName})`
      );
      this.result = await saveList({ plan: JSON.stringify(plan) });
      this.stage = "done";
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.stage = "review";
      this.error = `Nothing was saved. ${errorMessage(e)}`;
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
          lines.push({
            key: `${verb}-${term}`,
            text: `${verb} ${n} ${n === 1 ? t.sIn(term) : t.pIn(term)}`
          });
        });
    };
    add(this.result && this.result.added, "Added");
    add(this.result && this.result.changed, "Changed");
    return lines;
  }

  async handleUndo() {
    const ok = await LightningConfirm.open({
      label: `Undo the import of ${this.fileName}?`,
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
      this.undone = undoMessage(
        await undoImport({ importId: this.result.importId })
      );
      this.dispatchEvent(new CustomEvent("imported"));
    } catch (e) {
      this.error = `That import could not be undone. ${errorMessage(e)}`;
    } finally {
      this.undoing = false;
    }
  }

  get canUndo() {
    return !!(this.result && this.result.importId) && !this.undone;
  }
}
