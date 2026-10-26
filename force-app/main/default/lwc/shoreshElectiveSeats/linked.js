/**
 * Linked choices in a run (electives slice E8; repo ADR 0016 "Slice E8" and ADR 0018 choices 38 to
 * 44; desktop deriveChoices.js, solvableBundles.js and ADR 2026-09-29-linked-elective-bundles D2,
 * D4 to D6): each linked choice the director set up (ElectiveSeats.LinkedChoiceInfo) as the seat
 * engine takes it, and what keeps one from being placed as a set, worked out from the run each
 * time, as the other problems are. Pure: no server calls, no clock, no chance.
 *
 * - Only a linked choice whose offering is confirmed is used (desktop solvableBundles.js).
 * - It becomes one linked choice per division it applies to (All, Only these, All except) among
 *   the divisions holding at least one of its periods in this run (desktop D2, D4: a set of seats
 *   per division, since a time is one division's). Every one shares the key "linked|<Id>", so a
 *   camper's choice of it reaches the one for their division (the engine's D4 broadcast).
 * - A period this run doesn't have for that division (or where its offering isn't offered) is
 *   still passed (desktop D5): the engine keeps the set whole over the periods it has
 *   (linkedSetPlan, engine care PR 8) and says so; here it is a problem in words.
 * - Two linked choices of one offering sharing a period: the first by name keeps it as a set, the
 *   other is filled one period at a time (linkedSetPlan); here it is a problem in words.
 * - A camper it doesn't cover (their division left out, or holding none of its periods) has their
 *   choice of it counted as its activity, and said (desktop D6 amendment 2026-09-30,
 *   BUNDLE_TIER_NOT_COVERED): never dropped.
 * - A camper it covers who can't have it as a set (the engine's UNSUPPORTED_LINKED_CHOICE for
 *   campers) is worked out here by the engine's own rule, and said.
 */

import { linkedSetPlan } from "c/shoreshElectiveEngine";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/** "Tuesday" for "2027-07-06", the same in every time zone and language. */
export function weekdayOf(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The key every division's copy of a linked choice shares, and a choice of it names. */
export function linkedKey(linkedChoiceId) {
  return `linked|${linkedChoiceId}`;
}

/** The linked choice a seat came from: the Id before the division ("<Id>|<division>"). */
export function linkedIdOf(engineLinkedId) {
  return engineLinkedId ? String(engineLinkedId).split("|")[0] : null;
}

const periodKey = (weekday, blockId) => `${weekday}|${blockId}`;

/** Which divisions a linked choice is for, of those given. */
function divisionsFor(choice, divisionIds) {
  const named = new Set(choice.divisionIds || []);
  if (choice.appliesTo === "OnlyThese") {
    return divisionIds.filter((id) => named.has(id));
  }
  if (choice.appliesTo === "AllExcept") {
    return divisionIds.filter((id) => !named.has(id));
  }
  return divisionIds;
}

/**
 * The run's linked choices for the engine: { linkedChoices, linkedChoiceTimes, usable, problems }.
 * usable: linked choice Id -> { choice, offering, periods: Set("Tuesday|<block>"), timeKeys: the
 * run's times its copies hold, copies: [{ id, times, missing }] }.
 * problems: [{ key, ids, name, text }] in the linked choices' order: a period this schedule doesn't
 * have for a division it applies to, and a linked choice set aside because another of the same
 * offering, kept as a set, shares a time with it (two offerings' may share: each takes its own
 * offering's seats there, slice E9). ids: the linked choices the problem is about.
 * plan: the engine's linkedSetPlan for these, so the screen says what the engine did.
 */
export function linkedOf(run) {
  const choices = (run.view && run.view.linkedChoices) || [];
  // day|block|division -> the time, by weekday instead of date: "Tuesday|b1|d1".
  const timeAt = new Map();
  run.times.forEach((t) => {
    timeAt.set(`${weekdayOf(t.day)}|${t.blockId}|${t.divisionId}`, t);
  });
  const divisionOrder = new Map();
  run.times.forEach((t) => {
    if (!divisionOrder.has(t.divisionId)) {
      divisionOrder.set(t.divisionId, t.divisionOrder);
    }
  });
  const divisionName = new Map(
    [...run.groups.values()].map((g) => [g.divisionId, g.divisionName])
  );

  const linkedChoices = [];
  const linkedChoiceTimes = [];
  const usable = new Map();
  const problems = [];

  choices.forEach((choice) => {
    const offering = run.offeringById.get(choice.offeringId);
    if (!offering || offering.proposed) {
      return;
    }
    const periods = [];
    const seen = new Set();
    (choice.periods || []).forEach((p) => {
      const key = periodKey(p.weekday, p.blockId);
      if (!seen.has(key)) {
        seen.add(key);
        periods.push(p);
      }
    });
    if (periods.length === 0) {
      return;
    }
    const use = {
      choice,
      offering,
      periods: seen,
      timeKeys: new Set(),
      copies: []
    };
    usable.set(choice.id, use);
    const present = [...divisionOrder.keys()].filter((divisionId) =>
      periods.some((p) => timeAt.has(`${p.weekday}|${p.blockId}|${divisionId}`))
    );
    divisionsFor(choice, present).forEach((divisionId) => {
      const id = `${choice.id}|${divisionId}`;
      const copy = { id, times: [], missing: false };
      use.copies.push(copy);
      linkedChoices.push({
        id,
        key: linkedKey(choice.id),
        name: choice.name
      });
      periods.forEach((p) => {
        const time = timeAt.get(`${p.weekday}|${p.blockId}|${divisionId}`);
        const where = missingWhere(run, p, divisionName.get(divisionId));
        if (!time) {
          problems.push({
            key: `missing|${id}|${p.weekday}|${p.blockId}`,
            ids: [choice.id],
            name: choice.name,
            text: `Not on this schedule ${where}`
          });
        } else if (!(time.offeringIds || []).includes(offering.id)) {
          problems.push({
            key: `closed|${id}|${p.weekday}|${p.blockId}`,
            ids: [choice.id],
            name: choice.name,
            text: `${offering.name} isn't offered ${where}`
          });
        }
        const timeId = time
          ? time.key
          : `missing|${p.weekday}|${p.blockId}|${divisionId}`;
        copy.times.push(timeId);
        if (time) use.timeKeys.add(time.key);
        else copy.missing = true;
        linkedChoiceTimes.push({
          linkedChoiceId: id,
          timeId,
          activityId: offering.activityId,
          offeringId: offering.id,
          ...(time ? {} : { name: missingName(run, p) })
        });
      });
    });
  });

  const plan = linkedSetPlan({
    linkedChoices,
    linkedChoiceTimes,
    timeIds: run.times.map((t) => t.key),
    offerings: run.times.flatMap((t) =>
      (t.offeringIds || [])
        .map((id) => run.offeringById.get(id))
        .filter(Boolean)
        .map((o) => ({
          timeId: t.key,
          activityId: o.activityId,
          offeringId: o.id
        }))
    )
  });
  const nameOfCopy = (copyId) => {
    const use = usable.get(linkedIdOf(copyId));
    return use ? use.choice.name : "";
  };
  plan.setAside.forEach((aside) => {
    const time = run.timeByKey.get(aside.timeId);
    problems.push({
      key: `shared|${aside.id}`,
      ids: [linkedIdOf(aside.id)],
      name: nameOfCopy(aside.id),
      text: `Shares ${time ? timeWordsOf(time) : "a period"} with "${nameOfCopy(aside.keptId)}", which was kept as a set`,
      shared: true
    });
  });

  return { linkedChoices, linkedChoiceTimes, usable, problems, plan };
}

function timeWordsOf(time) {
  return `${weekdayOf(time.day)} ${time.startTime || time.blockName}`;
}

/** "Thu 12:30": a period this run doesn't have, as findings say it. */
function missingName(run, period) {
  const block = run.times.find((t) => t.blockId === period.blockId);
  const when = block ? block.startTime || block.blockName : "";
  return `${String(period.weekday).slice(0, 3)} ${when}`.trim();
}

/** "at Thursday 12:30 for Seniors": a period by its weekday and its block's start or name. */
function missingWhere(run, period, division) {
  const block = run.times.find((t) => t.blockId === period.blockId);
  const when = block ? block.startTime || block.blockName : "that period";
  return `at ${period.weekday} ${when}${division ? ` for ${division}` : ""}`;
}

/**
 * A camper's choice of a linked choice, as the engine takes it: the linked choice (by its shared
 * key) and, at each of its periods the camper takes, its activity, so a camper who can't have it
 * as a set still has it ranked one period at a time (the engine's own fallback: "filled one
 * period at a time instead"). A choice for one day and period counts only there.
 * Returns { rows, uncovered }, or null when the linked choice can't be used (gone, its offering
 * not confirmed, no periods): the choice then counts as its activity, as it was saved. A camper
 * the linked choice doesn't cover (no copy of it holds any time they take) also keeps the choice
 * as its activity, saved (rows: [base]), with uncovered true so it is said (desktop D6 amendment
 * 2026-09-30: never drop a camper's written answer).
 */
export function linkedRows(run, linked, camper, saved, base) {
  const use = saved.l ? linked.usable.get(saved.l) : null;
  if (!use) {
    return null;
  }
  const mine = run.timesOf(camper);
  if (!mine.some((t) => use.timeKeys.has(t.key))) {
    return { rows: [base], uncovered: true };
  }
  const rows = [{ ...base, key: linkedKey(saved.l) }];
  mine
    .filter((t) => use.periods.has(periodKey(weekdayOf(t.day), t.blockId)))
    .filter((t) => base.timeId == null || t.key === base.timeId)
    .forEach((t) => {
      rows.push({ ...base, key: use.offering.activityId, timeId: t.key });
    });
  return { rows, uncovered: false };
}

/**
 * Campers who asked for a linked choice but can't have it as a set, by the engine's own rule
 * (shoreshElectiveEngine placeLinkedChoices and linkedSetPlan, through linked.plan): over the
 * periods a set has in this run, they take some but not all ("absent"), or hold a locked seat at
 * one ("locked"); or the set was set aside because another of the same offering, kept as a set,
 * shares a period with it ("shared", with keptName and timeKey). The engine fills theirs one
 * period at a time. A camper who takes none of a copy's periods is another division's, and is
 * not one of these.
 * choices: the engine's choice rows; attendance: camperId -> the time keys the engine is given;
 * locks: the locks the engine is given.
 * Returns [{ camperId, linkedChoiceId, name, reason, keptName?, timeKey? }].
 */
export function splitOf(linked, choices, attendance, locks) {
  const nameOfCopy = (copyId) => {
    const use = linked.usable.get(linkedIdOf(copyId));
    return use ? use.choice.name : "";
  };
  const asideOf = new Map(linked.plan.setAside.map((a) => [a.id, a]));
  const lockedAt = new Set(locks.map((l) => `${l.camperId}|${l.timeId}`));
  const split = [];
  const said = new Set();
  [...linked.plan.sets.keys()].forEach((copyId) => {
    const times = [
      ...new Set(linked.plan.sets.get(copyId).members.map((m) => m.timeId))
    ];
    if (times.length === 0) return;
    const linkedChoiceId = linkedIdOf(copyId);
    const aside = asideOf.get(copyId);
    const key = linkedKey(linkedChoiceId);
    const wanted = [];
    choices.forEach((row) => {
      if (
        row.key === key &&
        (row.timeId == null || times.includes(row.timeId)) &&
        !wanted.includes(row.camperId)
      ) {
        wanted.push(row.camperId);
      }
    });
    wanted.forEach((camperId) => {
      const takes = attendance[camperId] || [];
      const some = times.filter((x) => takes.includes(x)).length;
      let reason = null;
      if (some === 0) return;
      if (aside) reason = "shared";
      else if (some < times.length) reason = "absent";
      else if (times.some((x) => lockedAt.has(`${camperId}|${x}`))) {
        reason = "locked";
      }
      const once = `${camperId}|${linkedChoiceId}|${reason}`;
      if (!reason || said.has(once)) return;
      said.add(once);
      split.push({
        camperId,
        linkedChoiceId,
        name: nameOfCopy(copyId),
        reason,
        ...(aside
          ? { keptName: nameOfCopy(aside.keptId), timeKey: aside.timeId }
          : {})
      });
    });
  });
  return split;
}
