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
 * - A camper it doesn't cover (their division left out, or holding none of its periods) has their
 *   choice of it counted as its activity, and said (desktop D6 amendment 2026-09-30,
 *   BUNDLE_TIER_NOT_COVERED): never dropped.
 * - A camper it covers who can't have it as a set (the engine's UNSUPPORTED_LINKED_CHOICE for
 *   campers) is worked out here by the engine's own rule, and said.
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
 * usable: linked choice Id -> { choice, offering, periods: Set("Tuesday|<block>"), timeKeys: the
 * run's times its copies hold, copies: [{ id, times, missing }] }.
 * problems: [{ key, ids, name, text }] in the linked choices' order: a period this schedule doesn't
 * have for a division it applies to, and two linked choices sharing a time. ids: the linked
 * choices the problem is about.
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
      ids: [...new Set(sharing.map((c) => c.id))],
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
 * Campers who asked for a linked choice the engine places as a set but can't have it as one, by
 * the engine's own rule (shoreshElectiveEngine placeLinkedChoices, UNSUPPORTED_LINKED_CHOICE with
 * camperIds): they take some of a copy's times but not all ("absent"), or hold a locked seat at
 * one ("locked"). The engine fills theirs one period at a time. A camper who takes none of a
 * copy's times is another division's, and is not one of these.
 * choices: the engine's choice rows; attendance: camperId -> the time keys the engine is given;
 * locks: the locks the engine is given. Returns [{ camperId, linkedChoiceId, name, reason }].
 */
export function splitOf(linked, choices, attendance, locks) {
  // The copies the engine tries as sets: more than one time, all in the run, none shared.
  const tried = [];
  linked.usable.forEach((use, linkedChoiceId) => {
    use.copies.forEach((copy) => {
      const times = [...new Set(copy.times)];
      if (times.length > 1 && !copy.missing) {
        tried.push({ linkedChoiceId, name: use.choice.name, times });
      }
    });
  });
  const holders = new Map();
  tried.forEach((c) =>
    c.times.forEach((x) => holders.set(x, (holders.get(x) || 0) + 1))
  );
  const lockedAt = new Set(locks.map((l) => `${l.camperId}|${l.timeId}`));
  const split = [];
  const said = new Set();
  tried
    .filter((c) => c.times.every((x) => holders.get(x) === 1))
    .forEach((c) => {
      const key = linkedKey(c.linkedChoiceId);
      const wanted = [];
      choices.forEach((row) => {
        if (
          row.key === key &&
          (row.timeId == null || c.times.includes(row.timeId)) &&
          !wanted.includes(row.camperId)
        ) {
          wanted.push(row.camperId);
        }
      });
      wanted.forEach((camperId) => {
        const takes = attendance[camperId] || [];
        const some = c.times.filter((x) => takes.includes(x)).length;
        let reason = null;
        if (some === 0) return;
        if (some < c.times.length) reason = "absent";
        else if (c.times.some((x) => lockedAt.has(`${camperId}|${x}`))) {
          reason = "locked";
        }
        const once = `${camperId}|${c.linkedChoiceId}|${reason}`;
        if (!reason || said.has(once)) return;
        said.add(once);
        split.push({
          camperId,
          linkedChoiceId: c.linkedChoiceId,
          name: c.name,
          reason
        });
      });
    });
  return split;
}
