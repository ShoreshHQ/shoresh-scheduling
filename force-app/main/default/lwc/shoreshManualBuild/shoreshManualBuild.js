import { LightningElement, api } from "lwc";
import { BuildScreen } from "c/shoreshBuildScreen";
import { BuildWeek } from "c/shoreshBuildWeek";
import { campZone } from "c/shoreshCampClock";
import setUpItem from "@salesforce/apex/SpecialPlacingController.setUpItem";
import takeOffDay from "@salesforce/apex/SpecialPlacingController.takeOffDay";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import startBlankWeek from "@salesforce/apex/ManualBuildController.startBlankWeek";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import keepWeekBeforeRain from "@salesforce/apex/RainyDayController.keepManualWeek";
import getWeekSources from "@salesforce/apex/ManualBuildController.getWeekSources";
import startFromWeek from "@salesforce/apex/ManualBuildController.startFromWeek";
import { failed, reasonOf } from "c/shoreshErrors";
import { dayLabel, days, groups } from "c/shoreshScheduleViews";
import { publishedWord } from "c/shoreshPublish";
import { manualWeekAdapter } from "./weekAdapter";

/**
 * " · Jun 29, 9:00 AM": when a version was saved, as Versions shows it, so versions with the same
 * name can be told apart. Empty when unknown, or when the name already says it (a copy kept when
 * the week was published again or unpublished: "Published Oct 18, 2:40 PM").
 */
function savedWhen(source) {
  if (!source.savedAt || source.namedByPublish) {
    return "";
  }
  return ` · ${new Date(source.savedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: campZone()
  })}`;
}

/**
 * Manual Build (desktop: the Manual schedule): a program's week built by hand. This screen
 * chooses the program and week, opens or starts it (a week not started yet offers "Start a blank
 * week" or "Start from another week"), keeps its versions (Save, Restore), counts what the week
 * still needs (the rail's counter), offers Clear day, Clear week and Copy day (in the editor's Edit
 * menu, ADR 0008 part 7), and publishes the week (Publish: what
 * would change and what is still to do are shown first; Unpublish asks first; SchedulePublish),
 * and shows what setup changed since the week started (a dot on each cell it changed), with
 * "Update to match setup" one change at a time or all at once, shown first (SetupMatch).
 * The week itself is drawn and edited
 * by c-shoresh-week-editor (drag, type, keyboard, Undo and Redo, "keep theirs or use yours");
 * this screen hands it the week, saves what it sends through saveRuns, and hears what changed.
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 */
export default class ShoreshManualBuild extends BuildScreen(LightningElement) {
  @api terms;
  /**
   * An archived season's week (WEEK-1.10): shown and looked at, never built, edited, saved as a
   * version or published. Its editor is read-only too.
   */
  @api readOnly = false;

  _setup;
  programId;
  weekId;
  // ManualBuildController's DraftView: { schedule, activities, away }, or null (not started).
  // The editor holds the working copy and tells this screen of every change.
  draft;
  loadedFor;
  loading = false;
  starting = false;
  error;
  // What the editor shows: the view, the day and the bunk (the tools row follows them).
  view = "day";
  dayIndex = 0;
  groupKey;
  // An edit is saving or waiting to (the editor says).
  editBusy = false;
  loadTicket = 0;
  // Reads of the week on their way (a reload whose answer is dropped is read again).
  reads = 0;
  // Changes when a week is shown fresh: the counter's dropdown closes.
  checksResetKey = 0;
  // The week's versions (Versions), and what Start from another week can start from.
  versions = [];
  weekSources = [];
  versionsWorking = false;
  // The version just restored, "on screen now" until the next edit (desktop VersionsDropdown).
  restoredId = null;
  // A Restore refused because someone saved the week since this screen read it: offers Reload.
  restoreRefused = false;
  // A week shown before the editor was drawn: given to it as soon as it is.
  waiting = null;
  // The week's published schedule ({ id, publishedAt, publishedBy, changedSince }), or null.
  publishState = null;
  // A preview, publish or unpublish is on its way (or its question is open).
  publishing = false;
  // Apply to other weeks is open (c-shoresh-apply-weeks).
  applying = false;
  // The question before publishing (c-shoresh-ask): { heading, lines, confirmLabel, preview, week }.
  publishAsk = null;
  // The question before unpublishing: { heading, lines, publishedId, week }.
  unpublishAsk = null;
  // Where focus goes back to once it is drawn enabled again ("publish" or "unpublish"), or null.
  focusOn = null;
  // A start just gave the week: its Start buttons are gone, so focus goes to the grid once drawn.
  focusGridAfterStart = false;
  // A Restore was refused: focus goes to its line's Reload once drawn, as on Generated Schedule.
  focusReloadAfterRender = false;
  // What setup changed since the week started (SetupMatch.Preview), for the week shown, or null.
  setupPreview = null;
  // "Update to match setup" is open, or null: { notice, announcement, said (counts each time
  // its words are to be read out, even the same words again), kept (an update in this opening
  // kept the week as it was, so the next keeps none), updated (an update in this opening was
  // made: its Cancel says Close) }. setupWorking: an update is on its way.
  setupAsk = null;
  setupWorking = false;
  // The season was read again while the update list was read, open or updating, or while a
  // publish or a versions action was on its way (or a read was dropped for one): the week is
  // read again once that is over.
  readAfterRun = false;
  // The week as this screen last read it, and the flows that act on it.
  buildWeek = new BuildWeek(manualWeekAdapter(this));
  // The setup dots as the editor takes them, worked out once per preview.
  setupDotsMemo = { preview: null, dots: null };

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
    // Setup saved on another screen of Camp Setup comes back as a new setup for the same week:
    // the week is read again, as on coming back to the window, so its dots and names catch up.
    // While it can't be (an edit saving or answering), its setup changes are still read: nothing
    // later would catch them up. While the update list is open or working, or a Publish,
    // Unpublish or versions action is on its way, the week is read once that is over (WEEK-6.7).
    // Its Versions list is read too: a list read disturbs no work. Not when this screen's own
    // save asked for this season read: it already has its answer.
    const own = this.seasonReadIsOwn();
    if (`${this.programId}|${this.weekId}` === this.loadedFor) {
      if (own) {
        return;
      }
      if (!this.refresh() && this.draft) {
        this.buildWeek.loadVersions();
        if (
          this.setupWorking ||
          this.setupAsk ||
          this.publishing ||
          this.versionsWorking
        ) {
          this.readAfterRun = true;
        } else {
          this.buildWeek.loadSetupChanges();
        }
      }
    } else {
      this.load();
    }
  }

  connectedCallback() {
    this.onWindowFocus = () => this.refresh();
    window.addEventListener("focus", this.onWindowFocus);
  }

  disconnectedCallback() {
    window.removeEventListener("focus", this.onWindowFocus);
  }

  renderedCallback() {
    this.tellSetupState();
    this.tellWeekState();
    if (this.waiting && this.weekEditor) {
      const { draft, fresh } = this.waiting;
      this.waiting = null;
      this.weekEditor.show(draft, fresh);
    }
    // Publish and Unpublish are disabled while they work and while the week is read again, so
    // focus fell from them: it goes back once they are drawn enabled again (WCAG 2.4.3), unless
    // the director has put it somewhere else meanwhile.
    if (this.focusOn && !this.publishDisabled) {
      this.focusBack();
    }
    // A refused Restore's Reload is the way on (WCAG 2.4.3): focus goes to it once drawn.
    if (this.focusReloadAfterRender) {
      const reload = this.template.querySelector(
        '[data-id="restore-refused"] [data-id="reload"]'
      );
      if (reload || !this.restoreRefused) {
        this.focusReloadAfterRender = false;
      }
      if (reload) {
        reload.focus();
      }
    }
    // After a start the button that was clicked is gone (WCAG 2.4.3): focus goes to the new
    // week's first cell, unless the director has put it somewhere else meanwhile.
    if (
      this.focusGridAfterStart &&
      this.draft &&
      !this.waiting &&
      this.weekEditor
    ) {
      this.focusGridAfterStart = false;
      if (this.focusIsLost()) {
        this.weekEditor.focusCell();
      }
    }
  }

  /**
   * Focus back to the button it was on (focusOn) once that is drawn enabled again. Unpublish is
   * gone once the week has nothing published: Publish then. Update to match setup is gone once
   * the week matches setup: the grid's cell then (Publish may not be there, and is no place to
   * land after an update).
   */
  focusBack() {
    const id = this.focusOn;
    this.focusOn = null;
    if (!this.focusIsLost()) {
      return;
    }
    if (id === "update-to-match") {
      // The menu's Update to match setup opened the list (ADR 0015 §9): focus goes back to it,
      // or, once the week matches setup and it is gone, to the grid. After the page has drawn
      // the menu with what this screen just told it (tellSetupState).
      Promise.resolve().then(() => {
        if (this.focusIsLost() && !this.focusMenuUpdate() && this.weekEditor) {
          this.weekEditor.focusCell();
        }
      });
      return;
    }
    // Unpublish sits in Published's dropdown: back to it while that is open, else to Published,
    // or to Publish once the week has nothing published.
    const button =
      (id === "unpublish"
        ? this.unpublishTarget()
        : this.template.querySelector(`[data-id="${id}"]`)) ||
      this.template.querySelector('[data-id="publish"]');
    if (button) {
      button.focus();
    } else if (this.weekEditor) {
      this.weekEditor.focusCell();
    }
  }

  /** Unpublish, when Published's dropdown is open; else Published; null with neither. */
  unpublishTarget() {
    const menu = this.template.querySelector('[data-id="published-menu"]');
    if (!menu) {
      return null;
    }
    return menu.opened
      ? this.template.querySelector('[data-id="unpublish"]')
      : menu;
  }

  /**
   * Focus fell to the page (or stayed on Publish or Unpublish while they were disabled), rather
   * than being on something the director chose since.
   */
  focusIsLost() {
    const inside = this.template.activeElement;
    if (inside) {
      const id = inside.dataset ? inside.dataset.id : null;
      return id === "publish" || id === "unpublish" || id === "published-menu";
    }
    const page = document.activeElement;
    return !page || page === document.body;
  }

  /** The editor that draws and edits the week, once it is drawn. */
  get weekEditor() {
    return this.template.querySelector('[data-id="week-editor"]');
  }

  /** Said by screen readers, through the editor (its quiet line and live region). */
  say(text) {
    this.weekEditor.say(text);
  }
  announce(text) {
    this.weekEditor.announce(text);
  }
  /** Given to Versions, so what it says is read out from this screen's one live region. */
  announceText = (text) => this.announce(text);

  /** The week as the server last sent it, without edits still waiting to save. */
  get server() {
    return this.weekEditor ? this.weekEditor.savedWeek : null;
  }

  /** The editor saves through here: saveSlots, with a refusal turned into an answer. */
  saveRuns = async (edits) => {
    try {
      const result = await saveSlots({
        scheduleId: this.schedule.schedule.id,
        edits
      });
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

  // ---------- what the editor says ----------

  handleEditorState(event) {
    const { draft, view, dayIndex, groupKey, busy } = event.detail;
    this.draft = draft;
    this.view = view;
    this.dayIndex = dayIndex;
    this.groupKey = groupKey;
    this.editBusy = busy;
  }

  /** An edit was made: a reload already on its way is older than it and must not replace it. */
  handleEdited() {
    this.loadTicket += 1;
    // The week is no longer the version just restored, and a refused Restore is behind it.
    this.restoredId = null;
    this.restoreRefused = false;
    this.loading = false;
    // The week is no longer what was published (a reload says exactly).
    if (this.publishState && !this.publishState.changedSince) {
      this.publishState = { ...this.publishState, changedSince: true };
    }
  }

  handleEditorError(event) {
    this.error = event.detail.message;
  }

  // ---------- choosing a program and week ----------

  get showStillNeeded() {
    return (
      this.editable &&
      !this.loading &&
      !this.draft &&
      this.stillNeeded.length > 0
    );
  }
  /**
   * The screen was left (CampSetup): its message row was about that visit, so it is empty when
   * the screen is opened again (word walk W4).
   */
  @api
  leave() {
    if (this.weekEditor) {
      this.weekEditor.clearMessages();
    }
  }

  /**
   * Another screen kept, renamed, deleted or restored a version of a week (WEEK-6.7): this
   * week's Versions list is read again, without a reload. Only a week started has the list.
   */
  @api
  readVersions(changed) {
    if (this.draft && this.showsWeekOf(changed)) {
      this.buildWeek.loadVersions();
    }
  }

  /**
   * Opens this screen on a week of the season, as choosing it in the week picker does (the
   * Schedules doorway, wiki decision 61). Not while the picker waits on work under way: the
   * week shown stays, and the picker says which it is. True when that week is the one shown.
   */
  @api
  openWeek(weekId) {
    if (!this.weekOptions.some((o) => o.value === weekId)) {
      return false;
    }
    if (weekId === this.weekId) {
      return true;
    }
    if (this.pickersLocked) {
      return false;
    }
    this.weekId = weekId;
    this.load();
    return true;
  }

  /**
   * A reload back where this screen was (Greg 2026-11-12; WEEK-6.3): its program, when still the
   * season's, and its week, as openWeek. True when that is what is shown.
   */
  @api
  openPlace({ programId, weekId }) {
    const program = this.programOptions.some((o) => o.value === programId)
      ? programId
      : this.programId;
    if (program !== this.programId) {
      if (this.pickersLocked) {
        return false;
      }
      const sameWeek = weekId === this.weekId;
      this.programId = program;
      // The week opens with it; a week that isn't there any more: the program on its week shown.
      if (sameWeek || !this.openWeek(weekId)) {
        this.load();
      }
      return true;
    }
    return this.openWeek(weekId);
  }

  /** Opens the chosen week's draft, or finds there is none yet. */
  async load(again = false) {
    const key = `${this.programId}|${this.weekId}`;
    if (!this.canChoose) {
      this.show(null, false);
      this.loadedFor = null;
      // No week shown: a publish question open for the last one goes (nothing was sent).
      this.buildWeek.forgetPublish();
      return;
    }
    if (key === this.loadedFor && !again) {
      return;
    }
    this.loadedFor = key;
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    this.readAfterRun = false;
    if (!again) {
      this.draft = null;
      this.loading = true;
      this.restoredId = null;
      this.restoreRefused = false;
      this.waiting = null;
      // The last week's versions go; a list still on its way is not this one's.
      this.buildWeek.forgetVersions();
      // The last week's setup changes go; a read of them still on its way is dropped.
      this.buildWeek.forgetSetup();
      // A publish question open for the last week goes (nothing was sent).
      this.buildWeek.forgetPublish();
      // The editor lets go of the old week: its notice, box, Undo and what was picked up.
      if (this.weekEditor) {
        this.weekEditor.clear();
      }
    }
    // Publish and Unpublish are disabled while the week is read: one focused gets focus back.
    const focused = this.template.activeElement;
    const focusedId = focused && focused.dataset ? focused.dataset.id : null;
    if (focusedId === "publish" || focusedId === "unpublish") {
      this.focusOn = focusedId;
    }
    this.reads += 1;
    try {
      const draft = await getDraft({
        programId: this.programId,
        weekId: this.weekId
      });
      if (ticket === this.loadTicket) {
        // A reload after a refused save keeps saying why; another week starts clean.
        if (!again) {
          this.error = null;
        }
        // Saved since (by anyone): no longer the version just restored; a refused Restore's
        // Reload is done.
        if (
          !draft ||
          !this.server ||
          draft.schedule.revisions !== this.server.revisions
        ) {
          this.restoredId = null;
          this.restoreRefused = false;
        }
        this.show(draft, !again);
        if (draft) {
          this.buildWeek.loadVersions();
        } else {
          this.versions = [];
          this.loadWeekSources();
        }
      }
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(`${this.weekName} couldn't be opened.`, e);
        this.loadedFor = again ? key : null;
      }
    } finally {
      this.reads -= 1;
      if (ticket === this.loadTicket) {
        this.loading = false;
      }
    }
  }

  /**
   * Coming back to the window shows other people's changes, unless an edit, a Restore or a start
   * is under way. Returns whether the week is read again.
   */
  /**
   * "Set it up" on a cell noted from a file as a special event or day (ADR 0014 slice 4): made
   * on the server from what the file had, then the week and the season are read again (the
   * Special events screen lists it). Resolves to what to say.
   */
  setUpWith = async ({ kind, name }) => {
    const scheduleId = this.schedule && this.schedule.schedule.id;
    if (!scheduleId) {
      return null;
    }
    const done = await setUpItem({ scheduleId, kind, name });
    this.dispatchEvent(new CustomEvent("seasonchanged"));
    this.load(true);
    return done && done.said;
  };

  /**
   * "Take off <day>" on a day a special day replaces (ADR 0014 slice 6): taken off on the server,
   * then the week and the season are read again, so the day's own cells are back. Resolves to
   * what to say.
   */
  takeOffWith = async ({ specialDayId, day }) => {
    const done = await takeOffDay({
      request: { specialDayId, weekId: this.weekId, day, answer: null }
    });
    this.dispatchEvent(new CustomEvent("seasonchanged"));
    this.load(true);
    return done && done.said;
  };

  refresh() {
    if (
      this.draft &&
      !this.versionsWorking &&
      !this.starting &&
      !this.publishing &&
      !this.setupWorking &&
      !this.setupAsk &&
      this.weekEditor &&
      this.weekEditor.settled
    ) {
      this.load(true);
      return true;
    }
    return false;
  }

  show(draft, fresh) {
    if (fresh && draft) {
      this.checksResetKey += 1;
    }
    this.draft = draft;
    this.publishState = (draft && draft.published) || null;
    if (this.weekEditor) {
      this.weekEditor.show(draft, fresh);
    } else {
      this.waiting = { draft, fresh };
    }
    this.buildWeek.loadSetupChanges();
  }

  get leftOut() {
    const lines = (this.draft && this.draft.leftOut) || [];
    return lines.length ? lines : null;
  }

  /** Just after Start a blank week: fixed or recurring activities whose slot was taken. */
  get notPlaced() {
    const lines = (this.draft && this.draft.notPlaced) || [];
    return lines.length ? lines : null;
  }

  get editable() {
    return !this.readOnly;
  }
  get showStart() {
    return (
      this.editable &&
      this.canChoose &&
      !this.loading &&
      !this.draft &&
      !this.error &&
      this.stillNeeded.length === 0
    );
  }

  /** The week and program can't change while a start, a Restore or a publish is on its way. */
  get pickersLocked() {
    return (
      this.starting ||
      this.versionsWorking ||
      this.publishing ||
      this.setupWorking ||
      !!this.setupAsk
    );
  }

  /**
   * Runs a start (blank or from another week) and shows the week it gives; an answer for a week
   * no longer chosen, or older than a reload, is dropped. Returns the draft, or null.
   */
  async startWith(work) {
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    const week = this.weekKey;
    this.starting = true;
    this.error = null;
    try {
      const draft = await work();
      if (ticket !== this.loadTicket) {
        // Started, though the screen has moved on: the other screens still show it (WEEK-6.7).
        if (draft) {
          this.tellSchedulesChanged(true, week);
        }
        return null;
      }
      this.show(draft, true);
      this.focusGridAfterStart = !!draft;
      this.buildWeek.loadVersions();
      // A schedule started: Bring in choices and Elective seats offer it (WEEK-6.7).
      if (draft) {
        this.tellSchedulesChanged(true);
      }
      return draft;
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(`${this.weekName} not started.`, e);
      }
      return null;
    } finally {
      this.starting = false;
    }
  }

  async handleStart() {
    const draft = await this.startWith(() =>
      startBlankWeek({ programId: this.programId, weekId: this.weekId })
    );
    if (draft) {
      this.announce(`Started ${this.weekName}.`);
    }
  }

  // ---------- Start from another week ----------

  get hasWeekSources() {
    return this.weekSources.length > 0;
  }

  /**
   * "Week 2 · Manual Build", "Week 1 · Published schedule" (the week's published schedule now,
   * in the camp's word), "Week 1 · Before the trip (version)".
   */
  get weekSourceItems() {
    return this.weekSources.map((source) => ({
      value: source.id,
      label: source.isPublished
        ? `${source.weekName} · ${this.t.s("PublishedSchedule")}`
        : `${source.weekName} · ${source.name}${source.isVersion ? ` (${this.t.sIn("Version")})${savedWhen(source)}` : ""}`
    }));
  }

  async loadWeekSources() {
    const key = `${this.programId}|${this.weekId}`;
    try {
      const sources = await getWeekSources({
        programId: this.programId,
        weekId: this.weekId
      });
      if (key === `${this.programId}|${this.weekId}`) {
        this.weekSources = sources || [];
      }
    } catch {
      // Without the list, only Start a blank week is offered.
      this.weekSources = [];
    }
  }

  async handleStartFrom(event) {
    const sourceId = event.detail.value;
    const source = this.weekSources.find((s) => s.id === sourceId);
    const draft = await this.startWith(() =>
      startFromWeek({
        programId: this.programId,
        weekId: this.weekId,
        sourceId
      })
    );
    if (!draft) {
      return;
    }
    if (draft.startedBySomeoneElse) {
      // Theirs is shown as they made it: say so, rather than claim a copy.
      this.weekEditor.setNotice(
        `Someone else started this ${this.t.sIn("Week")}; nothing was copied.`
      );
    } else {
      this.announce(
        `Started ${this.weekName} from ${source ? source.weekName : ""}.`
      );
    }
  }

  // ---------- versions (desktop VersionsDropdown, useSnapshots) ----------

  /** Versions wait while a version action, an edit's save or a publish is on its way. */
  get versionsBusy() {
    return (
      this.versionsWorking ||
      this.applying ||
      this.editBusy ||
      this.publishing ||
      this.setupWorking ||
      !!this.setupAsk
    );
  }

  /**
   * Edits wait while a version is restored or saved (Restore would paint over them) and while a
   * publish is on its way (its answer, published or refused, is for the week as it was), and
   * while "Update to match setup" is open or working (what it shows is the week as it is).
   */
  get editsWait() {
    return (
      this.versionsWorking ||
      this.applying ||
      this.publishing ||
      this.setupWorking ||
      !!this.setupAsk
    );
  }

  get applySourceId() {
    return this.schedule ? this.schedule.schedule.id : null;
  }
  get applySeen() {
    return this.server ? this.server.revisions : null;
  }
  /** Save version (c/shoreshBuildWeek): the week as it is now, kept under a name. */
  handleSaveVersion(event) {
    const { name, onDone } = event.detail;
    return this.buildWeek.saveVersion(name, onDone);
  }

  /**
   * Rainy day (repo docs/adr/0019): the week editor switches the day; first the week is kept as
   * an automatic version under the name it gives ("Before rainy Monday"), as on the desktop.
   */
  rainyWith = async (name) => {
    await keepWeekBeforeRain({ scheduleId: this.schedule.schedule.id, name });
    this.buildWeek.loadVersions();
    this.tellSchedulesChanged();
  };

  /**
   * Restore (c/shoreshBuildWeek): the version is copied into the week being built, after the week
   * as it was is kept as "Before Restore" (the way back). Undo starts over, as on the desktop.
   */
  handleRestore(event) {
    return this.buildWeek.restoreVersion(event.detail.id);
  }

  /** The draft as a Restore left it: the counters start over, on screen now, said so. */
  showRestored(draft, id, said) {
    this.checksResetKey += 1;
    this.draft = draft;
    this.publishState = draft.published || null;
    this.weekEditor.restored(draft);
    this.restoredId = id;
    this.buildWeek.loadSetupChanges();
    this.say(said);
  }

  get restoreRefusedText() {
    return this.buildWeek.restoreRefusedText;
  }

  /** Reload after a refused Restore: shows the week as it is now. */
  handleReloadAfterRefusal() {
    this.restoreRefused = false;
    this.load(true);
  }

  handleDeleteVersion(event) {
    return this.buildWeek.deleteVersion(event.detail.id);
  }

  handleRenameVersion(event) {
    const { id, name, onDone } = event.detail;
    return this.buildWeek.renameVersion(id, name, onDone);
  }

  // ---------- Publish (Greg, Manual Build round 1 #1, round 2 #4; ADR 0008 part 5) ----------

  get canPublish() {
    return this.editable && !!this.draft && !this.hasNoDays;
  }
  /** Versions are saved and restored here: not in an archived season (WEEK-1.10). */
  get showVersions() {
    return this.editable && !!this.draft;
  }
  /**
   * Publish and Unpublish wait while an edit saves or a Restore runs (it would publish a week in
   * between), and while the week is read again (after a failed save, or coming back to the
   * window): the question is worked out from what the screen shows, so it waits for the week as
   * it is.
   */
  get publishDisabled() {
    return this.publishing || this.versionsBusy || this.reads > 0;
  }

  /** Publish and Unpublish (c/shoreshBuildWeek): the question first, when there is one. */
  handlePublish() {
    return this.buildWeek.publish();
  }

  handlePublishAnswer(event) {
    return this.buildWeek.answerPublish(event.detail.yes);
  }

  handleUnpublish() {
    this.buildWeek.askUnpublish();
  }

  handleUnpublishAnswer(event) {
    return this.buildWeek.answerUnpublish(event.detail.yes);
  }

  /** "Published from Manual Build " before the date (c/shoreshPublish). */
  get publishedWord() {
    return publishedWord(this.publishState);
  }

  get publishedBy() {
    return this.publishState && this.publishState.publishedBy
      ? ` by ${this.publishState.publishedBy}`
      : "";
  }

  /** The rail's Published: and whether the week changed since (its corner says it to the eye). */
  /**
   * The main button's word: "Published" once the week is out as it is, "Publish" before and
   * again once it has changed since (UX pass 2026-11-10: the word stays on the button, so the bar
   * never grows when a week is published).
   */
  get publishLabel() {
    return this.publishState && !this.publishState.changedSince
      ? "Published"
      : "Publish";
  }

  // The menu beside Publish has a name of its own, never the main button's (word walk
  // 2026-11-12: two buttons both read "Published").
  get publishedName() {
    return this.publishState && this.publishState.changedSince
      ? // Greg's pick (2026-11-12): "Changed since" and what changed.
        "Published: options · Changed since: cells edited"
      : "Published: options";
  }

  /** The program and week shown. */
  get weekKey() {
    return `${this.programId}|${this.weekId}`;
  }

  get startFromLabel() {
    return `Start from another ${this.t.sIn("Week")}`;
  }
  get leftOutLabel() {
    return `Left Open: it couldn't go there this ${this.t.sIn("Week")}`;
  }
  get startLabel() {
    return `Start a blank ${this.t.sIn("Week")}`;
  }

  // ---------- views ----------

  /** The week's draft, where the counter keeps accepted lines (CORE-6.8). */
  get checksScheduleId() {
    return this.schedule && this.schedule.schedule
      ? this.schedule.schedule.id
      : null;
  }
  get schedule() {
    return this.draft ? this.draft.schedule : null;
  }
  get hasNoDays() {
    return !!this.schedule && this.schedule.days.length === 0;
  }

  // ---------- checks and counters ----------

  /** The week checked (c/shoreshEngine checkWeek), by the editor that draws its dots. */
  get checked() {
    // Read so the counter follows the week (the editor's answer is worked out again only when
    // the week or the camp's words change).
    return this.draft && this.weekEditor ? this.weekEditor.checked : null;
  }

  get showCounters() {
    return !!this.draft && !this.hasNoDays && !!this.weekEditor;
  }

  /** The week's measure, for the rail's counter (the editor's, from the same check as its dots). */
  get measure() {
    return this.draft && this.weekEditor ? this.weekEditor.measure : null;
  }

  /** A line takes the director to its bunk's week; the editor shows it. */
  handleLocate(event) {
    this.weekEditor.showLine(event.detail);
  }

  /** An under or over row: that activity, in Activity View. */
  handleShowActivity(event) {
    this.weekEditor.showActivity(event.detail.activityId);
  }
  // ---------- setup changed since the week started (ADR 0008 part 6) ----------

  /**
   * After a save: read again when the week differed from setup (an edit may have settled a
   * difference), an activity is closed or a group away this week, or the edit touched a fixed or
   * recurring activity or a time a group isn't at camp (any of these makes a new difference: the
   * hand edit's reminder in the Why list, Greg 2026-10-26), or when no read has answered yet (the
   * one on its way read the week before this edit).
   */
  handleSaved(event) {
    const preview = this.setupPreview;
    const remind = !!(event && event.detail && event.detail.remind);
    const again = preview
      ? remind ||
        (preview.changes || []).length > 0 ||
        (preview.closedActivityIds || []).length > 0 ||
        (preview.awayGroupIds || []).length > 0
      : !!this.schedule;
    if (again) {
      this.buildWeek.loadSetupChanges();
    }
  }

  /** Setup changed (the menu's foot says so), or it can't be compared (said under the rail). */
  get showSetupChanged() {
    return (
      !!this.draft &&
      !this.hasNoDays &&
      (this.setupChanges.length > 0 || !!this.setupProblem)
    );
  }
  /**
   * Tells the page the week shown and whether the week picker waits on work under way, when
   * either changes: the Schedules doorway holds its other weeks for this screen meanwhile, as
   * the picker does (openWeek). Fires: weekstate { weekId, programId, locked }.
   */
  tellWeekState() {
    const weekId = this.weekId || null;
    const programId = this.programId || null;
    const locked = !!this.pickersLocked;
    const told = this.weekStateTold;
    if (
      told &&
      told.weekId === weekId &&
      told.programId === programId &&
      told.locked === locked
    ) {
      return;
    }
    this.weekStateTold = { weekId, programId, locked };
    this.dispatchEvent(
      new CustomEvent("weekstate", { detail: { weekId, programId, locked } })
    );
  }

  /** The menu's Update to match setup (ADR 0015 §9): the list of what setup changed. */
  @api
  updateToMatchSetup() {
    if (this.showSetupChanged && this.canUpdateToMatch && !this.versionsBusy) {
      this.handleSetupMatch();
    }
  }

  /**
   * A read asked for while the list was read, open or updating, or while a publish or a versions
   * action was on its way (the season read again, a read dropped for it). Not while a refused
   * Restore's line is shown, as on Generated Schedule: its Reload reads the week.
   */
  readAfterSetup() {
    if (this.readAfterRun && !this.restoreRefused && this.refresh()) {
      this.readAfterRun = false;
    }
  }

  /** "Update to match setup" (c/shoreshBuildWeek): the list, read fresh, before anything changes. */
  handleSetupMatch() {
    return this.buildWeek.openSetupMatch();
  }

  handleSetupClose() {
    this.buildWeek.closeSetupMatch();
  }

  handleSetupUpdate(event) {
    return this.buildWeek.updateToMatchSetup(event.detail.keys);
  }

  /** The draft as an update left it: Undo starts over, as after Restore. */
  showUpdated(view) {
    this.checksResetKey += 1;
    this.draft = view;
    this.publishState = view.published || null;
    // What Undo would undo is no longer the week.
    this.weekEditor.restored(view);
    this.restoredId = null;
    this.restoreRefused = false;
  }

  // ---------- day and week tools (Greg, Manual Build round 2, decisions 6 and 7) ----------

  get showTools() {
    return !!this.draft && !this.hasNoDays && this.view !== "activity";
  }
  /**
   * The tools in the rail's Edit menu, after Undo and Redo (ADR 0008 part 7): Clear day and
   * Copy day to… for the day shown in Daily View (Clear day for one of the bunk's days in Group
   * View), then Clear week. They wait while an edit, a Restore or a Publish is under way.
   */
  get editItems() {
    if (!this.showTools) {
      return [];
    }
    const disabled = !!this.editsWait;
    const items = [];
    if (this.isDaily) {
      if (this.dayReadable) {
        items.push({
          value: "clear-day",
          label: "Clear day",
          dataId: "clear-day",
          disabled
        });
      }
      if (this.canCopyDay) {
        items.push({
          value: "copy-day",
          label: "Copy day to…",
          dataId: "copy-day",
          disabled,
          children: this.copyTargets.map((target) => ({
            value: `copy:${target.value}`,
            label: target.label,
            dataId: `copy-day-${target.value}`
          }))
        });
      }
    }
    if (this.isGroup) {
      items.push({
        value: "clear-group-day",
        label: "Clear day",
        dataId: "clear-group-day",
        disabled,
        children: this.clearDayTargets.map((target) => ({
          value: `clear-group-day:${target.value}`,
          label: target.label,
          dataId: `clear-group-day-${target.value}`
        }))
      });
    }
    items.push({
      value: "clear-week",
      label: this.clearWeekLabel,
      dataId: "clear-week",
      disabled
    });
    return items;
  }

  /** A tool chosen in the Edit menu. */
  handleEditSelect(event) {
    const value = String(event.detail.value);
    const [what, target] = value.split(":");
    if (what === "clear-day") {
      this.handleClearDay();
    } else if (what === "copy") {
      this.handleCopyDay({ detail: { value: target } });
    } else if (what === "clear-group-day") {
      this.handleClearGroupDay({ detail: { value: target } });
    } else if (what === "clear-week") {
      this.handleClearWeek();
    }
  }

  /** Clear day and Copy day to… work on the day shown, so only when it can be read. */
  get dayReadable() {
    const day = this.schedule && this.schedule.days[this.dayIndex];
    return !!day && !day.problem;
  }

  get clearWeekLabel() {
    return `Clear ${this.t.sIn("Week")}`;
  }

  /** The week Copy day to… can copy to: the week's other days, and all of them at once. */
  get copyTargets() {
    const others = this.readableDayPills
      .filter((d) => d.index !== this.dayIndex)
      .map((d) => ({ value: String(d.index), label: d.label }));
    return others.length > 1
      ? [...others, { value: "all", label: "All other days" }]
      : others;
  }

  /** The week of the week, for Group View's Clear day (that bunk's day). */
  get clearDayTargets() {
    return this.readableDayPills.map((d) => ({
      value: String(d.index),
      label: d.label
    }));
  }

  /** The week that can be read (a day that can't is never cleared or copied to). */
  get readableDayPills() {
    return days(this.schedule).filter(
      (d) => !this.schedule.days[d.index].problem
    );
  }

  get canCopyDay() {
    return this.dayReadable && this.copyTargets.length > 0;
  }

  dayNameAt(index) {
    return dayLabel(this.schedule.days[index].dateValue).label;
  }

  /** Daily View: the day shown, every bunk. */
  handleClearDay() {
    const name = this.dayNameAt(this.dayIndex);
    this.weekEditor.runTool({
      kind: "clear",
      dates: [this.schedule.days[this.dayIndex].dateValue],
      name
    });
  }

  /** Group View: one day of the bunk shown. */
  handleClearGroupDay(event) {
    const d = Number(event.detail.value);
    const grp = groups(this.schedule).find((g) => g.key === this.groupKey);
    this.weekEditor.runTool({
      kind: "clear",
      dates: [this.schedule.days[d].dateValue],
      groupId: this.groupKey,
      name: `${grp ? grp.name : ""} · ${this.dayNameAt(d)}`
    });
  }

  /** The whole week, every bunk. */
  handleClearWeek() {
    this.weekEditor.runTool({
      kind: "clear",
      dates: this.schedule.days.map((day) => day.dateValue),
      name: this.weekName,
      inWeek: true
    });
  }

  /** Copies the day shown onto another day of the week (or all the other days). */
  handleCopyDay(event) {
    const value = event.detail.value;
    const targets =
      value === "all"
        ? this.copyTargets
            .filter((c) => c.value !== "all")
            .map((c) => Number(c.value))
        : [Number(value)];
    this.weekEditor.runTool({
      kind: "copy",
      from: this.schedule.days[this.dayIndex].dateValue,
      dates: targets.map((t) => this.schedule.days[t].dateValue),
      fromName: this.dayNameAt(this.dayIndex),
      toName: value === "all" ? "all other days" : this.dayNameAt(targets[0])
    });
  }
}
