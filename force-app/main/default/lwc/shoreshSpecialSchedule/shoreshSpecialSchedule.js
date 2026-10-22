import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import openPlan from "@salesforce/apex/SpecialScheduleController.openPlan";
import saveCells from "@salesforce/apex/SpecialScheduleController.saveCells";
import changeFrame from "@salesforce/apex/SpecialScheduleController.changeFrame";
import addActivity from "@salesforce/apex/SpecialScheduleController.addActivity";
import importPlan from "@salesforce/apex/SpecialScheduleController.importPlan";
import { failed, reasonOf } from "c/shoreshErrors";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { scheduleSheets } from "c/shoreshScheduleExport";
import { shortClock } from "c/shoreshScheduleViews";
import {
  csvFile,
  isCsv,
  isReadable,
  workbookFile
} from "c/shoreshImportEngine";
import { pagesOf, planFromPage } from "./fromFile";

// A special schedule has no checks of its own (desktop: special days have no engine): no dots.
const NO_CHECKS = Object.freeze({ flags: new Map(), placements: [] });

function listed(names) {
  return names.join(", ");
}

/**
 * Whether a day holds something the director put there. What a special day started with (a
 * fixed or recurring activity brought in) is not that: an import replaces it, as the desktop's
 * seed never stops an import (its ADR 2026-08-22-event-schedule-import §6; SpecialScheduleImport).
 */
function hasTyped(day) {
  return (day.rows || []).some((row) =>
    String(row)
      .split(",")
      .some((cell) => {
        if (!cell || cell === "^") {
          return false;
        }
        const item = day.items[Number(cell) - 1];
        return !item || (item.kind !== "F" && item.kind !== "R");
      })
  );
}

/** How many cells of a day hold something, in a time block (blockIndex) or a row (groupIndex). */
function filledIn(day, { blockIndex = null, groupIndex = null }) {
  let count = 0;
  (day.rows || []).forEach((row, g) => {
    if (groupIndex !== null && g !== groupIndex) {
      return;
    }
    String(row)
      .split(",")
      .forEach((cell, b) => {
        if (cell && (blockIndex === null || b === blockIndex)) {
          count += 1;
        }
      });
  });
  return count;
}

/**
 * The schedule inside a special day or special event (ADR 0014 choices 14 to 17; decision 47.5;
 * design-research special-r1 special-day.html), opened from its details' "Open schedule": a
 * special day's groups across, an event's stations across, its own time blocks down, filled by
 * typing in a cell as on Manual Build. The grid is c-shoresh-week-editor with planName (one day,
 * no views or drawer): Undo, Redo, Copy and Paste, "keep theirs or use yours", and the padlock
 * on a fixed or recurring activity brought in work as on every schedule. This screen adds the
 * rail's way back and name, Saved, Import and Download, the time blocks and stations under the
 * grid, Clear schedule in Edit, and the item's notes.
 *
 * Fires: close { itemId } (back to Special events), changed (something was saved: the list's
 * counts are read again).
 */
export default class ShoreshSpecialSchedule extends LightningElement {
  @api terms;
  @api setup;

  _itemId;
  // SpecialScheduleController.openPlan's PlanView, kept up to date with each save.
  view = null;
  // The editor's draft (its activities include any added from a cell), as it last said.
  editorDraft = null;
  loading = true;
  error = null;
  // What an import did, line by line.
  importLines = [];
  // Saving a change to the frame (time blocks, stations, Clear) or importing.
  busy = false;
  editorBusy = false;
  // The form open under the grid: { kind: "block" | "station", targetId, name, start, end }.
  form = null;
  blocksOpen = false;
  stationsOpen = false;
  // A question before something that empties cells or replaces the frame:
  // { action, targetId, heading, lines, label, said, back }, and an import's pending file.
  ask = null;
  announcement = "";
  focusHeadingNext = false;
  focusAfter = null;
  // The editor's own tools (Clear day, Copy day to…) are a week's: this screen has Clear schedule.
  toolsOff = false;

  /** The special day or event shown; setting it opens it. */
  @api
  get itemId() {
    return this._itemId;
  }
  set itemId(value) {
    const changed = value !== this._itemId;
    this._itemId = value;
    if (changed && value) {
      this.load(true);
    }
  }

  get t() {
    return this.terms;
  }

  get editor() {
    return this.template.querySelector('[data-id="week-editor"]');
  }

  renderedCallback() {
    if (this.focusHeadingNext) {
      const heading = this.template.querySelector("[data-heading]");
      if (heading) {
        this.focusHeadingNext = false;
        heading.focus();
      }
    }
    if (this.focusAfter) {
      // One selector, or a list tried in order (the first one on screen and enabled gets focus).
      const target = []
        .concat(this.focusAfter)
        .reduce(
          (found, selector) => found || this.template.querySelector(selector),
          null
        );
      if (target) {
        this.focusAfter = null;
        target.focus();
      }
    }
  }

  // ---------- reading ----------

  async load(fresh) {
    this.loading = true;
    this.error = null;
    try {
      const view = await openPlan({ itemId: this._itemId });
      this.view = view;
      this.editorDraft = null;
      this.showInEditor(true);
      if (fresh) {
        this.focusHeadingNext = true;
      }
    } catch (e) {
      this.error = failed("This schedule couldn't be opened.", e);
    } finally {
      this.loading = false;
    }
  }

  /** The day the screen shows now: the editor's (with edits on their way), else the server's. */
  get day() {
    const draft = this.editorDraft;
    const schedule =
      (draft && draft.schedule) || (this.view && this.view.schedule);
    return schedule && schedule.days.length ? schedule.days[0] : null;
  }

  get activities() {
    return (
      (this.editorDraft && this.editorDraft.activities) ||
      (this.view && this.view.activities) ||
      []
    );
  }

  /** Something to fill: a time block and a column. */
  get canFill() {
    const day = this.view && this.view.schedule.days[0];
    return (
      !!day && !day.problem && day.blocks.length > 0 && day.groups.length > 0
    );
  }

  /** The editor's draft for the plan, or null when there is nothing to fill yet. */
  draftOf() {
    return this.canFill
      ? { schedule: this.view.schedule, activities: this.activities }
      : null;
  }

  /** Hands the plan to the editor. fresh: Undo starts over (a new visit, or a frame change). */
  showInEditor(fresh) {
    const editor = this.editor;
    if (!editor) {
      // Drawn after this render: shown from renderedCallback's next pass.
      Promise.resolve().then(() => this.editor && this.showInEditor(fresh));
      return;
    }
    const draft = this.draftOf();
    if (fresh || !editor.savedWeek) {
      editor.clear();
      editor.show(draft, true);
    } else {
      editor.restored(draft);
    }
  }

  // ---------- what the screen says ----------

  get name() {
    return (this.view && this.view.name) || "";
  }
  get isEvent() {
    return !!this.view && this.view.kind === "SpecialEvent";
  }
  get notes() {
    return (this.view && this.view.notes) || "";
  }
  get hasNotes() {
    return !!this.notes;
  }
  get backLabel() {
    return "Special events";
  }
  get problem() {
    const day = this.view && this.view.schedule.days[0];
    return day && day.problem
      ? `${this.name} can't be shown: ${day.problem}. Nothing on it was changed.`
      : null;
  }
  get hasEntries() {
    const day = this.day;
    return !!day && filledIn(day, {}) > 0;
  }
  /** Something the director put there: an import is refused then. */
  get hasTypedEntries() {
    const day = this.day;
    return !!day && hasTyped(day);
  }
  get blockWord() {
    return this.t ? this.t.s("TimeBlock") : "Time block";
  }
  get blocksWord() {
    return this.t ? this.t.p("TimeBlock") : "Time blocks";
  }
  get addBlockLabel() {
    return `+ ${this.blockWord}`;
  }
  /** Why the grid isn't there yet, and what to do: shown where the grid goes. */
  get emptyMessage() {
    if (!this.view || this.canFill || this.problem) {
      return null;
    }
    const day = this.view.schedule.days[0];
    const needs = [];
    if (!day.blocks.length) {
      needs.push(`a ${this.t.sIn("TimeBlock")}`);
    }
    if (!day.groups.length) {
      needs.push("a station");
    }
    return `Add ${needs.join(" and ")} to start, or import this schedule from a file.`;
  }
  get controlsDisabled() {
    return this.busy || this.editorBusy || !this.view || !!this.problem;
  }

  announce(text) {
    this.announcement = "";
    Promise.resolve().then(() => {
      this.announcement = text;
    });
  }

  markSaved() {
    const mark = this.template.querySelector('[data-id="saved"]');
    if (mark) {
      mark.saved();
    }
  }

  // ---------- the editor ----------

  noChecks = () => NO_CHECKS;

  /** The editor saves through here, with a refusal turned into an answer. */
  saveRuns = async (edits) => {
    try {
      const result = await saveCells({ itemId: this._itemId, edits });
      this.view = {
        ...this.view,
        schedule: result.schedule,
        revision: Number(result.revision),
        hasEntries: hasTyped(result.schedule.days[0])
      };
      return {
        status: "saved",
        conflicts: result.conflicts,
        schedule: result.schedule
      };
    } catch (e) {
      return {
        status: "refused",
        conflicts: [],
        schedule: null,
        message: reasonOf(e)
      };
    }
  };

  /** "Add <name>" from a cell: the season's activity of that name, or a new one. */
  addActivityWith = ({ name }) => addActivity({ itemId: this._itemId, name });

  handleEditorState(event) {
    this.editorDraft = event.detail.draft;
    this.editorBusy = !!event.detail.busy;
  }

  handleSaved() {
    this.markSaved();
    this.dispatchEvent(new CustomEvent("changed"));
  }

  handleEditorError(event) {
    this.error = event.detail.message;
  }

  /** A save failed: the plan is read again. */
  handleEditorReload() {
    this.load(false);
  }

  get editItems() {
    return [
      {
        value: "clear",
        label: "Clear schedule",
        dataId: "clear-schedule",
        disabled: this.controlsDisabled || !this.hasEntries
      }
    ];
  }

  handleEditSelect(event) {
    if (event.detail.value === "clear") {
      this.ask = {
        action: "clear",
        heading: `Clear ${this.name}?`,
        lines: [
          `Every cell is emptied, ${this.t.pIn("FixedActivity")} too. Its ${this.t.pIn("TimeBlock")} stay.`,
          "This can't be undone."
        ],
        label: "Clear",
        said: `${this.name} cleared`,
        back: '[data-id="add-block"]'
      };
    }
  }

  // ---------- the rail ----------

  handleBack() {
    this.dispatchEvent(
      new CustomEvent("close", { detail: { itemId: this._itemId } })
    );
  }

  async handleDownload() {
    const day = this.day;
    if (!day || day.problem) {
      return;
    }
    try {
      const [sheet] = scheduleSheets({ days: [day] }, [], this.t);
      await downloadWorkbook(
        this,
        [{ ...sheet, name: this.name }],
        fileNameOf(this.name)
      );
    } catch (e) {
      this.error = failed(`${this.name} wasn't downloaded.`, e);
    }
  }

  handleImport() {
    if (this.hasTypedEntries) {
      // Desktop: an import never fills over what was typed; what the day started with it replaces.
      this.error = `${this.name} already has entries. Clear it first if you want to replace it with an import, or add to it by hand.`;
      return;
    }
    const input = this.template.querySelector('[data-id="import-file"]');
    if (input) {
      input.click();
    }
  }

  async handleFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) {
      return;
    }
    this.error = null;
    this.importLines = [];
    if (!isReadable(file.name)) {
      this.error = `${file.name} wasn't imported: Shoresh reads Excel (.xlsx, .xls) and comma-separated (.csv) files.`;
      return;
    }
    this.busy = true;
    try {
      const { pages, unclear } = pagesOf(await this.readFile(file));
      // Desktop eventGridPopulate.js: a file whose times side can't be told is not guessed at.
      const noSide = `Couldn't tell which side of ${file.name} is the schedule's times. Check that the file has a clear time column or time row, and try again.`;
      if (unclear) {
        this.error = noSide;
        return;
      }
      if (!pages.length) {
        this.error = `No schedule could be read out of ${file.name}. Check it has times down the side or across the top.`;
        return;
      }
      const { imported, noTimes, places } = planFromPage(pages[0]);
      if (!imported.blocks.length) {
        this.error = noSide;
        return;
      }
      await this.sendImport(
        {
          fileName: file.name,
          imported,
          noTimes,
          places,
          pageCount: pages.length,
          revision: this.view.revision
        },
        false
      );
    } catch (e) {
      this.error = failed(`${file.name} wasn't imported.`, e);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Saves a file read into a plan. Time blocks or stations the director changed are not replaced
   * unasked: the server answers asks (nothing saved) with what the file changes, and the question
   * goes to the director; yes sends it again with replaceEdited.
   */
  async sendImport(pending, replaceEdited) {
    const outcome = await importPlan({
      itemId: this._itemId,
      revision: pending.revision,
      imported: { ...pending.imported, replaceEdited }
    });
    if (outcome.asks) {
      this.ask = {
        action: "import",
        pending,
        heading: `Replace ${this.frameWords} in ${this.name}?`,
        lines: [...this.frameSaid(outcome.frame, ""), "This can't be undone."],
        label: "Import",
        back: '[data-id="import"]'
      };
      return;
    }
    // Read again, so activities the import added join the ones to type in.
    await this.load(false);
    this.importLines = this.importSaid(
      pending.fileName,
      outcome,
      pending.noTimes,
      pending.places,
      pending.pageCount
    );
    this.announce(this.importLines.join(" "));
    this.markSaved();
    this.dispatchEvent(new CustomEvent("changed"));
  }

  /** "the time blocks", or for an event "the time blocks and stations", in the camp's words. */
  get frameWords() {
    const blocks = `the ${this.t.pIn("TimeBlock")}`;
    return this.isEvent ? `${blocks} and stations` : blocks;
  }

  /** Each change an import makes to the frame, a line each; by: " by the file" once made. */
  frameSaid(frame, by) {
    if (!frame) {
      return [];
    }
    const blocks = this.blocksWord;
    const lines = [];
    const add = (what, verb, names) => {
      if (names && names.length) {
        lines.push(`${what} ${verb}${by}: ${listed(names)}.`);
      }
    };
    add(
      blocks,
      "renamed",
      (frame.renamed || []).map((r) => `${r.was} to ${r.now}`)
    );
    add(blocks, "removed", frame.removed);
    add(blocks, "added", frame.added);
    add("Stations", "removed", frame.stationsRemoved);
    add("Stations", "added", frame.stationsAdded);
    return lines;
  }

  /** The director's answer to replacing what they changed: yes imports, no leaves it. */
  async answerImport(ask, yes) {
    this.focusAfter = ask.back;
    if (!yes) {
      this.announce(`${ask.pending.fileName} not imported`);
      return;
    }
    this.busy = true;
    try {
      await this.sendImport(ask.pending, true);
    } catch (e) {
      this.error = failed(`${ask.pending.fileName} wasn't imported.`, e);
    } finally {
      this.busy = false;
    }
  }

  async readFile(file) {
    if (isCsv(file.name)) {
      return csvFile(file.name, await file.text());
    }
    await loadScript(this, SHEETJS);
    // SheetJS puts itself on window when its script runs.
    return workbookFile(window.XLSX, file.name, await file.arrayBuffer());
  }

  /** What an import did and left out, line by line, in the camp's words. */
  importSaid(fileName, outcome, noTimes, places, pageCount) {
    const t = this.t;
    const lines = [
      `Imported ${fileName}: ${outcome.placed} ${outcome.placed === 1 ? "cell" : "cells"} filled.`
    ];
    if (outcome.replaced && outcome.replaced.length) {
      lines.push(
        `Replaced by the file, brought in when ${this.name} started: ${listed(outcome.replaced)}.`
      );
    }
    lines.push(...this.frameSaid(outcome.frame, " by the file"));
    if (outcome.added.length) {
      lines.push(`Added to ${t.pIn("Activity")}: ${listed(outcome.added)}.`);
    }
    if (outcome.notGroups.length) {
      lines.push(
        `Left out, not a ${t.sIn("Group")} here: ${listed(outcome.notGroups)}.`
      );
    }
    if (noTimes.length) {
      lines.push(`Left out, no times: ${listed(noTimes)}.`);
    }
    if (places) {
      lines.push(
        `Places written in ${places} ${places === 1 ? "cell were" : "cells were"} not kept.`
      );
    }
    if (pageCount > 1) {
      lines.push("Only the first schedule in the file was read.");
    }
    return lines;
  }

  get hasImportLines() {
    return this.importLines.length > 0;
  }

  // ---------- time blocks and stations ----------

  get blocks() {
    const day = this.day;
    if (!day) {
      return [];
    }
    const off = this.controlsDisabled;
    return day.blocks.map((block, index) => ({
      key: block.id,
      id: block.id,
      name: block.name,
      when: `${shortClock(block.startTime)}–${shortClock(block.endTime)}`,
      changeLabel: `Change ${block.name}`,
      earlierLabel: `Move ${block.name} earlier`,
      laterLabel: `Move ${block.name} later`,
      removeLabel: `Remove ${block.name}`,
      earlierOff: off || index === 0,
      laterOff: off || index === day.blocks.length - 1
    }));
  }

  get stations() {
    const day = this.day;
    if (!day || !this.isEvent) {
      return [];
    }
    const off = this.controlsDisabled;
    return day.groups.map((grp, index) => ({
      key: grp.id,
      id: grp.id,
      name: grp.name,
      renameLabel: `Rename ${grp.name}`,
      leftLabel: `Move ${grp.name} left`,
      rightLabel: `Move ${grp.name} right`,
      removeLabel: `Remove ${grp.name}`,
      leftOff: off || index === 0,
      rightOff: off || index === day.groups.length - 1
    }));
  }

  get hasBlocks() {
    return this.blocks.length > 0;
  }
  get hasStations() {
    return this.stations.length > 0;
  }
  get blocksExpanded() {
    return String(this.blocksOpen);
  }
  get stationsExpanded() {
    return String(this.stationsOpen);
  }
  handleToggleBlocks() {
    this.blocksOpen = !this.blocksOpen;
  }
  handleToggleStations() {
    this.stationsOpen = !this.stationsOpen;
  }

  get isBlockForm() {
    return !!this.form && this.form.kind === "block";
  }
  get formTitle() {
    if (!this.form) {
      return "";
    }
    if (this.form.kind === "station") {
      return this.form.targetId ? `Rename ${this.form.was}` : "New station";
    }
    return this.form.targetId
      ? `Change ${this.form.was}`
      : `New ${this.t.sIn("TimeBlock")}`;
  }
  get formSaveLabel() {
    return this.form && this.form.targetId ? "Save" : "Add";
  }

  handleAddBlock() {
    this.form = { kind: "block", targetId: null, name: "", start: "", end: "" };
    this.focusAfter = '[data-id="form-name"]';
  }
  handleAddStation() {
    this.form = { kind: "station", targetId: null, name: "" };
    this.focusAfter = '[data-id="form-name"]';
  }
  handleChangeBlock(event) {
    const id = event.currentTarget.dataset.target;
    const block = this.day.blocks.find((b) => b.id === id);
    this.form = {
      kind: "block",
      targetId: id,
      was: block.name,
      name: block.name,
      start: block.startTime,
      end: block.endTime,
      back: `[data-id="change-block"][data-target="${id}"]`
    };
    this.focusAfter = '[data-id="form-name"]';
  }
  handleRenameStation(event) {
    const id = event.currentTarget.dataset.target;
    const station = this.day.groups.find((g) => g.id === id);
    this.form = {
      kind: "station",
      targetId: id,
      was: station.name,
      name: station.name,
      back: `[data-id="rename-station"][data-target="${id}"]`
    };
    this.focusAfter = '[data-id="form-name"]';
  }
  handleFormInput(event) {
    this.form = {
      ...this.form,
      [event.target.dataset.field]: event.target.value
    };
  }
  handleFormKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.handleFormCancel();
    } else if (
      event.key === "Enter" &&
      !this.busy &&
      event.target.tagName !== "LIGHTNING-BUTTON"
    ) {
      event.preventDefault();
      this.handleFormSave();
    }
  }
  handleFormCancel() {
    const back = this.formBack();
    this.form = null;
    this.focusAfter = back;
  }
  formBack() {
    if (this.form && this.form.back) {
      return this.form.back;
    }
    return this.form && this.form.kind === "station"
      ? '[data-id="add-station"]'
      : '[data-id="add-block"]';
  }
  async handleFormSave() {
    const form = this.form;
    if (!form) {
      return;
    }
    const back = this.formBack();
    const block = form.kind === "block";
    let action;
    if (block) {
      action = form.targetId ? "changeBlock" : "addBlock";
    } else {
      action = form.targetId ? "renameStation" : "addStation";
    }
    const name = (form.name || "").trim();
    const saved = await this.frame(
      {
        action,
        targetId: form.targetId,
        name,
        startTime: block ? form.start : null,
        endTime: block ? form.end : null
      },
      form.targetId
        ? `${name || form.was} saved`
        : `${name || (block ? `New ${this.t.sIn("TimeBlock")}` : "New station")} added`
    );
    if (saved) {
      this.form = null;
      this.focusAfter = back;
    }
  }

  handleMove(event) {
    const { target, action, direction } = event.currentTarget.dataset;
    const list = action === "moveBlock" ? this.day.blocks : this.day.groups;
    const item = list.find((x) => x.id === target);
    const other = direction === "1" ? "-1" : "1";
    const rename = action === "moveBlock" ? "change-block" : "rename-station";
    this.frame(
      { action, targetId: target, direction: Number(direction) },
      `${item.name} moved`
    ).then(() => {
      // Back to the button pressed; once the item is first or last that one is off, so its
      // other move button, then its Change or Rename.
      this.focusAfter = [
        `[data-action="${action}"][data-target="${target}"][data-direction="${direction}"]:not([disabled])`,
        `[data-action="${action}"][data-target="${target}"][data-direction="${other}"]:not([disabled])`,
        `[data-id="${rename}"][data-target="${target}"]`
      ];
    });
  }

  handleRemove(event) {
    const { target, action } = event.currentTarget.dataset;
    const isBlock = action === "removeBlock";
    const day = this.day;
    const index = (isBlock ? day.blocks : day.groups).findIndex(
      (x) => x.id === target
    );
    const item = (isBlock ? day.blocks : day.groups)[index];
    const filled = filledIn(
      day,
      isBlock ? { blockIndex: index } : { groupIndex: index }
    );
    // Back to the list's toggle; once the last one is gone so is the toggle, so its Add button.
    const back = isBlock
      ? ['[data-id="edit-blocks"]', '[data-id="add-block"]']
      : ['[data-id="edit-stations"]', '[data-id="add-station"]'];
    if (filled > 0) {
      // Desktop: "Remove block and its 3 cells?" before anything filled goes.
      this.ask = {
        action,
        targetId: target,
        heading: `Remove ${item.name}?`,
        lines: [
          `${filled} ${filled === 1 ? "cell" : "cells"} in it ${filled === 1 ? "goes" : "go"} with it. This can't be undone.`
        ],
        label: "Remove",
        said: `${item.name} removed`,
        back
      };
      return;
    }
    this.frame({ action, targetId: target }, `${item.name} removed`).then(
      () => {
        this.focusAfter = back;
      }
    );
  }

  async handleAnswer(event) {
    const ask = this.ask;
    this.ask = null;
    if (ask.action === "import") {
      await this.answerImport(ask, event.detail.yes);
      return;
    }
    if (event.detail.yes) {
      await this.frame(
        { action: ask.action, targetId: ask.targetId || null },
        ask.said
      );
    }
    this.focusAfter = ask.back;
  }

  /** One change to the frame, saved; the grid shows the plan as it now is. Resolves whether it saved. */
  async frame(change, said) {
    if (this.busy) {
      // A second click while the last change saves would send an old revision.
      return false;
    }
    if (this.editorBusy) {
      this.error = "One moment: a change is still being saved. Try again.";
      return false;
    }
    this.busy = true;
    this.error = null;
    try {
      const view = await changeFrame({
        itemId: this._itemId,
        revision: this.view.revision,
        change
      });
      this.view = { ...view, activities: this.activities };
      this.editorDraft = null;
      this.showInEditor(false);
      this.announce(said);
      this.markSaved();
      this.dispatchEvent(new CustomEvent("changed"));
      return true;
    } catch (e) {
      this.error = failed("That wasn't saved.", e);
      return false;
    } finally {
      this.busy = false;
    }
  }
}
