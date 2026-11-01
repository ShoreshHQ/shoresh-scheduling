import { buildTerms } from "./engine.shoreshTerms.shoreshTerms.mjs";
import { hasOrderingEvidence } from "./engine.shoreshElectiveEngine.rankKind.mjs";
import { minCostAssign } from "./engine.shoreshElectiveEngine.minCostAssign.mjs";

export {
  CELL_CHOICE,
  ORDERED_FALLBACK,
  UNORDERED_SET,
  hasOrderingEvidence
} from "./engine.shoreshElectiveEngine.rankKind.mjs";

// Above any real rank (a 25-choice form tops out at 25), below no seat at all.
const UNRANKED_COST = 1000;

// "No limit" as a seat count the solver can subtract from.
const NO_LIMIT = Number.MAX_SAFE_INTEGER;

/**
 * Elective seat assignment (ADR 0016): which camper sits in which offering at each elective
 * time. A port of the desktop's src/engine/buildElectiveAssignments.js (Scheduling-Project-
 * 69dbd34, Apache-2.0; desktop ADRs 2026-09-17-individual-elective-scheduling D11/D14,
 * 2026-09-23-elective-run-lifecycle-and-remaining-slices b/c and Q3/Q6,
 * 2026-09-26-per-cell-elective-preferences, 2026-09-29-linked-elective-bundles D4).
 *
 * Pure: no server calls, no saving, no clock, no Math.random. Every order below is a total order
 * over the inputs' ids, never the order the records arrived in, so the same inputs give the
 * same seats in every browser.
 *
 * input:
 *   campers: [{ id }]
 *   times: [{ id, date, blockOrder, divisionOrder, name? }]: the elective times (name: how
 *     findings say it, "Mon 12:30") (one per day, time
 *     block and division where the set sits on the schedule). Filled one after another by date,
 *     then block order, then division order, then id, so the result can be explained ("Tuesday
 *     filled first, and by Thursday Archery was full").
 *   offerings: [{ timeId, activityId, offeringId?, key, name, seats, noLimit, minimum }]: what each time
 *     offers. `key` is what a camper's choice names; `name` is what findings say. `noLimit`
 *     true means no seat limit; otherwise `seats`. Blank or 0 seats are placed as no limit and
 *     said (NO_SEATS_SET; Greg, 2026-10-26: never stop the run). `minimum`: null for none,
 *     else at least 1.
 *   choices: [{ camperId, key, linkedChoiceId, timeId, rank, rankKind }]: a camper's choices.
 *     rank is 1-based, lower is better. With timeId the row counts only at that time; without
 *     one it is a whole-week choice used at any time with no row of its own for that key. The
 *     best (lowest) rank wins when rows repeat. rankKind: see rankKind.js.
 *   attendance: { camperId: [timeId] }, or null for every camper at every time.
 *   locks: [{ camperId, timeId, activityId }]: seats set by hand and locked. Never re-decided;
 *     each takes its seat before anything else is placed.
 *   linkedChoices: [{ id, key, name }] and linkedChoiceTimes: [{ linkedChoiceId, timeId,
 *     activityId, offeringId?, name? }]: an offering's periods a camper takes together or not at all
 *     (name: a period's words when the run doesn't have it). One with
 *     more than one time is linked; it is placed before everything else, as a set, over the
 *     periods this run can give it (linkedSetPlan). Never refused (Greg, Q13): what can't be
 *     honoured is placed one period at a time and said.
 *   terms: the camp's words (c/shoreshTerms) for findings; model words when left out.
 *
 * Returns { ok: true, seats, findings } (always ok: nothing in a setup stops the run):
 *   seats: [{ camperId, timeId, activityId, key, rank, flags, notRequestedReason?, locked?,
 *     linkedChoiceId? }], by time id then camper id. flags: NOT_REQUESTED (a seat they didn't
 *     ask for), NOT_TOP_CHOICE (ranked, not first, and the sheet showed an order).
 *   findings: [{ kind, message, ... }]: NO_OFFERINGS, NO_CAMPERS, NO_CAPACITY,
 *     UNPLACED_AFTER_DECLINE, BELOW_MINIMUM, KEPT_BELOW_MINIMUM, NO_SEATS_SET,
 *     LINKED_PERIOD_LEFT_OUT, LINKED_SEATS_SHARED, and UNSUPPORTED_LINKED_CHOICE (campers who
 *     can't take a set as one: they miss one of its periods here, or hold a locked seat in one).
 */
export function assignSeats({
  campers = [],
  times = [],
  offerings = [],
  choices = [],
  attendance = null,
  locks = [],
  linkedChoices = [],
  linkedChoiceTimes = [],
  terms
} = {}) {
  const t = terms || buildTerms([]);

  const seats = [];
  const findings = [];

  // Blank or 0 seats on a limited offering: an offering on the table needs seats, so it is placed
  // as if it had no limit, and said (Greg, 2026-10-26).
  // The flag says what to do (Greg, 2026-10-26).
  for (const b of unsetSeats(offerings)) {
    findings.push({
      kind: "NO_SEATS_SET",
      activityId: b.activityId,
      timeIds: b.timeIds,
      message: `Choose how many ${t.sIn("Seats")} “${b.name}” has.`
    });
  }

  const camperIds = [...new Set(campers.map((c) => c.id))].sort(compareText);
  // Sorted first, so a time listed twice keeps the same place whichever copy came first.
  const timeIds = [
    ...new Set([...times].sort(compareTimes).map((time) => time.id))
  ];
  const timeIdSet = new Set(timeIds);

  const linkedById = new Map(linkedChoices.map((c) => [c.id, c]));
  // Ties on key go to the lowest id, never to input order.
  const linkedByKey = new Map();
  for (const c of [...linkedChoices].sort((a, b) => compareText(a.id, b.id))) {
    if (!linkedByKey.has(c.key)) {
      linkedByKey.set(c.key, c);
    }
  }
  // Every linked choice sharing a key: a set offered to two divisions arrives as one linked
  // choice per division with the set's one name, and a choice by name must reach each of them
  // (desktop ADR 2026-09-29 D4).
  const allLinkedByKey = new Map();
  for (const c of linkedChoices) {
    if (!allLinkedByKey.has(c.key)) {
      allLinkedByKey.set(c.key, []);
    }
    allLinkedByKey.get(c.key).push(c);
  }
  const nameOfLinked = (id) => {
    const c = linkedById.get(id);
    return (c && (c.name ?? c.key)) ?? id;
  };

  // A camper's ranks, per (camper, key) and per (camper, linked choice): the rank at each time
  // that has its own row, and a whole-week fallback.
  const rankOf = new Map();
  const rankByLinked = new Map();
  const entryFor = (map, camperId, key) => {
    if (!map.has(camperId)) {
      map.set(camperId, new Map());
    }
    const byKey = map.get(camperId);
    if (!byKey.has(key)) {
      byKey.set(key, { byTime: new Map(), fallback: null });
    }
    return byKey.get(key);
  };
  // Both scopes keep the best (lowest) rank. On a tie, the kind survives only when both rows
  // agree on whether there was an order (the only question its one reader asks).
  const better = (held, rank, kind) => {
    if (rank == null) {
      return held;
    }
    if (held == null || rank < held.rank) {
      return { rank, kind };
    }
    if (rank === held.rank) {
      if (held.kind === kind) {
        return { rank, kind };
      }
      return hasOrderingEvidence(held.kind) === hasOrderingEvidence(kind)
        ? { rank, kind: held.kind }
        : { rank, kind: null };
    }
    return held;
  };
  const record = (entry, timeId, rank, kind) => {
    if (timeId != null) {
      entry.byTime.set(
        timeId,
        better(entry.byTime.get(timeId) ?? null, rank, kind)
      );
    } else {
      entry.fallback = better(entry.fallback, rank, kind);
    }
  };
  const bestAt = (camperId, timeId, key) => {
    const entry = rankOf.get(camperId)?.get(key);
    if (!entry) {
      return null;
    }
    return entry.byTime.has(timeId) ? entry.byTime.get(timeId) : entry.fallback;
  };
  const rankAt = (camperId, timeId, key) =>
    bestAt(camperId, timeId, key)?.rank ?? null;
  const rankKindAt = (camperId, timeId, key) =>
    bestAt(camperId, timeId, key)?.kind ?? null;
  // A linked choice's rank is the best the camper gave at any of its own times, or as a
  // whole-week choice. A time they didn't rank is silent: not a vote against.
  const linkedBest = (camperId, linkedId, memberTimeIds) => {
    const entry = rankByLinked.get(camperId)?.get(linkedId);
    if (!entry) {
      return null;
    }
    let best = entry.fallback;
    for (const timeId of memberTimeIds) {
      if (!entry.byTime.has(timeId)) {
        continue;
      }
      const held = entry.byTime.get(timeId) ?? null;
      best = better(best, held?.rank ?? null, held?.kind ?? null);
    }
    return best;
  };
  const linkedRank = (camperId, linkedId, memberTimeIds) =>
    linkedBest(camperId, linkedId, memberTimeIds)?.rank ?? null;
  const linkedRankKind = (camperId, linkedId, memberTimeIds) =>
    linkedBest(camperId, linkedId, memberTimeIds)?.kind ?? null;

  for (const p of choices) {
    const linked =
      (p.linkedChoiceId != null
        ? linkedById.get(p.linkedChoiceId)
        : undefined) ??
      (p.key != null ? linkedByKey.get(p.key) : undefined) ??
      null;
    const key = p.key ?? linked?.key ?? null;
    const kind = p.rankKind ?? null;
    if (key != null) {
      record(entryFor(rankOf, p.camperId, key), p.timeId ?? null, p.rank, kind);
    }
    // A choice naming a linked choice this run knows reaches exactly that one. Otherwise (no id,
    // or one this run doesn't have) a choice by key reaches every linked choice with that key.
    if (p.linkedChoiceId != null && linkedById.has(p.linkedChoiceId)) {
      record(
        entryFor(rankByLinked, p.camperId, linked.id),
        p.timeId ?? null,
        p.rank,
        kind
      );
    } else if (p.key != null) {
      for (const c of allLinkedByKey.get(p.key) ?? []) {
        record(
          entryFor(rankByLinked, p.camperId, c.id),
          p.timeId ?? null,
          p.rank,
          kind
        );
      }
    }
  }
  const attends = (camperId, timeId) =>
    !attendance || (attendance[camperId] ?? []).includes(timeId);

  // Seats taken before a time is solved: locked seats, then linked choices. Each removes the
  // camper from that time's solve and takes one seat from the offering.
  const prePlacedByTime = new Map();
  const prePlace = (timeId, camperId, activityId, row) => {
    if (!prePlacedByTime.has(timeId)) {
      prePlacedByTime.set(timeId, []);
    }
    prePlacedByTime.get(timeId).push({ camperId, activityId, row });
  };

  for (const l of [...locks].sort(
    (a, b) =>
      compareText(a.timeId, b.timeId) ||
      compareText(a.camperId, b.camperId) ||
      compareText(a.activityId, b.activityId)
  )) {
    prePlace(l.timeId, l.camperId, l.activityId, (here) => {
      const o = here.find((x) => x.activityId === l.activityId) ?? null;
      return {
        camperId: l.camperId,
        timeId: l.timeId,
        activityId: l.activityId,
        key: o?.key ?? null,
        rank: (o && rankAt(l.camperId, l.timeId, o.key)) ?? null,
        flags: [],
        locked: true
      };
    });
  }

  placeLinkedChoices();

  for (const timeId of timeIds) {
    const here = offerings
      .filter((o) => o.timeId === timeId)
      .sort(
        (a, b) =>
          compareText(a.key, b.key) || compareText(a.activityId, b.activityId)
      );
    const prePlacedHere = prePlacedByTime.get(timeId) ?? [];
    const prePlacedCampers = new Set(prePlacedHere.map((e) => e.camperId));
    // "No camper" is answered from who attends, not from who is left: a time where everyone
    // already has a locked or linked seat is finished, not empty.
    const eligible = camperIds.filter((id) => attends(id, timeId));
    const who = eligible.filter((id) => !prePlacedCampers.has(id));

    // Taken seats are returned as they are, even where the time has lost its offerings.
    for (const e of prePlacedHere) {
      seats.push(e.row(here));
    }

    if (here.length === 0) {
      findings.push({
        kind: "NO_OFFERINGS",
        timeId,
        message:
          "Nothing is offered in this period, so nobody was placed in it."
      });
      continue;
    }
    if (eligible.length === 0) {
      findings.push({
        kind: "NO_CAMPERS",
        timeId,
        message:
          "No camper is eligible for this period — check that the " +
          `${t.pIn("Division")} on the sheet match the camp’s ${t.sIn("Division")} names.`
      });
      continue;
    }

    // Minimum to run is a second phase: nobody knows an offering is short until everyone is
    // placed (desktop owner ruling 2026-09-26).
    const capacityAt = (j) => Math.max(0, seatLimit(here[j]));
    const prePlacedAt = (j) =>
      prePlacedHere.filter((e) => e.activityId === here[j].activityId).length;

    const cancelled = new Set();
    const seat = new Map(); // camperId -> column index

    const seatedAt = (j) => {
      let n = 0;
      for (const j2 of seat.values()) {
        if (j2 === j) {
          n += 1;
        }
      }
      return n;
    };
    const remainingCapacity = () =>
      here.map((_, j) =>
        Math.max(0, capacityAt(j) - prePlacedAt(j) - seatedAt(j))
      );

    // An unranked seat costs more than any rank and less than no seat: everyone is placed if a
    // seat exists (desktop owner ruling R3).
    const solveInto = (rowCamperIds, remaining) => {
      const cost = rowCamperIds.map((camperId) =>
        here.map((o, j) => {
          if (cancelled.has(j)) {
            return null;
          }
          const rank = rankAt(camperId, timeId, o.key);
          return rank == null ? UNRANKED_COST : rank;
        })
      );
      const placed = minCostAssign(cost, remaining);
      rowCamperIds.forEach((camperId, i) => {
        if (placed[i] != null) {
          seat.set(camperId, placed[i]);
        }
      });
    };

    solveInto(who, remainingCapacity());

    const shortfallAt = (j) => {
      const minimum = here[j].minimum;
      if (minimum == null) {
        return null;
      }
      const enrolled = prePlacedAt(j) + seatedAt(j);
      return enrolled >= minimum
        ? null
        : { j, enrolled, minimum, shortfall: minimum - enrolled };
    };

    // One offering dropped per round, the one furthest below its minimum first; only its
    // campers move, so the loop ends (a column's count never falls) within here.length rounds.
    // An offering holding a taken seat can't be emptied, so it is never dropped.
    let declinedAny = false;
    for (;;) {
      const cancellable = [];
      for (let j = 0; j < here.length; j++) {
        if (cancelled.has(j) || prePlacedAt(j) > 0) {
          continue;
        }
        const s = shortfallAt(j);
        if (s) {
          cancellable.push(s);
        }
      }
      if (cancellable.length === 0) {
        break;
      }
      cancellable.sort(
        (a, b) =>
          b.shortfall - a.shortfall ||
          compareText(here[a.j].activityId, here[b.j].activityId)
      );
      const worst = cancellable[0];
      cancelled.add(worst.j);
      declinedAny = true;
      findings.push({
        kind: "BELOW_MINIMUM",
        timeId,
        activityId: here[worst.j].activityId,
        key: here[worst.j].key,
        enrolled: worst.enrolled,
        minimum: worst.minimum,
        shortfall: worst.shortfall,
        message:
          `“${nameOf(here[worst.j])}” had ${worst.enrolled} of the ${worst.minimum} ` +
          "campers it needs to run, so it did not run. Those campers were moved to their next " +
          "choice."
      });

      const displaced = [...seat.entries()]
        .filter(([, j]) => j === worst.j)
        .map(([camperId]) => camperId)
        .sort(compareText);
      for (const camperId of displaced) {
        seat.delete(camperId);
      }
      solveInto(displaced, remainingCapacity());
    }

    // Reported once the dropping has settled: anything still short holds a taken seat, so it
    // ran anyway, and an offering quietly under its minimum is never left unsaid.
    for (let j = 0; j < here.length; j++) {
      if (cancelled.has(j)) {
        continue;
      }
      const s = shortfallAt(j);
      if (!s) {
        continue;
      }
      findings.push({
        kind: "KEPT_BELOW_MINIMUM",
        timeId,
        activityId: here[j].activityId,
        key: here[j].key,
        enrolled: s.enrolled,
        minimum: s.minimum,
        shortfall: s.shortfall,
        message:
          `“${nameOf(here[j])}” has ${s.enrolled} of the ${s.minimum} campers it ` +
          "needs to run, but it holds a seat that was set by hand, so it was kept as it is. " +
          "Lower its minimum, or move that seat, and run this again."
      });
    }

    // Why a camper sits in something they didn't ask for, read off the settled time: each
    // offering they asked for here either didn't run or is full. Anything else gets no reason
    // rather than a guess.
    const notRequestedReason = (camperId) => {
      const requested = [];
      for (let j = 0; j < here.length; j++) {
        if (rankAt(camperId, timeId, here[j].key) != null) {
          requested.push(j);
        }
      }
      if (requested.length === 0) {
        return "NO_CHOICE_OFFERED";
      }
      const remaining = remainingCapacity();
      let didNotRun = 0;
      let full = 0;
      for (const j of requested) {
        if (cancelled.has(j)) {
          didNotRun += 1;
        } else if (remaining[j] <= 0) {
          full += 1;
        }
      }
      if (didNotRun + full < requested.length) {
        return null;
      }
      if (full === 0) {
        return "CHOICES_DID_NOT_RUN";
      }
      if (didNotRun === 0) {
        return "CHOICES_FULL";
      }
      return "CHOICES_FULL_OR_DID_NOT_RUN";
    };

    const unplaced = [];
    for (const camperId of who) {
      const j = seat.get(camperId);
      if (j == null) {
        unplaced.push(camperId);
        continue;
      }
      const o = here[j];
      const rank = rankAt(camperId, timeId, o.key) ?? null;
      const kind = rankKindAt(camperId, timeId, o.key);
      const flags = [];
      if (rank == null) {
        flags.push("NOT_REQUESTED");
      } else if (rank > 1 && hasOrderingEvidence(kind)) {
        flags.push("NOT_TOP_CHOICE");
      }
      const reason = rank == null ? notRequestedReason(camperId) : null;
      seats.push({
        camperId,
        timeId,
        activityId: o.activityId,
        key: o.key,
        rank,
        flags,
        ...(reason ? { notRequestedReason: reason } : {})
      });
    }

    if (unplaced.length > 0) {
      // Two reasons, two findings: "everything is full" means add seats, "an offering didn't
      // run" means lower a minimum.
      findings.push(
        declinedAny
          ? {
              kind: "UNPLACED_AFTER_DECLINE",
              timeId,
              camperIds: unplaced.sort(compareText),
              message:
                `${unplaced.length} camper(s) had nowhere left to go after an offering did not run — ` +
                "they had no other choice in this period with room in it."
            }
          : {
              kind: "NO_CAPACITY",
              timeId,
              camperIds: unplaced.sort(compareText),
              message: `${unplaced.length} camper(s) could not be placed — every offering in this period is full.`
            }
      );
    }
  }

  seats.sort(
    (a, b) =>
      compareText(a.timeId, b.timeId) || compareText(a.camperId, b.camperId)
  );
  return { ok: true, seats, findings };

  // Linked choices, placed before any time is solved, as one matching of campers to linked
  // choices (desktop ADR 2026-09-23 c). A linked choice's seats are the fewest left (after
  // locks) at any of its times. Each placement becomes one taken seat per time. Known and
  // accepted (desktop owner ruling Q6): a camper who ranks both a linked choice and a scarce
  // single offering may not get the best trade between them.
  function placeLinkedChoices() {
    const membersByLinked = new Map();
    for (const m of linkedChoiceTimes) {
      if (!linkedById.has(m.linkedChoiceId)) {
        continue;
      }
      if (!membersByLinked.has(m.linkedChoiceId)) {
        membersByLinked.set(m.linkedChoiceId, []);
      }
      membersByLinked.get(m.linkedChoiceId).push(m);
    }
    // A set's periods this run can give it (linkedSetPlan), by time.
    let plan = null;
    const membersOf = (id) => plan.sets.get(id).members;
    const timesOf = (id) => [...new Set(membersOf(id).map((m) => m.timeId))];

    // Linked means more than one time. Which periods each set can really have here, and which
    // set keeps a shared period's seats, is linkedSetPlan's: the seats screen reads the same.
    plan = linkedSetPlan({
      linkedChoices,
      linkedChoiceTimes,
      timeIds,
      offerings
    });
    if (plan.sets.size === 0) {
      return;
    }
    const activityName = (activityId) => {
      const o = offerings.find((x) => x.activityId === activityId);
      return o ? nameOf(o) : activityId;
    };
    // A period in words: the time's name, or the linked choice time's (one this run doesn't
    // have), else its id.
    const periodName = new Map();
    for (const m of linkedChoiceTimes) {
      if (m.name != null && !periodName.has(m.timeId)) {
        periodName.set(m.timeId, m.name);
      }
    }
    for (const x of times) {
      if (x.name != null) {
        periodName.set(x.id, x.name);
      }
    }
    const periodWords = (timeId) => periodName.get(timeId) ?? timeId;
    const periodsWords = (ids) => {
      const words = ids.map(periodWords);
      return words.length < 2
        ? words.join("")
        : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
    };
    // Who asked for a set and takes at least one of the periods it has here; anyone else only
    // matched by name (another division's copy).
    const askedFor = (id) => {
      const ts = timesOf(id);
      return camperIds.filter(
        (c) =>
          linkedRank(c, id, timesOf(id)) != null &&
          ts.some((x) => attends(c, x))
      );
    };

    // A period the run can't give a set (not in this run, or its offering not offered then):
    // the set is kept whole over the periods it does have (Greg, Q13: never refuse; flag).
    for (const id of [...plan.sets.keys()]) {
      const { left, members } = plan.sets.get(id);
      if (left.length === 0) {
        continue;
      }
      const name = nameOfLinked(id);
      findings.push({
        kind: "LINKED_PERIOD_LEFT_OUT",
        linkedChoiceIds: [id],
        timeIds: left,
        camperIds: members.length ? askedFor(id) : [],
        message:
          `“${name}”: ${periodsWords(left)} can’t be given in this run; ` +
          (members.length
            ? "its other periods were kept together."
            : "nobody was placed in it.")
      });
    }

    // Two sets holding the same offering's seats in one period: the first by name keeps them,
    // and each set it pushed aside is filled one period at a time, said per set.
    for (const aside of plan.setAside) {
      const asked = askedFor(aside.id);
      const name = nameOfLinked(aside.id);
      const kept = nameOfLinked(aside.keptId);
      findings.push({
        kind: "LINKED_SEATS_SHARED",
        linkedChoiceIds: [aside.id],
        keptLinkedChoiceId: aside.keptId,
        timeId: aside.timeId,
        activityId: aside.activityId,
        camperIds: asked,
        message:
          `“${name}” shares “${activityName(aside.activityId)}” ${t.sIn("Seats")} with ` +
          `“${kept}” in ${periodWords(aside.timeId)}, so ` +
          (asked.length === 0
            ? `“${name}” wasn’t kept as a set.`
            : `${asked.length} ${asked.length === 1 ? "camper who asked for" : "campers who asked for"} ` +
              `“${name}” got a seat each period instead.`)
      });
    }

    const columns = [...plan.sets.keys()].filter(
      (id) => !plan.asideIds.has(id) && plan.sets.get(id).members.length > 0
    );
    if (columns.length === 0) {
      return;
    }

    // A camper who can't take the set as a set: they miss some of its times, or they already
    // hold a locked seat at one of them (the lock stands). A camper who attends none of its
    // times only matched by name (another division's linked choice), so nothing is said.
    const holdsSeatAt = (camperId, timeId) =>
      (prePlacedByTime.get(timeId) ?? []).some((e) => e.camperId === camperId);
    const excluded = new Map();
    const exclude = (id, ids, message) => {
      if (ids.length === 0) {
        return;
      }
      if (!excluded.has(id)) {
        excluded.set(id, new Set());
      }
      for (const c of ids) {
        excluded.get(id).add(c);
      }
      if (message == null) {
        return;
      }
      findings.push({
        kind: "UNSUPPORTED_LINKED_CHOICE",
        linkedChoiceIds: [id],
        camperIds: ids,
        message
      });
    };
    for (const id of columns) {
      const ts = timesOf(id);
      const wanted = camperIds.filter((c) => linkedRank(c, id, ts) != null);
      const absent = wanted.filter((c) => !ts.every((x) => attends(c, x)));
      const attendsNone = absent.filter((c) => !ts.some((x) => attends(c, x)));
      const attendsSome = absent.filter((c) => !attendsNone.includes(c));
      exclude(id, attendsNone, null);
      exclude(
        id,
        attendsSome,
        `${attendsSome.length} camper(s) asked for “${nameOfLinked(id)}” but do not attend ` +
          "every period it covers. They were placed one period at a time instead of together."
      );
      const held = wanted.filter(
        (c) => !absent.includes(c) && ts.some((x) => holdsSeatAt(c, x))
      );
      exclude(
        id,
        held,
        `${held.length} camper(s) asked for “${nameOfLinked(id)}” but already have a ` +
          "seat set by hand in one of the periods it covers. The seat set by hand was kept, so the " +
          "set could not be given to them as a set; they were placed one period at a time instead."
      );
    }

    const wants = (camperId, id) =>
      linkedRank(camperId, id, timesOf(id)) != null &&
      !excluded.get(id)?.has(camperId);
    const rows = camperIds.filter((c) => columns.some((id) => wants(c, id)));
    if (rows.length === 0) {
      return;
    }

    // An unranked linked choice is forbidden, not costed: the one-time-at-a-time pass is what
    // guarantees a seat.
    const cost = rows.map((camperId) =>
      columns.map((id) => {
        return wants(camperId, id)
          ? linkedRank(camperId, id, timesOf(id))
          : null;
      })
    );

    // Seats left after locks, never the offering's full count, or a placement here would have
    // to break a lock.
    const seatsLeft = new Map();
    for (const o of offerings) {
      if (!timeIdSet.has(o.timeId)) {
        continue;
      }
      seatsLeft.set(
        `${o.timeId}\u0000${o.activityId}`,
        Math.max(0, seatLimit(o))
      );
    }
    for (const [timeId, entries] of prePlacedByTime) {
      for (const e of entries) {
        const k = `${timeId}\u0000${e.activityId}`;
        if (seatsLeft.has(k)) {
          seatsLeft.set(k, Math.max(0, seatsLeft.get(k) - 1));
        }
      }
    }
    const capacity = columns.map((id) =>
      Math.min(
        ...membersOf(id).map(
          (m) => seatsLeft.get(`${m.timeId}\u0000${m.activityId}`) ?? 0
        )
      )
    );

    const placed = minCostAssign(cost, capacity);

    rows.forEach((camperId, i) => {
      const j = placed[i];
      if (j == null) {
        return;
      }
      const id = columns[j];
      const rank = linkedRank(camperId, id, timesOf(id));
      const kind = linkedRankKind(camperId, id, timesOf(id));
      for (const m of membersOf(id)) {
        prePlace(m.timeId, camperId, m.activityId, () => ({
          camperId,
          timeId: m.timeId,
          activityId: m.activityId,
          key: linkedById.get(id).key ?? id,
          rank,
          flags:
            rank > 1 && hasOrderingEvidence(kind) ? ["NOT_TOP_CHOICE"] : [],
          linkedChoiceId: id
        }));
      }
    });
  }
}

function seatLimit(offering) {
  return seatsUnset(offering) || offering.noLimit ? NO_LIMIT : offering.seats;
}

/** A limited offering whose seats are blank or 0 (Greg, 2026-10-26: both mean "no limit used"). */
function seatsUnset(offering) {
  return !offering.noLimit && (offering.seats == null || offering.seats === 0);
}

function nameOf(offering) {
  return offering.name ?? offering.key;
}

/** Limited offerings with blank or 0 seats, once per activity, by name: [{ activityId, name, timeIds }]. */
function unsetSeats(offerings) {
  const found = new Map();
  for (const o of offerings) {
    if (!seatsUnset(o)) {
      continue;
    }
    if (!found.has(o.activityId)) {
      found.set(o.activityId, {
        activityId: o.activityId,
        name: nameOf(o) ?? o.activityId,
        timeIds: new Set()
      });
    }
    found.get(o.activityId).timeIds.add(o.timeId);
  }
  return [...found.values()]
    .map((b) => ({ ...b, timeIds: [...b.timeIds].sort(compareText) }))
    .sort(
      (a, b) =>
        compareText(a.name, b.name) || compareText(a.activityId, b.activityId)
    );
}

/**
 * Which linked choices are placed as sets, and over which periods (engine care PR 8; Greg, Q13:
 * never refuse a setup, place what's possible, flag the rest). Shared by the engine and the seats
 * screen, so both say the same. Linked means more than one time.
 * - A period this run can't give a set (its time isn't in the run, or its offering isn't offered
 *   then) is left out; the set is kept whole over the periods it has: all of them or none.
 * - Two sets holding the same offering's seats in one period: the first by name (then id) keeps
 *   them; a set sharing with one already kept is set aside and filled one period at a time.
 * Returns { sets: Map(id -> { members: [{ timeId, activityId }], left: [timeId] }),
 *   setAside: [{ id, keptId, timeId, activityId }], asideIds: Set }. Every order is by id or name.
 */
export function linkedSetPlan({
  linkedChoices = [],
  linkedChoiceTimes = [],
  timeIds = [],
  offerings = []
} = {}) {
  const inRun = new Set(timeIds);
  // Matched by the offering itself when the caller gives its id (as the server does), else by
  // its activity (one offering per activity in a set).
  const offeringOf = (x) => x.offeringId ?? x.activityId;
  const offered = new Set(
    offerings.map((o) => `${o.timeId}\u0000${offeringOf(o)}`)
  );
  const nameById = new Map(
    linkedChoices.map((c) => [c.id, c.name ?? c.key ?? c.id])
  );
  const byId = new Map();
  for (const m of linkedChoiceTimes) {
    if (!nameById.has(m.linkedChoiceId)) {
      continue;
    }
    if (!byId.has(m.linkedChoiceId)) {
      byId.set(m.linkedChoiceId, []);
    }
    byId.get(m.linkedChoiceId).push(m);
  }
  const sets = new Map();
  for (const id of [...byId.keys()].sort(compareText)) {
    const all = [...byId.get(id)].sort(
      (a, b) =>
        compareText(a.timeId, b.timeId) ||
        compareText(a.activityId, b.activityId)
    );
    if (new Set(all.map((m) => m.timeId)).size < 2) {
      continue;
    }
    const can = (m) =>
      inRun.has(m.timeId) && offered.has(`${m.timeId}\u0000${offeringOf(m)}`);
    sets.set(id, {
      members: all.filter(can),
      left: [...new Set(all.filter((m) => !can(m)).map((m) => m.timeId))]
    });
  }
  const order = [...sets.keys()].sort(
    (a, b) => compareText(nameById.get(a), nameById.get(b)) || compareText(a, b)
  );
  const holder = new Map();
  const setAside = [];
  for (const id of order) {
    const members = sets.get(id).members;
    const clash = members.find((m) =>
      holder.has(`${m.timeId}\u0000${m.activityId}`)
    );
    if (clash) {
      setAside.push({
        id,
        keptId: holder.get(`${clash.timeId}\u0000${clash.activityId}`),
        timeId: clash.timeId,
        activityId: clash.activityId
      });
      continue;
    }
    for (const m of members) {
      holder.set(`${m.timeId}\u0000${m.activityId}`, id);
    }
  }
  return { sets, setAside, asideIds: new Set(setAside.map((a) => a.id)) };
}

/** Code-unit order: the same in every browser and locale. */
function compareText(a, b) {
  const x = a ?? "";
  const y = b ?? "";
  if (x < y) {
    return -1;
  }
  return x > y ? 1 : 0;
}

function compareNumber(a, b) {
  return (a ?? 0) - (b ?? 0);
}

function compareTimes(a, b) {
  return (
    compareText(a.date, b.date) ||
    compareNumber(a.blockOrder, b.blockOrder) ||
    compareNumber(a.divisionOrder, b.divisionOrder) ||
    compareText(a.id, b.id)
  );
}
