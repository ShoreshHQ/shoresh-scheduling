import { LightningElement, api } from "lwc";
import { CHILDREN, FIELD } from "c/shoreshSchema";

const OFFER = FIELD.Offering;
const CHOICE = FIELD.LinkedChoice;
const TIME = FIELD.LinkedChoiceTime;
const COVERS = FIELD.Coverage;
const BLOCK = FIELD.TimeBlock;
// A linked choice's periods are on weekdays (LinkedChoiceTime__c.Weekday__c).
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SHORT_DAYS = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri"
};
// "Applies to", in the desktop's words (BundleEditor.jsx: All, Only these, All except).
const APPLIES_TO = [
  { value: "All", label: "All" },
  { value: "OnlyThese", label: "Only these" },
  { value: "AllExcept", label: "All except" }
];

/** The season's elective sets (ElectiveMenus.Setup), or an empty one. */
export function electivesOf(setup) {
  const electives = (setup && setup.electives) || {};
  return {
    sets: electives.sets || [],
    offerings: electives.offerings || [],
    linkedChoices: electives.linkedChoices || []
  };
}

/** Closed: 0 seats and a limit (repo ADR 0018: 0 is closed, never unlimited). */
export function isClosed(offering) {
  const seats = offering[OFFER.Seats];
  return (
    !offering[OFFER.NoSeatLimit] &&
    seats !== null &&
    seats !== undefined &&
    seats !== "" &&
    Number(seats) === 0
  );
}

/**
 * A set's count, as the grid will show it ("Chugim (4)"): its confirmed, open offerings only
 * (decision 53): not proposed, not closed.
 */
export function openCount(offerings) {
  return (offerings || []).filter(
    (offering) => !offering[OFFER.Proposed] && !isClosed(offering)
  ).length;
}

/** A limited offering whose seats are not filled in yet (desktop: "Fill blank capacities first."). */
export function hasBlankSeats(offering) {
  const seats = offering[OFFER.Seats];
  return (
    !offering[OFFER.NoSeatLimit] &&
    (seats === null || seats === undefined || seats === "")
  );
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

/** Every division of the season, by Id. */
function divisionsOf(setup) {
  const names = new Map();
  ((setup && setup.programs) || []).forEach((entry) => {
    (entry.divisions || []).forEach((d) =>
      names.set(d.division.Id, d.division.Name)
    );
  });
  return names;
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

/**
 * One offering's linked choices, beside the Electives list (design-research electives-r1
 * setup-a: linked choices beside the table, decision 53.1). Opened from the offering's row
 * (open(id)): each linked choice's name on the sheet, its periods ticked on a small week, and who
 * it applies to (the desktop's BundleEditor.jsx). Read only: the editor is slice E8, and its place
 * is held at the foot ("Linked choice", coming).
 *
 * Fires: close { offeringId } (Close pressed: the page puts the cursor back on the row's chevron).
 */
export default class ShoreshElectiveDetails extends LightningElement {
  @api terms;

  offeringId = null;
  _setup;
  focusHeadingNext = false;

  /** The season setup from SeasonSetupController (electives, activities, programs). */
  @api
  get setup() {
    return this._setup;
  }
  set setup(value) {
    this._setup = value;
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
    this.offeringId = offeringId;
    this.focusHeadingNext = true;
    this.focusHeading();
    return true;
  }

  renderedCallback() {
    this.focusHeading();
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
    this.dispatchEvent(new CustomEvent("close", { detail: { offeringId } }));
  }

  get offering() {
    return (
      electivesOf(this._setup).offerings.find(
        (o) => o.Id === this.offeringId
      ) || null
    );
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
    return this.terms ? this.terms.p("LinkedChoice") : "Linked choices";
  }

  get addLabel() {
    return this.terms ? this.terms.s("LinkedChoice") : "Linked choice";
  }

  get hasChoices() {
    return this.choices.length > 0;
  }

  /** Each linked choice: its name, its periods on a small week, and who it applies to. */
  get choices() {
    const setup = this._setup;
    const blocks = blocksOf(setup);
    const divisions = divisionsOf(setup);
    return electivesOf(setup)
      .linkedChoices.filter((c) => c[CHOICE.Offering] === this.offeringId)
      .map((choice) => {
        const times = choice[CHILDREN.LinkedChoice.Times] || [];
        const picked = new Set(
          times.map((t) => `${t[TIME.Weekday]}|${t[TIME.TimeBlock]}`)
        );
        const days = WEEKDAYS.filter((day) =>
          times.some((t) => t[TIME.Weekday] === day)
        );
        const shownDays = days.length ? WEEKDAYS : [];
        const blockIds = [...new Set(times.map((t) => t[TIME.TimeBlock]))]
          .filter((id) => blocks.has(id))
          .sort((a, b) => blocks.get(a).order - blocks.get(b).order);
        const rows = blockIds.map((id) => {
          const block = blocks.get(id).block;
          const clock = clockOf(block[BLOCK.StartTime]) || block.Name;
          return {
            key: `${choice.Id}-${id}`,
            clock,
            cells: shownDays.map((day) => {
              const ticked = picked.has(`${day}|${id}`);
              return {
                key: `${choice.Id}-${id}-${day}`,
                className: ticked ? "period period_on" : "period",
                ticked,
                label: `${day}, ${block.Name}${clock !== block.Name ? ` (${clock})` : ""}: ${
                  ticked ? "linked" : "not linked"
                }`
              };
            })
          };
        });
        const applies = choice[CHOICE.AppliesTo] || "All";
        const named = (choice[CHILDREN.LinkedChoice.Coverages] || [])
          .map((row) => divisions.get(row[COVERS.Division]))
          .filter((n) => n);
        const chosen =
          APPLIES_TO.find((a) => a.value === applies) || APPLIES_TO[0];
        return {
          key: choice.Id,
          name: choice.Name,
          days: shownDays.map((day) => ({
            key: `${choice.Id}-${day}`,
            short: SHORT_DAYS[day]
          })),
          rows,
          hasPeriods: rows.length > 0,
          appliesTo: APPLIES_TO.map((option) => ({
            key: `${choice.Id}-${option.value}`,
            label: option.label,
            className:
              option.value === chosen.value
                ? "segment shoresh-raised segment_on"
                : "segment"
          })),
          // Read out once, in words: "Applies to: Only these: Juniors".
          appliesText: `Applies to: ${chosen.label}${
            chosen.value !== "All" && named.length
              ? `: ${named.join(", ")}`
              : ""
          }`,
          divisions:
            chosen.value !== "All" && named.length ? named.join(", ") : ""
        };
      });
  }
}
