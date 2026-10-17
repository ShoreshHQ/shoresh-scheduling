/*
 * Things a row names that the season doesn't have yet (Greg, 2026-10-17: "add it, and ask for
 * whatever details it needs; never make the director add it by hand first"):
 * - a name in "Who can do it" that is no division or group: asked whether to add it as a
 *   division (in which program) or a group (in which division);
 * - a rain plan naming an activity neither set up nor in the file: added with an activity's
 *   starting values, no question (Greg, 2026-10-17); its tick can be taken off.
 * Answers are names, never record Ids, so they still work in a copied season.
 */
import { LEAVE_OUT, looseKey } from "c/shoreshImportEngine";

export function whoAddKey(name) {
  return `whoAdd|${looseKey(name)}`;
}

export function rainAddKey(name) {
  return `rainAdd|${looseKey(name)}`;
}

/** Where a new name in a who list can go: a division in a program, or a group in a division. */
function whoOptions(setup, t) {
  const programs = setup.programs || [];
  const several = programs.length > 1;
  const options = programs.map((entry) => ({
    value: `division|${entry.program.Name}`,
    label: `${t.s("Division")} in ${entry.program.Name}`
  }));
  programs.forEach((entry) => {
    (entry.divisions || []).forEach((d) => {
      options.push({
        value: `group|${entry.program.Name}|${d.division.Name}`,
        label: `${t.s("Group")} in ${d.division.Name}${several ? ` (${entry.program.Name})` : ""}`
      });
    });
  });
  return options;
}

/** The record an answer names: { kind, key, name, parentId }, or null if it no longer fits. */
function whoAddition(name, answer, setup) {
  const [kind, programName, divisionName] = String(answer).split("|");
  const entry = (setup.programs || []).find(
    (p) => p.program.Name === programName
  );
  if (!entry) {
    return null;
  }
  if (kind === "division") {
    return {
      kind: "Division",
      key: `Division:${entry.program.Id}:${name}`,
      name,
      parentId: entry.program.Id
    };
  }
  const division = (entry.divisions || []).find(
    (d) => d.division.Name === divisionName
  );
  return kind === "group" && division
    ? {
        kind: "Group",
        key: `Group:${division.division.Id}:${name}`,
        name,
        parentId: division.division.Id
      }
    : null;
}

/**
 * Names in who lists that match no division or group: their questions, and, once answered, the
 * records to add (also put into targets, so the rows can name them). Returns { cards, adds,
 * leftOut (looseKeys), open (looseKeys) }.
 */
export function unknownWho(rows, targets, setup, answers, t) {
  // One spelling per name whatever the row order: the most written, then alphabetical.
  const spellings = new Map();
  rows
    .filter((r) => !r.problems.length && Array.isArray(r.values.who))
    .forEach((r) => {
      r.values.who.forEach((name) => {
        const key = looseKey(name);
        if (!targets.bySpelling.has(key)) {
          const seen = spellings.get(key) || new Map();
          seen.set(name, (seen.get(name) || 0) + 1);
          spellings.set(key, seen);
        }
      });
    });
  const names = new Map(
    [...spellings.entries()].map(([key, seen]) => [
      key,
      [...seen.entries()].sort(
        (x, y) => y[1] - x[1] || x[0].localeCompare(y[0])
      )[0][0]
    ])
  );
  const result = { cards: [], adds: [], leftOut: new Set(), open: new Set() };
  const options = whoOptions(setup, t);
  [...names.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, name]) => {
      const id = whoAddKey(name);
      const answer = answers[id];
      result.cards.push({
        id,
        title: `“${name}” is new. What is it?`,
        options: [
          ...options,
          { value: LEAVE_OUT, label: "Leave it out for now" }
        ],
        answer: answer || null
      });
      if (answer === LEAVE_OUT) {
        result.leftOut.add(key);
        return;
      }
      const added = answer ? whoAddition(name, answer, setup) : null;
      if (!added) {
        result.open.add(key);
        return;
      }
      result.adds.push(added);
      const target = {
        id: added.key,
        kind: added.kind,
        name,
        spellings: [name]
      };
      targets.bySpelling.set(key, [target]);
      targets.byId.set(added.key, target);
    });
  return result;
}

/**
 * Rain plans naming an activity that is nowhere: each is added with an activity's starting
 * values (as when added by hand), unless its tick was taken off (answer "skip"). Returns
 * { adds: [{ name, skipped }], skipped: Set }.
 */
export function unknownRainPlans(names, answers) {
  const result = { adds: [], skipped: new Set() };
  [...names]
    .sort((a, b) => a.localeCompare(b))
    .forEach((name) => {
      const skipped = answers[rainAddKey(name)] === "skip";
      result.adds.push({ name, skipped });
      if (skipped) {
        result.skipped.add(name);
      }
    });
  return result;
}
