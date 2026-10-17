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
import saveRowsAndWeeks from "@salesforce/apex/SeasonSetupController.saveRowsAndWeeks";
import saveRowsWeeksAndWho from "@salesforce/apex/SeasonSetupController.saveRowsWeeksAndWho";
import saveActivityDetails from "@salesforce/apex/ActivitiesController.saveActivityDetails";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import { undoMessage } from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { setupProblems } from "c/shoreshSetupRules";
import { errorMessage } from "c/shoreshErrors";
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

  // Forms
  newCamp = { Name: "" };
  newSeason = {};
  seasonForm = {};
  seasonChanged = false;
  seasonSubmitted = false;
  // Which location type the Locations table shows; "all" shows every location.
  locationFilter = "all";

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
      this.showError(e);
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
      this.setup = null;
      return;
    }
    if (this.setup && this.setup.season.Id !== this.seasonId) {
      // Another season: start its tables fresh rather than carrying unsaved rows across.
      this.setup = null;
    }
    const setup = await getSeasonSetup({
      campId: this.campId,
      seasonId: this.seasonId
    });
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
    return menuSections(this.terms, !!this.setup);
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
    await this.saveAndReload(() => saveRecords({ records: [chosen.record] }));
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
    // The table puts each new row's position in place of {n}.
    return {
      [WEEK.Season]: this.seasonId,
      Name: `${this.terms.s("Week")} {n}`
    };
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
      Name: `${this.terms.s("Location")} {n}`,
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
        options: [
          none,
          ...activities.map((a) => ({ label: a.Name, value: a.Id }))
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
      Name: `${this.terms.s("Activity")} {n}`,
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
      noWeeks: `No ${t.pIn("Week")} yet.`,
      overlapsWeek: `Overlaps another ${t.sIn("Week")}`,
      fillWeeks: `Fill in ${t.pIn("Week")} from the ${t.sIn("Season")} dates`,
      addProgram: `Add ${t.s("Program")}`,
      noPrograms: `No ${t.pIn("Program")} yet. Every ${t.sIn("Season")} needs at least one.`,
      copiedFrom: `Copied from "${this.copiedFromName}".`,
      locationTypes: t.p("LocationType"),
      addLocationType: `Add ${t.s("LocationType")}`,
      noLocationTypes: `No ${t.pIn("LocationType")} yet. They are optional; ${t.pIn("Location")} are listed by ${t.sIn("LocationType")}.`,
      addLocation: `Add ${t.s("Location")}`,
      noLocations: `No ${t.pIn("Location")} yet.`,
      catalogue: `${t.s("Activity")} catalogue`,
      addActivity: `Add ${t.s("Activity")}`,
      noActivities: `No ${t.pIn("Activity")} yet.`
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
      await this.loadCamps(campId);
    });
  }

  async handleCampChange(event) {
    this.campId = event.detail.value;
    this.seasonId = null;
    await this.run(() => this.loadCamp());
  }

  async handleLabelsSaved() {
    this.toast("Saved. Shoresh screens now use your camp words.");
    await this.run(() => this.loadCamp());
    // Stay on camp words, even before there is a season.
    this.screen = "campWords";
    this.mode = "screens";
  }

  // ---------- season ----------

  async handleSeasonChange(event) {
    this.seasonId = event.detail.value;
    this.mode = "screens";
    await this.run(() => this.loadSeason());
  }

  handleSeasonField(event) {
    this.seasonForm = {
      ...this.seasonForm,
      [SEASON_INPUTS[event.target.dataset.field]]: event.detail.value
    };
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
      }
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
      this.toast(`Deleted "${this.setup.season.Name}".`);
      this.seasonId = null;
      this.screen = "roots";
      await this.loadCamp();
    });
  }

  handleStartNewSeason() {
    this.newSeason = {};
    this.mode = "newSeason";
  }

  handleNewSeasonField(event) {
    this.newSeason = {
      ...this.newSeason,
      [SEASON_INPUTS[event.target.dataset.field]]: event.detail.value
    };
  }

  async handleCreateSeason() {
    if (!this.validInputs('[data-form="new-season"]')) {
      return;
    }
    await this.run(async () => {
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
      this.screen = "roots";
      await this.loadCamp(seasonId);
    });
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
    await this.run(() => this.loadCamp(event.detail.seasonId));
  }

  /** After an import is saved: the season again, with what it added (the summary stays up). */
  async handleImported() {
    await this.run(async () => {
      await this.loadSeason();
      this.seasons = await getSeasons({ campId: this.campId });
    });
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
      this.toast(undoMessage(result));
      await this.loadSeason();
    });
  }

  handleImportClosed() {
    this.screen = "roots";
  }

  handleCancelCopy() {
    this.mode = "screens";
  }

  // ---------- weeks, programs, and everything inside ----------

  async handleFillWeeks() {
    await this.run(async () => {
      await addWeeksFromSeasonDates({ seasonId: this.seasonId });
      await this.loadSeason();
    });
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
    await this.saveAndReload(() => saveRecords({ records }));
  }

  async handleSaveActivityDetails(event) {
    const { rules, whoCanDoIt, onFailure } = event.detail;
    let saved = false;
    await this.run(async () => {
      await saveActivityDetails({ rules, whoCanDoIt });
      saved = true;
      this.toast("Saved.");
      await this.loadSeason();
    });
    if (!saved && onFailure) {
      onFailure();
    }
  }

  /**
   * A table's save: its rows, and (for tables with "Runs in" weeks) its week ticks with them, and
   * (for recurring activities) who each covers.
   */
  async handleSaveRecords(event) {
    const { records, weeksOff, weeksBackOn, who, onFailure } = event.detail;
    let save = () => saveRecords({ records });
    if (who) {
      save = () =>
        saveRowsWeeksAndWho({
          records,
          extras: { weeksOff, weeksBackOn, who }
        });
    } else if (weeksOff || weeksBackOn) {
      save = () => saveRowsAndWeeks({ records, weeksOff, weeksBackOn });
    }
    await this.saveAndReload(save, onFailure);
  }

  /** For a week or program: its saved versions, which a delete takes with it. */
  savedSchedulesNote(recordId) {
    const count = ((this.setup && this.setup.schedules) || []).filter(
      (s) =>
        s[FIELD.Schedule.Status] === "Version" &&
        (s[FIELD.Schedule.Week] === recordId ||
          s[FIELD.Schedule.Program] === recordId)
    ).length;
    if (!count) {
      return "";
    }
    const t = this.terms;
    const word = count === 1 ? t.sIn("Version") : t.pIn("Version");
    return ` That includes ${count} saved ${word}.`;
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
      this.toast(`Deleted "${name}".`);
      await this.loadSeason();
    });
  }

  // ---------- helpers ----------

  async saveAndReload(save, onFailure) {
    let saved = false;
    await this.run(async () => {
      await save();
      saved = true;
      this.toast("Saved.");
      await this.loadSeason();
      this.seasons = await getSeasons({ campId: this.campId });
    });
    if (!saved && onFailure) {
      onFailure();
    }
  }

  async run(work) {
    this.busy = true;
    this.error = null;
    try {
      await work();
    } catch (e) {
      this.showError(e);
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

  showError(e) {
    this.error = errorMessage(e);
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
