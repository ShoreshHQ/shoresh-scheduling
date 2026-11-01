/**
 * The elective downloads (electives slice E10; repo ADR 0018 choices 51 to 54; plan §7): Rosters
 * (printed one page per offering, Greg's decision 53.4, option A; and as a file), Camper
 * schedules, the Full report and Campers (to edit and bring back). Made in the browser from a
 * final run as ElectiveDownloads.forRun reads it (ElectiveSeatsController.runDownload): the same
 * reading as the seats screen (readRun, buildBoard), the names copied onto the seats at Finalize,
 * and the bunks' week from the version kept then, so a final run's files never change.
 *
 * From the desktop: exportActivityRoster.js (who is where, the count once), exportChildSchedule.js
 * (a camper's week: their bunk's schedule with their electives in place, a multi-block activity
 * once), exportRunExceptions.js and exportRunSummary.js (the full report's sheets; unordered
 * choices never counted as a rank), exportCamperWorkbook.js (the campers file, laid out as Bring
 * in choices reads it; a camper with no choices is left out). Every text cell goes through the
 * spreadsheet-formula guard; a parent's comment is never in a download (ADR 0018 choice 3), and
 * file names carry the set and week, never a child's name. Pure: no server calls, no clock.
 */
import { UNORDERED_SET } from "./engine.shoreshElectiveEngine.shoreshElectiveEngine.mjs";
import { headingMeaning } from "./engine.shoreshChoicesReader.shoreshChoicesReader.mjs";
import { sanitizeCell } from "./engine.shoreshLists.shoreshLists.mjs";
import { dayLabel, shortClock } from "./engine.shoreshScheduleViews.shoreshScheduleViews.mjs";
import { buildBoard, parseChoices, readRun, timeWords } from "./engine.shoreshElectiveSeats.seats.mjs";

const RANK_NAMES = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth"
};

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const guard = (rows) =>
  rows.map((row) => row.map((cell) => sanitizeCell(cell)));

/** "14 Oct", whatever the browser's language. */
export function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()} ${date.toLocaleDateString("en-GB", { month: "short" })}`;
}

/**
 * Everything the downloads share, worked out once: the run as the screen reads it, its board,
 * the words of its header ("Chugim · Week 3 · Final 14 Oct"), and the names a final run keeps.
 */
export function readDownload(download, t) {
  const view = download.view;
  const run = readRun(view);
  const board = buildBoard(run, t);
  const setName = view.setName || "";
  const weekName = download.weekName || "";
  const when = shortDate(view.run.finalizedAt);
  const seatsById = new Map((view.seats || []).map((s) => [s.id, s]));
  const noBunk = `No ${t.sIn("Group")}`;
  /** A seat's offering as it was finalized (its live name before then). */
  const offeringName = (seat) => {
    if (seat && seat.activityName) return seat.activityName;
    const offering = seat && run.offeringById.get(seat.offeringId);
    return offering ? offering.name : "";
  };
  /** A camper's bunk as it was finalized on their seats, else as the run has it. */
  const bunkOf = (camper, seat) => {
    if (seat && seat.groupName) return seat.groupName;
    return camper.group ? camper.group.name : noBunk;
  };
  // Bunk order, then name: how a counsellor's roster and the camper files list campers.
  const groupOrder = new Map([...run.groups.keys()].map((id, i) => [id, i]));
  const byBunkThenName = (a, b) =>
    (groupOrder.has(a.groupId) ? groupOrder.get(a.groupId) : 1e6) -
      (groupOrder.has(b.groupId) ? groupOrder.get(b.groupId) : 1e6) ||
    compareText((a.name || "").toLowerCase(), (b.name || "").toLowerCase()) ||
    compareText(a.id, b.id);
  return {
    download,
    view,
    run,
    board,
    t,
    setName,
    weekName,
    header: [setName, weekName, when ? `Final ${when}` : "Final"]
      .filter(Boolean)
      .join(" · "),
    seatsById,
    offeringName,
    bunkOf,
    byBunkThenName,
    noBunk
  };
}

/** The file name for one download: "Chugim Week 3 rosters" (the set and the week, no child). */
export function downloadTitle(d, what) {
  return `${d.setName} ${d.weekName} ${what}`;
}

// ---------- Rosters: one page per offering, its whole week ----------

/**
 * One page per offering that runs this week (decision 53.4, rosters-a): its name, and for each
 * elective time it is offered, "12 of 12" and who is there, sorted by bunk with the bunk beside
 * each name. A time it was dropped at says so, with nobody under it.
 */
export function rosterPages(d) {
  const pages = [];
  d.board.offeringRows.forEach((row) => {
    const columns = row.cells
      .filter((cell) => cell.offered)
      .map((cell) => {
        const people = cell.roster
          .map((placed) => ({
            key: placed.seat.id,
            id: placed.camper.id,
            name: placed.camper.name,
            groupId: placed.camper.groupId,
            bunk: d.bunkOf(placed.camper, placed.seat)
          }))
          .sort(d.byBunkThenName)
          .map(({ key, name, bunk }) => ({ key, name, bunk }));
        return {
          key: cell.key,
          label: cell.column.label,
          count: cell.dropped
            ? `Dropped, had ${cell.dropped.had} of ${cell.dropped.needed}`
            : cell.seats == null
              ? String(cell.count)
              : `${cell.count} of ${cell.seats}`,
          people
        };
      });
    if (!columns.length) return;
    const named = row.cells
      .flatMap((cell) => cell.roster)
      .find((placed) => placed.seat.activityName);
    pages.push({
      key: row.key,
      title: named ? named.seat.activityName : row.name,
      columns
    });
  });
  return pages;
}

/** The roster pages as a workbook: a sheet per offering, laid out as its printed page. */
export function rosterSheets(d) {
  const used = new Set();
  return rosterPages(d).map((page) => {
    const rows = [[page.title], [d.header], []];
    rows.push(page.columns.flatMap((c) => [c.label, c.count]));
    const longest = Math.max(0, ...page.columns.map((c) => c.people.length));
    for (let i = 0; i < longest; i++) {
      rows.push(
        page.columns.flatMap((c) => {
          const person = c.people[i];
          return person ? [person.name, person.bunk] : ["", ""];
        })
      );
    }
    return {
      name: uniqueName(page.title, used),
      rows: guard(rows),
      widths: page.columns.flatMap(() => [24, 14])
    };
  });
}

/** Excel's sheet names are 31 characters and unique, capitals aside. */
function uniqueName(title, used) {
  const base = String(title || "Sheet").slice(0, 28);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    name = `${base} ${n}`;
  }
  used.add(name.toLowerCase());
  return name;
}

// ---------- Camper schedules: each camper's week ----------

/**
 * Each camper's week (desktop exportChildSchedule.js): their bunk's schedule from the version
 * finalized, with their seat where the set sits, something that takes several time blocks once,
 * in bunk order and then by name. A camper with no bunk has only their electives. Columns:
 * Camper, Bunk, Day, Time block, Starts, Activity, the set (on elective rows), Blocks.
 */
export function camperScheduleRows(d) {
  const { t, run } = d;
  const header = [
    "Camper",
    t.s("Group"),
    "Day",
    t.s("TimeBlock"),
    "Starts",
    "Activity",
    t.s("ElectiveSet"),
    "Blocks"
  ];
  const seatAt = new Map();
  (d.view.seats || []).forEach((seat) => {
    seatAt.set(`${seat.camperId}|${seat.day}|${seat.blockId}`, seat);
  });
  const bunkDays = (d.download.days || []).map((day) => ({
    day: day.day,
    blocks: new Map((day.blocks || []).map((b) => [b.id, b])),
    bunks: new Map((day.bunks || []).map((b) => [b.groupId, b.cells || []]))
  }));
  const body = [];
  [...run.campers].sort(d.byBunkThenName).forEach((camper) => {
    const seats = (d.view.seats || []).filter((s) => s.camperId === camper.id);
    const bunk = d.bunkOf(camper, seats[0]);
    const line = (day, block, startTime, activity, set, blocks) =>
      body.push([
        camper.name,
        bunk,
        dayLabel(day).label,
        block,
        startTime ? shortClock(startTime) : "",
        activity,
        set,
        blocks
      ]);
    if (!camper.groupId) {
      run.times
        .map((time) => ({
          time,
          seat: seatAt.get(`${camper.id}|${time.day}|${time.blockId}`)
        }))
        .filter(
          ({ time }) => time === run.timeOf(camper, time.day, time.blockId)
        )
        .forEach(({ time, seat }) =>
          line(
            time.day,
            time.blockName,
            time.startTime,
            seat ? d.offeringName(seat) : "Couldn't be placed",
            d.setName,
            1
          )
        );
      return;
    }
    bunkDays.forEach((day) => {
      (day.bunks.get(camper.groupId) || []).forEach((cell) => {
        const block = day.blocks.get(cell.blockId) || {};
        if (cell.thisSet) {
          const seat = seatAt.get(`${camper.id}|${day.day}|${cell.blockId}`);
          line(
            day.day,
            block.name,
            block.startTime,
            seat ? d.offeringName(seat) : "Couldn't be placed",
            d.setName,
            cell.blocks
          );
        } else {
          line(
            day.day,
            block.name,
            block.startTime,
            cell.name,
            "",
            cell.blocks
          );
        }
      });
    });
  });
  return [header, ...body];
}

export function camperScheduleSheets(d) {
  return [
    {
      name: "Camper schedules",
      rows: guard(camperScheduleRows(d)),
      widths: [24, 12, 12, 14, 8, 22, 14, 8]
    }
  ];
}

// ---------- the Full report ----------

/** Who is where, a row per camper, the count once (desktop's Activity Roster sheet). */
function rosterRows(d) {
  const { t } = d;
  const header = [
    "Day",
    t.s("TimeBlock"),
    "Activity",
    "Camper",
    t.s("Group"),
    "Count",
    t.s("Seats")
  ];
  const body = [];
  d.board.offeringRows.forEach((row) => {
    row.cells
      .filter((cell) => cell.offered)
      .forEach((cell) => {
        const time = cell.column.time;
        const people = cell.roster
          .map((placed) => ({
            id: placed.camper.id,
            name: placed.camper.name,
            groupId: placed.camper.groupId,
            seat: placed.seat,
            bunk: d.bunkOf(placed.camper, placed.seat)
          }))
          .sort(d.byBunkThenName);
        const seats = row.offering.noLimit
          ? "No limit"
          : row.offering.seats == null
            ? ""
            : Number(row.offering.seats);
        people.forEach((p, i) =>
          body.push([
            dayLabel(time.day).label,
            time.blockName,
            d.offeringName(p.seat),
            p.name,
            p.bunk,
            i === 0 ? people.length : "",
            i === 0 ? seats : ""
          ])
        );
      });
  });
  return [header, ...body];
}

/** What needs a look, by kind (desktop's Exceptions sheet, in the counter's words). */
function exceptionRows(d) {
  const { t, board, run } = d;
  const p = board.problems;
  const header = ["Problem", "Camper", "Time", "Detail"];
  const body = [];
  p.unplaced.forEach((u) =>
    body.push(["Couldn't be placed", u.camper.name, u.column.words, ""])
  );
  p.dropped.forEach((x) =>
    body.push([
      "Dropped below minimum",
      "",
      x.column.words,
      `${x.offering.name}: had ${x.had} of ${x.needed}`
    ])
  );
  p.belowMinimum.forEach((x) =>
    body.push([
      "Kept below minimum",
      "",
      x.column.words,
      `${x.offering.name}: ${x.count} of ${x.minimum}`
    ])
  );
  p.overSeats.forEach((x) =>
    body.push([
      `Over ${t.pIn("Seats")}`,
      "",
      x.column.words,
      `${x.offering.name}: ${x.count} of ${x.seats}`
    ])
  );
  p.stray.forEach((s) =>
    body.push(["Lock no longer applies", s.camper.name, "", ""])
  );
  p.noOfferings.forEach((c) => body.push(["Nothing offered", "", c.words, ""]));
  board.seatAt.forEach((placed) => {
    if (!placed.ranked) {
      body.push([
        "Not one they chose",
        placed.camper.name,
        timeWords(placed.time),
        d.offeringName(placed.seat)
      ]);
    }
  });
  const named = new Map(run.campers.map((c) => [c.id, c]));
  run.campers.forEach((camper) => {
    if (!camper.groupId) {
      body.push([`No ${t.sIn("Group")} on the sheet`, camper.name, "", ""]);
    } else if (!run.timesOf(camper).length) {
      body.push([
        `${t.s("Group")} has no ${t.sIn("ElectiveSet")} this ${t.sIn("Week")}`,
        camper.name,
        "",
        ""
      ]);
    }
    if (!parseChoices(camper.choices).length) {
      body.push(["No choices", camper.name, "", ""]);
    }
  });
  p.unmatched.forEach((u) => {
    const camper = named.get(u.camperId);
    body.push(["Choice not matched", camper ? camper.name : "", "", u.text]);
  });
  if (d.view.scheduleChanged) {
    body.push([
      "Out of date",
      "",
      "",
      "Schedule changed since it was finalized"
    ]);
  }
  return [header, ...body];
}

/**
 * The run in counts (desktop's Summary sheet): what it is, how many were placed, seats by how
 * they were chosen (an unordered choice is "One of their choices", never a rank), and how many
 * campers were in one offering more than once (repeats are normal; the plan reports them).
 */
export function summaryRows(d) {
  const { t, board, view } = d;
  const byRank = new Map();
  let oneOf = 0;
  let notChosen = 0;
  const offeringsOf = new Map();
  board.seatAt.forEach((placed) => {
    if (!placed.ranked) notChosen += 1;
    else if (placed.ranked.kind === UNORDERED_SET) oneOf += 1;
    else
      byRank.set(placed.ranked.rank, (byRank.get(placed.ranked.rank) || 0) + 1);
    const mine = offeringsOf.get(placed.camper.id) || [];
    mine.push(placed.seat.offeringId);
    offeringsOf.set(placed.camper.id, mine);
  });
  let repeats = 0;
  offeringsOf.forEach((list) => {
    if (new Set(list).size < list.length) repeats += 1;
  });
  const finalWhen = [
    shortDate(view.run.finalizedAt),
    firstName(view.run.finalizedBy)
  ]
    .filter(Boolean)
    .join(" · ");
  const rows = [
    ["Run", view.run.name],
    [
      "Status",
      view.scheduleChanged ? "Final · Out of date" : `Final · ${finalWhen}`
    ],
    [t.s("ElectiveSet"), d.setName],
    [t.s("Week"), d.weekName],
    ["Source file", view.sourceFile || ""],
    [t.p("Camper"), board.counter.total],
    ["Placed", `${board.counter.placed} of ${board.counter.total}`],
    ["Couldn't be placed", board.problems.unplaced.length]
  ];
  [...byRank.keys()]
    .sort((a, b) => a - b)
    .forEach((rank) =>
      rows.push([
        `${RANK_NAMES[rank] || `Choice ${rank}`} choice`,
        byRank.get(rank)
      ])
    );
  if (oneOf) rows.push(["One of their choices", oneOf]);
  if (notChosen) rows.push(["Not one they chose", notChosen]);
  rows.push(["In one offering more than once", repeats]);
  return rows;
}

export function fullReportSheets(d) {
  return [
    {
      name: "Camper schedules",
      rows: guard(camperScheduleRows(d)),
      widths: [24, 12, 12, 14, 8, 22, 14, 8]
    },
    {
      name: "Rosters",
      rows: guard(rosterRows(d)),
      widths: [12, 14, 22, 24, 12, 8, 8]
    },
    {
      name: "Exceptions",
      rows: guard(exceptionRows(d)),
      widths: [30, 24, 22, 40]
    },
    { name: "Summary", rows: guard(summaryRows(d)), widths: [30, 30] }
  ];
}

// ---------- Campers: to edit and bring back ----------

/** A column heading Bring in choices reads as `use`: the camp's word if it does, else `plain`. */
function headingFor(word, use, plain) {
  const meaning = headingMeaning(word);
  return meaning && meaning.use === use ? word : plain;
}

/**
 * The run's campers and their choices, one row per choice, laid out as Bring in choices reads a
 * sheet (desktop exportCamperWorkbook.js): Camper number, Camper name, Division, Bunk, Day,
 * Period, Rank, Activity. A choice for the whole week leaves Day and Period blank; one in no
 * order leaves Rank blank, so it comes back unordered, never as a rank. Edited and brought back
 * (into a new version of the run, since a final run doesn't change), no camper is added twice
 * and none removed: campers are found by number, else by name. A camper with no choices is left
 * out, since bringing in writes nothing for a row with none. The parent's comment is not here.
 * activityNames: the season's activities by Id, for choices of activities the set doesn't offer.
 */
export function campersRows(d, activityNames = new Map()) {
  const { t, run } = d;
  const linkedNames = new Map(
    ((d.view && d.view.linkedChoices) || []).map((l) => [l.id, l.name])
  );
  const nameOf = (choice) => {
    // A linked choice by its name on the sheet, which is how it is read back (slice E8).
    if (choice.l && linkedNames.has(choice.l)) return linkedNames.get(choice.l);
    const offering = run.offeringByActivity.get(choice.a);
    if (offering) return offering.name;
    return activityNames.get(choice.a) || choice.n || "";
  };
  const header = [
    "Camper number",
    "Camper name",
    headingFor(t.s("Division"), "division", "Division"),
    headingFor(t.s("Group"), "bunk", "Bunk"),
    "Day",
    "Period",
    "Rank",
    "Activity"
  ];
  const body = [];
  [...run.campers]
    .sort(
      (a, b) =>
        compareText(
          (a.name || "").toLowerCase(),
          (b.name || "").toLowerCase()
        ) || compareText(a.id, b.id)
    )
    .forEach((camper) => {
      parseChoices(camper.choices).forEach((choice) => {
        body.push([
          camper.camperNumber || "",
          camper.name,
          camper.group ? camper.group.divisionName || "" : "",
          camper.group ? camper.group.name : "",
          choice.d || "",
          choice.p || "",
          choice.k === "unordered" || choice.r == null ? "" : Number(choice.r),
          nameOf(choice)
        ]);
      });
    });
  return [header, ...body];
}

export function campersSheets(d, activityNames) {
  return [
    {
      name: d.t.p("Camper"),
      rows: guard(campersRows(d, activityNames)),
      widths: [14, 24, 14, 12, 12, 10, 6, 22]
    }
  ];
}

function firstName(name) {
  return String(name || "").split(" ")[0];
}
