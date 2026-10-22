/**
 * The desktop's buildElectiveAssignments, as a thin wrapper over assignSeats, so the desktop's
 * engine tests (Scheduling-Project- 69dbd34, src/engine/*.test.js) run here with their bodies
 * unchanged. It only renames fields: occurrence -> time, labelKey -> key, capacity -> seats
 * (the desktop engine closes an offering whose capacity is missing, so missing becomes 0; the
 * blank-seats refusal lives in its buildOfferings and is tested in refusals.test.js), preference
 * -> choice, choice/choiceOffering -> linked choice/linked choice time, lockedAssignment -> lock.
 * Nothing here decides anything.
 */
import { assignSeats } from "c/shoreshElectiveEngine";

export function buildElectiveAssignments({
  campers = [],
  occurrences = [],
  offerings = [],
  preferences = [],
  attendance = null,
  lockedAssignments = [],
  choices = [],
  choiceOfferings = []
} = {}) {
  const out = assignSeats({
    campers,
    times: occurrences.map((o) => ({ id: o.id })),
    offerings: offerings.map((o) => ({
      timeId: o.occurrence_id,
      activityId: o.activity_id,
      key: o.labelKey,
      name: o.labelKey,
      seats: o.capacity ?? 0,
      minimum: o.minimum ?? null
    })),
    choices: preferences.map((p) => ({
      camperId: p.camper_id,
      key: p.labelKey,
      linkedChoiceId: p.choice_id,
      timeId: p.occurrence_id,
      rank: p.rank,
      rankKind: p.rank_kind
    })),
    attendance,
    locks: lockedAssignments.map((l) => ({
      camperId: l.camperId,
      timeId: l.occurrenceId,
      activityId: l.activityId
    })),
    linkedChoices: choices.map((c) => ({
      id: c.id,
      key: c.labelKey,
      name: c.labelKey
    })),
    linkedChoiceTimes: choiceOfferings.map((m) => ({
      linkedChoiceId: m.choice_id,
      timeId: m.occurrence_id,
      activityId: m.activity_id
    }))
  });
  return {
    assignments: out.seats.map(toDesktopSeat),
    findings: out.findings.map(toDesktopFinding)
  };
}

function toDesktopSeat(s) {
  return {
    camper_id: s.camperId,
    occurrence_id: s.timeId,
    labelKey: s.key,
    activity_id: s.activityId,
    preference_rank: s.rank,
    flags: s.flags,
    ...(s.notRequestedReason
      ? { not_requested_reason: s.notRequestedReason }
      : {}),
    ...(s.locked ? { source: "manual", locked: true } : {})
  };
}

const FINDING_FIELDS = {
  timeId: "occurrence_id",
  timeIds: "occurrence_ids",
  activityId: "activity_id",
  key: "labelKey",
  camperIds: "camper_ids",
  linkedChoiceIds: "choice_ids"
};

function toDesktopFinding(f) {
  const out = {};
  for (const [name, value] of Object.entries(f)) {
    out[FINDING_FIELDS[name] || name] = value;
  }
  return out;
}
