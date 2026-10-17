/*
 * From a read list to what the screen shows and what is saved (slice 4c): the similar-name
 * questions, what is still waiting for an answer, and the save request
 * (ImportController.saveList). Nothing is saved until every question and every difference has
 * an answer, and the save is all or none.
 */
import { LEAVE_OUT } from "c/shoreshImportEngine";
import { NONE } from "./cells";
import { CHANGE, newValueOf } from "./proposal";
import { cellText } from "./screens";

function quoted(name) {
  return `“${name}”`;
}

const SIMILAR_WHY = {
  spelling: "They differ only in capitals, spaces, or punctuation.",
  ending: "They differ only in the ending.",
  letter: "They differ by one letter."
};

function kindWord(kind, t) {
  return {
    activity: t.sIn("Activity"),
    location: t.sIn("Location"),
    locationType: t.sIn("LocationType")
  }[kind];
}

/** The similar-name questions, in a fixed order, with the answer given (if any). */
export function similarCards(proposal, t, answers) {
  return (proposal.pairs || []).map((pair) => {
    const word = kindWord(pair.kind, t);
    const card = {
      id: pair.id,
      title: `Are ${quoted(pair.a)} and ${quoted(pair.b)} the same ${word}?`,
      detail: SIMILAR_WHY[pair.reason],
      // Import last year asks this with both spellings; either "same" answer means the camp's.
      answer:
        pair.existing && answers[pair.id] === "a"
          ? "b"
          : answers[pair.id] || null
    };
    const leaveOut = {
      value: LEAVE_OUT,
      label: "Leave it out for now"
    };
    if (pair.existing) {
      return {
        ...card,
        options: [
          { value: "b", label: `Same: ${quoted(pair.b)}` },
          { value: "different", label: `Different: add ${quoted(pair.a)}` },
          leaveOut
        ]
      };
    }
    return {
      ...card,
      options: [
        { value: "a", label: `Same: ${quoted(pair.a)}` },
        { value: "b", label: `Same: ${quoted(pair.b)}` },
        { value: "different", label: "Different: keep both" },
        leaveOut
      ]
    };
  });
}

/**
 * Every question, in a fixed order: similar names, then names that aren't set up (who to add
 * them as, how long a new rain plan is). Each with the answer given, if any.
 */
export function questionCards(proposal, t, answers) {
  return [
    ...similarCards(proposal, t, answers),
    ...(proposal.cards || []).map((card) => ({
      ...card,
      answer: answers[card.id] || null
    }))
  ].map((card) => {
    // An answer the card doesn't offer (an older question's) counts as not answered.
    const offered = card.options.some((o) => o.value === card.answer);
    return offered ? card : { ...card, answer: null };
  });
}

/** A value as the screen shows it in a difference ("none" for a cleared one). */
export function shownValue(proposal, columnKey, value) {
  const column = proposal.screen.columns.find((c) => c.key === columnKey);
  const text = cellText(column, value, proposal.targets);
  return text === "" ? "none" : String(text);
}

/**
 * "Change all from this file": the differences not answered yet (a Keep or Change already chosen
 * is the director's and stays), how many there are, and how many of them clear a value.
 */
export function changeAllCounts(proposal) {
  const differences = (proposal.rows || [])
    .filter((r) => r.status === "changed")
    .flatMap((r) => r.differences);
  const open = differences.filter((d) => !d.answer);
  return {
    changes: open.length,
    clears: open.filter((d) => d.clears).length,
    answered: differences.length - open.length,
    ids: open.map((d) => d.id)
  };
}

/** The button's words: "Change all from this file: 12 changes, 3 of them clear a value". */
export function changeAllLabel(counts) {
  const { changes, clears, answered } = counts;
  const what = answered
    ? `Change the other ${changes}`
    : `Change all from this file: ${changes} ${changes === 1 ? "change" : "changes"}`;
  if (!clears) {
    return what;
  }
  const clearing = `${clears} ${clears === 1 ? "clears" : "clear"} a value`;
  return answered
    ? `${what}: ${clearing}`
    : `${what}, ${clears} of them ${clears === 1 ? "clears" : "clear"} a value`;
}

function finalValue(row, key) {
  const difference = row.differences.find((d) => d.column === key);
  if (difference && difference.answer === CHANGE) {
    return difference.to;
  }
  return null;
}

/** Changes that would leave an item Salesforce refuses: at most below at least. */
function conflicts(proposal) {
  const messages = [];
  (proposal.rows || [])
    .filter(
      (r) => r.status === "changed" && proposal.screen.kind === "Activity"
    )
    .forEach((row) => {
      const record = (proposal.setupActivities || []).find(
        (a) => a.Id === row.id
      );
      if (!record) {
        return;
      }
      const min = finalValue(row, "min") ?? record.TimesPerWeekMin__c;
      const maxChanged = finalValue(row, "max");
      const max =
        maxChanged ??
        (record.NoWeeklyMax__c ? NONE : record.TimesPerWeekMax__c);
      if (max !== NONE && max !== null && min !== null && max < min) {
        messages.push(
          `${row.existingName}: at most ${max} would be below at least ${min}`
        );
      }
    });
  return messages;
}

/** What still needs an answer (or a fix in the file) before the list can be saved. */
export function waitingFor(proposal, t, answers) {
  if (proposal.empty) {
    return ["The file is empty"];
  }
  const waiting = [];
  const mapping = proposal.mapping;
  const heading = (key) =>
    proposal.screen.columns.find((c) => c.key === key).heading;
  if (mapping.missing.length) {
    waiting.push(
      `Which column is ${mapping.missing.map((k) => quoted(heading(k))).join(" or ")}?`
    );
  }
  mapping.doubled.forEach((key) => {
    waiting.push(`Two columns are ${quoted(heading(key))}`);
  });
  if (proposal.blocked) {
    return waiting;
  }
  const open = questionCards(proposal, t, answers).filter((c) => !c.answer);
  if (open.length) {
    waiting.push(
      `${open.length} ${open.length === 1 ? "question" : "questions"} to answer`
    );
  }
  const undecided = proposal.rows
    .filter((r) => r.status === "changed")
    .flatMap((r) => r.differences)
    .filter((d) => !d.answer).length;
  if (undecided) {
    waiting.push(
      `${undecided} ${undecided === 1 ? "difference" : "differences"} to Keep or Change`
    );
  }
  waiting.push(...conflicts(proposal));
  const count = proposal.rows.filter(
    (r) =>
      r.status === "new" ||
      (r.status === "changed" && r.differences.some((d) => d.answer === CHANGE))
  ).length;
  if (!waiting.length && !count) {
    waiting.push("Nothing to change");
  }
  return waiting;
}

/**
 * The save request: records to add (by key) and change (by Id), in the order they depend on
 * each other, and the answers to remember or forget. Only fields of columns the file has are
 * changed on existing records, and only where the director chose Change.
 */
export function listPlan(proposal, answers, seasonId, fileName) {
  const screen = proposal.screen;
  const records = [];
  const refTarget = refTargets(proposal);
  const addKind = { location: "Location", locationType: "LocationType" };
  ["locationType", "location"].forEach((ref) => {
    ((proposal.alsoAdd || {})[ref] || []).forEach((name) => {
      const fields = { Name: name };
      if (ref === "location") {
        // As a location added by hand starts: one group at a time.
        fields.GroupsThatFit__c = 1;
      }
      records.push({
        kind: addKind[ref],
        key: `${addKind[ref]}:${name}`,
        fields
      });
    });
  });
  ((proposal.alsoAdd || {}).who || []).forEach((add) => {
    records.push({
      kind: add.kind,
      key: add.key,
      fields:
        add.kind === "Group"
          ? { Name: add.name, Availability__c: "AllDay" }
          : { Name: add.name },
      refs:
        add.kind === "Group"
          ? { Division__c: add.parentId }
          : { Program__c: add.parentId }
    });
  });
  ((proposal.alsoAdd || {}).activity || [])
    .filter((add) => !add.skipped)
    .forEach((add) => {
      // A rain plan added with the list, as an activity added by hand starts.
      const values = { name: add.name };
      screen.columns.forEach((column) => {
        if (!(column.key in values)) {
          values[column.key] = newValueOf(column, { values });
        }
      });
      records.push(
        recordFor(
          screen,
          { name: add.name, values },
          screen.columns.map((c) => c.key),
          refTarget
        )
      );
    });
  proposal.rows.forEach((row) => {
    if (row.status === "new") {
      records.push(
        recordFor(
          screen,
          row,
          screen.columns.map((c) => c.key),
          refTarget
        )
      );
    } else if (row.status === "changed") {
      const chosen = row.differences
        .filter((d) => d.answer === CHANGE)
        .map((d) => d.column);
      if (chosen.length) {
        records.push(recordFor(screen, row, chosen, refTarget));
      }
    }
  });
  const remember = [];
  const forget = [];
  proposal.mapping.headings
    .filter((h) => h.how === "chosen")
    .forEach((h) => remember.push({ key: h.key, answer: answers[h.key] }));
  // Similar names and what a new who name is: remembered. A new rain plan's length, and which
  // of two items of one name (an Id), are not.
  [
    ...(proposal.pairs || []).map((pair) => pair.id),
    ...(proposal.cards || []).map((card) => card.id)
  ].forEach((id) => {
    const answer = answers[id];
    if (answer === LEAVE_OUT) {
      forget.push(id);
    } else if (
      answer &&
      !id.startsWith("rainAdd|") &&
      !id.startsWith("which|")
    ) {
      remember.push({ key: id, answer });
    }
  });
  return {
    seasonId,
    screen: screen.key,
    files: fileName,
    records,
    remember,
    forget
  };
}

/** Where a name points: an item set up (its Id), or one this list adds (its key). */
function refTargets(proposal) {
  const setup = proposal.setupRefs || {};
  const own = new Map();
  proposal.rows
    .filter(
      (r) =>
        r.status === "new" || r.status === "changed" || r.status === "unchanged"
    )
    .forEach((r) => {
      own.set(r.name, r.id || `${proposal.screen.kind}:${r.name}`);
    });
  return (ref, name) => {
    if (!name) {
      return null;
    }
    const records = setup[ref] || [];
    const found = records.find((r) => r.Name === name);
    if (found) {
      return found.Id;
    }
    if (ref === "activity") {
      // By the exact name: similar spellings were settled by the questions.
      return own.get(name) || `Activity:${name}`;
    }
    return `${{ location: "Location", locationType: "LocationType" }[ref]}:${name}`;
  };
}

function recordFor(screen, row, columnKeys, refTarget) {
  const record = row.id
    ? { kind: screen.kind, id: row.id, fields: {}, refs: {} }
    : {
        kind: screen.kind,
        key: `${screen.kind}:${row.name}`,
        fields: {},
        refs: {}
      };
  columnKeys.forEach((key) => {
    const column = screen.columns.find((c) => c.key === key);
    const value = row.id
      ? row.differences.find((d) => d.column === key).to
      : row.values[key];
    if (column.refField) {
      record.refs[column.refField] = refTarget(column.ref, value);
    } else if (column.type === "list") {
      record.who = value || [];
    } else if (column.write) {
      Object.assign(record.fields, column.write(value));
    }
  });
  return record;
}
