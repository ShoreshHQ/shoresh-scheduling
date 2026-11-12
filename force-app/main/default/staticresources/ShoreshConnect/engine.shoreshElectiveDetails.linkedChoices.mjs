/**
 * A set's linked choices, worked out without a screen: what the Electives list's editor
 * (shoreshElectiveDetails.js) shows and marks, and the connector's read of the same (API-1.131).
 * Pure, so the two can never say different things.
 */
import { CHILDREN, childRows, FIELD } from "./engine.shoreshSchema.shoreshSchema.mjs";
import {
  WEEKDAYS,
  foldName,
  nameDaysFor,
  realDivisionsOf,
  weekOrder
} from "./engine.shoreshImportEngine.shoreshImportEngine.mjs";
import { spokenWeekday } from "./engine.shoreshDayNames.shoreshDayNames.mjs";
import { SHORT_DAYS, buildTerms } from "./engine.shoreshTerms.shoreshTerms.mjs";
import { electivesOf } from "./engine.shoreshElectiveDetails.offerings.mjs";

const OFFER = FIELD.Offering;
const CHOICE = FIELD.LinkedChoice;
const TIME = FIELD.LinkedChoiceTime;
const COVERS = FIELD.Coverage;
const BLOCK = FIELD.TimeBlock;

// "Applies to", in the desktop's words (BundleEditor.jsx: All, Only these, All except).
export const APPLIES_TO = [
  { value: "All", label: "All" },
  { value: "OnlyThese", label: "Only these" },
  { value: "AllExcept", label: "All except" }
];

export const periodKey = (weekday, blockId) => `${weekday}|${blockId}`;

/** Every time block of the season, by Id, with its program's place (for ordering). */
export function blocksOf(setup) {
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

/** Minutes after midnight of a time block's start, as clockOf reads it; null when it has none. */
function minutesOf(value) {
  const parts = /^(\d\d):(\d\d)/.exec(value);
  if (parts) {
    return Number(parts[1]) * 60 + Number(parts[2]);
  }
  return typeof value === "number" ? Math.round(value / 60000) : null;
}

/**
 * "12:30" from a time block's start: milliseconds after midnight on a screen, "12:30:00.000Z" in
 * what a web address answers.
 */
export function clockOf(value) {
  const minutes = minutesOf(value);
  if (minutes === null) {
    return "";
  }
  const hours = Math.floor(minutes / 60) % 24;
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The divisions a linked choice is for, among those given (desktop bundleOverlap.js resolveScope). */
export function divisionsCovered(appliesTo, named, present) {
  const chosen = new Set(named || []);
  if (appliesTo === "OnlyThese") return present.filter((d) => chosen.has(d));
  if (appliesTo === "AllExcept") return present.filter((d) => !chosen.has(d));
  return [...present];
}

/** The set's linked choices as saved: { id, name, offeringId, appliesTo, periods, divisionIds }. */
export function savedChoicesOf(setup, setId) {
  return electivesOf(setup)
    .linkedChoices.filter((c) => !setId || c[CHOICE.ElectiveSet] === setId)
    .map((c) => ({
      id: c.Id,
      name: c.Name,
      offeringId: c[CHOICE.Offering],
      appliesTo: c[CHOICE.AppliesTo] || "All",
      periods: childRows(c, CHILDREN.LinkedChoice.Times).map((t) =>
        periodKey(t[TIME.Weekday], t[TIME.TimeBlock])
      ),
      divisionIds: childRows(c, CHILDREN.LinkedChoice.Coverages).map(
        (row) => row[COVERS.Division]
      )
    }));
}

/** Where the set sits: "Tuesday|<block>" -> the division Ids there. */
export function placeMapOf(places) {
  const map = new Map();
  ((places && places.cells) || []).forEach((cell) => {
    map.set(periodKey(cell.weekday, cell.blockId), cell.divisionIds || []);
  });
  return map;
}

/**
 * Another linked choice of the same offering holding this period for a division this one is for
 * too: neither is placed as a set (the seat engine's known limit, desktop ADR 2026-09-29 D8), so
 * it is said. Two offerings' linked choices may share a period (slice E9: a double period links
 * every choice across it): each takes its own offering's seats there.
 */
export function sharedWith(choice, k, others, present, terms = buildTerms([])) {
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
    ? `Also in "${clash.name}", so neither is placed as a set; their ${terms.pIn("TimeBlock")} are filled one at a time`
    : null;
}

/** What a period ticked carries, or null: the set has gone from it, or another shares it. */
export function periodLook(
  choice,
  k,
  { shown, placeMap, placesRead = true, setName, allDivisions, terms }
) {
  if (placesRead && !placeMap.has(k)) {
    return `${setName} isn't here on any schedule now`;
  }
  return choice.periods.size > 1
    ? sharedWith(
        choice,
        k,
        shown.filter((c) => c.id !== choice.id && c.periods.size > 1),
        placeMap.get(k) || allDivisions,
        terms
      )
    : null;
}

/** Another of the set's linked choices has this name: a sheet can't tell them apart. */
export function sameNameLook(choice, shown, { terms, setName }) {
  return shown.some(
    (c) =>
      c.id !== choice.id &&
      foldName(c.name) &&
      foldName(c.name) === foldName(choice.name)
  )
    ? `Another ${terms ? terms.sIn("LinkedChoice") : "linked choice"} in ${setName} is called this, so a sheet can't tell them apart.`
    : null;
}

/** The desktop's name for a new linked choice: the activity's, then the activity and a period. */
export function proposedName(activity, hasOne, firstPeriod, setup) {
  if (!hasOne || !firstPeriod) {
    return activity;
  }
  const block = blocksOf(setup).get(firstPeriod.blockId);
  const clock = block
    ? clockOf(block.block[BLOCK.StartTime]) || block.block.Name
    : "";
  // A saved name, and numbers aren't fixed: the weekday, as an import names one.
  return `${activity} · ${SHORT_DAYS[firstPeriod.weekday]} ${clock}`.trim();
}

/** The linked choices as shown, each with its sets of periods and divisions. */
function shownOf(setup, setId) {
  return savedChoicesOf(setup, setId).map((c) => ({
    ...c,
    periods: new Set(c.periods),
    divisionIds: new Set(c.divisionIds)
  }));
}

function activityNameOf(setup, offeringId) {
  const offering = electivesOf(setup).offerings.find(
    (o) => o.Id === offeringId
  );
  const activity =
    offering &&
    ((setup && setup.activities) || []).find(
      (a) => a.Id === offering[OFFER.Activity]
    );
  return (activity && activity.Name) || "";
}

/** A period, as an AI reads and names it; with its program when the season has more than one. */
function periodWords(key, blocks, setup) {
  const [weekday, blockId] = key.split("|");
  const block = blocks.get(blockId);
  const programs = (setup && setup.programs) || [];
  const entry = programs.find((p) =>
    (p.timeBlocks || []).some((b) => b.Id === blockId)
  );
  return {
    day: spokenWeekday(weekday),
    time: block ? block.block.Name : "",
    ...(programs.length > 1 && entry ? { program: entry.program.Name } : {})
  };
}

/** Periods in the order the week runs, as the editor draws them. */
function inWeekOrder(keys, blocks) {
  const days = weekOrder(WEEKDAYS);
  const at = (key) => {
    const [weekday, blockId] = key.split("|");
    const block = blocks.get(blockId);
    return [
      days.indexOf(weekday),
      (block && minutesOf(block.block[BLOCK.StartTime])) ?? 0,
      block ? block.order : 0
    ];
  };
  return [...keys].sort((a, b) => {
    const [dayA, startA, orderA] = at(a);
    const [dayB, startB, orderB] = at(b);
    return dayA - dayB || startA - startB || orderA - orderB;
  });
}

/** Every division of the season, with its program's name. */
function divisionsWithPrograms(setup) {
  return ((setup && setup.programs) || []).flatMap((entry) =>
    realDivisionsOf(entry).map((d) => ({
      id: d.division.Id,
      name: d.division.Name,
      program: entry.program && entry.program.Name
    }))
  );
}

/** A division's name, or {name, program} when another program has one by that name. */
function divisionWords(id, divisions) {
  const division = divisions.find((d) => d.id === id);
  return divisions.some((d) => d.id !== id && d.name === division.name)
    ? { name: division.name, program: division.program }
    : division.name;
}

/** A linked choice, as an AI reads it (the editor's fields and the marks on them). */
function choiceForAgent(choice, shown, context) {
  const { setup, blocks, names, look } = context;
  const guessed = ((setup && setup.guesses) || []).some(
    (g) => g.recordId === choice.id && g.field === "periods"
  );
  const notes = [
    sameNameLook(choice, shown, look),
    guessed
      ? `${look.terms.p("TimeBlock")} for ${choice.name}: guessed from your file`
      : null
  ].filter(Boolean);
  return {
    name: choice.name,
    activity: activityNameOf(setup, choice.offeringId),
    periods: inWeekOrder(choice.periods, blocks).map((key) => {
      const note = periodLook(choice, key, { ...look, shown });
      return { ...periodWords(key, blocks, setup), ...(note ? { note } : {}) };
    }),
    applies_to: APPLIES_TO.find((a) => a.value === choice.appliesTo).label,
    // The editor shows no divisions while it applies to All, though the rows stay.
    divisions:
      choice.appliesTo === "All"
        ? []
        : [...choice.divisionIds]
            .filter((id) => names.has(id))
            .map((id) => divisionWords(id, context.divisions)),
    ...(notes.length ? { notes } : {})
  };
}

/**
 * The set's linked choices as the editor shows them (API-1.131). read: what /v1/linked_choices
 * answers ({ elective_set, set_id, setup, labels, places }). activity: only that offering's.
 */
export function linkedChoicesForAgent(read, { activity } = {}) {
  const { setup, places } = read;
  nameDaysFor(setup);
  const setName = read.elective_set;
  const terms = buildTerms(read.labels);
  const blocks = blocksOf(setup);
  const divisions = divisionsWithPrograms(setup);
  const names = new Map(divisions.map((d) => [d.id, d.name]));
  const placeMap = placeMapOf(places);
  const look = {
    placeMap,
    setName,
    terms,
    allDivisions: divisions.map((d) => d.id)
  };
  const shown = shownOf(setup, read.set_id);
  const offered = electivesOf(setup)
    .offerings.filter((o) => o[OFFER.ElectiveSet] === read.set_id)
    .map((o) => activityNameOf(setup, o.Id));
  if (activity && !offered.some((n) => foldName(n) === foldName(activity))) {
    return {
      error: `${setName} doesn't offer "${activity}". It offers: ${offered.join(", ")}.`
    };
  }
  const context = { setup, blocks, names, look, divisions };
  const all = shown.map((c) => choiceForAgent(c, shown, context));
  const complete = !places || places.complete !== false;
  return {
    elective_set: setName,
    where_it_sits: inWeekOrder(placeMap.keys(), blocks).map((key) => ({
      ...periodWords(key, blocks, setup),
      divisions: placeMap
        .get(key)
        .filter((id) => names.has(id))
        .map((id) => divisionWords(id, divisions))
    })),
    ...(complete
      ? {}
      : {
          note: `Not every schedule could be read, so some places ${setName} sits may be missing.`
        }),
    linked_choices: activity
      ? all.filter((c) => foldName(c.activity) === foldName(activity))
      : all
  };
}

/** The name a new linked choice takes when none is given: the screen's proposal (API-1.132). */
export function proposedForAgent(read, { activity, period, program }) {
  const { setup } = read;
  nameDaysFor(setup);
  const saved = savedChoicesOf(setup, read.set_id);
  const wanted = foldName(activity);
  const offering = electivesOf(setup).offerings.find(
    (o) =>
      o[OFFER.ElectiveSet] === read.set_id &&
      foldName(activityNameOf(setup, o.Id)) === wanted
  );
  if (!offering) {
    return activity;
  }
  const name = activityNameOf(setup, offering.Id);
  const hasOne = saved.some((c) => c.offeringId === offering.Id);
  const at = period ? placeOfPeriod(read, period, program) : null;
  return proposedName(name, hasOne, at, setup);
}

/** The place in the week an AI's period names, or null when it names none or more than one. */
function placeOfPeriod(read, period, program) {
  const blocks = blocksOf(read.setup);
  const day = foldName(period.day);
  const time = foldName(period.time);
  const programOf = (block) =>
    (read.setup.programs || []).find((entry) =>
      (entry.timeBlocks || []).some((b) => b.Id === block.Id)
    );
  const found = ((read.places && read.places.cells) || []).filter((cell) => {
    const entry = blocks.get(cell.blockId);
    return (
      entry &&
      foldName(entry.block.Name) === time &&
      (foldName(cell.weekday) === day ||
        foldName(spokenWeekday(cell.weekday)) === day) &&
      (!program ||
        foldName((programOf(entry.block) || {}).program?.Name) ===
          foldName(program))
    );
  });
  return found.length === 1 ? found[0] : null;
}

/** What a linked choice just saved carries now: what the editor would mark on it. */
export function notesForAgent(read, { name, activity }) {
  const same = (
    linkedChoicesForAgent(read, { activity }).linked_choices || []
  ).filter((c) => foldName(c.name) === foldName(name));
  if (same.length === 0) {
    return [];
  }
  // Two of one name and no activity said: which is which can't be told, so only that is said.
  if (same.length > 1) {
    return same[0].notes || [];
  }
  return [
    ...(same[0].notes || []),
    ...same[0].periods
      .filter((p) => p.note)
      .map(
        (p) =>
          `${p.day} ${p.time}${p.program ? ` (${p.program})` : ""}: ${p.note}.`
      )
  ];
}
