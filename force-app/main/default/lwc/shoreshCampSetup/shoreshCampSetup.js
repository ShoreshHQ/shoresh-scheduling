import { LightningElement, wire } from "lwc";
import { CurrentPageReference } from "lightning/navigation";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import { loadStyle } from "lightning/platformResourceLoader";
import DATE_BOX from "@salesforce/resourceUrl/ShoreshDateBox";
import TABLE from "@salesforce/resourceUrl/ShoreshTable";
import FONTS from "@salesforce/resourceUrl/ShoreshFonts";
import getCamps from "@salesforce/apex/SeasonSetupController.getCamps";
import getSeasons from "@salesforce/apex/SeasonSetupController.getSeasons";
import getLabels from "@salesforce/apex/SeasonSetupController.getLabels";
import getSeasonSetup from "@salesforce/apex/SeasonSetupController.getSeasonSetupInCamp";
import saveRecords from "@salesforce/apex/SeasonSetupController.saveRecords";
import deleteRecord from "@salesforce/apex/SeasonSetupController.deleteRecord";
import addWeeksFromSeasonDates from "@salesforce/apex/SeasonSetupController.addWeeksFromSeasonDates";
import saveRow from "@salesforce/apex/SetupTablesController.saveRow";
import scheduleUses from "@salesforce/apex/SetupTablesController.scheduleUses";
import mergeLocations from "@salesforce/apex/SetupTablesController.mergeLocations";
import placedInWeeks from "@salesforce/apex/RunsInController.placedInWeeks";
import saveActivityDetails from "@salesforce/apex/ActivitiesController.saveActivityDetails";
import undoImport from "@salesforce/apex/ImportController.undoImport";
import confirmGuess from "@salesforce/apex/SetupGuessesController.confirmGuess";
import { undoMessage } from "c/shoreshImportEngine";
import { buildTerms } from "c/shoreshTerms";
import { menuMarks, setupProblems, turnOffQuestion } from "c/shoreshSetupRules";
import { failed } from "c/shoreshErrors";
import {
  canOpen,
  menuSections,
  nextScreen,
  previewScreen,
  screenLabels
} from "c/shoreshScreens";
import { leftField } from "c/shoreshSavedMark";
import {
  briefOf,
  placedOnText,
  scheduleText,
  seededLines,
  specialOf
} from "c/shoreshSpecialDetails";
import { CHILDREN, FIELD, OBJECT, PARENT } from "c/shoreshSchema";

// Names as the package has them (c/shoreshSchema).
const SEASON = FIELD.Season;
const WEEK = FIELD.Week;
const LOCATION = FIELD.Location;
const ACTIVITY = FIELD.Activity;
// The season forms' inputs (their data-field) and the season fields they hold. A season's Status
// stays in the data but is not shown: it changed nothing a director could see (decision 26 (5)).
const SEASON_INPUTS = {
  name: "Name",
  start: SEASON.StartDate,
  end: SEASON.EndDate
};
// The two dates, saved together (see saveSeasonField).
const SEASON_DATES = ["start", "end"];
// The schedules: their rail, grid and drawer are the frame's zones (each with its own inset); and
// the setup screens in the shared table pattern: their rail, then their list (ADR 0015 choice 11).
const FLUSH_SCREENS = new Set([
  "manualBuild",
  "generatedSchedule",
  "weeks",
  "divisions",
  "groups",
  "timeBlocks",
  "locations",
  "activities",
  "fixedActivities",
  "recurringActivities",
  "specialEvents",
  "bringInChoices"
]);
// The setup screens with a rail: what each counts, and in which of the camp's words.
const COUNTED = {
  weeks: "Week",
  divisions: "Division",
  groups: "Group",
  timeBlocks: "TimeBlock",
  locations: "Location",
  activities: "Activity",
  fixedActivities: "FixedActivity",
  recurringActivities: "RecurringActivity"
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
  "specialEvents",
  "generatedSchedule",
  "manualBuild",
  "schedules",
  "import",
  "bringInChoices"
];

/**
 * What deleting a season takes with it, one line per kind that has any ("4 Weeks"), in the
 * camp's words; saved schedules last. A season with nothing in it says so.
 */
export function seasonContents(setup, t) {
  const programs = setup.programs || [];
  const inPrograms = (pick) =>
    programs.reduce((sum, entry) => sum + pick(entry), 0);
  const counts = [
    ["Week", (setup.weeks || []).length],
    ["Program", programs.length],
    ["Division", inPrograms((e) => (e.divisions || []).length)],
    [
      "Group",
      inPrograms((e) =>
        (e.divisions || []).reduce((n, d) => n + (d.groups || []).length, 0)
      )
    ],
    ["TimeBlock", inPrograms((e) => (e.timeBlocks || []).length)],
    ["Location", (setup.locations || []).length],
    ["Activity", (setup.activities || []).length],
    ["FixedActivity", inPrograms((e) => (e.fixedActivities || []).length)],
    [
      "RecurringActivity",
      inPrograms((e) => (e.recurringActivities || []).length)
    ],
    ["SpecialDay", specialOf(setup).specialDays.length],
    ["SpecialEvent", specialOf(setup).specialEvents.length]
  ];
  const lines = counts
    .filter(([, n]) => n > 0)
    .map(([term, n]) => `${n} ${n === 1 ? t.s(term) : t.p(term)}`);
  const schedules = (setup.schedules || []).length;
  if (schedules) {
    lines.push(
      `${schedules} saved ${schedules === 1 ? "schedule" : "schedules"}`
    );
  }
  return lines.length ? lines : ["Nothing set up in it yet"];
}

/** The element with focus, looking inside components (their shadow roots). */
/** An activity's priority section: High, or Low (blank is Low, ADR 0002 choice 10). */
function isHighPriority(activity) {
  return activity[ACTIVITY.Priority] === "High";
}
function isLowPriority(activity) {
  return !isHighPriority(activity);
}

function focusedElement() {
  let element = document.activeElement;
  while (element && element.shadowRoot && element.shadowRoot.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element;
}

/**
 * The Shoresh page: a director picks (or starts) a season, then moves between screens with the
 * left-hand menu (desktop-style): Roots, the home, and one screen each for weeks, programs,
 * divisions, groups, time blocks, locations, camp words, activities, fixed activities, and
 * recurring activities, and the schedule page (Schedules). A season can also be
 * copied to start a new one. Every model term is shown in the camp's own words.
 *
 * Every screen stays on the page while another is shown, so typing that is not saved yet is still
 * there when the director comes back to it. Each setup screen ends with the next one's button, in
 * menu order (desktop SetupScreenShell.jsx).
 *
 * The season's name and dates are edited next to the season picker, and saved as you go like
 * everything else in setup (decision 26 (4) and (5)).
 */
/** "A", "A and B", "A, B and C". */
function andList(parts) {
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

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
  // The season's details, opened from the pencil beside the season picker.
  seasonOpen = false;
  // Season fields changed and not sent yet; and those sent, not yet answered (field -> count).
  seasonDirty = new Set();
  seasonSending = new Map();
  // Why a season field's last save was refused: data-field -> message, shown under it.
  seasonErrors = {};
  // A screen whose heading takes the cursor once it shows (after the menu or a "next" button).
  focusHeadingOf = null;
  // Something else that takes the cursor at the next render (a selector), such as the button
  // that opened New season once it is cancelled.
  focusAfter = null;
  // The top message last brought into view.
  errorShown = null;
  // Which location type the Locations table shows; "all" shows every location.
  locationFilter = "all";
  // "Same location?" while it is asked: the places, [{ id, name, fits, activities }].
  sameLocation = null;
  // The activity whose details are open (opened from its row), or null.
  activityDetailsFor = null;
  // The special day or event whose details are open, or null.
  specialDetailsFor = null;
  // The special day or event whose schedule is open in the list's place, or null; and whether
  // anything inside it was saved since it opened.
  specialScheduleFor = null;
  specialScheduleChanged = false;
  // What the special day just added started from, said under the list (role=status).
  seededNote = "";
  // The screen the page's address asks for (?c__preview=bringInChoices, repo ADR 0017 choice 19),
  // and whether it has been opened once (after that the menu leads, as for any screen).
  preview = null;
  previewOpened = false;
  // Why the last Merge was refused, shown in the question only (one alert, not two).
  sameLocationError = null;
  // Merging: the question's buttons wait.
  merging = false;
  // A delete's question is open, or the delete is under way.
  deleting = false;
  // A program card just deleted: its place in the list, so the cursor goes to its neighbour once
  // the card is gone and the page is no longer busy (null when none).
  focusAfterProgramDelete = null;
  // The Programs screen's live region: "Deleted Main" after a card's delete.
  programsAnnouncement = "";
  programsAnnounced = false;
  // Whether each schedule screen's week can be updated to match setup: screen -> { changed, busy }.
  setupStates = {};
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

  /**
   * The page's address. ?c__preview=bringInChoices opens Bring in choices, which is not in the
   * menu until electives are finished (decision 44), so it can be tried and checked before then
   * (repo ADR 0017 choice 19). Any other value is ignored.
   */
  @wire(CurrentPageReference)
  wiredPageReference(reference) {
    const state = (reference && reference.state) || {};
    this.preview = previewScreen(state.c__preview);
    this.openPreview();
  }

  /** The screen the address asked for, once the season is on screen. */
  openPreview() {
    if (
      this.preview &&
      !this.previewOpened &&
      this.mode === "screens" &&
      this.setup
    ) {
      this.previewOpened = true;
      this.openScreen(this.preview);
    }
  }

  connectedCallback() {
    // Date boxes' calendar buttons at least 24 by 24 (WCAG 2.5.8); without it they work, smaller.
    loadStyle(this, DATE_BOX).catch(() => {});
    // Setup tables' fields read as words at rest; without it they show as boxes, and work.
    loadStyle(this, TABLE).catch(() => {});
    // Inter and the one mono (ADR 0015); without them every word shows in the system font.
    loadStyle(this, `${FONTS}/fonts.css`).catch(() => {});
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
    this.openPreview();
  }

  async loadSeason() {
    if (!this.seasonId) {
      // No season: any read still on its way is out of date.
      this.loadTicket += 1;
      this.setup = null;
      return;
    }
    if (this.setup && this.setup.season.Id !== this.seasonId) {
      // Another season: start its tables fresh rather than carrying unsaved rows across,
      // and forget the old season's "setup changed".
      this.setup = null;
      this.setupStates = {};
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
    const sameSeason = this.seasonForm.Id === setup.season.Id;
    const form = { ...setup.season };
    if (sameSeason) {
      Object.values(SEASON_INPUTS).forEach((field) => {
        if (this.seasonDirty.has(field) || this.seasonSending.has(field)) {
          form[field] = this.seasonForm[field];
        }
      });
    } else {
      this.seasonDirty = new Set();
      this.seasonSending = new Map();
      this.seasonErrors = {};
    }
    this.setup = setup;
    this.termLabels = setup.labels;
    this.seasonForm = form;
  }

  renderedCallback() {
    this.showNewError();
    this.focusProgramNeighbour();
    if (this.focusAfter) {
      const target = this.template.querySelector(this.focusAfter);
      this.focusAfter = null;
      if (target && typeof target.focus === "function") {
        target.focus();
      }
    }
    if (!this.focusHeadingOf) {
      return;
    }
    const screen = this.focusHeadingOf;
    this.focusHeadingOf = null;
    this.focusScreenHeading(screen);
  }

  focusScreenHeading(screen) {
    const heading = this.template.querySelector(
      `[data-screen="${screen}"] [data-heading]`
    );
    if (heading) {
      heading.focus();
      return;
    }
    // A screen drawn by its own component (Roots, Camp words, Import last year) focuses its own.
    const own = this.template.querySelector(`[data-screen="${screen}"] > *`);
    if (own && typeof own.focusHeading === "function") {
      own.focusHeading();
    }
  }

  /**
   * A new message at the top is brought into view: a save refused while the director is far
   * down a long table would otherwise go unseen (screen readers hear it: role=alert).
   */
  showNewError() {
    if (this.error === this.errorShown) {
      return;
    }
    this.errorShown = this.error;
    const box = this.error && this.template.querySelector('[data-id="error"]');
    if (box && typeof box.scrollIntoView === "function") {
      box.scrollIntoView({ block: "nearest" });
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
  /**
   * The frame's body: inset like every zone, except under a schedule, whose rail, grid and
   * drawer are zones of the frame themselves, each with its own inset and the hairline between
   * them running edge to edge (docs/design/manual-build.html).
   */
  get bodyClass() {
    return FLUSH_SCREENS.has(this.currentScreen)
      ? "zone body body_flush"
      : "zone body";
  }

  /** Drawn only while it is shown: its start reads the season's elective sets. */
  get showsBringInChoices() {
    return this.currentScreen === "bringInChoices";
  }

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
  /**
   * The menu, Roots, or a screen's own link: that screen, with the cursor on its heading, so a
   * keyboard or screen-reader user lands where the new screen starts (WCAG 2.4.3).
   */
  handleNavigate(event) {
    const screen = event.detail.screen;
    if (!canOpen(screen, !!this.setup)) {
      return;
    }
    this.openScreen(screen);
    const itemId = event.detail.specialItemId;
    if (itemId) {
      // "Open <special day>" from a day it replaces (ADR 0014 slice 4): its details, then its
      // schedule in the list's place, as Open schedule there does.
      Promise.resolve().then(() => {
        const details = this.template.querySelector(
          "c-shoresh-special-details"
        );
        if (details && details.open(itemId)) {
          this.specialDetailsFor = itemId;
          this.specialScheduleFor = itemId;
        }
      });
    }
  }

  /**
   * Something on another screen changed the season's special days or events (Set it up on a
   * schedule, Put on a day): the season is read again, so every screen shows it.
   */
  handleSeasonChanged() {
    this.loadSeason().catch(() => {});
  }

  /**
   * Shows a screen with the cursor on its heading. The screen already open takes it now: the
   * page may not redraw, and a cursor move left waiting would jump at the next unrelated redraw.
   */
  openScreen(screen) {
    const already = this.currentScreen === screen;
    this.screen = screen;
    this.mode = "screens";
    // A message about another screen's save does not belong on this one.
    this.error = null;
    if (already) {
      this.focusHeadingOf = null;
      this.focusScreenHeading(screen);
    } else {
      this.focusHeadingOf = screen;
    }
  }

  // ---------- setup changed, at the menu's foot ----------

  /**
   * Manual Build and Generated Schedule each say whether their week can be updated to match setup
   * ({ changed, busy }); the menu's foot shows it for the one on screen.
   */
  handleSetupState(event) {
    const screen = event.currentTarget.dataset.setupState;
    this.setupStates = { ...this.setupStates, [screen]: event.detail };
  }
  get shownSetupState() {
    // No season on screen (switching, or its read failed): nothing to say about setup.
    if (!this.setup) return {};
    return (this.currentScreen && this.setupStates[this.currentScreen]) || {};
  }
  get menuSetupChanged() {
    return !!this.shownSetupState.changed;
  }
  get menuSetupBusy() {
    return !!this.shownSetupState.busy;
  }

  /**
   * The schedule's list of changes closed: focus goes back to the menu's Update to match setup,
   * which opened it, when it is still there (setupfocus { focused }, said back to the screen).
   */
  handleSetupFocus(event) {
    const menu = this.template.querySelector("c-shoresh-menu");
    event.detail.focused = !!menu && menu.focusUpdateToMatch();
  }

  /** The menu's Update to match setup: the schedule on screen opens its list of changes. */
  handleMenuUpdateToMatch() {
    const screen = this.template.querySelector(
      `[data-setup-state="${this.currentScreen}"]`
    );
    if (screen) {
      screen.updateToMatchSetup();
    }
  }

  /** Each setup screen's next screen ({ key, label }), or null: screen -> next. */
  get next() {
    const result = {};
    SCREENS.forEach((screen) => {
      result[screen] = nextScreen(screen, this.terms, !!this.setup);
    });
    return result;
  }

  /** A screen's "next" button: that screen, with the cursor on its heading (WCAG 2.4.3). */
  handleNext(event) {
    const screen = event.currentTarget.dataset.next;
    if (!canOpen(screen, !!this.setup)) {
      return;
    }
    this.openScreen(screen);
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
  /** The season shown, by name, for the menu's camp row. */
  get seasonName() {
    const season = this.seasons.find((s) => s.Id === this.seasonId);
    return season ? season.Name : "";
  }
  get campOptions() {
    return this.camps.map((c) => ({ label: c.Name, value: c.Id }));
  }
  get seasonOptions() {
    return this.seasons.map((s) => ({ label: s.Name, value: s.Id }));
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
  get showSeasonForm() {
    return this.seasonOpen && !!this.setup && this.mode === "screens";
  }
  get seasonOpenText() {
    return this.showSeasonForm ? "true" : "false";
  }
  get seasonNameError() {
    return this.seasonErrors.name;
  }
  get seasonStartError() {
    return this.seasonErrors.start;
  }
  get seasonEndError() {
    return this.seasonErrors.end;
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
  /**
   * A place's row: its name, how many groups fit, what is held there (worked out from the
   * activities, never edited here), and its weeks. Its type (the section it sits in) and its
   * notes are its details, opened from the row.
   */
  get locationColumns() {
    const t = this.terms;
    const activities = (this.setup && this.setup.activities) || [];
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      {
        fieldName: LOCATION.GroupsThatFit,
        label: t.s("GroupsThatFit"),
        type: "number",
        min: 1,
        required: true,
        width: 9
      },
      {
        fieldName: "heldHere",
        label: `${t.p("Activity")} held here`,
        type: "readonly",
        textFor: (saved) =>
          activities
            .filter((a) => saved.Id && a[ACTIVITY.Location] === saved.Id)
            .map((a) => a.Name)
            .join(", ")
      },
      {
        fieldName: LOCATION.LocationType,
        label: t.s("LocationType"),
        type: "picklist",
        more: true,
        options: [
          { label: "None", value: "" },
          ...((this.setup && this.setup.locationTypes) || []).map((type) => ({
            label: type.Name,
            value: type.Id
          }))
        ]
      },
      { fieldName: LOCATION.Notes, label: "Notes", type: "text", more: true }
    ];
  }
  get hasLocationTypes() {
    return ((this.setup && this.setup.locationTypes) || []).length > 0;
  }
  get locationFilterOptions() {
    const t = this.terms;
    return [
      { label: "All", value: "all" },
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
  /** The rail's choices: All and each type (and "No type" while a place has none). */
  get locationFilterItems() {
    const chosen = this.locationFilterValue;
    const untyped = this.untypedLocations.length > 0;
    return this.locationFilterOptions
      .filter((option) => option.value !== "" || untyped || chosen === "")
      .map((option) => ({
        ...option,
        pressed: option.value === chosen ? "true" : "false",
        className:
          option.value === chosen
            ? "shoresh-item shoresh-raised"
            : "shoresh-item"
      }));
  }
  get untypedLocations() {
    return ((this.setup && this.setup.locations) || []).filter(
      (l) => !l[LOCATION.LocationType]
    );
  }
  /**
   * Locations in sections, one per type in the camp's order, then the places with none ("No
   * type", or no heading at all while the camp has no types); one section when a type is chosen
   * on the rail. Each section is its own table with its own blank row, which starts in its type.
   */
  get locationSections() {
    const t = this.terms;
    const types = (this.setup && this.setup.locationTypes) || [];
    const chosen = this.locationFilterValue;
    const sections = types.map((type) => ({
      key: `type-${type.Id}`,
      value: type.Id,
      heading: type.Name,
      title: `${t.p("Location")}: ${type.Name}`
    }));
    if (!types.length) {
      sections.push({
        key: "type-none",
        value: "",
        heading: undefined,
        title: t.p("Location")
      });
    } else if (this.untypedLocations.length || chosen === "") {
      const none = `No ${t.sIn("LocationType")}`;
      sections.push({
        key: "type-none",
        value: "",
        heading: none,
        title: `${t.p("Location")}: ${none}`
      });
    }
    return sections
      .filter((section) => chosen === "all" || section.value === chosen)
      .map((section, index) => ({ ...section, first: index === 0 }));
  }
  handleLocationFilter(event) {
    this.locationFilter = event.currentTarget.dataset.value;
  }
  get locationDefaults() {
    return {
      [LOCATION.Season]: this.seasonId,
      [LOCATION.GroupsThatFit]: 1
    };
  }
  /**
   * An activity's row, as docs/design/setup/activities.html draws it (ADR 0015 choice 12): its
   * name, where it is held, how often (bars at rest, scaled to the camp's highest weekly count,
   * decision 42), who can do it (quiet "Everyone" unless limited) and its weeks. Everything else
   * is in its details beside the table.
   */
  get activityColumns() {
    const t = this.terms;
    const activities = (this.setup && this.setup.activities) || [];
    const who = this.whoNames;
    const whoIds = (saved) =>
      (saved[CHILDREN.Activity.Eligibilities] || []).map(
        (row) =>
          row[FIELD.ActivityEligibility.Division] ||
          row[FIELD.ActivityEligibility.Group]
      );
    return [
      {
        fieldName: "Name",
        label: t.s("Activity"),
        type: "text",
        required: true,
        minWidth: 8
      },
      {
        fieldName: ACTIVITY.Location,
        label: t.s("Location"),
        type: "picklist",
        width: 9,
        options: [
          { label: "None", value: "" },
          ...((this.setup && this.setup.locations) || []).map((l) => ({
            label: l.Name,
            value: l.Id
          }))
        ]
      },
      {
        fieldName: ACTIVITY.TimesPerWeekMin,
        type: "often",
        label: "How often",
        minLabel: `${t.s("TimesPerWeek")}: at least`,
        min: 0,
        required: true,
        maxField: ACTIVITY.TimesPerWeekMax,
        maxLabel: `${t.s("TimesPerWeek")}: at most`,
        noMaxField: ACTIVITY.NoWeeklyMax,
        // The camp's highest weekly count: every activity's bars on one scale.
        scale: activities.reduce(
          (most, a) =>
            Math.max(
              most,
              Number(a[ACTIVITY.TimesPerWeekMin]) || 0,
              Number(a[ACTIVITY.TimesPerWeekMax]) || 0
            ),
          1
        )
      },
      {
        fieldName: "whoCanDoIt",
        label: "Who",
        type: "readonly",
        minWidth: 7,
        textFor: (saved) => {
          const ids = whoIds(saved);
          return ids.length
            ? ids
                .map((id) => who.get(id))
                .filter((name) => name)
                .join(", ")
            : "Everyone";
        },
        exceptionFor: (saved) => whoIds(saved).length > 0
      }
    ];
  }

  /**
   * What an import guessed and no one has looked at or changed since (ADR 0006 §21; the desktop's
   * provenance dots), for the tables: record Id -> { [column]: { field, words, name } }. A new
   * activity's how often and who, a new place's groups that fit, and a bunk's unit when only its
   * file's name gave it.
   */
  get guessesByRecord() {
    const t = this.terms;
    const names = new Map();
    const setup = this.setup || {};
    (setup.activities || []).forEach((a) => names.set(a.Id, a.Name));
    (setup.locations || []).forEach((l) => names.set(l.Id, l.Name));
    (setup.programs || []).forEach((entry) =>
      (entry.divisions || []).forEach((d) =>
        (d.groups || []).forEach((g) => names.set(g.Id, g.Name))
      )
    );
    const fromFile = "Guessed from your file";
    const columns = {
      often: { column: ACTIVITY.TimesPerWeekMin, label: "How often" },
      who: { column: "whoCanDoIt", label: "Who" },
      fits: { column: LOCATION.GroupsThatFit, label: t.s("GroupsThatFit") }
    };
    const result = {};
    for (const guess of setup.guesses || []) {
      const name = names.get(guess.recordId) || "";
      let mark;
      if (guess.field === "division") {
        const words = `${guess.value} guessed from the file name`;
        mark = { column: "Name", words, name: `${name}: ${words}` };
      } else if (columns[guess.field]) {
        const { column, label } = columns[guess.field];
        mark = {
          column,
          words: fromFile,
          name: `${label} for ${name}: ${fromFile.toLowerCase()}`
        };
      }
      if (mark) {
        result[guess.recordId] = {
          ...(result[guess.recordId] || {}),
          [mark.column]: {
            field: guess.field,
            words: mark.words,
            name: mark.name
          }
        };
      }
    }
    return result;
  }

  /** Looks right on a guess: the camp forgets it, and the season is read again. */
  async handleConfirmGuess(event) {
    const { recordId, field, onDone } = event.detail;
    await this.run(async () => {
      await confirmGuess({ recordId, field });
      this.changedOnServer = true;
      await this.loadSeason();
      if (onDone) {
        onDone();
      }
    }, "Not marked as looked at. Nothing was changed.");
  }

  /** Division and group names by Id, across the season's programs (for who can do it). */
  get whoNames() {
    const names = new Map();
    ((this.setup && this.setup.programs) || []).forEach((entry) => {
      (entry.divisions || []).forEach((d) => {
        names.set(d.division.Id, d.division.Name);
        (d.groups || []).forEach((g) => names.set(g.Id, g.Name));
      });
    });
    return names;
  }

  /**
   * Activities in two sections by priority, High then Low (the desktop's ActivitiesScreen.jsx:
   * "High Priority", "Low Priority"; a blank priority is Low, ADR 0002 choice 10). Each section
   * is a table over every activity showing its own (rowFilter), so same-name dots compare
   * across both; its blank row starts in its priority. As on the desktop, High shows only
   * while it holds an activity. Low always shows: new activities start Low (Greg, 2026-10-16),
   * so its blank row is where they are added. With no activities at all there is no heading,
   * only the empty list. An activity whose priority is changed in its details moves to the
   * other section on the next read.
   */
  get activitySections() {
    const activities = (this.setup && this.setup.activities) || [];
    const anyHigh = activities.some(isHighPriority);
    const sections = [];
    if (anyHigh) {
      sections.push({
        key: "priority-high",
        value: "High",
        heading: "High priority",
        rowFilter: isHighPriority
      });
    }
    sections.push({
      key: "priority-low",
      value: "Low",
      heading: activities.length ? "Low priority" : undefined,
      rowFilter: isLowPriority
    });
    return sections.map((section, index) => ({
      ...section,
      first: index === 0,
      title: section.heading
        ? `${this.labels.catalogue}: ${section.heading}`
        : this.labels.catalogue,
      defaults: {
        ...this.activityDefaults,
        [ACTIVITY.Priority]: section.value
      }
    }));
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

  // ---------- special events (ADR 0014 choice 11) ----------

  /**
   * The words for events on this screen: the camp's own word when it has one, else "Event", as
   * the approved mock-up and the desktop say it (the screen's own name already says "Special").
   */
  get eventWords() {
    const t = this.terms;
    if (t.s("SpecialEvent") === "Special event") {
      return { s: "Event", p: "Events", sIn: "event", pIn: "events" };
    }
    return {
      s: t.s("SpecialEvent"),
      p: t.p("SpecialEvent"),
      sIn: t.sIn("SpecialEvent"),
      pIn: t.pIn("SpecialEvent")
    };
  }

  get special() {
    return specialOf(this.setup);
  }

  /** The rail: "3 special days" and "4 events". */
  get specialCounts() {
    const t = this.terms;
    const events = this.eventWords;
    const days = this.special.specialDays.length;
    const count = this.special.specialEvents.length;
    return {
      days,
      daysNoun: ` ${days === 1 ? t.sIn("SpecialDay") : t.pIn("SpecialDay")}`,
      events: count,
      eventsNoun: ` ${count === 1 ? events.sIn : events.pIn}`
    };
  }

  /**
   * The columns both lists share, as design-research special-r1 special-events.html draws them:
   * Name, Where, Schedule, Placed on, Notes. Schedule and Placed on are worked out (the plan in
   * brief, the days it is on), quiet while there is none. Widths are fixed so the two lists'
   * columns line up.
   */
  specialColumns(isEvent) {
    const t = this.terms;
    const setup = this.setup;
    const weeks = (setup && setup.weeks) || [];
    const brief = (saved) => briefOf(setup, saved.Id);
    const where = isEvent
      ? {
          fieldName: FIELD.SpecialEvent.Location,
          label: "Where",
          type: "picklist",
          width: 11,
          options: [
            { label: "None", value: "" },
            ...((setup && setup.locations) || []).map((l) => ({
              label: l.Name,
              value: l.Id
            }))
          ]
        }
      : {
          fieldName: "where",
          label: "Where",
          type: "readonly",
          width: 11,
          textFor: () => "Whole camp"
        };
    return [
      { fieldName: "Name", label: "Name", type: "text", required: true },
      where,
      {
        fieldName: "schedule",
        label: "Schedule",
        type: "readonly",
        width: 9,
        // The blank row has nothing to show yet.
        textFor: (saved) => {
          if (!saved.Id) return "";
          return scheduleText(brief(saved), isEvent, t) || "None";
        },
        exceptionFor: (saved) => !!saved.Id && brief(saved).planned
      },
      {
        fieldName: "placedOn",
        label: "Placed on",
        type: "readonly",
        width: 11,
        textFor: (saved) => {
          if (!saved.Id) return "";
          return (
            placedOnText(brief(saved), weeks, this.weekWords) || "Not placed"
          );
        },
        exceptionFor: (saved) => !!saved.Id && brief(saved).days.length > 0
      },
      {
        fieldName: isEvent ? FIELD.SpecialEvent.Notes : FIELD.SpecialDay.Notes,
        label: "Notes",
        type: "text"
      }
    ];
  }

  get specialDayColumns() {
    return this.specialColumns(false);
  }

  get specialEventColumns() {
    return this.specialColumns(true);
  }

  get specialDayDefaults() {
    return { [FIELD.SpecialDay.Season]: this.seasonId };
  }

  get specialEventDefaults() {
    return { [FIELD.SpecialEvent.Season]: this.seasonId };
  }

  /** A row's chevron: its details open beside the lists (decision 47.1). */
  handleOpenSpecialDetails(event) {
    const { recordId } = event.detail;
    const details = this.template.querySelector("c-shoresh-special-details");
    if (details && details.open(recordId)) {
      this.specialDetailsFor = recordId;
    }
  }

  /** Closed: the cursor goes back to that row's chevron. */
  handleCloseSpecialDetails(event) {
    const { itemId } = event.detail;
    this.specialDetailsFor = null;
    const table = [
      ...this.template.querySelectorAll(
        '[data-screen="specialEvents"] c-shoresh-editable-table'
      )
    ].find((list) => list.showsRow(itemId));
    if (table) {
      table.focusDetailsOf(itemId);
    }
  }

  /** "Open schedule" in an item's details: its schedule opens in the list's place. */
  handleOpenSpecialSchedule(event) {
    this.specialScheduleFor = event.detail.itemId;
  }

  /**
   * Back from a schedule: the list as it was (read again if anything inside was saved, for its
   * counts and briefs), the cursor on that item's Open schedule.
   */
  handleCloseSpecialSchedule() {
    this.specialScheduleFor = null;
    if (this.specialScheduleChanged) {
      this.specialScheduleChanged = false;
      this.loadSeason().catch(() => {});
    }
    Promise.resolve().then(() => {
      const details = this.template.querySelector("c-shoresh-special-details");
      if (details) {
        details.focusOpenSchedule();
      }
    });
  }

  handleSpecialScheduleChanged() {
    this.specialScheduleChanged = true;
  }

  /** The list stays drawn under an open schedule, hidden, so going back finds it as it was. */
  get specialListClass() {
    return this.specialScheduleFor ? "slds-hide" : "";
  }

  /** Each counted screen's rail: how many, in the camp's word ("10 groups", "1 week"). */
  get counts() {
    const setup = this.setup || {};
    const programs = setup.programs || [];
    const inPrograms = (pick) =>
      programs.reduce((sum, entry) => sum + pick(entry), 0);
    const n = {
      weeks: (setup.weeks || []).length,
      divisions: inPrograms((e) => (e.divisions || []).length),
      groups: inPrograms((e) =>
        (e.divisions || []).reduce((sum, d) => sum + (d.groups || []).length, 0)
      ),
      timeBlocks: inPrograms((e) => (e.timeBlocks || []).length),
      locations: (setup.locations || []).length,
      activities: (setup.activities || []).length,
      fixedActivities: inPrograms((e) => (e.fixedActivities || []).length),
      recurringActivities: inPrograms(
        (e) => (e.recurringActivities || []).length
      )
    };
    const t = this.terms;
    const result = {};
    Object.keys(COUNTED).forEach((screen) => {
      const count = n[screen];
      result[screen] = {
        count,
        noun: ` ${count === 1 ? t.sIn(COUNTED[screen]) : t.pIn(COUNTED[screen])}`
      };
    });
    return result;
  }

  /**
   * The weeks in words, in the camp's word for a week: "Every week", "Off Wk 3" (a camp that
   * calls them sessions: "Every session", "Off Session 3").
   */
  get weekWords() {
    const t = this.terms;
    const standard = t.s("Week") === "Week";
    return {
      every: `Every ${t.sIn("Week")}`,
      none: `No ${t.pIn("Week")}`,
      off: "Off",
      one: standard ? "Wk" : t.s("Week"),
      many: standard ? "Wks" : t.p("Week")
    };
  }
  /** A place is closed, not off (docs/design/setup/locations.html). */
  get locationWeekWords() {
    return { ...this.weekWords, off: "Closed" };
  }
  /** With more than one program, each program's tables are headed with its name. */
  get hasSeveralPrograms() {
    return this.programs.length > 1;
  }

  get labels() {
    const t = this.terms;
    const screens = screenLabels(t);
    return {
      screens,
      camp: "Camp",
      season: t.s("Season"),
      newSeason: `New ${t.sIn("Season")}`,
      seasonActions: `${t.s("Season")} actions`,
      copySeason: `Copy this ${t.sIn("Season")}`,
      seasonName: `${t.s("Season")} name`,
      editSeason: `Edit ${(this.setup && this.setup.season.Name) || t.sIn("Season")}`,
      seasonDetails: `${t.s("Season")} details`,
      deleteSeason: `Delete ${t.sIn("Season")}`,
      createSeason: `Create ${t.sIn("Season")}`,
      newSeasonTitle: `Start a new ${t.sIn("Season")}`,
      problems: "Needs attention",
      addWeek: `Add ${t.s("Week")}`,
      noWeeks: `No ${t.pIn("Week")} yet`,
      overlapsWeek: `Overlaps another ${t.sIn("Week")}`,
      fillWeeks: `Fill in ${t.pIn("Week")} from the ${t.sIn("Season")} dates`,
      addProgram: `Add ${t.s("Program")}`,
      noPrograms: `No ${t.pIn("Program")} yet`,
      copiedFrom: `Copied from "${this.copiedFromName}".`,
      locationTypes: t.p("LocationType"),
      showTypes: `Show ${t.pIn("LocationType")}`,
      weeksColumn: t.p("Week"),
      addLocationType: `Add ${t.s("LocationType")}`,
      noLocationTypes: `No ${t.pIn("LocationType")} yet`,
      addLocation: `Add ${t.s("Location")}`,
      noLocations: `No ${t.pIn("Location")} yet`,
      sameLocation: `Same ${t.sIn("Location")}?`,
      catalogue: `${t.s("Activity")} catalogue`,
      addActivity: `Add ${t.s("Activity")}`,
      noActivities: `No ${t.pIn("Activity")} yet`,
      specialDays: t.p("SpecialDay"),
      addSpecialDay: `Add ${t.s("SpecialDay")}`,
      noSpecialDays: `No ${t.pIn("SpecialDay")} yet`,
      specialEvents: this.eventWords.p,
      addSpecialEvent: `Add ${this.eventWords.s}`,
      noSpecialEvents: `No ${this.eventWords.pIn} yet`
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

  /** Camp words saved (the editor shows "Saved"): every screen reads them again. */
  async handleLabelsSaved() {
    // The director stays where they are: the save ran as they left a box, maybe by clicking
    // another screen, New season or Copy this season. So only the words and the season are read
    // again, never loadCamp, which would choose the screen.
    await this.run(async () => {
      this.termLabels = await getLabels({ campId: this.campId });
      await this.loadSeason();
    }, this.openFailed);
  }

  /** Camp words refused: shown under the box, and at the top too if camp words is not showing. */
  handleLabelsFailed(event) {
    if (this.currentScreen !== "campWords") {
      this.error = event.detail.message;
    }
  }

  // ---------- season ----------

  async handleSeasonChange(event) {
    this.seasonId = event.detail.value;
    this.mode = "screens";
    await this.run(() => this.loadSeason(), this.openFailed);
  }

  handleToggleSeason() {
    this.seasonOpen = !this.seasonOpen;
  }

  handleSeasonField(event) {
    const input = event.target.dataset.field;
    const field = SEASON_INPUTS[input];
    if (!field) {
      return;
    }
    this.seasonForm = { ...this.seasonForm, [field]: event.detail.value };
    this.seasonDirty.add(field);
    if (this.seasonErrors[input]) {
      this.seasonErrors = { ...this.seasonErrors, [input]: null };
    }
    const mark = this.template.querySelector(
      'c-shoresh-saved-mark[data-id="season-saved"]'
    );
    if (mark) {
      mark.clear();
    }
  }

  handleSeasonLeave(event) {
    if (leftField(event)) {
      this.saveSeasonField(event.currentTarget);
    }
  }

  handleSeasonKey(event) {
    if (event.key === "Enter") {
      this.saveSeasonField(event.currentTarget);
    }
  }

  /**
   * Saves the season field left (input), if it changed. The name is sent alone; the two dates
   * always go together, since the last day may not come before the first (a season moved later
   * would be refused with only its first day sent). A blank or impossible value is not sent; the
   * field says why, as any field does.
   */
  saveSeasonField(input) {
    const name = input.dataset.field;
    if (!SEASON_INPUTS[name]) {
      return;
    }
    const names = SEASON_DATES.includes(name) ? SEASON_DATES : [name];
    const fields = names.map((n) => SEASON_INPUTS[n]);
    const changed = fields.filter((f) => this.seasonDirty.has(f));
    if (!changed.length) {
      return;
    }
    const inputs = names.map((n) => {
      if (n === name) {
        return input;
      }
      return this.template.querySelector(
        `[data-form="season"][data-field="${n}"]`
      );
    });
    if (inputs.some((i) => i && !i.reportValidity())) {
      return;
    }
    const record = { sobjectType: OBJECT.Season, Id: this.seasonForm.Id };
    fields.forEach((f) => {
      this.seasonDirty.delete(f);
      this.seasonSending.set(f, (this.seasonSending.get(f) || 0) + 1);
      record[f] = this.seasonForm[f];
    });
    const seasonId = this.seasonForm.Id;
    const done = () => {
      fields.forEach((f) => {
        const left = (this.seasonSending.get(f) || 0) - 1;
        if (left > 0) {
          this.seasonSending.set(f, left);
        } else {
          this.seasonSending.delete(f);
        }
      });
    };
    // Sent together, so answered together: an old refusal under either is replaced.
    const showErrors = (message) => {
      const errors = { ...this.seasonErrors };
      names.forEach((n) => {
        errors[n] = n === name ? message : null;
      });
      this.seasonErrors = errors;
    };
    const current = () => this.seasonForm.Id === seasonId;
    this.saveForm({
      records: [record],
      what: `${this.terms.s("Season")} not saved. Your changes are still here.`,
      onSaved: () => {
        if (!current()) {
          return;
        }
        done();
        showErrors(null);
        const mark = this.template.querySelector(
          'c-shoresh-saved-mark[data-id="season-saved"]'
        );
        if (mark) {
          mark.saved();
        }
      },
      onFailure: (message) => {
        if (!current()) {
          return;
        }
        done();
        if (this.seasonSending.has(fields[0])) {
          // A newer save of the same fields is on its way, with what the form shows now.
          return;
        }
        changed.forEach((f) => this.seasonDirty.add(f));
        showErrors(message);
      },
      // A new name shows in the season picker.
      reloadSeasons: true,
      // The season box is beside the picker, on every screen, until its pencil closes it.
      shown: () => this.showSeasonForm,
      // Another season picked since: the box no longer shows this one.
      sameRecord: current
    });
  }

  /**
   * Delete season asks first, as every question does (c-shoresh-ask): what goes with it is shown
   * as counts, one line each, rather than told in a sentence. Cancel puts the cursor back on
   * the button.
   */
  async handleDeleteSeason() {
    const ok = await this.askFirst({
      heading: `Delete ${this.setup.season.Name}?`,
      lines: seasonContents(this.setup, this.terms),
      confirmLabel: this.labels.deleteSeason
    });
    if (!ok) {
      return;
    }
    await this.run(async () => {
      await deleteRecord({ recordId: this.seasonId });
      this.changedOnServer = true;
      this.toast(`Deleted "${this.setup.season.Name}".`);
      this.seasonId = null;
      this.seasonOpen = false;
      this.screen = "roots";
      await this.loadCamp();
    }, `"${this.setup.season.Name}" not deleted. Nothing was removed.`);
  }

  /** The camp row's small menu (step 3b): New season, or Copy this season. */
  handleSeasonMenu(event) {
    if (this.busy) {
      return;
    }
    if (event.detail.value === "new") {
      this.handleStartNewSeason();
    } else if (event.detail.value === "copy" && this.setup) {
      this.handleStartCopy();
    }
  }

  handleStartNewSeason() {
    this.newSeason = {};
    this.mode = "newSeason";
    this.focusAfter = '[data-id="new-season-title"]';
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
    // Back on the camp row's menu that opened it (its rows show only while it is open).
    const selector = '[data-id="season-menu"]';
    if (this.seasonId) {
      this.mode = "screens";
      this.focusAfter = selector;
      return;
    }
    // No season open: the form stays and the page may not redraw, so the button takes it now.
    const target = this.template.querySelector(selector);
    if (target && typeof target.focus === "function") {
      target.focus();
    }
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
    this.focusHeadingOf = "roots";
  }

  handleCancelCopy() {
    this.mode = "screens";
    this.focusAfter = '[data-id="season-menu"]';
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

  /** An activity row's Details: its details open below the table (desktop's row Edit). */
  async handleOpenActivityDetails(event) {
    const { recordId } = event.detail;
    const details = this.template.querySelector("c-shoresh-activity-details");
    if (details && (await details.open(recordId))) {
      this.activityDetailsFor = recordId;
    }
  }

  /** Closed: the cursor goes back to that row's Details button. */
  handleCloseActivityDetails(event) {
    const { activityId } = event.detail;
    this.activityDetailsFor = null;
    // The section the row is in now: its priority may have moved it while the panel was open.
    const table = [
      ...this.template.querySelectorAll(
        'c-shoresh-editable-table[data-id="activities"]'
      )
    ].find((section) => section.showsRow(activityId));
    if (table) {
      table.focusDetailsOf(activityId);
    }
  }

  /**
   * A field of an activity's details, saved as the director leaves it: a rule or who can do it
   * (ActivityDetails), or one of the activity's own fields, compared and set as a table row.
   */
  handleSaveActivityDetails(event) {
    const { rules, whoCanDoIt, record, seen, onSaved, onFailure, shown } =
      event.detail;
    return this.saveForm({
      // The activity's own field: compared and set as the table's rows are (ADR 0011 choice
      // 5); seen() is read when its turn comes. The panel hears what someone else changed.
      save: record
        ? () => saveRow({ record, seen: seen(), extras: null })
        : () => saveActivityDetails({ rules, whoCanDoIt }),
      what: `${this.terms.s("Activity")} details not saved. Your changes are still here.`,
      onSaved,
      onFailure,
      sameRecord: shown
    });
  }

  /**
   * A save from a table (one row, as the director leaves it: SetupTablesController.saveRow,
   * ADR 0011) or from a program's own form (a field, as the director leaves it).
   */
  async handleSaveRecords(event) {
    const detail = event.detail;
    if (detail.record) {
      await this.saveTableRow(detail);
      return;
    }
    await this.saveForm({
      records: detail.records,
      what: this.notSaved(detail.records),
      onSaved: detail.onSaved,
      onFailure: detail.onFailure
    });
  }

  /**
   * One field of a setup form (season, program, activity details), saved as the director leaves
   * it. It waits its turn with the table rows, so saves never pass each other, and like a row it
   * doesn't make the page busy. The form hears it saved (and shows "Saved") before the season is
   * read again; a refusal goes back to the form, to show next to the field in camp words, and is
   * said at the top as well when that field is no longer on screen (shown(): whether it is), or
   * the form now shows another record (sameRecord(): whether it still shows the one sent).
   * Done but not read back is said at the top, as the tables do.
   */
  saveForm({
    records,
    save,
    what,
    onSaved,
    onFailure,
    reloadSeasons,
    shown,
    sameRecord
  }) {
    // Where the field is: by default the screen it was left on (the click that left it may
    // open another). A refusal the director can't see there is also said at the top.
    const screen = this.screen;
    const onScreen =
      shown || (() => this.mode === "screens" && this.screen === screen);
    const stillShown = () => onScreen() && (!sameRecord || sameRecord());
    this.rowSaves = this.rowSaves
      .then(async () => {
        let saved = false;
        this.error = null;
        try {
          const result = await (save ? save() : saveRecords({ records }));
          saved = true;
          if (onSaved) {
            onSaved(result);
          }
          await this.loadSeason();
          if (reloadSeasons) {
            this.seasons = await getSeasons({ campId: this.campId });
          }
        } catch (e) {
          if (saved) {
            this.showError(e, this.refreshFailed);
          } else if (onFailure) {
            const message = failed(what, e);
            onFailure(message);
            if (!stillShown()) {
              this.error = message;
            }
          } else {
            this.showError(e, what);
          }
        }
      })
      .catch((e) => this.showError(e));
    return this.rowSaves;
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
    // A place's row with the cursor in it may leave its section once saved (its type changed).
    const held = this.focusedLocation();
    let answered = false;
    this.error = null;
    // The rail's quiet Saved: gone while a row is on its way, back once it is saved.
    const screen = this.screen;
    this.railSaved(screen, false);
    try {
      const result = await saveRow({
        record,
        seen,
        extras: { ...extras, seenWho }
      });
      answered = true;
      onSaved(result);
      if (result && result.seeded) {
        this.seededNote = seededLines(
          result.seeded,
          record.Name,
          this.terms
        ).join(" ");
      }
      // Someone else changed the row: the table asks, and nothing is saved yet.
      const asked =
        !!result &&
        ((result.changed && result.changed.length > 0) || !!result.theirWho);
      if (!asked) {
        this.railSaved(screen, true);
      }
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
      if (held) {
        // Once the table has redrawn without the row.
        Promise.resolve().then(() => this.followMovedLocation(held));
      }
    }
  }

  /**
   * The quiet "✓ Saved" on a setup screen's rail (decision 26 (4), ADR 0015 choice 11): shown
   * once a row of that screen is saved, gone while the next is on its way. The table says each
   * save to screen readers ("Cedar saved"), so the mark itself is silent.
   */
  railSaved(screen, saved) {
    const mark = this.template.querySelector(
      `[data-screen="${screen}"] [data-id="rail-saved"]`
    );
    if (mark) {
      if (saved) {
        mark.saved();
      } else {
        mark.clear();
      }
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

  /**
   * For a week: the special days and events on its days, which a delete takes off them (ADR 0014
   * choice 9; the items stay saved): ' It takes "Field Day" off Tuesday and "Carnival" off
   * Wednesday and Thursday.'
   */
  specialDaysNote(recordId) {
    const special = (this.setup && this.setup.special) || {};
    const names = new Map(
      [...(special.specialDays || []), ...(special.specialEvents || [])].map(
        (item) => [item.Id, item.Name]
      )
    );
    const off = (special.briefs || [])
      .map((brief) => ({
        name: names.get(brief.itemId),
        days: (brief.days || [])
          .filter((d) => d.weekId === recordId)
          .map((d) => d.day)
      }))
      .filter((item) => item.name && item.days.length)
      .map((item) => `"${item.name}" off ${andList(item.days)}`);
    return off.length ? ` It takes ${andList(off)}.` : "";
  }

  async handleDeleteRecord(event) {
    // A second click while the question is open (or the delete is under way) does nothing.
    if (this.deleting) {
      return;
    }
    this.deleting = true;
    try {
      await this.askAndDelete(event.detail);
    } finally {
      this.deleting = false;
    }
  }

  async askAndDelete({ recordId, name, onDeleted }) {
    // Asked without making the page busy: the row's delete button keeps the focus, so Cancel
    // gives it back there.
    const ok = await LightningConfirm.open(
      await this.deleteQuestion(recordId, name)
    );
    if (!ok) {
      return;
    }
    // A whole program card (not a table row): where it was in the list, before it goes.
    const programIndex = this.programs.findIndex((p) => p.key === recordId);
    await this.run(async () => {
      await deleteRecord({ recordId });
      this.changedOnServer = true;
      this.toast(`Deleted "${name}".`);
      await this.loadSeason();
      // The table says so in its live region and moves the cursor off the gone row.
      if (onDeleted) {
        onDeleted();
      } else if (programIndex >= 0) {
        this.programDeleted(programIndex, name);
      }
    }, `"${name}" not deleted. Nothing was removed.`);
  }

  /**
   * A program card was deleted and the season read again: it is said, and the cursor goes to
   * the name of the card that took its place, else the card above, else Add program, as a
   * table's row delete does (ADR 0013 choice 25).
   */
  programDeleted(index, name) {
    this.programsAnnounced = !this.programsAnnounced;
    const text = `Deleted ${name || ""}`.trim();
    // Every other time with a trailing non-breaking space, so the same words are read again.
    this.programsAnnouncement = this.programsAnnounced ? text : `${text}\u00a0`;
    this.focusAfterProgramDelete = index;
  }

  focusProgramNeighbour() {
    // Add program is disabled while the page is busy, and a disabled button can't take focus.
    if (this.focusAfterProgramDelete === null || this.busy) {
      return;
    }
    const index = this.focusAfterProgramDelete;
    this.focusAfterProgramDelete = null;
    const cards = [
      ...this.template.querySelectorAll(
        '[data-screen="programs"] c-shoresh-program'
      )
    ];
    const card = cards[index] || cards[index - 1];
    if (card) {
      card.focusName();
      return;
    }
    const add = this.template.querySelector('[data-id="add-program"]');
    if (add) {
      add.focus();
    }
  }

  /**
   * The question before a delete. A bunk or activity some schedule uses says how many first
   * (decision 15: "Bunk 3 is in 2 schedules. Delete anyway?"); Salesforce's Recycle Bin can
   * bring it back, and the schedules keep its name.
   */
  async deleteQuestion(recordId, name) {
    // A count that couldn't be made is said so, never left out quietly.
    const count = (await Promise.resolve()
      .then(() => scheduleUses({ recordId }))
      .catch(() => ({ schedules: 0, complete: false }))) || {
      schedules: 0,
      complete: true
    };
    const uses = count.schedules;
    const word = uses === 1 ? "schedule" : "schedules";
    let message = null;
    if (uses > 0 && count.complete) {
      message = `${name} is in ${uses} ${word}. Delete anyway?`;
    } else if (uses > 0) {
      message = `${name} is in ${uses} or more schedules. Delete anyway?`;
    } else if (!count.complete) {
      message = `Shoresh couldn't count the schedules ${name} is in. Delete anyway?`;
    }
    if (message) {
      return {
        label: `Delete "${name}"?`,
        message,
        variant: "header",
        theme: "warning"
      };
    }
    return {
      label: "Delete",
      message: `Delete "${name}"? Anything inside it is deleted too.${this.savedSchedulesNote(recordId)}${this.specialDaysNote(recordId)}`,
      variant: "header",
      theme: "warning"
    };
  }

  /** "Same location?" for a place and the places whose names match it (ADR 0012). */
  handleSameLocation(event) {
    this.error = null;
    this.sameLocationError = null;
    this.sameLocation = this.placesFor(event.detail.recordIds);
  }

  /** The places still set up, each with what fits and how many activities happen there. */
  placesFor(recordIds) {
    const locations = (this.setup && this.setup.locations) || [];
    const activities = (this.setup && this.setup.activities) || [];
    return recordIds
      .map((id) => locations.find((l) => l.Id === id))
      .filter((location) => location)
      .map((location) => ({
        id: location.Id,
        name: location.Name,
        fits: location[LOCATION.GroupsThatFit],
        activities: activities.filter(
          (a) => a[ACTIVITY.Location] === location.Id
        ).length
      }));
  }

  handleCloseSameLocation() {
    const from = this.sameLocation[0].id;
    this.sameLocation = null;
    this.sameLocationError = null;
    this.locationsTable(from).focusRowOf(from);
  }

  /**
   * The section showing this place (each type is its own table), else the first section, whose
   * blank row takes the cursor when the place is gone.
   */
  locationsTable(recordId) {
    const tables = [
      ...this.template.querySelectorAll(
        'c-shoresh-editable-table[data-id="locations"]'
      )
    ];
    return (
      tables.find((table) => table.showsRow(recordId)) ||
      tables[0] || {
        focusRowOf: () => {}
      }
    );
  }

  /** The place whose row holds the cursor, and the section table it is in, if any. */
  focusedLocation() {
    const tables = this.template.querySelectorAll(
      'c-shoresh-editable-table[data-id="locations"]'
    );
    for (const table of tables) {
      const row = table.focusedRow();
      if (row) {
        return { ...row, table };
      }
    }
    return null;
  }

  /**
   * After a row is saved, a place that held the cursor and is no longer in its section (its
   * type changed, ADR 0015 choice 11) takes the cursor along to its new section: the same field,
   * its details open again if that is where the cursor was. If the rail shows only the old
   * type, the cursor goes to that section's blank row. Either way the move is said aloud, so the
   * cursor never drops to the top of the page (WCAG 2.4.3).
   */
  followMovedLocation(held) {
    if (!held || !this.setup) {
      return;
    }
    // Only when the cursor was lost with the row: never taken from where the director went.
    const now = focusedElement();
    if (now && now !== document.body) {
      return;
    }
    const { table, recordId, field, inDetails } = held;
    if (table.isConnected && table.showsRow(recordId)) {
      return;
    }
    const place = (this.setup.locations || []).find((l) => l.Id === recordId);
    if (!place) {
      return;
    }
    const type = place[LOCATION.LocationType] || "";
    const named = (this.setup.locationTypes || []).find((t) => t.Id === type);
    const typeName = named
      ? named.Name
      : `No ${this.terms.sIn("LocationType")}`;
    const tables = [
      ...this.template.querySelectorAll(
        'c-shoresh-editable-table[data-id="locations"]'
      )
    ];
    const target =
      tables.find((t) => t.showsRow(recordId)) ||
      (table.isConnected ? table : tables[0]);
    if (target) {
      target.takeFocus(
        recordId,
        field,
        inDetails,
        `${place.Name} moved to ${typeName}`
      );
    }
  }

  /**
   * Merge. Refused: the season is read again and the question shows the places as they are now
   * (desktop: it reloads after a failed merge), so trying again can work; if fewer than two of
   * them are left, the question closes and the page says why.
   */
  async handleMergeLocations(event) {
    if (this.merging) {
      return;
    }
    const { keepId, otherIds, groupsThatFit } = event.detail;
    const kept = this.sameLocation.find((place) => place.id === keepId);
    const asked = this.sameLocation.map((place) => place.id);
    this.merging = true;
    this.sameLocationError = null;
    let merged = false;
    try {
      await mergeLocations({ keepId, otherIds, groupsThatFit });
      merged = true;
      this.sameLocation = null;
      this.toast(`Merged into "${kept.name}".`);
      await this.loadSeason();
      this.locationsTable(keepId).focusRowOf(keepId);
    } catch (e) {
      if (merged) {
        // Done, but the screen couldn't read it back: said so (the page's usual words), never
        // shown as a refusal.
        this.showError(e, this.refreshFailed);
        return;
      }
      const why = failed(`Nothing was merged into "${kept.name}".`, e);
      // The refusal says more than a failed reload would.
      await this.loadSeason().catch(() => null);
      const places = this.placesFor(asked);
      if (places.length >= 2) {
        this.sameLocation = places;
        this.sameLocationError = why;
      } else {
        this.sameLocation = null;
        this.error = why;
        this.locationsTable(keepId).focusRowOf(keepId);
      }
    } finally {
      this.merging = false;
    }
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
