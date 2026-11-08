/**
 * What Generated Schedule and Manual Build do the same way, word for word: choosing a program and
 * week, what setup changed, what's still needed, applying to other weeks, and the Versions list.
 * Each screen keeps its own fields and what differs. Publish, restore and reading the week stay
 * on each screen: they look alike but differ, some of it on purpose.
 */
import getVersions from "@salesforce/apex/SchedulesController.getVersions";
import { campZone } from "c/shoreshCampClock";
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
    /**
     * Reads what setup changed since the week was made (its own request, so opening the week costs
     * no more). An answer older than the latest ask, or for a week no longer shown, is dropped.
     * Returns the preview, or null.
     */
    loadSetupChanges() {
      const read = this.readSetupChanges();
      // The newest read, for one that finds it was overtaken (handleSetupMatch).
      this.setupRead = read;
      return read;
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
    /** The list, open again with words to read out (read out even when the same as last time). */
    setupAskWith(notice, announcement, kept, updated = false) {
      this.setupSaid += 1;
      return { notice, announcement, kept, updated, said: this.setupSaid };
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
    async loadVersions() {
      this.versionsTicket += 1;
      const ticket = this.versionsTicket;
      // An older read answering after a newer one (or after another week was chosen) is dropped.
      const latest = () => ticket === this.versionsTicket;
      try {
        const rows = await getVersions({
          programId: this.programId,
          weekId: this.weekId
        });
        if (latest()) {
          this.versions = rows || [];
        }
      } catch {
        // The list shows as empty; the week itself is unaffected.
        if (latest()) {
          this.versions = [];
        }
      }
    }
    /** ‹ Roots on this screen's rail: said again to the page, which goes home (repo ADR 0020). */
    handleBackToRoots(event) {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent("backtoroots", { bubbles: true }));
    }
  };
