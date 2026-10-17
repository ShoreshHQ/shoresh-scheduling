/*
 * From a read list to what the screen shows and what is saved (slice 4c): the similar-name
 * questions, what is still waiting for an answer, and the save request
 * (ImportController.saveList). Nothing is saved until every question and every difference has
 * an answer, and the save is all or none.
 */
import { LEAVE_OUT, looseKey } from "c/shoreshImportEngine";
import { NONE } from "./cells";
import { CHANGE } from "./proposal";
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
      answer: answers[pair.id] || null
    };
    const leaveOut = {
      value: LEAVE_OUT,
      label: "Leave it out for now"
    };
    if (pair.existing) {
      return {
        ...card,
        subtitle: `${quoted(pair.b)} is already set up. ${quoted(pair.a)} is in the file.`,
        options: [
          { value: "b", label: `Same: use ${quoted(pair.b)}` },
          { value: "different", label: `Different: add ${quoted(pair.a)}` },
          leaveOut
        ]
      };
    }
    return {
      ...card,
      subtitle: `Both are in the file.`,
      options: [
        { value: "a", label: `Same: use ${quoted(pair.a)}` },
        { value: "b", label: `Same: use ${quoted(pair.b)}` },
        { value: "different", label: "Different: keep both" },
        leaveOut
      ]
    };
  });
}

/** A value as the screen shows it in a difference ("none" for a cleared one). */
export function shownValue(proposal, columnKey, value) {
  const column = proposal.screen.columns.find((c) => c.key === columnKey);
  const text = cellText(column, value, proposal.targets);
  return text === "" ? "none" : String(text);
}

/** "Change all from this file": how many changes, and how many of them clear a value. */
export function changeAllCounts(proposal) {
  const differences = (proposal.rows || [])
    .filter((r) => r.status === "changed")
    .flatMap((r) => r.differences);
  return {
    changes: differences.length,
    clears: differences.filter((d) => d.clears).length,
    ids: differences.map((d) => d.id)
  };
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
    .filter((r) => r.status === "changed" && proposal.screen.kind === "Activity")
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
        maxChanged ?? (record.NoWeeklyMax__c ? NONE : record.TimesPerWeekMax__c);
      if (max !== NONE && max !== null && min !== null && max < min) {
        messages.push(
          `${row.existingName}: at most ${max} would be less than at least ${min} times a week. Change both, or keep both.`
        );
      }
    });
  return messages;
}

/** What still needs an answer (or a fix in the file) before the list can be saved. */
export function waitingFor(proposal, t, answers) {
  if (proposal.needsSheet) {
    return ["Choose the sheet the list is on."];
  }
  if (proposal.empty) {
    return ["The sheet is empty."];
  }
  const waiting = [];
  const mapping = proposal.mapping;
  const heading = (key) =>
    proposal.screen.columns.find((c) => c.key === key).heading;
  if (mapping.missing.length) {
    waiting.push(
      `No column is ${mapping.missing.map((k) => quoted(heading(k))).join(" or ")}. Choose which column it is.`
    );
  }
  mapping.doubled.forEach((key) => {
    waiting.push(
      `Two columns are both ${quoted(heading(key))}. Choose one, and set the other to "Not used".`
    );
  });
  if (proposal.blocked) {
    return waiting;
  }
  const open = similarCards(proposal, t, answers).filter((c) => !c.answer);
  if (open.length) {
    waiting.push(
      `${open.length} ${open.length === 1 ? "question" : "questions"} about similar names.`
    );
  }
  const undecided = proposal.rows
    .filter((r) => r.status === "changed")
    .flatMap((r) => r.differences)
    .filter((d) => !d.answer).length;
  if (undecided) {
    waiting.push(
      `${undecided} ${undecided === 1 ? "difference" : "differences"} to Keep or Change.`
    );
  }
  waiting.push(...conflicts(proposal));
  const count = proposal.rows.filter(
    (r) =>
      r.status === "new" ||
      (r.status === "changed" && r.differences.some((d) => d.answer === CHANGE))
  ).length;
  if (!waiting.length && !count) {
    waiting.push("Nothing to add or change: the list matches what is set up.");
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
  Object.entries(proposal.alsoAdd || {}).forEach(([ref, names]) => {
    names.forEach((name) => {
      const fields = { Name: name };
      if (ref === "location") {
        // As a location added by hand starts: one group at a time.
        fields.GroupsThatFit__c = 1;
      }
      records.push({ kind: addKind[ref], key: `${addKind[ref]}:${name}`, fields });
    });
  });
  proposal.rows.forEach((row) => {
    if (row.status === "new") {
      records.push(
        recordFor(screen, row, screen.columns.map((c) => c.key), refTarget)
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
  (proposal.pairs || []).forEach((pair) => {
    const answer = answers[pair.id];
    if (answer === LEAVE_OUT) {
      forget.push(pair.id);
    } else if (answer) {
      remember.push({ key: pair.id, answer });
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
    .filter((r) => r.status === "new" || r.status === "changed" || r.status === "unchanged")
    .forEach((r) => {
      own.set(looseKey(r.name), r.id || `${proposal.screen.kind}:${r.name}`);
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
      return own.get(looseKey(name)) || null;
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
