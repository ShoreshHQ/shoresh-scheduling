import { LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetupInCamp";
import saveRecords from "@salesforce/apex/SeasonSetupController.saveRecords";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import addWeeksFromSeasonDates from "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates";
import saveRow from "@salesforce/apex/SetupTablesController.saveRow";
import placedInWeeks from "@salesforce/apex/RunsInController.placedInWeeks";
import saveActivityDetails from "@salesforce/apex/ActivitiesController.saveActivityDetails";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import { undoMessage } from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import {
  menuMarks,
  rainPlanChoices,
  rainPlanOptions,
  setupProblems,
  turnOffQuestion
} from "c/shoreshSetupRules";
import { failed } from "c/shoreshErrors";
import { canOpen, menuSections, screenLabels } from "c/shoreshScreens";
import { FIELD, OBJECT, PARENT } from "c/shoreshSchema";

// Names as the package has them (c/shoreshSchema).
const SEASON = FIELD.Season;
const WEEK = FIELD.Week;
const LOCATION = FIELD.Location;
const ACTIVITY = FIELD.Activity;
// The season forms' inputs (their data-field) and the season fields they hold.
const SEASON_INPUTS = {
  name: "Name",
  start: SEASON.StartDate,
  end: SEASON.EndDate,
  status: SEASON.Status
};

const SCREENS = [
  "roots",
  "weeks",
  "programs",
  "divisions",
  "groups",
  "timeBlocks",
  "locations",
  "campWords",
  "activities",
  "fixedActivities",
  "recurringActivities",
  "manualBuild",
  "schedules",
  "import"
];

/** The element with focus, looking inside components (their shadow roots). */
function focusedElement() {
  let element = document.activeElement;
  while (element && element.shadowRoot && element.shadowRoot.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

const STATUS_OPTIONS = [
  { label: "Planning", value: "Planning" },
  { label: "Active", value: "Active" },
  { label: "Finished", value: "Finished" }
];

/**
 * The Shoresh page: a director picks (or starts) a season, then moves between screens with the
 * left-hand menu (desktop-style): Roots, the home, and one screen each for weeks, programs,
 * divisions, groups, time blocks, locations, camp words, activities, fixed activities, and
 * recurring activities, and the schedule page (Schedules). A season can also be
 * copied to start a new one. Every model term is shown in the camp's own words.
 *
 * Every screen stays on the page while another is shown, so typing that is not saved yet is still
 * there when the director comes back to it.
 */
export default class ShoreshCampSetup extends LightningElement {
  camps = [];
  campId;
  seasons = [];
  seasonId;
  setup;
  termLabels = [];
  mode = "loading"; // loading | noCamp | screens | newSeason | copy
  screen = "roots";
  busy = false;
  error;
  // A question before saving (c-shoresh-ask): { heading, lines, confirmLabel }.
  ask;

  // Forms
  newCamp = { Name: "" };
  newSeason = {};
  seasonForm = {};
  seasonChanged = false;
  seasonSubmitted = false;
  // Which location type the Locations table shows; "all" shows every location.
  locationFilter = "all";
  // Table rows are saved one at a time across the whole page, in the order they were left.
  rowSaves = Promise.resolve();
  // Each read of the season is numbered; an answer older than the latest read is dropped.
  loadTicket = 0;
  /**
   * Asked before a week is unticked on a saved row: ({ recordId, name, weekId, weekName }) ->
   * Promise<boolean>. The desktop's "Turn off … for Week 3?" when it is placed that week; false
   * puts the tick back and saves nothing.
   */
  beforeWeekOff = ({ recordId, weekId }) =>
    this.turnOffAnyway(
      [{ target: recordId, week: weekId }],
      "Not turned off. The week is ticked again."
    );

  connectedCallback() {
    this.loadCamps();
  }

  // ---------- loading ----------

  async loadCamps(selectCampId) {
    try {
      this.camps = await getCamps();
      if (this.camps.length === 0) {
        this.mode = "noCamp";
        return;
      }
      const keep = selectCampId || this.campId;
      this.campId = this.camps.some((c) => c.Id === keep)
        ? keep
        : this.camps[0].Id;
      await this.loadCamp();
    } catch (e) {
      this.showError(e, "Couldn't open the camp setup. Nothing was changed.");
    }
  }

  async loadCamp(selectSeasonId) {
    this.termLabels = await getLabels({ campId: this.campId });
    this.seasons = await getSeasons({ campId: this.campId });
    const keep = selectSeasonId || this.seasonId;
    this.seasonId = this.seasons.some((s) => s.Id === keep)
      ? keep
      : this.seasons.length
        ? this.seasons[0].Id
        : null;
    this.mode = this.seasonId ? "screens" : "newSeason";
    if (this.mode === "newSeason") {
      this.newSeason = {};
    }
    await this.loadSeason();
  }

  async loadSeason() {
    if (!this.seasonId) {
      // No season: any read still on its way is out of date.
      this.loadTicket += 1;
      this.setup = null;
      return;
    }
    if (this.setup && this.setup.season.Id !== this.seasonId) {
      // Another season: start its tables fresh rather than carrying unsaved rows across.
      this.setup = null;
    }
    const ticket = ++this.loadTicket;
    const setup = await getSeasonSetup({
      campId: this.campId,
      seasonId: this.seasonId
    });
    if (ticket !== this.loadTicket) {
      // A newer read is on its way: this answer would show older data over it.
      return;
    }
    // Keep typed but unsaved season details when something else was saved.
    const keepForm =
      this.seasonChanged &&
      !this.seasonSubmitted &&
      this.seasonForm.Id === setup.season.Id;
    this.setup = setup;
    this.termLabels = setup.labels;
    if (!keepForm) {
      this.seasonForm = { ...setup.season };
      this.seasonChanged = false;
      this.seasonSubmitted = false;
    }
  }

  // ---------- what the template shows ----------

  get terms() {
    return buildTerms(this.termLabels);
  }

  get isLoading() {
    return this.mode === "loading";
  }
  get isNoCamp() {
    return this.mode === "noCamp";
  }
  get isNewSeason() {
    return this.mode === "newSeason";
  }
  get isCopy() {
    return this.mode === "copy" && !!this.setup;
  }

  // ---------- menu and screens ----------

  get menu() {
    return menuSections(this.terms, !!this.setup, menuMarks(this.setup));
  }
  get currentScreen() {
    return this.mode === "screens" ? this.screen : null;
  }
  /** Each screen's class: shown, or hidden (kept on the page with its unsaved typing). */
  get shown() {
    const result = {};
    SCREENS.forEach((screen) => {
      result[screen] = screen === this.currentScreen ? "" : "slds-hide";
    });
    return result;
  }
  /** One camp words editor per camp: choosing another camp starts it afresh. */
  get campKeys() {
    return this.campId ? [this.campId] : [];
  }
  handleNavigate(event) {
    const screen = event.detail.screen;
    if (!canOpen(screen, !!this.setup)) {
      return;
    }
    this.screen = screen;
    this.mode = "screens";
    // A message about another screen's save does not belong on this one.
    this.error = null;
  }
  get hasCamp() {
    return !!this.campId && !this.isNoCamp && !this.isLoading;
  }
  get hasSeveralCamps() {
    return this.camps.length > 1;
  }
  get hasSeasons() {
    return this.seasons.length > 0;
  }
  get campName() {
    const camp = this.camps.find((c) => c.Id === this.campId);
    return camp ? camp.Name : "";
  }
  get campOptions() {
    return this.camps.map((c) => ({ label: c.Name, value: c.Id }));
  }
  get seasonOptions() {
    return this.seasons.map((s) => ({ label: s.Name, value: s.Id }));
  }
  get statusOptions() {
    return STATUS_OPTIONS;
  }
  get problems() {
    return setupProblems(this.setup, this.terms);
  }
  /** What needs attention on the screen shown (Roots lists everything in its own way). */
  get screenProblems() {
    return this.problems
      .filter((problem) => problem.screen === this.currentScreen)
      .map((problem) => ({ ...problem, actions: problem.actions || [] }));
  }

  /** A fix offered on an attention item (a changed fixed or recurring activity): saves it. */
  async handleProblemAction(event) {
    const { problem, action } = event.currentTarget.dataset;
    const found = this.problems.find((p) => p.key === problem);
    const chosen = found.actions.find((a) => a.key === action);
    await this.saveAndReload(
      () => saveRecords({ records: [chosen.record] }),
      null,
      this.notSaved([chosen.record])
    );
  }
  get hasScreenProblems() {
    return this.screenProblems.length > 0;
  }
  get hasNoWeeks() {
    return this.setup && this.setup.weeks.length === 0;
  }
  get seasonSaveDisabled() {
    return this.busy || !this.seasonChanged;
  }
  /** Object and field names for the template's tables, as the package has them. */
  get objects() {
    return OBJECT;
  }

  get locationTypeField() {
    return LOCATION.LocationType;
  }

  /** The season forms' dates and status, by the season's fields. */
  get newSeasonStart() {
    return this.newSeason[SEASON.StartDate];
  }

  get newSeasonEnd() {
    return this.newSeason[SEASON.EndDate];
  }

  get seasonStart() {
    return this.seasonForm[SEASON.StartDate];
  }

  get seasonEnd() {
    return this.seasonForm[SEASON.EndDate];
  }

  get seasonStatus() {
    return this.seasonForm[SEASON.Status];
  }

  get copiedFromName() {
    const season = this.setup && this.setup.season;
    const from = season && season[PARENT.Season.CopiedFrom];
    return from ? from.Name : null;
  }
  get weekColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: WEEK.StartDate,
        label: "Start date",
        type: "date",
        required: true
      },
      {
        fieldName: WEEK.EndDate,
        label: "End date",
        type: "date",
        required: true
      }
    ];
  }
  get weekDefaults() {
    return { [WEEK.Season]: this.seasonId };
  }
  get programs() {
    return ((this.setup && this.setup.programs) || []).map((entry) => ({
      key: entry.program.Id,
      entry
    }));
  }
  get hasNoPrograms() {
    return this.programs.length === 0;
  }

  get locationTypeColumns() {
    return [{ fieldName: "Name", label: "Name", type: "text", required: true }];
  }
  get locationTypeDefaults() {
    return { [FIELD.LocationType.Season]: this.seasonId };
  }
  get locationColumns() {
    const t = this.terms;
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: LOCATION.LocationType,
        label: t.s("LocationType"),
        type: "picklist",
        options: [
          { label: "None", value: "" },
          ...((this.setup && this.setup.locationTypes) || []).map((type) => ({
            label: type.Name,
            value: type.Id
          }))
        ]
      },
      {
        fieldName: LOCATION.GroupsThatFit,
        label: t.s("GroupsThatFit"),
        type: "number",
        min: 1,
        required: true
      },
      { fieldName: LOCATION.Notes, label: "Notes", type: "text" }
    ];
  }
  get hasLocationTypes() {
    return ((this.setup && this.setup.locationTypes) || []).length > 0;
  }
  get locationFilterOptions() {
    const t = this.terms;
    return [
      { label: `All ${t.pIn("LocationType")}`, value: "all" },
      ...((this.setup && this.setup.locationTypes) || []).map((type) => ({
        label: type.Name,
        value: type.Id
      })),
      { label: `No ${t.sIn("LocationType")}`, value: "" }
    ];
  }
  get locationFilterValue() {
    // A type deleted (or another season loaded) since it was chosen: show everything.
    const known = this.locationFilterOptions.some(
      (option) => option.value === this.locationFilter
    );
    return known ? this.locationFilter : "all";
  }
  get locationTableFilter() {
    return this.locationFilterValue === "all"
      ? undefined
      : this.locationFilterValue;
  }
  handleLocationFilter(event) {
    this.locationFilter = event.detail.value;
  }
  get locationDefaults() {
    return {
      [LOCATION.Season]: this.seasonId,
      [LOCATION.GroupsThatFit]: 1
    };
  }
  get activityColumns() {
    const t = this.terms;
    const none = { label: "None", value: "" };
    const activities = (this.setup && this.setup.activities) || [];
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: ACTIVITY.Location,
        label: t.s("Location"),
        type: "picklist",
        options: [
          none,
          ...((this.setup && this.setup.locations) || []).map((l) => ({
            label: l.Name,
            value: l.Id
          }))
        ]
      },
      {
        fieldName: ACTIVITY.Length,
        label: t.s("Length"),
        type: "number",
        min: 1,
        required: true
      },
      {
        fieldName: ACTIVITY.TimesPerWeekMin,
        label: `${t.s("TimesPerWeek")}: at least`,
        type: "number",
        min: 0,
        required: true
      },
      {
        fieldName: ACTIVITY.TimesPerWeekMax,
        label: `${t.s("TimesPerWeek")}: at most`,
        type: "number",
        min: 0
      },
      {
        fieldName: ACTIVITY.NoWeeklyMax,
        label: "No weekly maximum",
        type: "checkbox"
      },
      {
        fieldName: ACTIVITY.Priority,
        label: "Priority",
        type: "picklist",
        options: [
          { label: "High", value: "High" },
          { label: "Low", value: "Low" }
        ]
      },
      { fieldName: ACTIVITY.Outdoor, label: "Outdoors", type: "checkbox" },
      {
        fieldName: ACTIVITY.RainPlan,
        label: t.s("RainPlan"),
        type: "picklist",
        excludeSelf: true,
        options: [none, ...rainPlanOptions(activities)],
        // Only the activity holding an outdoor rain plan shows it (desktop :339-341).
        optionsFor: (saved) => [
          none,
          ...rainPlanChoices(activities, saved[ACTIVITY.RainPlan])
        ]
      },
      {
        fieldName: ACTIVITY.GroupsAtOnce,
        label: t.s("GroupsAtOnce"),
        type: "number",
        min: 1
      },
      {
        fieldName: ACTIVITY.NoGroupLimit,
        label: "No limit",
        type: "checkbox"
      }
    ];
  }
  get activityDefaults() {
    // Defaults for an activity added by hand (Greg, 2026-10-16); import never uses these.
    return {
      [ACTIVITY.Season]: this.seasonId,
      [ACTIVITY.Length]: 1,
      [ACTIVITY.TimesPerWeekMin]: 1,
      [ACTIVITY.TimesPerWeekMax]: 1,
      [ACTIVITY.Priority]: "Low",
      [ACTIVITY.Outdoor]: false,
      [ACTIVITY.GroupsAtOnce]: 1,
      [ACTIVITY.NoWeeklyMax]: false,
      [ACTIVITY.NoGroupLimit]: false
    };
  }

  get labels() {
    const t = this.terms;
    const screens = screenLabels(t);
    return {
      screens,
      camp: "Camp",
      season: t.s("Season"),
      newSeason: `New ${t.sIn("Season")}`,
      copySeason: `Copy this ${t.sIn("Season")}`,
      seasonName: `${t.s("Season")} name`,
      saveSeason: `Save ${t.sIn("Season")}`,
      deleteSeason: `Delete ${t.sIn("Season")}`,
      createSeason: `Create ${t.sIn("Season")}`,
      newSeasonTitle: `Start a new ${t.sIn("Season")}`,
      newSeasonHint: this.hasSeasons
        ? `Or go back and use "Copy this ${t.sIn("Season")}" to start from an earlier one.`
        : `Give it a name and its first and last days. You can add ${t.pIn("Week")} and ${t.pIn("Program")} next.`,
      problems: "Needs attention",
      seasonDates: `${t.s("Season")} dates`,
      addWeek: `Add ${t.s("Week")}`,
      noWeeks: `No ${t.pIn("Week")} yet`,
      overlapsWeek: `Overlaps another ${t.sIn("Week")}`,
      fillWeeks: `Fill in ${t.pIn("Week")} from the ${t.sIn("Season")} dates`,
      addProgram: `Add ${t.s("Program")}`,
      noPrograms: `No ${t.pIn("Program")} yet`,
      copiedFrom: `Copied from "${this.copiedFromName}".`,
      locationTypes: t.p("LocationType"),
      addLocationType: `Add ${t.s("LocationType")}`,
      noLocationTypes: `No ${t.pIn("LocationType")} yet`,
      addLocation: `Add ${t.s("Location")}`,
      noLocations: `No ${t.pIn("Location")} yet`,
      catalogue: `${t.s("Activity")} catalogue`,
      addActivity: `Add ${t.s("Activity")}`,
      noActivities: `No ${t.pIn("Activity")} yet`
    };
  }

  // ---------- camp ----------

  handleNewCampName(event) {
    this.newCamp = { ...this.newCamp, Name: event.detail.value };
  }

  async handleCreateCamp() {
    const input = this.template.querySelector(
      'lightning-input[data-id="camp-name"]'
    );
    if (input && !input.reportValidity()) {
      return;
    }
    await this.run(async () => {
      const [campId] = await saveRecords({
        records: [{ sobjectType: OBJECT.Camp, Name: this.newCamp.Name }]
      });
      this.changedOnServer = true;
      await this.loadCamps(campId);
    }, "Camp not created. Nothing was saved.");
  }

  async handleCampChange(event) {
    this.campId = event.detail.value;
    this.seasonId = null;
    await this.run(() => this.loadCamp(), this.openFailed);
  }

  async handleLabelsSaved() {
    this.toast("Saved. Shoresh screens now use your camp words.");
    await this.run(() => this.loadCamp(), this.openFailed);
    // Stay on camp words, even before there is a season.
    this.screen = "campWords";
    this.mode = "screens";
  }

  // ---------- season ----------

  async handleSeasonChange(event) {
    this.seasonId = event.detail.value;
    this.mode = "screens";
    await this.run(() => this.loadSeason(), this.openFailed);
  }

  handleSeasonField(event) {
    const field = SEASON_INPUTS[event.target.dataset.field];
    if (!field) {
      return;
    }
    this.seasonForm = { ...this.seasonForm, [field]: event.detail.value };
    this.seasonChanged = true;
  }

  async handleSaveSeason() {
    if (!this.validInputs('[data-form="season"]')) {
      return;
    }
    const f = this.seasonForm;
    this.seasonSubmitted = true;
    const records = [
      {
        sobjectType: OBJECT.Season,
        Id: f.Id,
        Name: f.Name,
        [SEASON.StartDate]: f[SEASON.StartDate],
        [SEASON.EndDate]: f[SEASON.EndDate],
        [SEASON.Status]: f[SEASON.Status]
      }
    ];
    await this.saveAndReload(
      () => saveRecords({ records }),
      () => {
        this.seasonSubmitted = false;
      },
      `${this.terms.s("Season")} not saved. Your changes are still here.`
    );
  }

  async handleDeleteSeason() {
    const t = this.terms;
    const ok = await LightningConfirm.open({
      label: `Delete ${t.sIn("Season")}`,
      message:
        `Delete "${this.setup.season.Name}" and everything set up in it (${t.pIn("Week")}, ${t.pIn("Program")}, ` +
        `${t.pIn("Division")}, ${t.pIn("Group")}, ${t.pIn("TimeBlock")}, ${t.pIn("Location")}, ${t.pIn("Activity")}, ` +
        `${t.pIn("FixedActivity")}, ${t.pIn("RecurringActivity")}, and saved schedules)? ` +
        `This cannot be undone.`,
      variant: "header",
      theme: "error"
    });
    if (!ok) {
      return;
    }
    await this.run(async () => {
      await deleteRecord({ recordId: this.seasonId });
      this.changedOnServer = true;
      this.toast(`Deleted "${this.setup.season.Name}".`);
      this.seasonId = null;
      this.screen = "roots";
      await this.loadCamp();
    }, `"${this.setup.season.Name}" not deleted. Nothing was removed.`);
  }

  handleStartNewSeason() {
    this.newSeason = {};
    this.mode = "newSeason";
  }

  handleNewSeasonField(event) {
    const field = SEASON_INPUTS[event.target.dataset.field];
    if (!field) {
      return;
    }
    this.newSeason = { ...this.newSeason, [field]: event.detail.value };
  }

  async handleCreateSeason() {
    if (!this.validInputs('[data-form="new-season"]')) {
      return;
    }
    await this.run(
      async () => {
        const [seasonId] = await saveRecords({
          records: [
            {
              sobjectType: OBJECT.Season,
              [SEASON.Camp]: this.campId,
              [SEASON.Status]: "Planning",
              ...this.newSeason
            }
          ]
        });
        this.changedOnServer = true;
        this.screen = "roots";
        await this.loadCamp(seasonId);
      },
      `${this.terms.s("Season")} not created. Nothing was saved.`
    );
  }

  handleCancelNewSeason() {
    this.mode = this.seasonId ? "screens" : "newSeason";
  }

  // ---------- copy ----------

  handleStartCopy() {
    this.mode = "copy";
  }

  async handleCopied(event) {
    this.toast(
      `Copied. You are now looking at the new ${this.terms.sIn("Season")}.`
    );
    this.mode = "screens";
    this.screen = "roots";
    await this.run(() => this.loadCamp(event.detail.seasonId), this.openFailed);
  }

  /** After an import is saved: the season again, with what it added (the summary stays up). */
  async handleImported() {
    await this.run(async () => {
      await this.loadSeason();
      this.seasons = await getSeasons({ campId: this.campId });
    }, this.openFailed);
  }

  /** Roots' Undo last import, confirmed first (desktop wording). */
  async handleUndoImport(event) {
    const { importId, files } = event.detail;
    const ok = await LightningConfirm.open({
      label: `Undo the import of ${files || "the last file"}?`,
      message:
        "What this import added is removed, and what it changed goes back to how it was. Anything you have edited since the import stays as it is.",
      variant: "header",
      theme: "warning"
    });
    if (!ok) {
      return;
    }
    await this.run(async () => {
      const result = await undoImport({ importId });
      this.changedOnServer = true;
      this.toast(undoMessage(result));
      await this.loadSeason();
    }, "That import could not be undone. Nothing was changed.");
  }

  handleImportClosed() {
    this.screen = "roots";
  }

  handleCancelCopy() {
    this.mode = "screens";
  }

  // ---------- weeks, programs, and everything inside ----------

  async handleFillWeeks() {
    await this.run(
      async () => {
        await addWeeksFromSeasonDates({ seasonId: this.seasonId });
        this.changedOnServer = true;
        await this.loadSeason();
      },
      `${this.terms.p("Week")} not added. Nothing was saved.`
    );
  }

  async handleAddProgram() {
    const count = this.programs.length;
    const records = [
      {
        sobjectType: OBJECT.Program,
        [FIELD.Program.Season]: this.seasonId,
        Name: count ? `${this.terms.s("Program")} ${count + 1}` : "Main",
        [FIELD.Program.SortOrder]: count + 1
      }
    ];
    await this.saveAndReload(
      () => saveRecords({ records }),
      null,
      `${this.terms.s("Program")} not added. Nothing was saved.`
    );
  }

  async handleSaveActivityDetails(event) {
    const { rules, whoCanDoIt, onFailure } = event.detail;
    let saved = false;
    await this.run(
      async () => {
        await saveActivityDetails({ rules, whoCanDoIt });
        this.changedOnServer = true;
        saved = true;
        this.toast("Saved.");
        await this.loadSeason();
      },
      `${this.terms.s("Activity")} details not saved. Your changes are still here.`
    );
    if (!saved && onFailure) {
      onFailure();
    }
  }

  /**
   * A save from a table (one row, as the director leaves it: SetupTablesController.saveRow,
   * ADR 0011) or from a program's own form (its records).
   */
  async handleSaveRecords(event) {
    const detail = event.detail;
    if (detail.record) {
      await this.saveTableRow(detail);
      return;
    }
    await this.saveAndReload(
      () => saveRecords({ records: detail.records }),
      detail.onFailure,
      this.notSaved(detail.records)
    );
  }

  /**
   * One table row. Rows from every table on the page wait their turn, so two tables never save
   * at once. The table hears what happened (saved, or what someone else changed), then the
   * season is read again, and only then may the next row go. A row save doesn't make the page
   * busy: buttons stay as they are, so a click that moved focus out of a row still lands.
   */
  saveTableRow(detail) {
    // A step that fails in a way no one expected is shown, and the rows after it still go.
    this.rowSaves = this.rowSaves
      .then(() => this.saveOneRow(detail))
      .catch((e) => this.showError(e));
    return this.rowSaves;
  }

  async saveOneRow(detail) {
    const { record, seen, extras, seenWho, onSaved, onFailure, onDone } =
      detail;
    let answered = false;
    this.error = null;
    try {
      const result = await saveRow({
        record,
        seen,
        extras: { ...extras, seenWho }
      });
      answered = true;
      onSaved(result);
      await this.loadSeason();
    } catch (e) {
      // What didn't happen, then why; a row saved whose screen didn't refresh says so.
      this.showError(
        e,
        answered ? this.refreshFailed : this.notSaved([record])
      );
    }
    try {
      if (!answered) {
        onFailure();
      }
    } finally {
      // Always: the table may only send its next row once this one is done.
      onDone();
    }
  }

  /**
   * Turning a bunk, activity, or location off for a week it is already placed in asks first
   * (Shoresh desktop ExclusionConfirmDialog.jsx, its words in the camp's). With nothing placed it
   * just switches off. True to go ahead.
   */
  async turnOffAnyway(weeksOff, failedWhat = this.notSaved()) {
    const asks = (weeksOff || [])
      .filter((off) => off.target)
      .map(({ target, week }) => ({ target, week }));
    if (!asks.length) {
      return true;
    }
    let placed = [];
    this.busy = true;
    try {
      placed = await placedInWeeks({ weeksOff: asks });
    } catch (e) {
      this.showError(e, failedWhat);
      return false;
    } finally {
      this.busy = false;
    }
    if (!placed.length) {
      return true;
    }
    return this.askFirst(turnOffQuestion(placed, this.setup, this.terms));
  }

  /**
   * Shows the question and waits for the answer: true for yes. Focus goes back to where it was
   * (the table's Save, or the tick) when the question closes (WCAG 2.4.3).
   */
  askFirst(question) {
    this.focusBack = focusedElement();
    this.ask = question;
    return new Promise((resolve) => {
      this.answerAsk = resolve;
    });
  }

  handleAnswer(event) {
    const resolve = this.answerAsk;
    const back = this.focusBack;
    this.ask = null;
    this.answerAsk = null;
    this.focusBack = null;
    if (back && back.isConnected && typeof back.focus === "function") {
      back.focus();
    }
    if (resolve) {
      resolve(event.detail.yes);
    }
  }

  /**
   * For a week or program: its saved versions and Manual Build weeks, which a delete takes with
   * it (ADR 0005 §10, ADR 0008).
   */
  savedSchedulesNote(recordId) {
    const S = FIELD.Schedule;
    const mine = ((this.setup && this.setup.schedules) || []).filter(
      (s) => s[S.Week] === recordId || s[S.Program] === recordId
    );
    const versions = mine.filter((s) => s[S.Status] === "Version").length;
    const drafts = (origin) =>
      mine.filter((s) => s[S.Status] === "Draft" && s[S.Origin] === origin)
        .length;
    const builds = drafts("Manual");
    const generated = drafts("Generated");
    const t = this.terms;
    const parts = [];
    if (builds) {
      parts.push(builds === 1 ? "its Manual Build" : `${builds} Manual Builds`);
    }
    if (generated) {
      parts.push(
        generated === 1
          ? "its Generated Schedule"
          : `${generated} Generated Schedules`
      );
    }
    if (versions) {
      const word = versions === 1 ? t.sIn("Version") : t.pIn("Version");
      parts.push(`${versions} saved ${word}`);
    }
    if (!parts.length) {
      return "";
    }
    const last = parts.pop();
    return ` That includes ${parts.length ? `${parts.join(", ")} and ` : ""}${last}.`;
  }

  async handleDeleteRecord(event) {
    const { recordId, name } = event.detail;
    const ok = await LightningConfirm.open({
      label: "Delete",
      message: `Delete "${name}"? Anything inside it is deleted too.${this.savedSchedulesNote(recordId)} This cannot be undone.`,
      variant: "header",
      theme: "warning"
    });
    if (!ok) {
      return;
    }
    await this.run(async () => {
      await deleteRecord({ recordId });
      this.changedOnServer = true;
      this.toast(`Deleted "${name}".`);
      await this.loadSeason();
    }, `"${name}" not deleted. Nothing was removed.`);
  }

  // ---------- helpers ----------

  /** A save, then the season again. what: what didn't happen if the save fails. */
  async saveAndReload(save, onFailure, what = this.notSaved()) {
    let saved = false;
    await this.run(async () => {
      await save();
      this.changedOnServer = true;
      saved = true;
      this.toast("Saved.");
      await this.loadSeason();
      this.seasons = await getSeasons({ campId: this.campId });
    }, what);
    if (!saved && onFailure) {
      onFailure();
    }
  }

  /** Runs a server call; if it fails, says what didn't happen (what), then why. */
  async run(work, what) {
    this.busy = true;
    this.error = null;
    // Set by work once its change is saved, so a failure after it (the reload) never says
    // the change wasn't made.
    this.changedOnServer = false;
    try {
      await work();
    } catch (e) {
      this.showError(e, this.changedOnServer ? this.refreshFailed : what);
    } finally {
      this.busy = false;
    }
  }

  validInputs(selector) {
    return [...this.template.querySelectorAll(selector)].reduce(
      (ok, input) => input.reportValidity() && ok,
      true
    );
  }

  /** The change was saved, but showing the season again failed. */
  get refreshFailed() {
    return "Done, but the screen couldn't show it yet. Reload the page.";
  }

  /** Loading a camp or season. */
  get openFailed() {
    return "Couldn't open this. Nothing was changed.";
  }

  /**
   * A save that didn't go through: what it was (the rows' kind in the camp's words, or the
   * screen's name), and that what was typed is kept (ADR 0001 §9).
   */
  notSaved(records) {
    const type = records && records.length ? records[0].sobjectType : null;
    const kind = Object.keys(OBJECT).find((k) => OBJECT[k] === type);
    const what = kind
      ? this.terms.p(kind)
      : screenLabels(this.terms)[this.screen] || "Your changes";
    return `${what} not saved. Your changes are still here.`;
  }

  showError(e, what = this.openFailed) {
    this.error = failed(what, e);
    if (this.mode === "loading") {
      this.mode = "screens";
    }
  }

  toast(message) {
    this.dispatchEvent(
      new ShowToastEvent({ title: message, variant: "success" })
    );
  }
}
