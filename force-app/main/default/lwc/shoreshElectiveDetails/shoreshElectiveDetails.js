import { LightningElement, api } from "lwc";
import { CHILDREN, FIELD } from "c/shoreshSchema";
import linkedChoicePlaces from "@salesforce/apex/LinkedChoicesController.linkedChoicePlaces";
import {
  WEEKDAYS,
  foldName,
  programDays,
  weekOrder,
  realDivisionsOf
} from "c/shoreshImportEngine";
import { failed } from "c/shoreshErrors";

const OFFER = FIELD.Offering;
const CHOICE = FIELD.LinkedChoice;
const TIME = FIELD.LinkedChoiceTime;
const COVERS = FIELD.Coverage;
const BLOCK = FIELD.TimeBlock;
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun"
};
// "Applies to", in the desktop's words (BundleEditor.jsx: All, Only these, All except).
const APPLIES_TO = [
  { value: "All", label: "All" },
  { value: "OnlyThese", label: "Only these" },
  { value: "AllExcept", label: "All except" }
];
const DRAFT = "draft";

/** The season's elective sets (ElectiveMenus.Setup), or an empty one. */
export function electivesOf(setup) {
  const electives = (setup && setup.electives) || {};
  return {
    sets: electives.sets || [],
    offerings: electives.offerings || [],
    linkedChoices: electives.linkedChoices || []
  };
}

/**
 * A set's count, as the grid will show it ("Chugim (4)"): its confirmed offerings (decision 53).
 * 0 or blank seats don't close one (Greg, 2026-10-26: an offering on the table needs seats; the
 * seat run uses no limit and says so): Proposed, or not open to a division or period, is how
 * something isn't offered.
 */
export function openCount(offerings) {
  return (offerings || []).filter((offering) => !offering[OFFER.Proposed])
    .length;
}

/**
 * Why a limited offering's seats need a look, or null: "blank" (not filled in yet) or "zero".
 * Either way the seat run places it with no limit and says so (engine care PR 8).
 */
export function seatsNeedingLook(offering) {
  if (offering[OFFER.NoSeatLimit]) {
    return null;
  }
  const seats = offering[OFFER.Seats];
  if (seats === null || seats === undefined || seats === "") {
    return "blank";
  }
  return Number(seats) === 0 ? "zero" : null;
}

/** What to do when seatsNeedingLook says so (Greg, 2026-10-26: the flag says what to do). */
export function seatsLookWords(name, seatsWord = "seats") {
  return `Choose how many ${seatsWord} "${name}" has`;
}

/** The names of an offering's linked choices, in their order. */
export function linkedNames(setup, offeringId) {
  return electivesOf(setup)
    .linkedChoices.filter((choice) => choice[CHOICE.Offering] === offeringId)
    .map((choice) => choice.Name);
}

/** Every time block of the season, by Id, with its program's place (for ordering). */
function blocksOf(setup) {
  const blocks = new Map();
  ((setup && setup.programs) || []).forEach((entry, programAt) => {
    (entry.timeBlocks || []).forEach((block, at) => {
      blocks.set(block.Id, { block, order: programAt * 1000 + at });
    });
  });
  return blocks;
}

/** Every division of the season, in the season's order: [{ id, name }]. */
export function divisionsOf(setup) {
  const result = [];
  ((setup && setup.programs) || []).forEach((entry) => {
    // DIV-1.1: a holding record is no division.
    realDivisionsOf(entry).forEach((d) =>
      result.push({ id: d.division.Id, name: d.division.Name })
    );
  });
  return result;
}

/** "12:30" from a time block's start (milliseconds after midnight). */
function clockOf(value) {
  if (typeof value !== "number") {
    return "";
  }
  const minutes = Math.round(value / 60000);
  const hours = Math.floor(minutes / 60) % 24;
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, "0")}`;
}

const periodKey = (weekday, blockId) => `${weekday}|${blockId}`;

/** The divisions a linked choice is for, among those given (desktop bundleOverlap.js resolveScope). */
export function divisionsCovered(appliesTo, named, present) {
  const chosen = new Set(named || []);
  if (appliesTo === "OnlyThese") return present.filter((d) => chosen.has(d));
  if (appliesTo === "AllExcept") return present.filter((d) => !chosen.has(d));
  return [...present];
}

/**
 * A linked choice as saved, with the gestures still on their way laid over it (they are shown at
 * once, and the season read after each save replaces them).
 */
export function withPending(choice, edits) {
  const result = {
    id: choice.id,
    name: choice.name,
    appliesTo: choice.appliesTo,
    periods: new Set(choice.periods),
    divisionIds: new Set(choice.divisionIds)
  };
  edits.forEach((edit) => {
    if (edit.name != null) result.name = edit.name;
    if (edit.appliesTo != null) result.appliesTo = edit.appliesTo;
    (edit.periodsOff || []).forEach((p) =>
      result.periods.delete(periodKey(p.weekday, p.blockId))
    );
    (edit.periodsOn || []).forEach((p) =>
      result.periods.add(periodKey(p.weekday, p.blockId))
    );
    (edit.divisionsOff || []).forEach((d) => result.divisionIds.delete(d));
    (edit.divisionsOn || []).forEach((d) => result.divisionIds.add(d));
  });
  return result;
}

/**
 * One offering's linked choices, beside the Electives list (design-research electives-r1
 * setup-a, decision 53.1; electives slice E8, repo ADR 0018 choices 38 to 44): each linked
 * choice's name on the sheet, its periods picked on a small week of where the set sits, and who
 * it applies to (All, Only these, All except), as the desktop's BundleEditor.jsx edits them.
 * Opened from the offering's row (open(id)). Each gesture is saved as it is made; a linked choice
 * is made by picking its first period, named as the desktop proposes (the activity's name, then
 * the activity and that period). What would keep it from being placed as a set is marked where
 * it is: a period the set no longer sits in, two linked choices sharing a period, two with one
 * name.
 *
 * Fires: close { offeringId } (Close pressed: the page puts the cursor back on the row's chevron);
 * save { edit, onSaved(id), onFailure(message) } (one gesture, LinkedChoicesController's Edit);
 * delete { recordId, name, onDeleted } (the page asks first, as every setup delete).
 */
export default class ShoreshElectiveDetails extends LightningElement {
  @api terms;

  offeringId = null;
  _setup;
  focusHeadingNext = false;
  // Where the set sits: { setId, cells, complete } once read, null while reading.
  places = null;
  placesError = null;
  // The linked choice being made: { name, appliesTo, divisionIds, sending, createdId } or null.
  draft = null;
  // Gestures on their way: [{ seq, choiceId, edit, saved }].
  pending = [];
  seq = 0;
  error = null;
  // What a screen reader hears after Looks right.
  status = "";
  // Names being typed, by linked choice, until the field is left.
  typed = {};
  // A control that takes the cursor at the next render (a selector).
  focusAfter = null;
  // Periods pressed while these details are open ("choiceId|weekday|blockId"): each keeps its
  // button, even unticked where the set doesn't sit, so the cursor stays on it and it can be
  // ticked again. Forgotten when the details close or show another offering.
  pressed = new Set();

  /** The season setup from SeasonSetupController (electives, activities, programs). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
    // The season read after a save shows it: what was laid over it goes.
    this.pending = this.pending.filter((p) => !p.saved);
    if (
      this.draft &&
      this.draft.createdId &&
      this.savedChoices.some((c) => c.id === this.draft.createdId)
    ) {
      this.draft = null;
    }
    if (this.offeringId && !this.offering) {
      // Gone (deleted, or another season): its details close.
      this.offeringId = null;
    }
  }

  /** The offering shown, or null when the details are closed. */
  @api
  get openOfferingId() {
    return this.offeringId;
  }

  /** Opens this offering's details, the cursor on their heading. Says whether it is shown. */
  @api
  open(offeringId) {
    const known = electivesOf(this._setup).offerings.some(
      (o) => o.Id === offeringId
    );
    if (!known) {
      return false;
    }
    if (offeringId !== this.offeringId) {
      this.draft = null;
      this.error = null;
      this.pressed = new Set();
    }
    this.offeringId = offeringId;
    this.focusHeadingNext = true;
    this.focusHeading();
    this.readPlaces();
    return true;
  }

  /** Where the set sits, read each time the details open (the grid may have changed since). */
  async readPlaces() {
    const setId = this.setId;
    if (!setId) return;
    this.places = null;
    this.placesError = null;
    try {
      const read = await linkedChoicePlaces({ electiveSetId: setId });
      if (this.setId === setId) {
        this.places = {
          setId,
          cells: (read && read.cells) || [],
          complete: !read || read.complete !== false
        };
      }
    } catch (e) {
      if (this.setId === setId) {
        this.places = { setId, cells: [], complete: false };
        this.placesError = failed(
          `Where ${this.setName} sits could not be read.`,
          e
        );
      }
    }
  }

  renderedCallback() {
    this.focusHeading();
    if (this.focusAfter) {
      const target = this.template.querySelector(this.focusAfter);
      if (target) {
        this.focusAfter = null;
        target.focus();
      }
    }
  }

  focusHeading() {
    const heading =
      this.focusHeadingNext && this.template.querySelector("[data-heading]");
    if (heading) {
      this.focusHeadingNext = false;
      heading.focus();
    }
  }

  handleClose() {
    const offeringId = this.offeringId;
    this.offeringId = null;
    this.draft = null;
    this.pressed = new Set();
    this.dispatchEvent(new CustomEvent("close", { detail: { offeringId } }));
  }

  // ---------- what is shown ----------

  get offering() {
    return (
      electivesOf(this._setup).offerings.find(
        (o) => o.Id === this.offeringId
      ) || null
    );
  }

  get setId() {
    const offering = this.offering;
    return offering ? offering[OFFER.ElectiveSet] : null;
  }

  get setName() {
    const set = electivesOf(this._setup).sets.find((s) => s.Id === this.setId);
    return (set && set.Name) || "";
  }

  get name() {
    const offering = this.offering;
    const activity =
      offering &&
      ((this._setup && this._setup.activities) || []).find(
        (a) => a.Id === offering[OFFER.Activity]
      );
    return (activity && activity.Name) || "";
  }

  get closeLabel() {
    return `Close ${this.name} details`;
  }

  get linkedTitle() {
    return this.term("p", "LinkedChoice", "Linked choices");
  }

  get addLabel() {
    return this.term("s", "LinkedChoice", "Linked choice");
  }

  /** A camp word (s, p, sIn, pIn), or the model's when the words aren't read yet. */
  term(kind, term, fallback) {
    return this.terms ? this.terms[kind](term) : fallback;
  }

  /** The set's linked choices as saved: { id, name, offeringId, appliesTo, periods, divisionIds }. */
  get savedChoices() {
    const setId = this.setId;
    return electivesOf(this._setup)
      .linkedChoices.filter((c) => !setId || c[CHOICE.ElectiveSet] === setId)
      .map((c) => ({
        id: c.Id,
        name: c.Name,
        offeringId: c[CHOICE.Offering],
        appliesTo: c[CHOICE.AppliesTo] || "All",
        periods: (c[CHILDREN.LinkedChoice.Times] || []).map((t) =>
          periodKey(t[TIME.Weekday], t[TIME.TimeBlock])
        ),
        divisionIds: (c[CHILDREN.LinkedChoice.Coverages] || []).map(
          (row) => row[COVERS.Division]
        )
      }));
  }

  /** The set's linked choices as shown: saved, with the gestures on their way laid over them. */
  get shownChoices() {
    return this.savedChoices.map((c) => ({
      ...withPending(
        c,
        this.pending.filter((p) => p.choiceId === c.id).map((p) => p.edit)
      ),
      offeringId: c.offeringId
    }));
  }

  /** Where the set sits: "Tuesday|<block>" -> the division Ids there. */
  get placeMap() {
    const map = new Map();
    ((this.places && this.places.cells) || []).forEach((cell) => {
      map.set(periodKey(cell.weekday, cell.blockId), cell.divisionIds || []);
    });
    return map;
  }

  get placesRead() {
    return !!this.places && this.places.setId === this.setId;
  }

  get sitsNowhere() {
    return (
      this.placesRead && this.places.complete && this.places.cells.length === 0
    );
  }

  get placesIncomplete() {
    return this.placesRead && !this.places.complete;
  }

  get nowhereText() {
    return `Place ${this.setName || "this set"} on a schedule first`;
  }

  get incompleteText() {
    return (
      this.placesError ||
      `Not every schedule could be read, so some places ${this.setName} sits may be missing.`
    );
  }

  /** The divisions the chips offer: where the set sits, else every division of the season. */
  get divisionChoices() {
    const all = divisionsOf(this._setup);
    const there = new Set();
    this.placeMap.forEach((ids) => ids.forEach((id) => there.add(id)));
    const shown = there.size ? all.filter((d) => there.has(d.id)) : all;
    return shown.map((d) => ({ label: d.name, value: d.id }));
  }

  get canAdd() {
    return this.placesRead && this.places.cells.length > 0 && !this.draft;
  }

  get addDisabled() {
    return !this.canAdd;
  }

  get hasNote() {
    return this.sitsNowhere || this.placesIncomplete;
  }

  /** Each linked choice of the offering (and the one being made), as the template draws it. */
  get choices() {
    const shown = this.shownChoices;
    const mine = shown.filter((c) => c.offeringId === this.offeringId);
    const views = mine.map((c) => this.viewOf(c, shown, false));
    if (
      this.draft &&
      !(
        this.draft.createdId && shown.some((c) => c.id === this.draft.createdId)
      )
    ) {
      const draft = {
        id: DRAFT,
        name: this.draft.name,
        appliesTo: this.draft.appliesTo,
        periods: new Set(),
        divisionIds: new Set(this.draft.divisionIds),
        offeringId: this.offeringId
      };
      views.push(this.viewOf(draft, shown, true));
    }
    return views;
  }

  viewOf(choice, shown, isDraft) {
    const key = choice.id;
    const places = this.placeMap;
    const blocks = blocksOf(this._setup);
    const allDivisions = divisionsOf(this._setup).map((d) => d.id);
    // Rows: every time block where the set sits, this choice has a period, or one was pressed.
    const pressed = [...this.pressed]
      .filter((p) => p.startsWith(`${key}|`))
      .map((p) => p.slice(key.length + 1));
    const keys = new Set([...places.keys(), ...choice.periods, ...pressed]);
    const blockIds = [...new Set([...keys].map((k) => k.split("|")[1]))]
      .filter((id) => blocks.has(id))
      .sort(
        (a, b) =>
          (blocks.get(a).block[BLOCK.StartTime] ?? 0) -
            (blocks.get(b).block[BLOCK.StartTime] ?? 0) ||
          blocks.get(a).order - blocks.get(b).order
      );
    const others = shown.filter(
      (c) => c.id !== choice.id && c.periods.size > 1
    );
    const sending = isDraft && this.draft && this.draft.sending;
    // Columns: the days the camp's programs run, and any day the set sits or a period is on,
    // in the order the week runs.
    const onDays = new Set([...keys].map((k) => k.split("|")[0]));
    const runs = new Set(programDays(this._setup));
    const weekDays = weekOrder(
      WEEKDAYS.filter((day) => runs.has(day) || onDays.has(day))
    );
    const rows = blockIds.map((blockId) => {
      const block = blocks.get(blockId).block;
      const clock = clockOf(block[BLOCK.StartTime]) || block.Name;
      return {
        key: `${key}-${blockId}`,
        clock,
        cells: weekDays.map((day) => {
          const k = periodKey(day, blockId);
          const sits = places.has(k);
          const ticked = choice.periods.has(k);
          const words = `${day} ${clock}${clock !== block.Name ? ` (${block.Name})` : ""}`;
          const cell = {
            key: `${key}-${k}`,
            id: `${key}|${k}`,
            weekday: day,
            blockId,
            shown: sits || ticked || this.pressed.has(`${key}|${k}`),
            ticked,
            pressed: ticked ? "true" : "false",
            disabled: !!sending,
            className: ticked ? "period period_on" : "period",
            label: words,
            look: null
          };
          if (ticked && this.placesRead && !sits) {
            cell.look = `${this.setName} isn't here on any schedule now`;
          } else if (ticked && choice.periods.size > 1) {
            cell.look = this.sharedWith(choice, k, others, allDivisions);
          }
          cell.lookName = cell.look ? `${words}: ${cell.look}` : null;
          return cell;
        })
      };
    });
    const appliesTo = choice.appliesTo || "All";
    const names = new Map(divisionsOf(this._setup).map((d) => [d.id, d.name]));
    const named = [...choice.divisionIds].filter((id) => names.has(id));
    const sameName = shown.some(
      (c) =>
        c.id !== choice.id &&
        foldName(c.name) &&
        foldName(c.name) === foldName(choice.name)
    );
    return {
      key,
      isDraft,
      className: isDraft ? "choice choice_draft" : "choice",
      name: choice.name,
      namePlaceholder: isDraft ? this.proposedName(null) : "",
      nameLabel: "Name on the sheet",
      // Its periods read from a double period in last year's file (slice E9): marked for a look.
      periodsGuess:
        !isDraft &&
        ((this._setup && this._setup.guesses) || []).some(
          (g) => g.recordId === choice.id && g.field === "periods"
        )
          ? `Periods for ${choice.name}: guessed from your file`
          : null,
      nameLook: sameName
        ? `Another ${this.term("sIn", "LinkedChoice", "linked choice")} in ${this.setName} is called this, so a sheet can't tell them apart.`
        : null,
      days: weekDays.map((day) => ({
        key: `${key}-${day}`,
        short: SHORT_DAYS[day],
        label: day
      })),
      rows,
      hasRows: rows.length > 0,
      appliesTo,
      appliesOptions: APPLIES_TO,
      showDivisions: appliesTo !== "All",
      divisionsLabel:
        appliesTo === "AllExcept"
          ? `All ${this.term("pIn", "Division", "divisions")} except`
          : `Only these ${this.term("pIn", "Division", "divisions")}`,
      divisionOptions: this.divisionOptionsFor(named, names),
      divisionValue: named,
      disabled: !!sending,
      deleteText: isDraft ? "Cancel" : "Delete",
      deleteLabel: isDraft
        ? `Don't add this ${this.term("sIn", "LinkedChoice", "linked choice")}`
        : `Delete "${choice.name}"`
    };
  }

  /** The chips: where the set sits, and any division the choice already names. */
  divisionOptionsFor(named, names) {
    const options = [...this.divisionChoices];
    named.forEach((id) => {
      if (!options.some((o) => o.value === id)) {
        options.push({ label: names.get(id), value: id });
      }
    });
    return options;
  }

  /**
   * Another linked choice of the same offering holding this period for a division this one is for
   * too: neither is placed as a set (the seat engine's known limit, desktop ADR 2026-09-29 D8), so
   * it is said. Two offerings' linked choices may share a period (slice E9: a double period links
   * every choice across it): each takes its own offering's seats there.
   */
  sharedWith(choice, k, others, allDivisions) {
    const present = this.placeMap.get(k) || allDivisions;
    const mine = new Set(
      divisionsCovered(choice.appliesTo, [...choice.divisionIds], present)
    );
    const clash = others.find(
      (other) =>
        other.offeringId === choice.offeringId &&
        other.periods.has(k) &&
        divisionsCovered(other.appliesTo, [...other.divisionIds], present).some(
          (d) => mine.has(d)
        )
    );
    return clash
      ? `Also in "${clash.name}", so neither is placed as a set; their periods are filled one at a time`
      : null;
  }

  /**
   * Looks right on periods an import guessed (ADR 0006 choice 21): the page forgets the guess;
   * the cursor goes to the linked choice's first period, and it is said.
   */
  handleConfirmGuess(event) {
    const choiceId = event.currentTarget.dataset.choice;
    const choice = this.savedChoices.find((c) => c.id === choiceId);
    const name = choice ? choice.name : "";
    this.focusAfter = `button[data-choice="${choiceId}"][data-id="period"]`;
    this.dispatchEvent(
      new CustomEvent("confirmguess", {
        detail: {
          recordId: choiceId,
          field: "periods",
          onDone: () => {
            this.status = `${name}: looks right`.trim();
            this.focusAfter = `button[data-choice="${choiceId}"][data-id="period"]`;
          }
        }
      })
    );
  }

  /** The desktop's name for a new linked choice: the activity's, then the activity and a period. */
  proposedName(firstPeriod) {
    const activity = this.name;
    const hasOne = this.savedChoices.some(
      (c) => c.offeringId === this.offeringId
    );
    if (!hasOne || !firstPeriod) {
      return activity;
    }
    const block = blocksOf(this._setup).get(firstPeriod.blockId);
    const clock = block
      ? clockOf(block.block[BLOCK.StartTime]) || block.block.Name
      : "";
    return `${activity} · ${SHORT_DAYS[firstPeriod.weekday]} ${clock}`.trim();
  }

  // ---------- gestures ----------

  /** Sends one gesture; it shows at once and stays until the season is read again. */
  send(choiceId, edit, { onSaved, onFailure } = {}) {
    const entry = { seq: ++this.seq, choiceId, edit, saved: false };
    if (choiceId !== DRAFT) {
      this.pending = [...this.pending, entry];
    }
    this.error = null;
    this.dispatchEvent(
      new CustomEvent("save", {
        detail: {
          edit,
          onSaved: (id) => {
            entry.saved = true;
            this.pending = [...this.pending];
            if (onSaved) onSaved(id);
          },
          onFailure: (message) => {
            this.pending = this.pending.filter((p) => p !== entry);
            this.error = message;
            if (onFailure) onFailure(message);
          }
        }
      })
    );
  }

  choiceOf(event) {
    const key = event.currentTarget.dataset.choice;
    return this.choices.find((c) => c.key === key) || null;
  }

  handleAdd() {
    if (!this.canAdd) return;
    this.draft = {
      name: "",
      appliesTo: "All",
      divisionIds: [],
      sending: false,
      createdId: null
    };
    this.focusAfter = '[data-choice="draft"][data-id="choice-name"]';
  }

  handlePeriod(event) {
    const { choice: key, weekday, block } = event.currentTarget.dataset;
    const period = { weekday, blockId: block };
    if (key === DRAFT) {
      this.makeDraft(period);
      return;
    }
    const shown = this.shownChoices.find((c) => c.id === key);
    if (!shown) return;
    const on = !shown.periods.has(periodKey(weekday, block));
    this.pressed = new Set(this.pressed).add(
      `${key}|${periodKey(weekday, block)}`
    );
    this.send(key, {
      id: key,
      periodsOn: on ? [period] : [],
      periodsOff: on ? [] : [period]
    });
  }

  /** The first period picked makes the linked choice, with what was typed or chosen so far. */
  makeDraft(period) {
    const draft = this.draft;
    if (!draft || draft.sending) return;
    const name = (draft.name || "").trim() || this.proposedName(period);
    this.draft = { ...draft, sending: true };
    this.send(
      DRAFT,
      {
        offeringId: this.offeringId,
        name,
        appliesTo: draft.appliesTo,
        periodsOn: [period],
        divisionsOn: draft.appliesTo === "All" ? [] : draft.divisionIds
      },
      {
        onSaved: (id) => {
          this.draft = { ...this.draft, createdId: id };
          // The cursor stays on the period picked, now in the saved linked choice.
          this.focusAfter = `[data-cell="${id}|${periodKey(period.weekday, period.blockId)}"]`;
        },
        onFailure: () => {
          this.draft = { ...this.draft, sending: false };
        }
      }
    );
  }

  /** Typing: kept until the field is left (or Enter), then saved, as every setup field is. */
  handleNameInput(event) {
    const key = event.currentTarget.dataset.choice;
    const value = event.detail ? event.detail.value : event.target.value;
    if (key === DRAFT) {
      this.draft = { ...this.draft, name: value };
      return;
    }
    this.typed = { ...this.typed, [key]: value };
  }

  handleNameKey(event) {
    if (event.key === "Enter") {
      this.commitName(event.currentTarget.dataset.choice);
    }
  }

  handleNameLeave(event) {
    this.commitName(event.currentTarget.dataset.choice);
  }

  commitName(key) {
    if (key === DRAFT || !(key in this.typed)) return;
    const value = (this.typed[key] || "").trim();
    const rest = { ...this.typed };
    delete rest[key];
    this.typed = rest;
    const shown = this.shownChoices.find((c) => c.id === key);
    if (!shown || value === shown.name) return;
    if (!value) {
      this.error = `Give the ${this.term("sIn", "LinkedChoice", "linked choice")} a name: it is what a sheet says to choose it.`;
      return;
    }
    this.send(key, { id: key, name: value });
  }

  handleAppliesTo(event) {
    const key = event.currentTarget.dataset.choice;
    const value = event.detail.value;
    if (key === DRAFT) {
      this.draft = { ...this.draft, appliesTo: value };
      return;
    }
    this.send(key, { id: key, appliesTo: value });
  }

  handleDivisions(event) {
    const key = event.currentTarget.dataset.choice;
    const wanted = new Set(event.detail.value || []);
    if (key === DRAFT) {
      this.draft = { ...this.draft, divisionIds: [...wanted] };
      return;
    }
    const shown = this.shownChoices.find((c) => c.id === key);
    if (!shown) return;
    const on = [...wanted].filter((id) => !shown.divisionIds.has(id));
    const off = [...shown.divisionIds].filter((id) => !wanted.has(id));
    if (!on.length && !off.length) return;
    this.send(key, { id: key, divisionsOn: on, divisionsOff: off });
  }

  handleDelete(event) {
    const view = this.choiceOf(event);
    if (!view) return;
    if (view.isDraft) {
      this.draft = null;
      this.focusAfter = '[data-id="add-linked-choice"]';
      return;
    }
    this.dispatchEvent(
      new CustomEvent("delete", {
        detail: {
          recordId: view.key,
          name: view.name,
          onDeleted: () => {
            // The page calls this once the season is read again, after the details have
            // redrawn without the deleted one: the cursor goes to the add button now. Only if it
            // isn't drawn yet does the next render take it there.
            const add = this.template.querySelector(
              '[data-id="add-linked-choice"]'
            );
            if (add) {
              add.focus();
            } else {
              this.focusAfter = '[data-id="add-linked-choice"]';
            }
          }
        }
      })
    );
  }
}
