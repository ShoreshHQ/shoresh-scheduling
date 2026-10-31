/**
 * docs/import/review.md INGEST-5.8: what an earlier import brought in that the new file no
 * longer has. Each is listed with Keep (the default) and Remove; nothing is removed unasked, and
 * something made or changed by hand is never listed (only items in `imported`, from
 * ImportController.getImported, are).
 */
import { foldName } from "./engine.shoreshImportEngine.names.mjs";

export const REMOVE = "remove";

const ORDER = ["Activity", "FixedActivity", "RecurringActivity"];

/** The answer key of one listed item. */
export function missingKey(kind, program, name) {
  return `missing|${kind}|${program || ""}|${name}`;
}

/**
 * The listed items: [{ id, key, kind, name, program, answer }], activities first, then each
 * program's fixed and recurring activities, by name. Fixed and recurring activities are listed
 * only for programs the files cover; activities when no file names them anywhere.
 */
export function missingItems({
  existing,
  imported,
  inUse = {},
  versionUses = {},
  versions = [],
  answers,
  usable,
  decisions,
  electives,
  timetables
}) {
  if (!existing || !imported || imported.size === 0) {
    return [];
  }
  const inFile = new Set([
    ...usable.map((p) => foldName(p.text)),
    ...decisions.map((d) => foldName(d.name)),
    ...electives.sets.flatMap((s) => [
      foldName(s.name),
      ...(s.choices || []).map(foldName),
      ...(s.offerings || []).map((o) => foldName(o.activityName || ""))
    ])
  ]);
  // The imported weeks this import brings in again: an earlier import's own week of the same
  // program and week is superseded, so cells only there go with the item (coordinator, Q3).
  const brought = new Set(versions.map((v) => `${v.programKey}|${v.weekId}`));
  const usesOf = (record) => {
    const uses = versionUses[record.Id] || [];
    const kept = uses.find((u) => !brought.has(`${u.programId}|${u.weekId}`));
    return {
      reason:
        inUse[record.Id] || (kept ? `${record.Name} is on ${kept.name}` : null),
      alsoOut: [...new Set(uses.map((u) => u.name))]
    };
  };
  const item = (kind, record, program) => {
    const key = missingKey(kind, program, record.Name);
    const uses = usesOf(record);
    return {
      id: record.Id,
      key,
      kind,
      name: record.Name,
      program,
      // Still used by something else: kept, with why; never offered for removal.
      inUse: uses.reason,
      // Its cells in superseded imported weeks, taken out with it.
      alsoOut: uses.reason ? [] : uses.alsoOut,
      answer: answers[key] === REMOVE && !uses.reason ? REMOVE : "keep"
    };
  };
  const listed = (existing.activities || [])
    .filter((a) => imported.has(a.Id) && !inFile.has(foldName(a.Name)))
    .map((a) => item("Activity", a, ""));
  const covered = new Map(
    timetables
      .filter((t) => t.program && !t.leftOut)
      .map((t) => [t.program.id, t])
  );
  for (const entry of existing.programs || []) {
    const t = covered.get(entry.program.Id);
    if (!t) {
      continue;
    }
    const here = new Set(
      decisions.filter((d) => d.timetable === t).map((d) => foldName(d.name))
    );
    const lacking = (records, kind) =>
      (records || [])
        .filter((r) => imported.has(r.Id) && !here.has(foldName(r.Name)))
        .map((r) => item(kind, r, entry.program.Name));
    listed.push(
      ...lacking(entry.fixedActivities, "FixedActivity"),
      ...lacking(entry.recurringActivities, "RecurringActivity")
    );
  }
  return listed.sort(
    (a, b) =>
      ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) ||
      a.program.localeCompare(b.program) ||
      a.name.localeCompare(b.name)
  );
}
