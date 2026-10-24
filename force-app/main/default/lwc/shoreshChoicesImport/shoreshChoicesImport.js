import { LightningElement, api } from "lwc";
import { loadScript } from "lightning/platformResourceLoader";
import SHEETJS from "@salesforce/resourceUrl/SheetJS";
import choicesSetup from "@salesforce/apex/ChoicesImportController.choicesSetup";
import checkChoices from "@salesforce/apex/ChoicesImportController.checkChoices";
import bringInChoices from "@salesforce/apex/ChoicesImportController.bringInChoices";
import {
  csvFile,
  foldName,
  isCsv,
  isReadable,
  workbookFile
} from "c/shoreshImportEngine";
import { readChoices } from "c/shoreshChoicesReader";
import { failed } from "c/shoreshErrors";
import { buildTerms } from "c/shoreshTerms";
import { FIELD } from "c/shoreshSchema";
import {
  allSettled,
  buildRequest,
  linkedByFold,
  cantTellApartRows,
  countLines,
  groupsOfProgram,
  keptCommentRows,
  notReadRows,
  proposalFor,
  readBacks,
  rememberedAnswers,
  shapeOf,
  sheetPreview,
  toCheckRows
} from "./review";

const STEPS = 3;
const SCHEDULE = FIELD.Schedule;

/**
 * Bring in choices (electives slice E6; ADR 0017): a camp's own choices sheet, read in the browser
 * (c/shoreshChoicesReader), reviewed on three cards, and saved as the director confirms it: the
 * campers, a Committed run for the elective set, week and schedule, and each camper's choices.
 *
 * 1 of 3: the sheet drawn with Shoresh's reading over its columns, and one or two campers read back
 *    in words. "That's right".
 * 2 of 3: only what needs a person: names Shoresh doesn't know (Same as, Add as an activity, Leave
 *    out; once per name), campers it can't tell apart, what it didn't read, what to check, and the
 *    comments kept with each camper.
 * 3 of 3: the count, what bringing in again keeps, and Bring in. Two campers with one name and no
 *    camper number refuse the sheet, as on the desktop (decision 53); so does a final run.
 *
 * The flow and words follow Shoresh desktop's choices-sheet import (AssignmentPanel.jsx,
 * ParseSummary.jsx); the look is Greg's approved mock-ups (design-research/electives-r1).
 */
export default class ShoreshChoicesImport extends LightningElement {
  @api terms;

  _setup;
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    const seasonBefore =
      this._setup && this._setup.season && this._setup.season.Id;
    this._setup = value;
    const season = value && value.season && value.season.Id;
    if (season && season !== seasonBefore) {
      this.startOver();
      this.loadSituation();
    }
  }

  // pick | reading | card | checking | saving | done
  phase = "pick";
  step = 1;
  error = null;
  status = "";
  dragging = false;
  situation = null;
  setId = null;
  weekId = null;
  scheduleId = null;
  fileName = null;
  fingerprint = null;
  file = null;
  reading = null;
  // The set's linked choices by name when the file was read (slice E8): a sheet may name one.
  linked = new Map();
  answers = {};
  check = null;
  done = null;
  // A selector that takes the cursor at the next render.
  focusAfter = null;
  sheetJsLoaded = false;

  /** The screen's heading takes the cursor when it opens (the page asks). */
  @api
  focusHeading() {
    const heading = this.template.querySelector("[data-heading]");
    if (heading) heading.focus();
  }

  renderedCallback() {
    if (!this.focusAfter) return;
    const target = this.template.querySelector(this.focusAfter);
    this.focusAfter = null;
    if (target && typeof target.focus === "function") target.focus();
  }

  /** The camp's words; the model's own until the page passes them. */
  get t() {
    return this.terms || buildTerms([]);
  }

  // ---------- the start: which set, week and schedule ----------

  async loadSituation() {
    const seasonId = this._setup && this._setup.season && this._setup.season.Id;
    if (!seasonId) return;
    try {
      const situation = await choicesSetup({ seasonId });
      if (!this._setup || this._setup.season.Id !== seasonId) return;
      this.situation = situation;
      const sets = situation.sets || [];
      if (!sets.some((s) => s.id === this.setId)) {
        this.setId = sets.length ? sets[0].id : null;
      }
      const weeks = this.weekOptions;
      if (!weeks.some((w) => w.value === this.weekId)) {
        this.weekId = weeks.length ? weeks[0].value : null;
      }
      this.pickSchedule();
    } catch (e) {
      this.error = failed("Couldn't open Bring in choices.", e);
    }
  }

  get isLoaded() {
    return !!this.situation;
  }
  get sets() {
    return (this.situation && this.situation.sets) || [];
  }
  get set() {
    return this.sets.find((s) => s.id === this.setId) || null;
  }
  get showsPickers() {
    return this.isLoaded && this.sets.length > 0;
  }
  get hasNoSets() {
    return this.isLoaded && this.sets.length === 0;
  }
  get setOptions() {
    return this.sets.map((s) => ({ label: s.name, value: s.id }));
  }
  get weekOptions() {
    return ((this._setup && this._setup.weeks) || []).map((w) => ({
      label: w.Name,
      value: w.Id
    }));
  }
  /** The week's working schedules (not saved versions), each named by its program and kind. */
  get scheduleOptions() {
    if (!this._setup || !this.weekId) return [];
    const programs = new Map(
      (this._setup.programs || []).map((p) => [p.program.Id, p.program.Name])
    );
    const many = programs.size > 1;
    return (this._setup.schedules || [])
      .filter(
        (s) =>
          s[SCHEDULE.Week] === this.weekId && s[SCHEDULE.Status] !== "Version"
      )
      .map((s) => {
        const kind =
          s[SCHEDULE.Origin] === "Generated"
            ? "Generated Schedule"
            : "Manual Build";
        const published =
          s[SCHEDULE.Status] === "Published" ? " · Published" : "";
        return {
          label: `${many ? `${programs.get(s[SCHEDULE.Program])} · ` : ""}${kind}${published}`,
          value: s.Id,
          programId: s[SCHEDULE.Program]
        };
      });
  }
  /** "Assign against:" is asked only when the week has more than one (desktop D2.7). */
  get asksSchedule() {
    return this.scheduleOptions.length > 1;
  }
  get hasNoSchedule() {
    return this.isLoaded && !!this.setId && this.scheduleOptions.length === 0;
  }
  get canChooseFile() {
    return this.isLoaded && !!this.setId && !!this.scheduleId;
  }
  get showsDrop() {
    return this.phase === "pick" && this.canChooseFile;
  }
  pickSchedule() {
    const options = this.scheduleOptions;
    if (!options.some((o) => o.value === this.scheduleId)) {
      this.scheduleId = options.length ? options[0].value : null;
    }
  }
  get programId() {
    const option = this.scheduleOptions.find(
      (o) => o.value === this.scheduleId
    );
    return option ? option.programId : null;
  }
  handleSet(event) {
    this.setId = event.detail.value;
  }
  handleWeek(event) {
    this.weekId = event.detail.value;
    this.pickSchedule();
  }
  handleSchedule(event) {
    this.scheduleId = event.detail.value;
  }

  // ---------- reading the file ----------

  handleChoose() {
    this.template.querySelector('input[data-id="file"]').click();
  }
  handleFileInput(event) {
    const chosen = event.target.files && event.target.files[0];
    event.target.value = null;
    this.readFile(chosen);
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
    const list = event.dataTransfer && event.dataTransfer.files;
    this.readFile(list && list[0]);
  }
  get dropClass() {
    return this.dragging ? "drop drop_over" : "drop";
  }

  async ensureSheetJs() {
    if (!this.sheetJsLoaded) {
      await loadScript(this, SHEETJS);
      this.sheetJsLoaded = true;
    }
    return window.XLSX;
  }

  /** SHA-256 of the file, so a run says which file it came from; none if the browser can't. */
  async fingerprintOf(bytes) {
    try {
      const subtle = window.crypto && window.crypto.subtle;
      if (!subtle) return null;
      const digest = await subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      return null;
    }
  }

  async readFile(chosen) {
    if (!chosen || !this.canChooseFile) return;
    if (!isReadable(chosen.name)) {
      this.error = `${chosen.name}: Shoresh reads Excel (.xlsx, .xls) and CSV files. Nothing was brought in.`;
      return;
    }
    this.error = null;
    this.phase = "reading";
    this.status = "Reading the file";
    try {
      const bytes = new Uint8Array(await chosen.arrayBuffer());
      const file = isCsv(chosen.name)
        ? csvFile(chosen.name, await chosen.text())
        : workbookFile(await this.ensureSheetJs(), chosen.name, bytes);
      const activities = this.activities;
      // A linked choice's name is what a sheet says to choose it (desktop ADR 2026-09-29 D6),
      // so it is a name Shoresh knows, never one to settle.
      const linked = linkedByFold(this._setup, this.setId);
      const reading = readChoices(file, {
        activities: [
          ...activities.map((a) => a.Name),
          ...[...linked.values()].map((l) => l.name)
        ]
      });
      if (reading.campers.length === 0 && reading.cantTellApart.length === 0) {
        this.phase = "pick";
        this.status = "";
        this.error = `${chosen.name}: no campers with choices found. Nothing was brought in.`;
        return;
      }
      this.fingerprint = await this.fingerprintOf(bytes);
      this.linked = linked;
      this.file = file;
      this.fileName = chosen.name;
      this.reading = reading;
      this.answers = rememberedAnswers(
        reading.newNames,
        this.situation.answers,
        activities
      );
      this.check = null;
      this.done = null;
      this.goTo(1);
    } catch (e) {
      this.phase = "pick";
      this.status = "";
      this.error = failed("That file could not be read.", e);
    }
  }

  get activities() {
    return (this._setup && this._setup.activities) || [];
  }

  // ---------- the cards ----------

  get isPick() {
    return this.phase === "pick" || this.phase === "reading";
  }
  get isReading() {
    return this.phase === "reading";
  }
  get isCards() {
    return (
      this.phase === "card" ||
      this.phase === "checking" ||
      this.phase === "saving"
    );
  }
  get isDone() {
    return this.phase === "done";
  }
  get isBusy() {
    return this.phase === "checking" || this.phase === "saving";
  }
  get isStep1() {
    return this.isCards && this.step === 1;
  }
  get isStep2() {
    return this.isCards && this.step === 2;
  }
  get isStep3() {
    return this.isCards && this.step === 3;
  }
  get stepText() {
    return `${this.step} of ${STEPS}`;
  }
  get noBack() {
    return this.isBusy || this.step === 1;
  }
  get noForward() {
    return this.isBusy || this.step === STEPS || !this.canGoOn;
  }

  /** Card 1 */
  get shape() {
    return this.reading ? shapeOf(this.reading) : "";
  }
  get preview() {
    return this.reading ? sheetPreview(this.file, this.reading, this.t) : null;
  }
  get readBackRows() {
    return this.reading ? readBacks(this.reading) : [];
  }

  /** Card 2 */
  get groups() {
    return groupsOfProgram(this._setup, this.programId);
  }
  get settleRows() {
    if (!this.reading) return [];
    const options = this.activities.map((a) => ({
      label: a.Name,
      value: a.Id
    }));
    const camperWord = (n) => {
      return n === 1 ? this.t.sIn("Camper") : this.t.pIn("Camper");
    };
    return this.reading.newNames.map((item) => {
      const key = foldName(item.name);
      const answer = this.answers[key] || null;
      const proposal = proposalFor(item.name, this.activities);
      const sameId =
        answer && answer.kind === "same" ? answer.activityId : null;
      const pressed = (kind, id) =>
        String(
          !!answer && answer.kind === kind && (!id || answer.activityId === id)
        );
      return {
        key,
        name: item.name,
        count: `${item.campers} ${camperWord(item.campers)}`,
        className: answer
          ? "row shoresh-raised"
          : "row row_look shoresh-raised",
        unsettled: !answer,
        remembered: !!(answer && answer.remembered),
        proposal,
        proposalLabel: proposal ? `Same as ${proposal.name}` : null,
        proposalPressed: proposal ? pressed("same", proposal.id) : "false",
        proposalClass:
          proposal && pressed("same", proposal.id) === "true"
            ? "shoresh-item choice shoresh-raised"
            : "shoresh-item choice",
        sameValue:
          sameId && (!proposal || sameId !== proposal.id) ? sameId : null,
        sameLabel: `Same as, for ${item.name}`,
        options,
        hasOptions: options.length > 0,
        addPressed: pressed("add"),
        addClass:
          pressed("add") === "true"
            ? "shoresh-item choice shoresh-raised"
            : "shoresh-item choice",
        addLabel: `Add ${item.name} as an activity`,
        leavePressed: pressed("leave"),
        leaveClass:
          pressed("leave") === "true"
            ? "shoresh-item choice shoresh-raised"
            : "shoresh-item choice",
        leaveLabel: `Leave out ${item.name}`
      };
    });
  }
  get hasSettle() {
    return this.settleRows.length > 0;
  }
  get settleCount() {
    return this.settleRows.length;
  }
  get apartRows() {
    return this.reading ? cantTellApartRows(this.reading) : [];
  }
  get hasApart() {
    return this.apartRows.length > 0;
  }
  get notReadList() {
    return this.reading ? notReadRows(this.reading, this.groups, this.t) : [];
  }
  get hasNotRead() {
    return this.notReadList.length > 0;
  }
  get checkList() {
    return this.reading ? toCheckRows(this.reading, this.t) : [];
  }
  get checkCount() {
    return this.checkList.length;
  }
  get notReadCount() {
    return this.notReadList.length;
  }
  get keptCount() {
    return this.keptList.length;
  }
  get hasCheck() {
    return this.checkList.length > 0;
  }
  get keptList() {
    return this.reading ? keptCommentRows(this.reading) : [];
  }
  get hasKept() {
    return this.keptList.length > 0;
  }
  get nothingOnCard2() {
    return !(
      this.hasSettle ||
      this.hasApart ||
      this.hasNotRead ||
      this.hasCheck ||
      this.hasKept
    );
  }

  answer(key, value) {
    this.answers = { ...this.answers, [key]: value };
    this.check = null;
  }
  handleProposal(event) {
    const { key, activity } = event.currentTarget.dataset;
    this.answer(key, { kind: "same", activityId: activity });
  }
  handleSameAs(event) {
    const key = event.currentTarget.dataset.key;
    this.answer(key, { kind: "same", activityId: event.detail.value });
  }
  handleAdd(event) {
    this.answer(event.currentTarget.dataset.key, { kind: "add" });
  }
  handleLeave(event) {
    this.answer(event.currentTarget.dataset.key, { kind: "leave" });
  }

  /** Card 3 */
  get refused() {
    return this.hasApart;
  }
  get apartCount() {
    return this.reading ? this.reading.cantTellApart.length : 0;
  }
  get refusalLines() {
    return this.apartRows.map((row) => ({
      key: row.key,
      text: `${row.name}: ${row.where}. ${row.why}`
    }));
  }
  get isFinal() {
    return !!(this.check && this.check.isFinal);
  }
  get request() {
    if (!this.reading) return null;
    return buildRequest({
      reading: this.reading,
      activities: this.activities,
      linked: this.linked,
      answers: this.answers,
      groups: this.groups,
      place: {
        seasonId: this._setup.season.Id,
        setId: this.setId,
        weekId: this.weekId,
        scheduleId: this.scheduleId
      },
      fileName: this.fileName,
      fingerprint: this.fingerprint,
      runRevision: this.check ? this.check.runRevision : null
    });
  }
  get lines() {
    if (!this.check || !this.reading) return [];
    const request = this.request;
    if (!request) return [];
    return countLines({
      request,
      check: this.check,
      set: this.set,
      t: this.t,
      activities: this.activities
    }).map((line) => ({
      ...line,
      className: line.look ? "line line_look" : "line"
    }));
  }
  get canGoOn() {
    if (this.step === 2) {
      return this.reading && allSettled(this.reading.newNames, this.answers);
    }
    return true;
  }

  // ---------- the rail's buttons ----------

  get primaryLabel() {
    if (this.step === 1) return "That's right";
    if (this.step === 2) return "Next";
    return "Bring in";
  }
  get showsPrimary() {
    if (!this.isCards) return false;
    if (this.step < STEPS) return true;
    return !!this.check && !this.refused && !this.isFinal;
  }
  get primaryDisabled() {
    return this.isBusy || !this.canGoOn;
  }

  handlePrimary() {
    if (this.step < STEPS) {
      this.goTo(this.step + 1);
    } else {
      this.save();
    }
  }
  handleBack() {
    if (this.step > 1) this.goTo(this.step - 1);
  }
  handleForward() {
    if (this.step < STEPS && this.canGoOn) this.goTo(this.step + 1);
  }
  handleCancel() {
    this.startOver();
    this.status = "Nothing was brought in.";
    this.focusAfter = '[data-id="choose"]';
  }
  handleAnother() {
    this.startOver();
    this.focusAfter = '[data-id="choose"]';
  }

  startOver() {
    this.phase = "pick";
    this.step = 1;
    this.file = null;
    this.reading = null;
    this.answers = {};
    this.check = null;
    this.done = null;
    this.fileName = null;
    this.fingerprint = null;
    this.error = null;
  }

  goTo(step) {
    this.step = step;
    this.phase = "card";
    this.error = null;
    this.status = `${step} of ${STEPS}`;
    this.focusAfter = `[data-card="${step}"]`;
    if (step === STEPS) {
      this.runCheck();
    }
  }

  /** What bringing the sheet in would do (the count, hand changes kept), asked of the server. */
  async runCheck() {
    if (this.refused) return;
    const request = this.request;
    if (!request) return;
    this.phase = "checking";
    try {
      this.check = await checkChoices({ request: JSON.stringify(request) });
      this.phase = "card";
      this.status = this.check.isFinal
        ? "This run is final."
        : "Ready to bring in.";
    } catch (e) {
      this.phase = "card";
      this.error = failed("Couldn't count what this sheet brings in.", e);
    }
  }

  async save() {
    const request = this.request;
    if (!request || this.refused || this.isFinal) return;
    this.phase = "saving";
    this.status = "Bringing in";
    try {
      this.done = await bringInChoices({ request: JSON.stringify(request) });
      this.phase = "done";
      this.status = this.doneText;
      this.focusAfter = '[data-id="done"]';
      // An activity added here is in the season now: Camp Setup reads it again, so the
      // Activities screen, the "Same as" lists and the next sheet all know it.
      this.dispatchEvent(new CustomEvent("seasonchanged"));
      await this.loadSituation();
    } catch (e) {
      this.phase = "card";
      this.error = failed("Nothing was brought in.", e);
    }
  }

  get doneText() {
    if (!this.done) return "";
    const n = this.done.campers;
    return `Brought in ${n} ${n === 1 ? this.t.sIn("Camper") : this.t.pIn("Camper")} to "${this.done.runName}".`;
  }
  get doneLines() {
    if (!this.done) return [];
    const lines = [];
    lines.push({ key: "new", text: `${this.done.added} new` });
    if (this.done.handKept) {
      lines.push({
        key: "hand",
        text: `${this.done.handKept} changed by hand: kept`
      });
    }
    if (this.done.activitiesAdded) {
      lines.push({
        key: "added",
        text: `${this.done.activitiesAdded} added as ${this.done.activitiesAdded === 1 ? this.t.sIn("Activity") : this.t.pIn("Activity")}`
      });
    }
    return lines;
  }

  get bunkWord() {
    return this.t.s("Group");
  }
  get setWord() {
    return this.t.s("ElectiveSet");
  }
  get weekWord() {
    return this.t.s("Week");
  }
  get noSetsText() {
    return `No ${this.t.pIn("ElectiveSet")} yet`;
  }
  get noScheduleText() {
    return `No schedule for this ${this.t.sIn("Week")} yet`;
  }
  get statusText() {
    return this.status;
  }
}
