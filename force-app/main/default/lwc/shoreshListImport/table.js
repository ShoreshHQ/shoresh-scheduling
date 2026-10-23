/*
 * Import a list, laid into the screen's own table (Greg's decision 56, mock-up
 * design-research/screens-r1 list-import A; ADR 0007 choice 33). What the screen has and what
 * the file brings, in the screen's sections and columns:
 * - an item set up that the file doesn't change is a raised row, as it is (with a camp workbook,
 *   counted instead: "8 the same as here");
 * - a new row has a dashed outline and a Leave out;
 * - a difference shows the old value crossed out beside the new one, with Keep or Change;
 * - a row that can't be used carries the needs-a-look corner and says why;
 * - a row left out (the director's Leave out, a repeat, a deleted place) is faded, with why.
 * Pure JavaScript over the list's proposal (c/shoreshLists), so the same file and answers always
 * draw the same table.
 */
import { CHANGE, KEEP, cellText, shownValue } from "c/shoreshLists";

/** The screen's own sections (ADR 0015 choice 11): a group by its division, a place by its type. */
const SECTION_COLUMN = {
  groups: "division",
  locations: "type",
  activities: "priority"
};

// What a row's kind looks like: raised (set up, or a change), dashed (new), faded (left out).
const ROW_CLASS = {
  same: "row",
  changed: "row",
  new: "row row_new",
  skipped: "row row_new row_out",
  leftOut: "row row_out",
  asked: "row row_look",
  unreadable: "row row_look"
};

// The rows that will be in the table once saved: the section's count.
const COUNTED = new Set(["same", "changed", "new"]);

function textOf(column, value, targets) {
  const text = cellText(column, value, targets);
  return text === "" || text === null || text === undefined ? "" : String(text);
}

/** The columns the file has, as the table shows them: not the name, nor what a section says. */
function shownColumns(p, sectionKey) {
  if (!p.screen || !p.mapping) {
    return [];
  }
  const used = new Set(
    p.mapping.headings.filter((h) => h.column).map((h) => h.column)
  );
  return p.screen.columns.filter(
    (c) =>
      used.has(c.key) && c.key !== "name" && !c.scope && c.key !== sectionKey
  );
}

/** Where a row goes: its program or set (with more than one), then its own section. */
function sectionMaker(p, setup) {
  const screen = p.screen;
  if (!screen) {
    return { ofRecord: () => "", ofRow: () => "" };
  }
  const column = screen.columns.find(
    (c) => c.key === SECTION_COLUMN[screen.key]
  );
  const scopes = new Set(
    [
      ...screen.records(setup).map((r) => r._programName),
      ...(p.rows || []).map((r) => r.programName)
    ].filter((name) => name)
  );
  const several = !!screen.scope && scopes.size > 1;
  const blank = column ? `No ${column.heading.toLowerCase()}` : "";
  const label = (scope, value) => {
    const own = column ? value || blank : "";
    return [several ? scope || "" : "", own].filter((x) => x).join(" · ");
  };
  return {
    // An item set up: from the record.
    ofRecord: (record) =>
      label(
        record._programName,
        column
          ? textOf(column, column.fromRecord(record, setup), p.targets)
          : ""
      ),
    // A row of the file: from what it says; null when it can't be told (a row not read).
    ofRow: (row) => {
      const values = row.values || {};
      if (column && !(column.key in values)) {
        return null;
      }
      return label(
        row.programName,
        column ? textOf(column, values[column.key], p.targets) : ""
      );
    }
  };
}

function plainCells(columns, valueOf, targets, quiet = []) {
  return columns.map((c) => ({
    key: c.key,
    text: textOf(c, valueOf(c), targets),
    className: quiet.includes(c.heading) ? "cell cell_quiet" : "cell",
    // Said after the value: what it starts with, not what the file gave.
    after: quiet.includes(c.heading) ? ", starting value" : ""
  }));
}

/** Keep and Change for one difference, each naming its item and difference for screen readers. */
function choiceOf(p, row, d, name, shown) {
  const text = p.screen
    ? `${d.heading}: ${shownValue(p, d.column, d.from)} → ${shownValue(p, d.column, d.to)}`
    : d.text || `${d.heading}: ${d.from} → ${d.to}`;
  return {
    id: d.id,
    // A difference the table has no column for says itself ("Division: Juniors → Inters").
    text: shown ? "" : text,
    clears: d.clears,
    keepPressed: String(d.answer === KEEP),
    changePressed: String(d.answer === CHANGE),
    keepLabel: `Keep, ${name}: ${text}`,
    changeLabel: `Change, ${name}: ${text}`,
    keepClass:
      d.answer === KEEP
        ? "shoresh-item choice shoresh-raised"
        : "shoresh-item choice",
    changeClass:
      d.answer === CHANGE
        ? "shoresh-item choice shoresh-raised"
        : "shoresh-item choice"
  };
}

function setUpRow(p, record, row, columns, setup) {
  const name = (row && row.existingName) || record.Name;
  const differences = row && row.status === "changed" ? row.differences : [];
  const byColumn = new Map(differences.map((d) => [d.column, d]));
  const cells = columns.map((c) => {
    const d = byColumn.get(c.key);
    if (d) {
      return {
        key: c.key,
        className: "cell",
        old: shownValue(p, c.key, d.from),
        text: shownValue(p, c.key, d.to),
        changed: true,
        // Read as "was All day, now Mornings only".
        wasSaid: "was ",
        nowSaid: ", now "
      };
    }
    return {
      key: c.key,
      className: "cell",
      text: textOf(c, c.fromRecord(record, setup), p.targets)
    };
  });
  const shownKeys = new Set(columns.map((c) => c.key));
  const kind = differences.length ? "changed" : "same";
  return {
    key: record.Id ? `rec-${record.Id}` : `rec-${name}`,
    kind,
    name,
    cells,
    choices: differences.map((d) =>
      choiceOf(p, row, d, name, shownKeys.has(d.column))
    )
  };
}

function fileRow(p, row, columns, canLeaveOut) {
  const name = row.name || row.existingName || `Row ${row.rowNumber}`;
  const base = { key: `row-${row.rowNumber}`, name };
  if (row.status === "new" || row.skipped) {
    return {
      ...base,
      kind: row.skipped ? "skipped" : "new",
      cells: plainCells(
        columns,
        (c) => row.values[c.key],
        p.targets,
        row.startingValues || []
      ),
      leaveOut:
        row.skipKey && canLeaveOut
          ? {
              key: row.skipKey,
              pressed: String(!!row.skipped),
              label: `Leave out ${name}`
            }
          : null
    };
  }
  if (row.status === "changed" || row.status === "unchanged") {
    // A row of a sheet with no screen (a workbook's weeks, camp words): its differences only.
    return {
      ...base,
      name: row.existingName || name,
      kind: row.status === "changed" ? "changed" : "same",
      cells: [],
      choices: (row.differences || []).map((d) =>
        choiceOf(p, row, d, row.existingName || name, false)
      )
    };
  }
  const why = {
    unreadable: () => (row.problems || []).join("; "),
    asked: () => "Asked above",
    leftOut: () =>
      row.reason ||
      (row.usedRow ? `Row ${row.usedRow} used` : "") ||
      (row.sameAs ? `Same as ${row.sameAs}` : "") ||
      "Left out"
  }[row.status];
  return {
    ...base,
    kind: row.status,
    cells: columns.map((c) => ({ key: c.key, className: "cell", text: "" })),
    note: `Row ${row.rowNumber}${why ? ` · ${why()}` : ""}`
  };
}

function finish(row) {
  const kind = row.kind;
  const choices = row.choices || [];
  // Each choice names its column when the row has more than one (Keep or Change for each).
  return {
    ...row,
    className: ROW_CLASS[kind],
    isNew: kind === "new" || kind === "skipped",
    look: kind === "asked" || kind === "unreadable",
    cells: row.cells || [],
    note: row.note || "",
    choices,
    hasChoices: choices.length > 0,
    hasLeaveOut: !!row.leaveOut,
    // Words for screen readers before the name: what this row is.
    said:
      {
        new: "New: ",
        skipped: "Left out: ",
        changed: "Changes: ",
        asked: "Needs a look: ",
        unreadable: "Needs a look: ",
        leftOut: "Left out: "
      }[kind] || ""
  };
}

/**
 * One list's table: { columns, sections: [{ key, label, count, rows }], same } where same is
 * how many items set up the file leaves as they are, when they are counted, not shown.
 * options: { setup, showSame (draw every item set up; a camp workbook counts them), leaveOut
 * (a new row's Leave out; not in a camp workbook, where a later sheet may name the item) }.
 */
export function importTable(p, { setup, showSame = true, leaveOut = true }) {
  const section = sectionMaker(p, setup || {});
  const sectionKey = p.screen ? SECTION_COLUMN[p.screen.key] : null;
  const columns = shownColumns(p, sectionKey);
  const rows = p.rows || [];
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id, r]));
  const order = [];
  const sections = new Map();
  // One section per name, capitals aside ("juniors" in the file is the Juniors set up).
  const keyOf = (label) => label.toLowerCase();
  const into = (label, row) => {
    if (!sections.has(keyOf(label))) {
      sections.set(keyOf(label), []);
      order.push(label);
    }
    sections.get(keyOf(label)).push(row);
  };
  let same = 0;
  const records = p.screen ? p.screen.records(setup || {}) : [];
  records.forEach((record) => {
    const row = byId.get(record.Id) || null;
    const drawn = setUpRow(p, record, row, columns, setup || {});
    if (drawn.kind === "same" && !showSame) {
      same += 1;
      return;
    }
    into(section.ofRecord(record), drawn);
  });
  const later = [];
  rows
    .filter((r) => !r.id || !records.some((rec) => rec.Id === r.id))
    .filter((r) => r.status !== "deleted")
    .forEach((r) => {
      if ((r.status === "unchanged" || r.status === "changed") && p.screen) {
        return;
      }
      if (r.status === "unchanged" && !showSame) {
        same += 1;
        return;
      }
      const drawn = fileRow(p, r, columns, leaveOut);
      const home = section.ofRow(r);
      // A new row starts its own section if need be (a division added with the list); a row
      // that won't be saved goes where it says only when that section is there. A sheet with
      // no screen of its own (Weeks, Camp words) draws its Keep or Change rows like new ones.
      const usable =
        drawn.kind === "new" ||
        drawn.kind === "skipped" ||
        (!p.screen && (drawn.kind === "changed" || drawn.kind === "same"));
      const placed = home !== null && (usable || sections.has(keyOf(home)));
      if (placed) {
        into(home, drawn);
      } else {
        later.push(drawn);
      }
    });
  later.forEach((row) => into("Review here", row));
  const list = order.map((label, i) => {
    const sectionRows = sections.get(keyOf(label)).map((row) => finish(row));
    // New rows after the ones set up, then what needs a look, as the screen adds them.
    const rank = {
      same: 0,
      changed: 0,
      new: 1,
      skipped: 1,
      asked: 2,
      unreadable: 2,
      leftOut: 3
    };
    sectionRows.sort((a, b) => rank[a.kind] - rank[b.kind]);
    const count = sectionRows.filter((r) => COUNTED.has(r.kind)).length;
    return {
      key: `table-${i}-${label}`,
      label,
      hasLabel: !!label,
      count,
      // "Juniors, 4" for screen readers; "Juniors 4" to the eye.
      countSaid: `${label}, ${count}`,
      showHead: i === 0,
      headClass: i === 0 ? "head" : "head head_hidden",
      rows: sectionRows
    };
  });
  const nameColumn = p.screen && p.screen.columns.find((c) => c.key === "name");
  return {
    nameHeading: nameColumn ? nameColumn.heading : "Name",
    columns: columns.map((c) => ({ key: c.key, heading: c.heading })),
    hasColumns: columns.length > 0,
    sections: list,
    same
  };
}
