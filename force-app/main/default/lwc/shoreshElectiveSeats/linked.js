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
 * - A period this run doesn't have for that division is still passed (desktop D5): the engine then
 *   fills that linked choice one period at a time and says so; here it is a problem in words.
 */

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
 * usable: linked choice Id -> { choice, offering, periods: Set("Tuesday|<block>") }.
 * problems: [{ key, name, text }] in the linked choices' order: a period this schedule doesn't
 * have for a division it applies to, and two linked choices sharing a time.
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
  // time key -> the linked choices holding it, to say which share one.
  const holding = new Map();

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
    usable.set(choice.id, { choice, offering, periods: seen });
    const present = [...divisionOrder.keys()].filter((divisionId) =>
      periods.some((p) => timeAt.has(`${p.weekday}|${p.blockId}|${divisionId}`))
    );
    divisionsFor(choice, present).forEach((divisionId) => {
      const id = `${choice.id}|${divisionId}`;
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
            name: choice.name,
            text: `Not on this schedule ${where}`
          });
        } else if (!(time.offeringIds || []).includes(offering.id)) {
          problems.push({
            key: `closed|${id}|${p.weekday}|${p.blockId}`,
            name: choice.name,
            text: `${offering.name} isn't offered ${where}`
          });
        }
        const timeId = time
          ? time.key
          : `missing|${p.weekday}|${p.blockId}|${divisionId}`;
        linkedChoiceTimes.push({
          linkedChoiceId: id,
          timeId,
          activityId: offering.activityId
        });
        if (time && periods.length > 1) {
          if (!holding.has(time.key)) holding.set(time.key, []);
          holding.get(time.key).push(choice);
        }
      });
    });
  });

  holding.forEach((sharing, timeKey) => {
    const names = [...new Set(sharing.map((c) => c.name))];
    if (sharing.length < 2) return;
    const time = run.timeByKey.get(timeKey);
    problems.push({
      key: `shared|${timeKey}`,
      name: names.map((n) => `"${n}"`).join(" and "),
      text: `Share ${time ? timeWordsOf(time) : "a period"}`,
      shared: true
    });
  });

  return { linkedChoices, linkedChoiceTimes, usable, problems };
}

function timeWordsOf(time) {
  return `${weekdayOf(time.day)} ${time.startTime || time.blockName}`;
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
 * period at a time instead"). A choice for one day and period counts only there. Null when the
 * linked choice can't be used (gone, its offering not confirmed, no periods): the choice then
 * counts as its activity, as it was saved.
 */
export function linkedRows(run, linked, camper, saved, base) {
  const use = saved.l ? linked.usable.get(saved.l) : null;
  if (!use) {
    return null;
  }
  const rows = [{ ...base, key: linkedKey(saved.l) }];
  run
    .timesOf(camper)
    .filter((t) => use.periods.has(periodKey(weekdayOf(t.day), t.blockId)))
    .filter((t) => base.timeId == null || t.key === base.timeId)
    .forEach((t) => {
      rows.push({ ...base, key: use.offering.activityId, timeId: t.key });
    });
  return rows;
}
