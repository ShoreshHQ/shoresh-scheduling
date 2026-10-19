import { LightningElement, api } from "lwc";
import getDraft from "@salesforce/apex/ManualBuildController.getDraft";
import startBlankWeek from "@salesforce/apex/ManualBuildController.startBlankWeek";
import saveSlots from "@salesforce/apex/ManualBuildController.saveSlots";
import saveVersion from "@salesforce/apex/ManualBuildController.saveVersion";
import restoreVersion from "@salesforce/apex/ManualBuildController.restoreVersion";
import deleteVersion from "@salesforce/apex/ManualBuildController.deleteVersion";
import getWeekSources from "@salesforce/apex/ManualBuildController.getWeekSources";
import startFromWeek from "@salesforce/apex/ManualBuildController.startFromWeek";
import previewPublish from "@salesforce/apex/ManualBuildController.previewPublish";
import publish from "@salesforce/apex/ManualBuildController.publish";
import unpublish from "@salesforce/apex/ManualBuildController.unpublish";
import getSetupChanges from "@salesforce/apex/SetupMatchController.getSetupChanges";
import updateToMatchSetup from "@salesforce/apex/SetupMatchController.updateToMatchSetup";
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import renameSchedule from "@salesforce/apex/SchedulesController.renameSchedule";
import { errorMessage, failed } from "c/shoreshErrors";
import { dayLabel, days, groups } from "c/shoreshScheduleViews";
import { stillNeeded, stillNeededSentence } from "c/shoreshSetupRules";
import { publishQuestion } from "c/shoreshPublish";

/**
 * " · Jun 29, 9:00 AM": when a version was saved, as Versions shows it, so versions with the same
 * name can be told apart. Empty when unknown, or when the name already says it (a copy kept when
 * the week was published again or unpublished: "Published Oct 18, 2:40 PM").
 */
function savedWhen(source) {
  if (!source.savedAt || source.namedByPublish) {
    return "";
  }
  return ` · ${new Date(source.savedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

/**
 * Manual Build (desktop: the Manual schedule): a program's week built by hand. This screen
 * chooses the program and week, opens or starts it (a week not started yet offers "Start a blank
 * week" or "Start from another week"), keeps its versions (Save, Restore), counts what the week
 * still needs, offers Clear day, Clear week and Copy day, and publishes the week (Publish: what
 * would change and what is still to do are shown first; Unpublish asks first; SchedulePublish),
 * and shows what setup changed since the week started (a dot on each cell it changed), with
 * "Update to match setup" one change at a time or all at once, shown first (SetupMatch).
 * The week itself is drawn and edited
 * by c-shoresh-week-editor (drag, type, keyboard, Undo and Redo, "keep theirs or use yours");
 * this screen hands it the week, saves what it sends through saveRuns, and hears what changed.
 *
 * setup: the season (SeasonSetupController.getSeasonSetup). terms: the camp's words.
 */
export default class ShoreshManualBuild extends LightningElement {
  @api terms;

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
  // Changes when a week is shown fresh: the counters' list closes and its accepted lines return.
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
  // The question before publishing (c-shoresh-ask): { heading, lines, confirmLabel, preview, week }.
  publishAsk = null;
  // The question before unpublishing: { heading, lines, publishedId, week }.
  unpublishAsk = null;
  // Where focus goes back to once it is drawn enabled again ("publish" or "unpublish"), or null.
  focusOn = null;
  // What setup changed since the week started (SetupMatch.Preview), for the week shown, or null.
  setupPreview = null;
  setupTicket = 0;
  // The "couldn't check against setup" message while it is shown, so a later read that works
  // clears it and nothing else.
  setupError = null;
  // "Update to match setup" is open, or null: { notice, announcement, said (counts each time
  // its words are to be read out, even the same words again), kept (an update in this opening
  // kept the week as it was, so the next keeps none) }. setupWorking: an update is on its way.
  setupAsk = null;
  setupWorking = false;
  setupSaid = 0;
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
    this.load();
  }

  connectedCallback() {
    this.onWindowFocus = () => this.refresh();
    window.addEventListener("focus", this.onWindowFocus);
  }

  disconnectedCallback() {
    window.removeEventListener("focus", this.onWindowFocus);
  }

  renderedCallback() {
    if (this.waiting && this.weekEditor) {
      const { draft, fresh } = this.waiting;
      this.waiting = null;
      this.weekEditor.show(draft, fresh);
    }
    // Publish and Unpublish are disabled while they work and while the week is read again, so
    // focus fell from them: it goes back once they are drawn enabled again (WCAG 2.4.3), unless
    // the director has put it somewhere else meanwhile.
    if (this.focusOn && !this.publishDisabled) {
      // Unpublish is gone once the week has nothing published: Publish then.
      const button =
        this.template.querySelector(`[data-id="${this.focusOn}"]`) ||
        this.template.querySelector('[data-id="publish"]');
      this.focusOn = null;
      if (button && this.focusIsLost()) {
        button.focus();
      }
    }
  }

  /**
   * Focus fell to the page (or stayed on Publish or Unpublish while they were disabled), rather
   * than being on something the director chose since.
   */
  focusIsLost() {
    const inside = this.template.activeElement;
    if (inside) {
      const id = inside.dataset ? inside.dataset.id : null;
      return id === "publish" || id === "unpublish";
    }
    const page = document.activeElement;
    return !page || page === document.body;
  }

  get t() {
    return this.terms;
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
        message: errorMessage(e)
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

  /** A save failed: what is saved is read again. */
  handleEditorReload() {
    this.load(true);
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
    return this.t.s("Program");
  }
  get weekLabel() {
    return this.t.s("Week");
  }
  get hasSeveralPrograms() {
    return this.programOptions.length > 1;
  }
  get canChoose() {
    return !!this.programId && !!this.weekId;
  }
  /** What building still needs (desktop readiness.js): Start waits for all of it. */
  get stillNeeded() {
    return stillNeeded(this._setup, this.t, this.programId);
  }
  /** The desktop's one sentence, each missing thing a link to its screen. */
  get stillNeededParts() {
    return stillNeededSentence(this.stillNeeded);
  }
  /** The desktop's main action: "Set up <the first thing missing>". */
  get setUpFirstLabel() {
    const [first] = this.stillNeeded;
    return first ? `Set up ${first.label}` : "";
  }
  get setUpFirstScreen() {
    const [first] = this.stillNeeded;
    return first ? first.screen : null;
  }
  get showStillNeeded() {
    return !this.loading && !this.draft && this.stillNeeded.length > 0;
  }
  handleStillNeeded(event) {
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent("navigate", {
        detail: { screen: event.currentTarget.dataset.screen }
      })
    );
  }

  handleProgram(event) {
    this.programId = event.detail.value;
    this.load();
  }
  handleWeek(event) {
    this.weekId = event.detail.value;
    this.load();
  }

  /** Opens the chosen week's draft, or finds there is none yet. */
  async load(again = false) {
    const key = `${this.programId}|${this.weekId}`;
    if (!this.canChoose) {
      this.show(null, false);
      this.loadedFor = null;
      return;
    }
    if (key === this.loadedFor && !again) {
      return;
    }
    this.loadedFor = key;
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    if (!again) {
      this.draft = null;
      this.loading = true;
      this.restoredId = null;
      this.restoreRefused = false;
      this.waiting = null;
      this.setupPreview = null;
      // A read of the last week's setup changes still on its way is dropped.
      this.setupTicket += 1;
      this.setupAsk = null;
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
          this.loadVersions();
        } else {
          this.versions = [];
          this.loadWeekSources();
        }
      }
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(
          `${this.weekName} couldn't be opened. Nothing was changed.`,
          e
        );
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
   * is under way.
   */
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
    }
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
    this.loadSetupChanges();
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

  get showStart() {
    return (
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
    this.starting = true;
    this.error = null;
    try {
      const draft = await work();
      if (ticket !== this.loadTicket) {
        return null;
      }
      this.show(draft, true);
      this.loadVersions();
      return draft;
    } catch (e) {
      if (ticket === this.loadTicket) {
        this.error = failed(
          `${this.weekName} not started. Nothing was saved.`,
          e
        );
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
      this.publishing ||
      this.setupWorking ||
      !!this.setupAsk
    );
  }

  async loadVersions() {
    const key = `${this.programId}|${this.weekId}`;
    try {
      const rows = await getVersions({
        programId: this.programId,
        weekId: this.weekId
      });
      if (key === `${this.programId}|${this.weekId}`) {
        this.versions = rows || [];
      }
    } catch {
      // The list shows as empty; the week itself is unaffected.
      this.versions = [];
    }
  }

  /**
   * Runs a versions action, then reads the list again before it is done (so the list never shows
   * a version just deleted as if it were there); refused ones say why.
   */
  async versionsAction(work) {
    this.versionsWorking = true;
    this.error = null;
    try {
      await work();
      return true;
    } catch (e) {
      this.error = errorMessage(e);
      return false;
    } finally {
      await this.loadVersions();
      this.versionsWorking = false;
    }
  }

  /** Save version: the week as it is now, kept under a name. */
  async handleSaveVersion(event) {
    const { name, onDone } = event.detail;
    const saved = await this.versionsAction(() =>
      saveVersion({ scheduleId: this.schedule.schedule.id, name })
    );
    if (saved) {
      this.say(`Saved ${name}.`);
    }
    onDone(saved);
  }

  /**
   * Restore: the version is copied into the week being built, after the week as it was is kept
   * as "Before Restore" (the way back). Undo starts over, as on the desktop.
   */
  async handleRestore(event) {
    const id = event.detail.id;
    const version = this.versions.find((v) => v.id === id);
    if (this.versionsBusy) {
      this.say("One moment: an edit is still saving.");
      return;
    }
    // A reload already on its way read the week before this Restore: its answer must not
    // replace the restored week. A change of week while it runs drops this answer.
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    this.restoreRefused = false;
    await this.versionsAction(async () => {
      const draft = await restoreVersion({
        scheduleId: this.schedule.schedule.id,
        versionId: id,
        seenRevisions: this.server ? this.server.revisions : null
      });
      if (ticket !== this.loadTicket) {
        return;
      }
      if (draft.changedSince) {
        // Nothing was changed: someone else's newer week is never replaced unseen.
        this.restoreRefused = true;
        // Its line (with Reload) is on screen; said aloud too.
        this.announce(this.restoreRefusedText);
        return;
      }
      this.checksResetKey += 1;
      this.draft = draft;
      this.publishState = draft.published || null;
      this.weekEditor.restored(draft);
      this.restoredId = id;
      this.loadSetupChanges();
      this.say(`Restored ${version ? version.name : ""}.`);
    });
  }

  get restoreRefusedText() {
    return `Someone else changed this ${this.t.sIn("Week")} since you opened it, so nothing was restored.`;
  }

  /** Reload after a refused Restore: shows the week as it is now. */
  handleReloadAfterRefusal() {
    this.restoreRefused = false;
    this.load(true);
  }

  async handleDeleteVersion(event) {
    if (this.versionsBusy) {
      return;
    }
    const id = event.detail.id;
    const version = this.versions.find((v) => v.id === id);
    const done = await this.versionsAction(() =>
      deleteVersion({ scheduleId: this.schedule.schedule.id, versionId: id })
    );
    if (done) {
      this.say(`Deleted ${version ? version.name : ""}.`);
    }
  }

  async handleRenameVersion(event) {
    const { id, name, onDone } = event.detail;
    const renamed = await this.versionsAction(() =>
      renameSchedule({ scheduleId: id, name })
    );
    onDone(renamed);
  }

  // ---------- Publish (Greg, Manual Build round 1 #1, round 2 #4; ADR 0008 part 5) ----------

  get canPublish() {
    return !!this.draft && !this.hasNoDays;
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

  /**
   * Publish: the server's preview says what would change; with the week's checks, that decides
   * whether to ask first (c/shoreshPublish). A week already published as it is needs nothing.
   */
  async handlePublish() {
    if (this.editBusy) {
      this.say("One moment: an edit is still saving.");
      return;
    }
    // Edits, Restore and the pickers wait while publishing, so the answer is for this week; one
    // for a week no longer shown is dropped.
    const week = this.weekKey;
    this.publishing = true;
    this.error = null;
    try {
      const preview = await previewPublish({
        scheduleId: this.schedule.schedule.id
      });
      if (week !== this.weekKey) {
        return;
      }
      // Someone else saved the week since this screen read it: what would be published isn't
      // what is shown. Nothing is published; the week is read again for the director to see.
      if (preview.revisions !== (this.server ? this.server.revisions : null)) {
        this.refusePublish(this.draftChangedText);
        return;
      }
      const checks = this.template.querySelector("c-shoresh-week-checks");
      const question = publishQuestion({
        preview,
        checked: this.checked,
        // What the counters count now (lines the director accepted aside).
        counts: checks ? checks.counts : null,
        weekName: this.weekName,
        t: this.t
      });
      if (question.kind === "same") {
        this.publishState = { ...preview.published, changedSince: false };
        this.say(`${this.weekName} is already published as it is.`);
      } else if (question.kind === "now") {
        await this.publishNow(preview, week);
      } else {
        this.publishAsk = { ...question, preview, week };
      }
    } catch (e) {
      this.error = failed(`${this.weekName} was not published.`, e);
    } finally {
      if (!this.publishAsk) {
        this.publishing = false;
        // Publish was disabled while it worked, so focus fell from it: it goes back once Publish
        // is drawn enabled again (WCAG 2.4.3), unless another week is shown by then.
        if (week === this.weekKey) {
          this.focusOn = "publish";
        }
      }
    }
  }

  async handlePublishAnswer(event) {
    const ask = this.publishAsk;
    this.publishAsk = null;
    try {
      if (event.detail.yes) {
        // The server refuses it if the week changed since the preview.
        await this.publishNow(ask.preview, ask.week);
      }
    } catch (e) {
      this.error = failed(`${this.weekName} was not published.`, e);
    } finally {
      this.publishing = false;
      // The question is gone: focus goes back to where it started (WCAG 2.4.3).
      this.focusOn = "publish";
    }
  }

  /**
   * Unpublish (Greg, 2026-10-18): asks first, Cancel focused. The week then has no published
   * schedule; the one it had is kept in Versions, marked Published, as one replaced is.
   */
  handleUnpublish() {
    if (!this.publishState) {
      return;
    }
    this.publishing = true;
    this.error = null;
    this.unpublishAsk = {
      heading: `Unpublish ${this.weekName}?`,
      lines: [`Nothing will be published for this ${this.t.sIn("Week")}.`],
      publishedId: this.publishState.id,
      week: this.weekKey
    };
  }

  async handleUnpublishAnswer(event) {
    const ask = this.unpublishAsk;
    this.unpublishAsk = null;
    try {
      if (event.detail.yes) {
        await this.unpublishNow(ask);
      }
    } catch (e) {
      this.error = failed(`${this.weekName} was not unpublished.`, e);
    } finally {
      this.publishing = false;
      // Back to Unpublish (WCAG 2.4.3), or to Publish once the week has nothing published.
      if (ask.week === this.weekKey) {
        this.focusOn = "unpublish";
      }
    }
  }

  /** Refused when the week was published or unpublished since the screen showed it. */
  async unpublishNow(ask) {
    const reload = this.dropReload();
    try {
      const result = await unpublish({
        scheduleId: this.schedule.schedule.id,
        seenPublishedId: ask.publishedId
      });
      if (ask.week !== this.weekKey) {
        return;
      }
      if (result.publishedChanged) {
        reload.done = true;
        this.refusePublish(
          `Someone else published or unpublished this ${this.t.sIn("Week")} since, so nothing was unpublished.`
        );
        return;
      }
      this.publishState = null;
      this.say(`Unpublished ${this.weekName}.`);
      // The copy is a version now: Versions lists it straight away.
      await this.loadVersions();
    } finally {
      this.readAgain(reload, ask.week);
    }
  }

  /**
   * A reload already on its way read the week before Publish or Unpublish: its answer must not
   * show the old publish state again. It is dropped, and the week is read again once the answer
   * is in, so what the reload was for (a failed save, other people's changes) is still shown.
   */
  dropReload() {
    const dropped = this.reads > 0;
    this.loadTicket += 1;
    return { dropped, done: false };
  }

  readAgain(reload, week) {
    if (reload.dropped && !reload.done && week === this.weekKey) {
      this.load(true);
    }
  }

  /**
   * Publishes the week the preview showed; a week or publish changed since is refused. The
   * answer is always shown, unless another week (week, program) is shown by then.
   */
  async publishNow(preview, week) {
    const reload = this.dropReload();
    try {
      const result = await publish({
        scheduleId: this.schedule.schedule.id,
        seenRevisions: preview.revisions,
        seenPublishedId: preview.published ? preview.published.id : null
      });
      if (week !== this.weekKey) {
        return;
      }
      if (result.draftChanged || result.publishedChanged) {
        reload.done = true;
        this.refusePublish(
          result.draftChanged
            ? this.draftChangedText
            : `Someone else published this ${this.t.sIn("Week")} since, so nothing was replaced.`
        );
        return;
      }
      this.publishState = { ...result.published, changedSince: false };
      this.say(
        result.unchanged
          ? `${this.weekName} is already published as it is.`
          : `Published ${this.weekName}.`
      );
      if (!result.unchanged) {
        // A published schedule it replaced is a version now: Versions lists it straight away.
        await this.loadVersions();
      }
    } finally {
      this.readAgain(reload, week);
    }
  }

  get draftChangedText() {
    return `Someone else changed this ${this.t.sIn("Week")} since, so nothing was published.`;
  }

  /** Nothing was published: what changed is shown, and the director looks again. */
  refusePublish(text) {
    this.weekEditor.setNotice(text);
    this.load(true);
  }

  /** "Published " before the date: a template drops the space after a word on its own. */
  get publishedWord() {
    return "Published ";
  }

  get publishedBy() {
    return this.publishState && this.publishState.publishedBy
      ? ` by ${this.publishState.publishedBy}`
      : "";
  }

  /** The program and week shown. */
  get weekKey() {
    return `${this.programId}|${this.weekId}`;
  }

  get weekName() {
    const week = this.weekOptions.find((o) => o.value === this.weekId);
    return week ? week.label : "";
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

  get schedule() {
    return this.draft ? this.draft.schedule : null;
  }
  get hasNoDays() {
    return !!this.schedule && this.schedule.days.length === 0;
  }

  // ---------- checks and counters ----------

  /** The week checked (c/shoreshEngine checkWeek), by the editor that draws its dots. */
  get checked() {
    // Read so the counters follow the week (the editor's answer is worked out again only when
    // the week or the camp's words change).
    return this.draft && this.weekEditor ? this.weekEditor.checked : null;
  }

  get showCounters() {
    return !!this.draft && !this.hasNoDays && !!this.weekEditor;
  }

  /** A line takes the director to its bunk's week; the editor shows it. */
  handleLocate(event) {
    this.weekEditor.showLine(event.detail);
  }
  get programName() {
    const program = this.programOptions.find((o) => o.value === this.programId);
    return program ? program.label : "";
  }

  // ---------- setup changed since the week started (ADR 0008 part 6) ----------

  /**
   * Reads what setup changed since the week started (its own request, so opening the week costs
   * no more). An answer for a week no longer shown, or older than the latest ask, is dropped.
   * Returns the preview, or null.
   */
  async loadSetupChanges() {
    const scheduleId =
      this.schedule && this.schedule.schedule
        ? this.schedule.schedule.id
        : null;
    this.setupTicket += 1;
    const ticket = this.setupTicket;
    if (!scheduleId) {
      this.setupPreview = null;
      return null;
    }
    try {
      const preview = await getSetupChanges({ scheduleId });
      if (ticket !== this.setupTicket) {
        return null;
      }
      this.setupPreview = preview;
      // Checked now: a "couldn't check" from an earlier read goes (any other error stays).
      if (this.error && this.error === this.setupError) {
        this.error = null;
      }
      this.setupError = null;
      return preview;
    } catch (e) {
      // Said, never hidden: the dots and the box stay as last read rather than vanishing, which
      // would make the week look as if it matched setup.
      if (ticket === this.setupTicket) {
        this.error = failed(
          `Shoresh couldn't check ${this.weekName} against setup.`,
          e
        );
        this.setupError = this.error;
      }
      return null;
    }
  }

  /**
   * After a save: read again when the week differed from setup (an edit may have settled a
   * difference) or an activity is closed this week (placing one makes a new difference).
   */
  handleSaved() {
    const preview = this.setupPreview;
    if (
      preview &&
      ((preview.changes || []).length > 0 ||
        (preview.closedActivityIds || []).length > 0)
    ) {
      this.loadSetupChanges();
    }
  }

  /** The cells setup changed, as the editor takes them: cell key to the dot's words. */
  get setupDots() {
    const preview = this.setupPreview;
    if (this.setupDotsMemo.preview !== preview) {
      this.setupDotsMemo = {
        preview,
        dots: new Map(
          ((preview && preview.dots) || []).map((dot) => [dot.key, dot.words])
        )
      };
    }
    return this.setupDotsMemo.dots;
  }

  get setupChanges() {
    return (this.setupPreview && this.setupPreview.changes) || [];
  }

  /** The line under the toolbar: setup changed (with its button), or why it can't be compared. */
  get showSetupChanged() {
    return (
      !!this.draft &&
      !this.hasNoDays &&
      (this.setupChanges.length > 0 || !!this.setupProblem)
    );
  }
  get setupProblem() {
    return this.setupPreview ? this.setupPreview.problem : null;
  }
  /**
   * True whether setup changed since the week started or an activity closed this week was placed
   * by hand (still allowed, as on the desktop, with its "Not running this week" dot).
   */
  get setupChangedText() {
    return this.setupProblem || `${this.weekName} doesn't match setup`;
  }
  get canUpdateToMatch() {
    return this.setupChanges.length > 0 && !this.setupProblem;
  }
  get setupHeading() {
    return `Update ${this.weekName} to match setup?`;
  }

  /**
   * "Update to match setup": what it would change is read fresh and shown first; nothing changes
   * until the director chooses a change, or all of them.
   */
  async handleSetupMatch() {
    if (this.editBusy || this.versionsWorking || this.publishing) {
      this.say("One moment: an edit is still saving.");
      return;
    }
    const week = this.weekKey;
    this.setupWorking = true;
    try {
      const preview = await this.loadSetupChanges();
      if (week !== this.weekKey || !preview) {
        return;
      }
      if (preview.problem) {
        // Can't be compared now: said, never "matches" (the box says the same).
        this.say(preview.problem);
      } else if (preview.changes.length) {
        // A new opening of the list: its first update that takes a placement keeps a version.
        this.setupAsk = { notice: null, kept: false };
      } else {
        this.say(`${this.weekName} matches setup.`);
      }
    } finally {
      this.setupWorking = false;
      if (!this.setupAsk) {
        this.focusOn = "update-to-match";
      }
    }
  }

  handleSetupClose() {
    this.setupAsk = null;
    this.focusOn = "update-to-match";
  }

  /**
   * Makes the chosen changes, on the week as the list showed it. Refused, with nothing changed,
   * when someone saved the week since (it is read again) or setup changed again (the list shows
   * what it would change now). After one change the list stays open with what is left.
   */
  async handleSetupUpdate(event) {
    const keys = event.detail.keys;
    const preview = this.setupPreview;
    if (!preview || !keys.length || this.setupWorking || !this.setupAsk) {
      return;
    }
    let kept = this.setupAsk.kept;
    // A reload already on its way read the week before this update: its answer must not
    // replace the updated week. A change of week while it runs drops this answer.
    this.loadTicket += 1;
    const ticket = this.loadTicket;
    this.setupWorking = true;
    this.error = null;
    try {
      const result = await updateToMatchSetup({
        scheduleId: this.schedule.schedule.id,
        ask: { keys, seenRevisions: preview.revisions, versionKept: kept }
      });
      if (ticket !== this.loadTicket) {
        return;
      }
      if (result.refused === "changedSince") {
        this.setupAsk = null;
        this.weekEditor.setNotice(
          `Someone else changed this ${this.t.sIn("Week")} since, so nothing was updated.`
        );
        this.load(true);
        return;
      }
      if (result.refused === "setupChanged") {
        const fresh = await this.loadSetupChanges();
        const again =
          "Setup changed again since you looked, so nothing was updated.";
        this.setupAsk =
          fresh && fresh.changes.length
            ? this.setupAskWith(
                `${again} This is what it would change now.`,
                null,
                kept
              )
            : null;
        if (fresh && !this.setupAsk) {
          // Nothing left to change (or it can't be compared now): the list closes, and says why.
          this.say(
            `${again} ${fresh.problem || `${this.weekName} matches setup now.`}`
          );
        }
        return;
      }
      this.checksResetKey += 1;
      this.draft = result.view;
      this.publishState = result.view.published || null;
      // Undo starts over, as after Restore: what it would undo is no longer the week.
      this.weekEditor.restored(result.view);
      this.restoredId = null;
      this.restoreRefused = false;
      kept = kept || !!result.kept;
      if (result.kept) {
        // Versions lists the week as it was, kept just now.
        this.loadVersions();
      }
      const done =
        keys.length === 1
          ? "Updated to match setup."
          : `Updated ${keys.length} changes to match setup.`;
      const fresh = await this.loadSetupChanges();
      const all = keys.length === preview.changes.length;
      // While the list stays open it says so itself: a screen reader in the dialog hears only
      // the dialog.
      this.setupAsk =
        !all && fresh && fresh.changes.length
          ? this.setupAskWith(null, done, kept)
          : null;
      if (!this.setupAsk) {
        this.say(done);
      }
    } catch (e) {
      this.setupAsk = null;
      this.error = failed(`${this.weekName} was not updated.`, e);
    } finally {
      this.setupWorking = false;
      if (!this.setupAsk) {
        this.focusOn = "update-to-match";
      }
    }
  }

  /** The list, open again with words to read out (read out even when the same as last time). */
  setupAskWith(notice, announcement, kept) {
    this.setupSaid += 1;
    return { notice, announcement, kept, said: this.setupSaid };
  }

  // ---------- day and week tools (Greg, Manual Build round 2, decisions 6 and 7) ----------

  get showTools() {
    return !!this.draft && !this.hasNoDays && this.view !== "activity";
  }
  get isDaily() {
    return this.view === "day";
  }
  get isGroup() {
    return this.view === "group";
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
