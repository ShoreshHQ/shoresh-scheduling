import { LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetup";
import saveRecords from "@salesforce/apex/SeasonSetupController.saveRecords";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import addWeeksFromSeasonDates from "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates";
import saveWeekExceptions from "@salesforce/apex/WeekExceptionsController.saveWeekExceptions";
import { buildTerms } from "c/shoreshTerms";
import { setupProblems } from "c/shoreshSetupRules";
import { errorMessage } from "c/shoreshErrors";

const STATUS_OPTIONS = [
  { label: "Planning", value: "Planning" },
  { label: "Active", value: "Active" },
  { label: "Finished", value: "Finished" }
];

/**
 * Camp setup: a director picks (or starts) a season and sets up its dates, weeks, programs,
 * divisions, groups, and time blocks, or copies it to start a new season. Every model term on
 * the screen is shown in the camp's own words.
 */
export default class ShoreshCampSetup extends LightningElement {
  camps = [];
  campId;
  seasons = [];
  seasonId;
  setup;
  termLabels = [];
  mode = "loading"; // loading | noCamp | setup | newSeason | copy | labels
  busy = false;
  error;

  // Forms
  newCamp = { Name: "" };
  newSeason = {};
  seasonForm = {};
  seasonChanged = false;
  seasonSubmitted = false;

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
    this.mode = this.seasonId ? "setup" : "newSeason";
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
    const setup = await getSeasonSetup({ seasonId: this.seasonId });
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
  get isSetup() {
    return this.mode === "setup" && !!this.setup;
  }
  get isNewSeason() {
    return this.mode === "newSeason";
  }
  get isCopy() {
    return this.mode === "copy" && !!this.setup;
  }
  get isLabels() {
    return this.mode === "labels";
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
    return setupProblems(this.setup, this.terms).map((text, i) => ({
      key: `p${i}`,
      text
    }));
  }
  get hasProblems() {
    return this.problems.length > 0;
  }
  get hasNoWeeks() {
    return this.setup && this.setup.weeks.length === 0;
  }
  get seasonSaveDisabled() {
    return this.busy || !this.seasonChanged;
  }
  get copiedFromName() {
    const season = this.setup && this.setup.season;
    return season && season.CopiedFrom__r ? season.CopiedFrom__r.Name : null;
  }
  get weekColumns() {
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: "StartDate__c",
        label: "Start date",
        type: "date",
        required: true
      },
      {
        fieldName: "EndDate__c",
        label: "End date",
        type: "date",
        required: true
      }
    ];
  }
  get weekDefaults() {
    // The table puts each new row's position in place of {n}.
    return { Season__c: this.seasonId, Name: `${this.terms.s("Week")} {n}` };
  }
  get programs() {
    return ((this.setup && this.setup.programs) || []).map((entry) => ({
      key: entry.program.Id,
      entry
    }));
  }
  get hasPrograms() {
    return this.programs.length > 0;
  }

  get labels() {
    const t = this.terms;
    return {
      camp: "Camp",
      season: t.s("Season"),
      newSeason: `New ${t.sIn("Season")}`,
      copySeason: `Copy this ${t.sIn("Season")}`,
      campWords: "Camp words",
      seasonName: `${t.s("Season")} name`,
      saveSeason: `Save ${t.sIn("Season")}`,
      deleteSeason: `Delete ${t.sIn("Season")}`,
      createSeason: `Create ${t.sIn("Season")}`,
      newSeasonTitle: `Start a new ${t.sIn("Season")}`,
      newSeasonHint: this.hasSeasons
        ? `Or go back and use "Copy this ${t.sIn("Season")}" to start from an earlier one.`
        : `Give it a name and its first and last days. You can add ${t.pIn("Week")} and ${t.pIn("Program")} next.`,
      problems: "Needs attention",
      weeks: t.p("Week"),
      addWeek: `Add ${t.s("Week")}`,
      noWeeks: `No ${t.pIn("Week")} yet.`,
      fillWeeks: `Fill in ${t.pIn("Week")} from the ${t.sIn("Season")} dates`,
      programs: t.p("Program"),
      addProgram: `Add ${t.s("Program")}`,
      noPrograms: `No ${t.pIn("Program")} yet. Every ${t.sIn("Season")} needs at least one.`,
      copiedFrom: `Copied from "${this.copiedFromName}".`
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
        records: [{ sobjectType: "Camp__c", Name: this.newCamp.Name }]
      });
      await this.loadCamps(campId);
    });
  }

  async handleCampChange(event) {
    this.campId = event.detail.value;
    this.seasonId = null;
    await this.run(() => this.loadCamp());
  }

  handleShowLabels() {
    this.mode = "labels";
  }

  async handleLabelsSaved() {
    this.toast("Saved. Shoresh screens now use your camp words.");
    await this.handleLabelsDone();
  }

  async handleLabelsDone() {
    this.mode = this.seasonId ? "setup" : "newSeason";
    await this.run(() => this.loadCamp());
  }

  // ---------- season ----------

  async handleSeasonChange(event) {
    this.seasonId = event.detail.value;
    this.mode = "setup";
    await this.run(() => this.loadSeason());
  }

  handleSeasonField(event) {
    this.seasonForm = {
      ...this.seasonForm,
      [event.target.dataset.field]: event.detail.value
    };
    this.seasonChanged = true;
  }

  async handleSaveSeason() {
    if (!this.validInputs('[data-form="season"]')) {
      return;
    }
    const f = this.seasonForm;
    this.seasonSubmitted = true;
    await this.saveAndReload(
      [
        {
          sobjectType: "Season__c",
          Id: f.Id,
          Name: f.Name,
          StartDate__c: f.StartDate__c,
          EndDate__c: f.EndDate__c,
          Status__c: f.Status__c
        }
      ],
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
        `${t.pIn("Division")}, ${t.pIn("Group")}, ${t.pIn("TimeBlock")})? This cannot be undone.`,
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
      [event.target.dataset.field]: event.detail.value
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
            sobjectType: "Season__c",
            Camp__c: this.campId,
            Status__c: "Planning",
            ...this.newSeason
          }
        ]
      });
      await this.loadCamp(seasonId);
    });
  }

  async handleCancelNewSeason() {
    this.mode = this.seasonId ? "setup" : "newSeason";
  }

  // ---------- copy ----------

  handleStartCopy() {
    this.mode = "copy";
  }

  async handleCopied(event) {
    this.toast(
      `Copied. You are now looking at the new ${this.terms.sIn("Season")}.`
    );
    this.mode = "setup";
    await this.run(() => this.loadCamp(event.detail.seasonId));
  }

  handleCancelCopy() {
    this.mode = "setup";
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
    await this.saveAndReload([
      {
        sobjectType: "Program__c",
        Season__c: this.seasonId,
        Name: count ? `${this.terms.s("Program")} ${count + 1}` : "Main",
        SortOrder__c: count + 1
      }
    ]);
  }

  async handleSaveWeekExceptions(event) {
    const { toAdd, toRemove, onFailure } = event.detail;
    let saved = false;
    await this.run(async () => {
      await saveWeekExceptions({ toAdd, toRemove });
      saved = true;
      this.toast("Saved.");
      await this.loadSeason();
    });
    if (!saved && onFailure) {
      onFailure();
    }
  }

  async handleSaveRecords(event) {
    await this.saveAndReload(event.detail.records, event.detail.onFailure);
  }

  async handleDeleteRecord(event) {
    const { recordId, name } = event.detail;
    const ok = await LightningConfirm.open({
      label: "Delete",
      message: `Delete "${name}"? Anything inside it is deleted too. This cannot be undone.`,
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

  async saveAndReload(records, onFailure) {
    if (!records || records.length === 0) {
      return;
    }
    let saved = false;
    await this.run(async () => {
      await saveRecords({ records });
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
      this.mode = "setup";
    }
  }

  toast(message) {
    this.dispatchEvent(
      new ShowToastEvent({ title: message, variant: "success" })
    );
  }
}
