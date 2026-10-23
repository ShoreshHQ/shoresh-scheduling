import { LightningElement, api } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { loadStyle } from "lightning/platformResourceLoader";
import PRINT_STYLE from "@salesforce/resourceUrl/ShoreshPrint";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import openSchedule from "@salesforce/apex/SchedulesController.openSchedule";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { failed } from "c/shoreshErrors";
import { FIELD } from "c/shoreshSchema";
import { downloadWorkbook, fileNameOf } from "c/shoreshDownload";
import { printPages, scheduleSheets } from "c/shoreshScheduleExport";
import {
  activityCards,
  activityGrid,
  dailyGrid,
  days,
  eventPlans,
  eventsOn,
  groupGrid,
  groups,
  withSpecials
} from "c/shoreshScheduleViews";
import { noScheduleYet } from "c/shoreshScheduleExport";

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
 * and moving things comes with Manual Build. Export to Excel and Print, beside Versions, take out
 * the version on screen (ADR 0005 part 2): the version open is the choice, so nothing asks which.
 *
 * Special days and events (ADR 0014 slice 5): a day a special day replaces shows that special day's
 * own schedule, its pill and Group View column carrying its name, and under the grid its line (its
 * name, the camp's word for it, its notes). A day with special events placed on it lists them under
 * the grid, each with "Open <name>", which shows that event's own schedule, read-only, in the
 * grid's place; "← <day>" goes back (focus on the way back, then on that Open again, as Activity
 * View's drilldown). A version that is or was published shows them as it carried them when it was
 * published; any other, the week's as they are now (SchedulesController.openSchedule).
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
  // The special event whose own schedule is shown in Daily View's place, or null.
  eventId = null;
  // The opened version with its special days in their days' places, worked out once per open.
  shownMemo = { of: null, view: null };
  // Where the cursor goes at the next render: { back }, { card: activity Id }, { eventBack } or
  // { event: event Id }.
  focusAfter = null;
  pending = 0;
  // From choosing a week until its newest version is open (or it has none).
  loading = false;
  error;
  loadedFor;
  // Each open asks the server once; only the latest answer is shown.
  openTicket = 0;
  exporting = false;
  // The printout's pages while it is being printed (c-shoresh-schedule-print), else null.
  printout = null;
  printPending = false;
  printStyleLoaded = false;
  afterPrint = null;

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
  /** The empty state says what is true only once nothing is still loading. */
  get showEmpty() {
    return this.canChoose && !this.loading && !this.busy;
  }
  get cannotChoose() {
    return !this.canChoose;
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
      this.loading = false;
      return;
    }
    if (key === this.loadedFor) {
      return;
    }
    this.loadedFor = key;
    this.opened = null;
    this.openTicket += 1;
    this.versions = [];
    this.loading = true;
    const loaded = await this.run(async () => {
      const versions = await getVersions({
        programId: this.programId,
        weekId: this.weekId
      });
      // Another program or week chosen meanwhile: its own load wins.
      if (key === this.loadedFor) {
        this.versions = versions || [];
      }
    }, "Couldn't open the saved schedules. Nothing was changed.");
    if (!loaded && key === this.loadedFor) {
      // Choosing the same week again tries again.
      this.loadedFor = null;
    } else if (loaded && key === this.loadedFor && this.versions.length) {
      // The newest version opens by itself (Greg, 2026-10-16); Versions switches to another.
      await this.open(this.versions[0].id);
    }
    if (key === this.loadedFor || this.loadedFor === null) {
      this.loading = false;
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
      this.eventId = null;
    }, "Couldn't open that schedule. Nothing was changed.");
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
    }, "Not renamed. The name is as it was.");
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
  get noDaysMessage() {
    return `This ${this.t.sIn("Version")} has no days saved.`;
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
    this.eventId = null;
    if (this.view !== "activity") {
      this.activityId = null;
    }
  }

  /** The opened version as the views show it: each day a special day replaces is its schedule. */
  get shown() {
    if (this.shownMemo.of !== this.opened) {
      this.shownMemo = { of: this.opened, view: withSpecials(this.opened) };
    }
    return this.shownMemo.view;
  }

  get corner() {
    return this.t.s("TimeBlock");
  }

  // Daily View
  get dayPills() {
    return days(this.shown).map((day) => ({
      ...day,
      // A day a special day replaces carries its name: "Friday Jul 3 · Visiting Day".
      sub: day.special ? `${day.sub} · ${day.special}` : day.sub,
      specialText: day.special ? ` · ${day.special}` : "",
      className: day.index === this.dayIndex ? "pill pill_on" : "pill",
      // Chosen is said to screen readers, and shown by more than colour (CSS: underline).
      pressed: String(day.index === this.dayIndex)
    }));
  }
  get selectedDay() {
    return this.shown.days[this.dayIndex];
  }
  get dayProblem() {
    const day = this.selectedDay;
    return day && day.problem
      ? `This day could not be read: ${day.problem}.`
      : null;
  }
  get dailyGrid() {
    return dailyGrid(this.shown, this.dayIndex, this.t);
  }
  get dailyGridLabel() {
    const day = this.dayPills.find((pill) => pill.index === this.dayIndex);
    return day ? `${day.label}${day.specialText}` : null;
  }
  handleDay(event) {
    this.dayIndex = Number(event.currentTarget.dataset.index);
    this.eventId = null;
  }

  // ---------- special days and events (ADR 0014 slice 5) ----------

  /** The special day replacing the day shown: its line under the grid, or null. */
  get specialLine() {
    const day = this.selectedDay;
    if (!day || !day.special) {
      return null;
    }
    return {
      name: day.special.name,
      kind: this.t.s("SpecialDay"),
      notes: day.special.notes || ""
    };
  }
  /** A special day with no time blocks yet says so in its grid's place. */
  get noSpecialSchedule() {
    const day = this.selectedDay;
    return day && day.special && !day.problem && !day.blocks.length
      ? noScheduleYet(day.special.name)
      : null;
  }
  get showDailyGrid() {
    return !this.dayProblem && !this.noSpecialSchedule;
  }

  /** The special events on the day shown that have a schedule of their own, to open. */
  get dayEvents() {
    const plans = new Map(eventPlans(this.shown).map((e) => [e.eventId, e]));
    return eventsOn(this.selectedDay)
      .filter((item) => plans.has(item.id))
      .map((item) => {
        const name = plans.get(item.id).name;
        return { id: item.id, name, open: `Open ${name}` };
      });
  }
  get hasDayEvents() {
    return this.dayEvents.length > 0;
  }
  get eventWord() {
    return this.t.s("SpecialEvent");
  }
  get openedEvent() {
    if (!this.eventId || !this.isDaily) {
      return null;
    }
    return eventPlans(this.shown).find((e) => e.eventId === this.eventId);
  }
  get eventGrid() {
    const event = this.openedEvent;
    return event ? dailyGrid({ days: [event.plan] }, 0, this.t) : null;
  }
  get eventBackLabel() {
    const day = this.dayPills.find((pill) => pill.index === this.dayIndex);
    return `← ${day ? day.label : ""}`;
  }
  /** Opening an event puts the cursor on the way back; going back, on its Open (WCAG 2.4.3). */
  handleOpenEvent(event) {
    this.eventId = event.currentTarget.dataset.event;
    this.focusAfter = { eventBack: true };
  }
  handleEventBack() {
    this.focusAfter = { event: this.eventId };
    this.eventId = null;
  }

  // Group View
  get groupPills() {
    return groups(this.shown).map((grp) => ({
      ...grp,
      className: grp.key === this.groupKey ? "pill pill_on" : "pill",
      pressed: String(grp.key === this.groupKey)
    }));
  }
  get groupGrid() {
    return this.groupKey ? groupGrid(this.shown, this.groupKey, this.t) : null;
  }
  get groupGridLabel() {
    const grp = this.groupPills.find((pill) => pill.key === this.groupKey);
    return grp ? grp.name : null;
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
        (l) => l.Id === activity[FIELD.Activity.Location]
      );
    return location ? location.Name : null;
  }
  get activityCards() {
    return activityCards(this.shown, this.catalogue, this.t).map((card) => ({
      ...card,
      location: this.locationName(card.key)
    }));
  }
  get selectedActivity() {
    return this.activityCards.find((card) => card.key === this.activityId);
  }
  get activityGrid() {
    return activityGrid(this.shown, this.activityId, this.t);
  }
  get activityGridLabel() {
    const activity = this.selectedActivity;
    return activity ? activity.name : null;
  }
  get allActivitiesLabel() {
    return `← All ${this.t.p("Activity")}`;
  }
  /** Opening an activity puts the cursor on the way back; going back, on its card (WCAG 2.4.3). */
  handleActivity(event) {
    this.activityId = event.currentTarget.dataset.key;
    this.focusAfter = { back: true };
  }
  handleAllActivities() {
    this.focusAfter = { card: this.activityId };
    this.activityId = null;
  }

  // ---------- getting it out: Excel and print ----------

  /** Nothing to get out: no version open, or one with no days, or the page is busy. */
  get cannotGetOut() {
    return !this.opened || this.hasNoDays || this.busy;
  }
  // While a download or a printout is under way the button stays focusable (aria-disabled) and a
  // click does nothing: a focused button that turns disabled drops the cursor to the top of the
  // page (WCAG 2.4.3), and the director just pressed it.
  get exportBusy() {
    return this.exporting ? "true" : "false";
  }
  get printBusy() {
    return this.printout ? "true" : "false";
  }
  get cannotExport() {
    return this.cannotGetOut || this.exporting;
  }
  get cannotPrint() {
    return this.cannotGetOut || !!this.printout;
  }
  /** The version on screen as an Excel file: a sheet per day, then every group's and activity's week. */
  async handleExport() {
    if (this.cannotExport) {
      return;
    }
    this.exporting = true;
    this.error = null;
    try {
      await downloadWorkbook(
        this,
        scheduleSheets(this.shown, this.catalogue, this.t),
        fileNameOf(`${this.weekName} - ${this.openedName}`)
      );
    } catch (e) {
      this.error = failed("The schedule wasn't downloaded.", e);
    } finally {
      this.exporting = false;
    }
  }

  /**
   * The version on screen on paper, a page per day, group or activity as the view shows them:
   * the printout is put on the page, the browser's print opens, and the printout goes after.
   */
  async handlePrint() {
    if (this.cannotPrint) {
      return;
    }
    if (!this.printStyleLoaded) {
      try {
        await loadStyle(this, PRINT_STYLE);
        this.printStyleLoaded = true;
      } catch {
        // Without it the paper also shows the page around the printout; it still prints.
      }
    }
    this.printout = printPages(this.shown, this.view, this.catalogue, this.t);
    this.printPending = true;
  }
  get printWeek() {
    return this.weekName;
  }
  get printVersion() {
    return this.opened ? this.opened.schedule.name : "";
  }

  startPrint() {
    this.printPending = false;
    this.afterPrint = () => this.endPrint();
    window.addEventListener("afterprint", this.afterPrint);
    window.print();
  }
  endPrint() {
    if (this.afterPrint) {
      window.removeEventListener("afterprint", this.afterPrint);
      this.afterPrint = null;
    }
    this.printout = null;
  }

  disconnectedCallback() {
    this.endPrint();
  }

  renderedCallback() {
    if (
      this.printPending &&
      this.template.querySelector("c-shoresh-schedule-print")
    ) {
      this.startPrint();
    }
    if (!this.focusAfter) {
      return;
    }
    const { back, card, eventBack, event } = this.focusAfter;
    this.focusAfter = null;
    let target;
    if (back) {
      target = this.template.querySelector('[data-id="all-activities"]');
    } else if (eventBack) {
      target = this.template.querySelector('[data-id="event-back"]');
    } else if (event) {
      target = [...this.template.querySelectorAll("[data-event]")].find(
        (el) => el.dataset.event === event
      );
    } else {
      target = [...this.template.querySelectorAll(".card[data-key]")].find(
        (el) => el.dataset.key === card
      );
    }
    if (target) {
      target.focus();
    }
  }

  // ---------- empty states ----------

  /** The empty state's title (desktop: a title only, the same on every screen). */
  get emptyMessage() {
    const t = this.t;
    if (!this.programId) {
      return `No ${t.pIn("Program")} yet`;
    }
    if (!this.weekId) {
      return `No ${t.pIn("Week")} yet`;
    }
    if (this.versions.length === 0) {
      return `Nothing saved for ${this.weekName} yet`;
    }
    return "Nothing open yet";
  }

  // ---------- helpers ----------

  get busy() {
    return this.pending > 0;
  }

  /**
   * Runs a server call; if it fails, says what didn't happen (what), then why. Returns whether
   * it worked.
   */
  async run(work, what = "That didn't go through. Nothing was changed.") {
    this.pending += 1;
    this.error = null;
    try {
      await work();
      return true;
    } catch (e) {
      this.error = failed(what, e);
      return false;
    } finally {
      this.pending -= 1;
    }
  }
}
