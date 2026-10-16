import { LightningElement, api } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { errorMessage } from "c/shoreshErrors";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  days,
  groupGrid,
  groups,
  kindLabel
} from "c/shoreshScheduleViews";

const ORIGINS = {
  Manual: "Manual Build",
  Generated: "Generated Schedule",
  Copied: "Copied",
  Imported: "Imported"
};

/**
 * The schedule page (desktop: the schedule screen): pick a program and a week; its newest version
 * opens by itself, Versions switches to another, and the director looks at it in Daily View (all groups for one day), Group View (one
 * group's week), or Activity View (where one activity runs across the week). Read-only: placing
 * and moving things comes with Manual Build.
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 */
export default class ShoreshSchedules extends LightningElement {
  @api terms;

  _setup;
  programId;
  weekId;
  versions = [];
  opened;
  view = "day";
  dayIndex = 0;
  groupKey;
  activityId;
  pending = 0;
  error;
  loadedFor;
  // Each open asks the server once; only the latest answer is shown.
  openTicket = 0;

  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    const programs = this.programOptions.map((o) => o.value);
    const weeks = this.weekOptions.map((o) => o.value);
    if (!programs.includes(this.programId)) {
      this.programId = programs[0];
    }
    if (!weeks.includes(this.weekId)) {
      this.weekId = weeks[0];
    }
    // The parent hands the setup again after every save; reload only when the choice changed.
    this.loadVersions();
  }

  // ---------- choosing a program and week ----------

  get programOptions() {
    return ((this._setup && this._setup.programs) || []).map((entry) => ({
      label: entry.program.Name,
      value: entry.program.Id
    }));
  }
  get weekOptions() {
    return ((this._setup && this._setup.weeks) || []).map((week) => ({
      label: week.Name,
      value: week.Id
    }));
  }
  get programLabel() {
    return this.terms.s("Program");
  }
  get weekLabel() {
    return this.terms.s("Week");
  }
  get hasSeveralPrograms() {
    return this.programOptions.length > 1;
  }
  get canChoose() {
    return !!this.programId && !!this.weekId;
  }
  get weekName() {
    const week = this.weekOptions.find((o) => o.value === this.weekId);
    return week ? week.label : "";
  }

  handleProgram(event) {
    this.programId = event.detail.value;
    this.loadVersions();
  }
  handleWeek(event) {
    this.weekId = event.detail.value;
    this.loadVersions();
  }

  async loadVersions() {
    const key = `${this.programId}|${this.weekId}`;
    if (!this.canChoose) {
      this.versions = [];
      this.opened = null;
      this.loadedFor = null;
      return;
    }
    if (key === this.loadedFor) {
      return;
    }
    this.loadedFor = key;
    this.opened = null;
    this.openTicket += 1;
    this.versions = [];
    const loaded = await this.run(async () => {
      const versions = await getVersions({
        programId: this.programId,
        weekId: this.weekId
      });
      // Another program or week chosen meanwhile: its own load wins.
      if (key === this.loadedFor) {
        this.versions = versions || [];
      }
    });
    if (!loaded && key === this.loadedFor) {
      // Choosing the same week again tries again.
      this.loadedFor = null;
    } else if (loaded && key === this.loadedFor && this.versions.length) {
      // The newest version opens by itself (Greg, 2026-10-16); Versions switches to another.
      await this.open(this.versions[0].id);
    }
  }

  // ---------- versions ----------

  get openId() {
    return this.opened ? this.opened.schedule.id : null;
  }

  handleOpenVersion(event) {
    this.open(event.detail.id);
  }
  async open(scheduleId) {
    this.openTicket += 1;
    const ticket = this.openTicket;
    await this.run(async () => {
      const opened = await openSchedule({ scheduleId });
      if (ticket !== this.openTicket) {
        // Another version opened, or another week chosen, while this one loaded.
        return;
      }
      this.opened = opened;
      this.dayIndex = 0;
      const all = groups(opened);
      this.groupKey = all.length ? all[0].key : null;
      this.activityId = null;
    });
  }

  async handleRename(event) {
    const { id, name, onDone } = event.detail;
    let saved = false;
    await this.run(async () => {
      await renameSchedule({ scheduleId: id, name });
      saved = true;
      this.versions = this.versions.map((v) => {
        return v.id === id ? { ...v, name } : v;
      });
      if (this.opened && this.opened.schedule.id === id) {
        this.opened = {
          ...this.opened,
          schedule: { ...this.opened.schedule, name }
        };
      }
      this.dispatchEvent(
        new ShowToastEvent({ title: "Renamed.", variant: "success" })
      );
    });
    onDone(saved);
  }

  // ---------- the opened version ----------

  get t() {
    return this.terms;
  }
  get openedName() {
    return this.opened.schedule.name;
  }
  get openedOrigin() {
    return ORIGINS[this.opened.schedule.origin] || this.opened.schedule.origin;
  }
  get openedSavedAt() {
    return this.opened.schedule.savedAt;
  }
  get viewingLabel() {
    return `Looking at a ${this.t.sIn("Version")}`;
  }
  get noDaysMessage() {
    return `This ${this.t.sIn("Version")} has no days saved.`;
  }
  get showLegend() {
    return !this.isActivity;
  }
  get hasNoDays() {
    return this.opened && this.opened.days.length === 0;
  }

  get viewButtons() {
    return [
      ["day", "Daily View"],
      ["group", "Group View"],
      ["activity", "Activity View"]
    ].map(([key, label]) => ({
      key,
      label,
      className:
        key === this.view ? "view-button view-button_on" : "view-button",
      pressed: String(key === this.view)
    }));
  }
  get isDaily() {
    return this.view === "day";
  }
  get isGroup() {
    return this.view === "group";
  }
  get isActivity() {
    return this.view === "activity";
  }
  handleView(event) {
    this.view = event.currentTarget.dataset.view;
    if (this.view !== "activity") {
      this.activityId = null;
    }
  }

  get corner() {
    return this.t.s("TimeBlock");
  }

  // Daily View
  get dayPills() {
    return days(this.opened).map((day) => ({
      ...day,
      className: day.index === this.dayIndex ? "pill pill_on" : "pill"
    }));
  }
  get selectedDay() {
    return this.opened.days[this.dayIndex];
  }
  get dayProblem() {
    const day = this.selectedDay;
    return day && day.problem
      ? `This day could not be read: ${day.problem}.`
      : null;
  }
  get dailyGrid() {
    return dailyGrid(this.opened, this.dayIndex, this.t);
  }
  handleDay(event) {
    this.dayIndex = Number(event.currentTarget.dataset.index);
  }

  // Group View
  get groupPills() {
    return groups(this.opened).map((grp) => ({
      ...grp,
      className: grp.key === this.groupKey ? "pill pill_on" : "pill"
    }));
  }
  get groupGrid() {
    return this.groupKey ? groupGrid(this.opened, this.groupKey, this.t) : null;
  }
  handleGroup(event) {
    this.groupKey = event.currentTarget.dataset.key;
  }

  // Activity View
  get catalogue() {
    return (this._setup && this._setup.activities) || [];
  }
  locationName(activityId) {
    const activity = this.catalogue.find((a) => a.Id === activityId);
    const location =
      activity &&
      ((this._setup && this._setup.locations) || []).find(
        (l) => l.Id === activity.Location__c
      );
    return location ? location.Name : null;
  }
  get activityCards() {
    return activityCards(this.opened, this.catalogue, this.t).map((card) => ({
      ...card,
      location: this.locationName(card.key)
    }));
  }
  get selectedActivity() {
    return this.activityCards.find((card) => card.key === this.activityId);
  }
  get activityGrid() {
    return activityGrid(this.opened, this.activityId);
  }
  get allActivitiesLabel() {
    return `← All ${this.t.p("Activity")}`;
  }
  handleActivity(event) {
    this.activityId = event.currentTarget.dataset.key;
  }
  handleAllActivities() {
    this.activityId = null;
  }

  get legend() {
    return [
      {
        key: "activity",
        label: this.t.s("Activity"),
        className: "swatch swatch_activity"
      },
      {
        key: "set-time",
        label: `${this.t.s("FixedActivity")} or ${this.t.sIn("RecurringActivity")}`,
        className: "swatch swatch_set-time"
      },
      {
        key: "not-set-up",
        label: `Not set up yet (${[kindLabel("E", this.t), kindLabel("D", this.t), kindLabel("S", this.t), kindLabel("T", this.t)].join(", ")})`,
        className: "swatch swatch_not-set-up"
      },
      {
        key: "open",
        label: "Open: nothing placed",
        className: "swatch swatch_open"
      }
    ];
  }

  // ---------- empty states ----------

  get emptyMessage() {
    const t = this.t;
    if (!this.programId) {
      return `No ${t.pIn("Program")} yet. Add one on the ${t.p("Program")} screen first.`;
    }
    if (!this.weekId) {
      return `No ${t.pIn("Week")} yet. Add them on the ${t.p("Week")} screen first.`;
    }
    if (this.versions.length === 0) {
      return `Nothing saved for ${this.weekName} yet. Manual Build and Generated Schedule are coming; bringing in last year's schedule (also coming) saves it here as a ${t.sIn("Version")}.`;
    }
    return `Nothing is open. Choose a ${t.sIn("Version")} from ${t.p("Version")}.`;
  }

  // ---------- helpers ----------

  get busy() {
    return this.pending > 0;
  }

  /** Runs a server call, showing its error if it fails. Returns whether it worked. */
  async run(work) {
    this.pending += 1;
    this.error = null;
    try {
      await work();
      return true;
    } catch (e) {
      this.error = errorMessage(e);
      return false;
    } finally {
      this.pending -= 1;
    }
  }
}
