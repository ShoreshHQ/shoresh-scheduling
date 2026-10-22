/*
 * Things you delete stay deleted (Greg, decision 45; desktop Director Guide §2): a setup item a
 * director deleted on a setup screen is remembered for the camp with the import's answers
 * (Apex SetupDeletions), as "deleted|<kind>|<program>|<name>" answered "deleted". An import
 * leaves such an item out instead of adding it again, and lists it as "Deleted before; not
 * brought back" with Bring back, which answers the same key BRING_BACK: the item is then added
 * as any other, and the save forgets the deletion. Something the camp has (live, made again by
 * hand) always wins: only an item the import would add is left out.
 *
 * Kinds are the import's words for what it makes (c/shoreshLists screen kinds); the program is
 * named for a program's own items (Division, Group, TimeBlock, FixedActivity,
 * RecurringActivity) and empty for the season's. Names compare as similar names do (foldName).
 */
import { foldName } from "./names";

export const DELETED_PREFIX = "deleted|";
export const DELETED = "deleted";
export const BRING_BACK = "back";

/** The kinds of activity: a name deleted as any of them is not added again as another. */
const ACTIVITY_KINDS = ["Activity", "FixedActivity", "RecurringActivity"];

export function deletedKey(kind, scope, name) {
  return `${DELETED_PREFIX}${kind}|${scope || ""}|${name}`;
}

function folded(key) {
  return String(key).split("|").map(foldName).join("|");
}

/**
 * The camp's deletions not brought back, from the answers: folded key -> the key as stored (the
 * one Bring back answers). With BRING_BACK: the ones brought back in this import.
 */
export function deletionsIn(answers, value = DELETED) {
  const result = new Map();
  Object.keys(answers || {})
    .filter((k) => k.startsWith(DELETED_PREFIX) && answers[k] === value)
    .forEach((k) => result.set(folded(k), k));
  return result;
}

/** The stored key if this item was deleted and not brought back, else null. */
export function deletedAs(deletions, kind, scope, name) {
  return deletions.get(folded(deletedKey(kind, scope, name))) || null;
}

/** Any activity kind of this name: the season's, or the program's own (fixed, recurring). */
export function deletedActivity(deletions, program, name) {
  for (const kind of ACTIVITY_KINDS) {
    const key = deletedAs(
      deletions,
      kind,
      kind === "Activity" ? "" : program,
      name
    );
    if (key) {
      return { key, kind };
    }
  }
  return null;
}

/** Deletions brought back in this import: forgotten when it is saved. */
export function broughtBack(answers) {
  return Object.keys(answers || {})
    .filter((k) => k.startsWith(DELETED_PREFIX) && answers[k] === BRING_BACK)
    .sort();
}
