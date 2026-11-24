/**
 * What Generated Schedule and Manual Build show the same way, word for word: choosing a program
 * and week, what's still needed, the setup dots and the menu's Update, applying to other weeks,
 * Publish's buttons and words, and telling the page what changed. Each screen keeps its own
 * fields and what differs. What acts on the week (Update to match setup, publish, the Versions
 * list and its actions) is c/shoreshBuildWeek; reading the week stays on each screen.
 */
import { campZone } from "c/shoreshCampClock";
import { publishedWord } from "c/shoreshPublish";
import { FIELD } from "c/shoreshSchema";
import { stillNeeded, stillNeededSentence } from "c/shoreshSetupRules";

export const BuildScreen = (Base) =>
  class extends Base {
    /** When it was published, on the camp's clock (CORE-6.11). */
    get campTimeZone() {
      return campZone();
    }
    get t() {
      return this.terms;
    }
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
    // No program or week picker beside ‹ Roots: the editor's own separator before Edit is the
    // only divider it needs.
    get backStandsAlone() {
      return !this.hasSeveralPrograms && !this.canChoose;
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
    get programName() {
      const program = this.programOptions.find(
        (o) => o.value === this.programId
      );
      return program ? program.label : "";
    }
    handleProgram(event) {
      this.programId = event.detail.value;
      this.load();
    }
    handleWeek(event) {
      this.weekId = event.detail.value;
      this.load();
    }
    /** "Open <special day>" from a day it replaces: its schedule, on the Special events screen. */
    handleOpenSpecial(event) {
      this.dispatchEvent(
        new CustomEvent("navigate", {
          detail: {
            screen: "specialEvents",
            specialItemId: event.detail.itemId
          }
        })
      );
    }
    /**
     * A problem chosen in Publish's question (PUB-6.4, PUB-6.5), which is answered no: a cell or a
     * bunk's line, as the Why list goes there; an activity, in Activity View; a special day, on
     * the Special events screen. go: c-shoresh-ask's answer.
     */
    goToProblem(go) {
      if (go.specialItemId) {
        this.handleOpenSpecial({ detail: { itemId: go.specialItemId } });
      } else if (this.weekEditor && go.activityId) {
        this.weekEditor.showActivity(go.activityId);
      } else if (this.weekEditor && go.line) {
        this.weekEditor.showLine(go.line);
      }
    }
    /** What building still needs (desktop readiness.js): Generate and Start wait for all of it. */
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
    handleStillNeeded(event) {
      event.preventDefault();
      this.dispatchEvent(
        new CustomEvent("navigate", {
          detail: { screen: event.currentTarget.dataset.screen }
        })
      );
    }
    get isDaily() {
      return this.view === "day";
    }
    get isGroup() {
      return this.view === "group";
    }
    /** A save failed: what is saved is read again. */
    handleEditorReload() {
      this.load(true);
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
    get setupProblem() {
      return this.setupPreview ? this.setupPreview.problem : null;
    }
    /**
     * Tells the page whether this week can be updated to match setup, and whether its Update waits,
     * when either changes: the menu's foot shows it too (ADR 0015). Fires: setupstate
     * { changed, busy }.
     */
    tellSetupState() {
      const changed = this.showSetupChanged && this.canUpdateToMatch;
      const busy = !!this.versionsBusy;
      const told = this.setupStateTold;
      if (told && told.changed === changed && told.busy === busy) {
        return;
      }
      this.setupStateTold = { changed, busy };
      this.dispatchEvent(
        new CustomEvent("setupstate", { detail: { changed, busy } })
      );
    }
    get canUpdateToMatch() {
      return this.setupChanges.length > 0 && !this.setupProblem;
    }
    get setupHeading() {
      return `Update ${this.weekName} to match setup?`;
    }
    /**
     * Asks the page to put focus on the menu's Update to match setup (setupfocus { focused }: the
     * page says whether it could). False when nothing took it.
     */
    focusMenuUpdate() {
      const detail = { focused: false };
      this.dispatchEvent(new CustomEvent("setupfocus", { detail }));
      return detail.focused;
    }
    /** The season's other weeks, in a season whose days are numbered (WEEK-6.2): else none. */
    get otherWeeks() {
      const season = this._setup && this._setup.season;
      return season && season[FIELD.Season.NumberedDays]
        ? this.weekOptions.filter((o) => o.value !== this.weekId)
        : [];
    }
    get applyLabel() {
      return this.otherWeeks.length
        ? `Apply to other ${this.t.pIn("Week")}`
        : null;
    }
    handleApply() {
      this.applying = true;
    }
    handleApplyClose(event) {
      this.applying = false;
      this.template.querySelector('[data-id="versions"]').focusButton();
      if (event.detail.sourceChanged) {
        this.load(true);
      }
    }
    /** Publish and Unpublish (c/shoreshBuildWeek): the question first, when there is one. */
    handlePublish() {
      return this.buildWeek.publish();
    }
    handlePublishAnswer(event) {
      const done = this.buildWeek.answerPublish(event.detail.yes);
      if (event.detail.go) {
        this.goToProblem(event.detail.go);
      }
      return done;
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
    /**
     * The main button's word: "Published" once the week is out as it is, "Publish" before and
     * again once it has changed since (UX pass 2026-11-10: the word stays on the button, so the
     * bar never grows when a week is published).
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
    /**
     * Something other screens show was just saved here (WEEK-6.7): a version kept, renamed,
     * deleted or restored, a week built or published. season: the season's schedules themselves
     * changed (one started or published), so the page reads the season again; this screen
     * already has its own answer, so that season read doesn't read its week again. week: the
     * "programId|weekId" saved, when the screen has moved on to another since. Fires:
     * scheduleschanged { weekId, programId, season }.
     */
    tellSchedulesChanged(season = false, week = null) {
      const [programId, weekId] = week
        ? week.split("|")
        : [this.programId, this.weekId];
      if (season) {
        this.ownSeasonRead = `${programId}|${weekId}`;
      }
      this.dispatchEvent(
        new CustomEvent("scheduleschanged", {
          detail: { weekId, programId, season }
        })
      );
    }
    /**
     * An activity was added from a cell, or its Undo took it off (LOCK-6.3): the page reads the
     * season again, so Activities and the other screens show it now; this screen already has it,
     * so that read doesn't read its week again. Fires: seasonchanged.
     */
    handleActivitiesChanged() {
      this.ownSeasonRead = `${this.programId}|${this.weekId}`;
      this.dispatchEvent(new CustomEvent("seasonchanged"));
    }
    /**
     * Whether this season read is the one this screen asked for, for the week it shows (it has
     * its own answer already). Asked once per season read: the next one is read as usual.
     */
    seasonReadIsOwn() {
      const own = this.ownSeasonRead === `${this.programId}|${this.weekId}`;
      this.ownSeasonRead = null;
      return own;
    }
    /** Whether a change on another screen ({ weekId, programId }) is about the week shown here. */
    showsWeekOf(changed) {
      const { weekId, programId } = changed || {};
      return (
        this.canChoose &&
        (!weekId || weekId === this.weekId) &&
        (!programId || programId === this.programId)
      );
    }
    /** ‹ Roots on this screen's rail: said again to the page, which goes home (repo ADR 0020). */
    handleBackToRoots(event) {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent("backtoroots", { bubbles: true }));
    }
  };
