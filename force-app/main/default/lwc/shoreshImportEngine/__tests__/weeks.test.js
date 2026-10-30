// Weeks in the files (docs/import/weeks.md, INGEST-4.n): a "Week" column, the week in a file's
// name, one week's day with its own time blocks, and a week named by a date.
import {
  buildProposal,
  LEAVE_OUT,
  importNotes,
  readAsGroups,
  planFor,
  questionCards
} from "./data/engine";
import { existingSetup, terms } from "./data/samples";
import { splitWeekColumn, sheetToPages } from "../sheets";
import { cellAt } from "../structure";
import {
  labelDates,
  weekInFileName,
  weekInTitle,
  withoutWeek
} from "../weekLabels";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const GROUPS = ["Bunk 1", "Bunk 2", "Bunk 3"];
const BLOCKS = [
  "Period 1 9:00-9:45",
  "Period 2 9:50-10:35",
  "Lunch 11:30-12:15",
  "Period 3 1:00-1:45",
  "Period 4 1:50-2:35"
];
// Friday afternoon cut into one long block in one week only.
const SHORT_FRIDAY = [...BLOCKS.slice(0, 3), "Activity A 1:00-2:35"];
const ROTATION = ["Art", "Swim", "Sports", "Drama", "Music", "Nature"];

/** The activity a group has: Lunch at lunch, otherwise a rotation that differs by week. */
function cellOf(week, g, d, b, block) {
  if (/^Lunch/.test(block)) {
    return "Lunch";
  }
  return ROTATION[(g + b + d * 2 + week * 3) % ROTATION.length];
}

/** One day's all-camp grid: a title line, the groups across, the blocks down. */
function dayGrid(week, d, blocks, groups = GROUPS) {
  return [
    [DAYS[d]],
    ["Time", ...groups],
    ...blocks.map((block, b) => [
      block,
      ...groups.map((_, g) => cellOf(week, g, d, b, block))
    ])
  ];
}

/** One week's days stacked on one sheet; `blocksOn(d)` gives a day's blocks. */
function weekRows(week, blocksOn = () => BLOCKS, groups = GROUPS) {
  return DAYS.flatMap((_, d) => [...dayGrid(week, d, blocksOn(d), groups), []]);
}

function file(name, sheets) {
  return { name, sheets };
}

function sheetOf(name, rows) {
  return { name, rows, merges: [] };
}

/** A group's week, days across (a by-group page), with its name on the first row. */
function groupRows(week, g, blocks = BLOCKS, fridayBlocks = BLOCKS) {
  const all = [...new Set([...blocks, ...fridayBlocks])];
  const start = (label) => {
    const [h, m] = label
      .match(/(\d+):(\d+)/)
      .slice(1)
      .map(Number);
    return (h < 7 ? h + 12 : h) * 60 + m;
  };
  all.sort((a, b) => start(a) - start(b));
  return [
    [GROUPS[g]],
    ["Time", ...DAYS],
    ...all.map((block) => [
      block,
      ...DAYS.map((_, d) => {
        const own = d === 4 ? fridayBlocks : blocks;
        const b = own.indexOf(block);
        return b < 0 ? "" : cellOf(week, g, d, b, block);
      })
    ])
  ];
}

function propose(files, existing = existingSetup(), answers = {}) {
  return buildProposal({ files, existing, terms, answers });
}

function weeksRead(p) {
  return [...new Set(p.reading.placements.map((x) => x.week))].sort();
}

function asked(p, prefix) {
  return questionCards(p, terms, {}).filter(
    (c) => c.answer === null && c.id.startsWith(prefix)
  );
}

/** A CSV-shaped sheet with a week column first, each day's grid under its title line. */
function weekColumnSheet(heading, labels, blocksOn) {
  const rows = [];
  labels.forEach((label, week) =>
    DAYS.forEach((_, d) => {
      const grid = dayGrid(week, d, blocksOn ? blocksOn(week, d) : BLOCKS);
      rows.push(grid[0]);
      rows.push([heading, ...grid[1]]);
      grid.slice(2).forEach((row) => rows.push([label, ...row]));
    })
  );
  return rows;
}

describe("INGEST-4.1: a week column", () => {
  it("INGEST-4.1: a Week column gives each row its week; nothing is asked", () => {
    const rows = weekColumnSheet("Week", ["Week 1", "Week 2"]);
    const p = propose([file("Camp 2026.csv", [sheetOf("Camp 2026", rows)])]);
    expect(weeksRead(p)).toEqual(["Week 1", "Week 2"]);
    expect(p.reading.disagreements).toEqual([]);
    expect(p.reading.timetables).toHaveLength(1);
    // Week 2's Monday Period 1 for Bunk 2 is week 2's own cell.
    const cell = p.reading.placements.find(
      (x) =>
        x.week === "Week 2" &&
        x.group === "Bunk 2" &&
        x.day === "Monday" &&
        /^Period 1/.test(x.block)
    );
    expect(cell.text).toBe(cellOf(1, 1, 0, 0, BLOCKS[0]));
  });

  it("INGEST-4.1: recognises Wk, Session, Week of and Dates headings, numbers and dates under them", () => {
    const read = (heading, labels) =>
      weeksRead(
        propose([
          file("Camp.csv", [sheetOf("Camp", weekColumnSheet(heading, labels))])
        ])
      );
    expect(read("Wk", ["1", "2"])).toEqual(["Week 1", "Week 2"]);
    expect(read("Session", ["1", "2"])).toEqual(["Session 1", "Session 2"]);
    expect(read("Week of", ["7/6", "7/13"])).toEqual([
      "Week of 7/13",
      "Week of 7/6"
    ]);
    expect(read("Dates", ["July 6", "July 13"])).toEqual([
      "Week of Jul 13",
      "Week of Jul 6"
    ]);
  });

  it("INGEST-4.1: the week written once and left blank below carries down", () => {
    const rows = weekColumnSheet("Week", ["Week 1", "Week 2"]).map(
      (row, i, all) => {
        const repeated = i > 0 && row[0] && row[0] === all[i - 1][0];
        return repeated ? ["", ...row.slice(1)] : row;
      }
    );
    const p = propose([file("Camp.csv", [sheetOf("Camp", rows)])]);
    expect(weeksRead(p)).toEqual(["Week 1", "Week 2"]);
  });

  it("INGEST-4.1 counter-case: a column headed Week whose cells name no weeks is not a week column", () => {
    const table = [
      ["Monday"],
      ["Time", "Week", "Bunk 1"],
      ["Period 1 9:00-9:45", "Art", "Swim"],
      ["Period 2 9:50-10:35", "Swim", "Art"]
    ];
    const split = splitWeekColumn(table, []);
    expect(split.table).toBe(table);
    expect(split.weekOf.every((w) => w === "")).toBe(true);
    const [page] = sheetToPages(sheetOf("Monday", table));
    expect(page.columns).toEqual(["Week", "Bunk 1"]);
    expect(page.week).toBeUndefined();
  });
});

describe("INGEST-4.2: the week in a file's name", () => {
  it("INGEST-4.2: reads Week 2, Wk2, W2, Session 1 and a date as the week; a day's date is not a week", () => {
    expect(weekInFileName("Camp 2026 - Week 2")).toBe("Week 2");
    expect(weekInFileName("Camp 2026 Wk2")).toBe("Week 2");
    expect(weekInFileName("Camp 2026 - W2")).toBe("Week 2");
    expect(weekInFileName("Camp 2026 - Session 1")).toBe("Session 1");
    expect(weekInFileName("Camp 2026 - 7-6-2026")).toBe("Week of 7/6");
    expect(weekInFileName("Camp - week of July 6th")).toBe("Week of Jul 6");
    expect(weekInFileName("Camp 2026 - Monday 6-30")).toBeNull();
    expect(weekInTitle("Monday 6/30")).toBeNull();
    // A group named like a month is not a date.
    expect(weekInFileName("Juniors 1")).toBeNull();
    expect(withoutWeek("Wk2 - Bunk 1")).toBe("Bunk 1");
  });

  it("INGEST-4.2: a by-group file per week, the week only in the file's name: each file is its week, never a disagreement", () => {
    const files = [1, 2].map((w) =>
      file(
        `Camp 2026 - Week ${w}.xlsx`,
        GROUPS.map((g, gi) => sheetOf(g, groupRows(w, gi)))
      )
    );
    const p = propose(files);
    expect(weeksRead(p)).toEqual(["Week 1", "Week 2"]);
    expect(p.reading.disagreements).toEqual([]);
    expect(asked(p, "cross|")).toEqual([]);
    expect(p.reading.groups.map((g) => g.name)).toEqual(GROUPS);
  });

  it("INGEST-4.2: Wk, W and Session file names read the same way", () => {
    for (const [a, b, want] of [
      ["Camp Wk1", "Camp Wk2", ["Week 1", "Week 2"]],
      ["Camp W1", "Camp W2", ["Week 1", "Week 2"]],
      ["Camp Session 1", "Camp Session 2", ["Session 1", "Session 2"]]
    ]) {
      const files = [a, b].map((name, w) =>
        file(
          `${name}.xlsx`,
          GROUPS.map((g, gi) => sheetOf(g, groupRows(w, gi)))
        )
      );
      const p = propose(files);
      expect(weeksRead(p)).toEqual(want);
      expect(p.reading.disagreements).toEqual([]);
    }
  });

  it("INGEST-4.2 counter-case: two files for the same week that differ still disagree, and it is asked", () => {
    const files = ["Camp 2026 - Week 1", "Camp 2026 copy - Week 1"].map(
      (name, w) =>
        file(
          `${name}.xlsx`,
          GROUPS.map((g, gi) => sheetOf(g, groupRows(w, gi)))
        )
    );
    const p = propose(files);
    expect(weeksRead(p)).toEqual(["Week 1"]);
    expect(p.reading.disagreements.length).toBeGreaterThan(0);
    expect(p.reading.disagreements.every((d) => d.week === "Week 1")).toBe(
      true
    );
    expect(asked(p, "cross|").length).toBeGreaterThan(0);
  });
});

describe("INGEST-4.3: one week's day with its own time blocks", () => {
  const shortFridayIn = (week) => (w, d) => {
    return w === week && d === 4 ? SHORT_FRIDAY : BLOCKS;
  };

  it("INGEST-4.3: a Friday with other blocks in week 2 is that week's own day: one program, the groups not split, said in the notes", () => {
    const files = [0, 1, 2].map((w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(
          `Week ${w + 1}`,
          weekRows(w, (d) => shortFridayIn(1)(w, d))
        )
      ])
    );
    const p = propose(files);
    expect(p.reading.timetables).toHaveLength(1);
    expect(p.reading.groups.map((g) => g.name)).toEqual(GROUPS);
    expect(p.reading.notes).toContainEqual({
      type: "weekDay",
      week: "Week 2",
      day: "Friday",
      id: "ownDays|Week 2",
      answer: "special"
    });
    expect(
      p.reading.placements.some(
        (x) =>
          x.week === "Week 2" &&
          x.day === "Friday" &&
          /^Activity A/.test(x.block)
      )
    ).toBe(true);
    // Listed under "Read as" (review.md INGEST-5.4), no longer in the notes.
    expect(
      readAsGroups(p, terms, [])
        .find((g) => g.key === "specialDay")
        .lines.map((l) => [l.name, l.answer])
    ).toEqual([["Week 2's Friday", "special"]]);
    expect(
      questionCards(p, terms, {}).filter((c) => c.answer === null)
    ).toEqual([]);
  });

  it("INGEST-4.3: the same on by-group pages, where the week's page holds both shapes", () => {
    const files = [0, 1, 2].map((w) =>
      file(
        `Camp 2026 - Week ${w + 1}.xlsx`,
        GROUPS.map((g, gi) =>
          sheetOf(g, groupRows(w, gi, BLOCKS, w === 1 ? SHORT_FRIDAY : BLOCKS))
        )
      )
    );
    const p = propose(files);
    expect(p.reading.timetables).toHaveLength(1);
    expect(p.reading.groups.map((g) => g.name)).toEqual(GROUPS);
    expect(p.reading.groups.some((g) => /schedule/.test(g.name))).toBe(false);
  });

  it("INGEST-4.3 counter-case: different groups on different blocks every day are two programs", () => {
    const seniors = ["Senior 1", "Senior 2"];
    const late = [
      "Period 1 9:15-10:00",
      "Period 2 10:05-10:50",
      "Lunch 12:15-1:00",
      "Period 3 1:05-1:50"
    ];
    const files = [
      file("Juniors.csv", [sheetOf("Juniors", weekRows(0))]),
      file("Seniors.csv", [
        sheetOf(
          "Seniors",
          weekRows(0, () => late, seniors)
        )
      ])
    ];
    const p = propose(files);
    expect(p.reading.timetables).toHaveLength(2);
    expect(p.reading.notes.some((n) => n.type === "weekDay")).toBe(false);
  });
});

describe("INGEST-4.4: a week named by a date", () => {
  const WEEK1 = {
    Id: "w1",
    Name: "Week 1",
    StartDate__c: "2027-06-28",
    EndDate__c: "2027-07-02"
  };
  const WEEK2 = {
    Id: "w2",
    Name: "Week 2",
    StartDate__c: "2027-07-05",
    EndDate__c: "2027-07-09"
  };

  it("INGEST-4.4: goes to the season's week holding that date, without asking", () => {
    const rows = weekColumnSheet("Week of", ["6/28", "7/6"]);
    const p = propose(
      [file("Camp.csv", [sheetOf("Camp", rows)])],
      existingSetup({ weeks: [WEEK1, WEEK2] })
    );
    expect(p.versions.map((v) => v.weekId).sort()).toEqual(["w1", "w2"]);
    expect(asked(p, "week|")).toEqual([]);
  });

  it("INGEST-4.4 counter-case: a date in none of the season's weeks is asked", () => {
    const rows = weekColumnSheet("Week of", ["6/28", "8/10"]);
    const p = propose(
      [file("Camp.csv", [sheetOf("Camp", rows)])],
      existingSetup({ weeks: [WEEK1, WEEK2] })
    );
    expect(asked(p, "week|").map((c) => c.id)).toEqual(["week|Week of 8/10"]);
  });
});

describe("INGEST-4.3: the week's own day saves as a special day", () => {
  const weeks = [
    ["w1", "Week 1", "2027-06-28", "2027-07-02"],
    ["w2", "Week 2", "2027-07-05", "2027-07-09"],
    ["w3", "Week 3", "2027-07-12", "2027-07-16"]
  ].map(([Id, Name, start, end]) => ({
    Id,
    Name,
    StartDate__c: start,
    EndDate__c: end
  }));
  const files = [0, 1, 2].map((w) =>
    file(`Camp - Week ${w + 1}.csv`, [
      sheetOf(
        `Week ${w + 1}`,
        weekRows(w, (d) => (w === 1 && d === 4 ? SHORT_FRIDAY : BLOCKS))
      )
    ])
  );
  const existing = existingSetup({ weeks });
  const p = propose(files, existing);
  const plan = planFor(p, existing, "a00000000000001AAA");

  it("INGEST-4.3: a special day on Week 2's Friday, with its own blocks and the file's cells", () => {
    expect(plan.specialDays).toHaveLength(1);
    const [day] = plan.specialDays;
    expect(day).toMatchObject({
      weekId: "w2",
      day: "Friday",
      name: "Week 2 Friday"
    });
    expect(day.grid.b.map((b) => [b[0], b[2], b[3]])).toEqual([
      ["b1", "09:00", "09:45"],
      ["b2", "09:50", "10:35"],
      ["b3", "11:30", "12:15"],
      ["b4", "13:00", "14:35"]
    ]);
    expect(day.grid.g.map((g) => g[1])).toEqual(GROUPS);
    // Bunk 1's long afternoon block holds its file cell.
    const row = day.grid.r[0].split(",");
    const item = day.grid.i[Number(row[3]) - 1];
    expect(item[2]).toBe(cellOf(1, 0, 4, 3, SHORT_FRIDAY[3]));
  });

  it("INGEST-4.3: the program's blocks never gain the short Friday's; the week's version has no Friday", () => {
    expect(plan.timeBlocks.map((b) => `${b.start}-${b.end}`)).toEqual([
      "09:00-09:45",
      "09:50-10:35",
      "11:30-12:15",
      "13:00-13:45",
      "13:50-14:35"
    ]);
    const week2 = plan.versions.find((v) => v.weekId === "w2");
    expect(week2.days.map((d) => d.date)).toEqual([
      "2027-07-05",
      "2027-07-06",
      "2027-07-07",
      "2027-07-08"
    ]);
    week2.days.forEach((d) => expect(d.grid.b).toHaveLength(5));
    const week1 = plan.versions.find((v) => v.weekId === "w1");
    expect(week1.days).toHaveLength(5);
  });

  // INGEST-4.6
  it("INGEST-4.6: the camp's own special day on that day wins; the file's day is left out, said first", () => {
    const withColorWar = {
      ...existingSetup({ weeks }),
      special: {
        specialDays: [{ Id: "sd1", Name: "Color War" }],
        specialEvents: [],
        briefs: [{ itemId: "sd1", days: [{ weekId: "w2", day: "Friday" }] }]
      }
    };
    const q = propose(files, withColorWar);
    const saved = planFor(q, withColorWar, "a00000000000001AAA");
    expect(saved.specialDays).toEqual([]);
    expect(importNotes(q, terms).map((n) => n.text)).toContain(
      "Week 2's Friday already has Color War, so the file's Friday was left out."
    );
    expect(
      q.unmatched.filter((u) => u.why === "specialDayTaken").length
    ).toBeGreaterThan(0);
    expect(saved.timeBlocks).toHaveLength(5);
  });

  it("INGEST-4.3 counter-case: a week without its own day has no special day", () => {
    const plain = [0, 1].map((w) =>
      file(`Camp - Week ${w + 1}.csv`, [sheetOf(`Week ${w + 1}`, weekRows(w))])
    );
    const q = propose(plain, existing);
    expect(planFor(q, existing, "a00000000000001AAA").specialDays).toEqual([]);
  });
});

describe("INGEST-4.5: Session N in a season of numbered weeks", () => {
  const weeks = [
    ["w1", "Week 1", "2027-06-28", "2027-07-02"],
    ["w2", "Week 2", "2027-07-05", "2027-07-09"]
  ].map(([Id, Name, start, end]) => ({
    Id,
    Name,
    StartDate__c: start,
    EndDate__c: end
  }));
  const sessionFiles = ["Camp Session 1", "Camp Session 2"].map((name, w) =>
    file(
      `${name}.xlsx`,
      GROUPS.map((g, gi) => sheetOf(g, groupRows(w, gi)))
    )
  );

  it("INGEST-4.5: Session 2 is the season's Week 2, without asking, said in the notes", () => {
    const p = propose(sessionFiles, existingSetup({ weeks }));
    expect(p.versions.map((v) => v.weekId).sort()).toEqual(["w1", "w2"]);
    expect(asked(p, "week|")).toEqual([]);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "Session 2 is read as Week 2: the weeks are numbered."
    );
  });

  it("INGEST-4.5 counter-case: weeks not numbered are asked, as before", () => {
    const named = weeks.map((w, i) => ({
      ...w,
      Name: ["Opening", "Color War"][i]
    }));
    const p = propose(sessionFiles, existingSetup({ weeks: named }));
    expect(
      asked(p, "week|")
        .map((c) => c.id)
        .sort()
    ).toEqual(["week|Session 1", "week|Session 2"]);
  });
});

describe("review of PR 176: only what surely names a week", () => {
  // INGEST-4.2
  it("INGEST-4.2: a range or a version number in a name is not a week, and the name is kept whole", () => {
    for (const name of [
      "Grades 3-5",
      "Ages 8-10",
      "Camp 10.2 final",
      "Swim 7-6"
    ]) {
      expect(weekInFileName(name)).toBeNull();
      expect(withoutWeek(name, { bareDates: true })).toBe(name);
    }
    // Counter-cases: with the word week, a month, or a full date with its year, it is a week.
    expect(weekInTitle("Week of 7-6")).toBe("Week of 7/6");
    expect(weekInFileName("Camp Jul 6")).toBe("Week of Jul 6");
    expect(weekInFileName("Camp 7-6-2026")).toBe("Week of 7/6");
  });

  // INGEST-4.2
  it("INGEST-4.2: a bare W2 is a week only alone and within the season's weeks", () => {
    expect(weekInFileName("Bunk W2")).toBeNull();
    expect(weekInFileName("W12 Girls")).toBeNull();
    expect(weekInFileName("Cabin 4 W2")).toBeNull();
    expect(weekInFileName("Camp 2026 - W2", 6)).toBe("Week 2");
    expect(weekInFileName("Camp 2026 - W5", 3)).toBeNull();
    expect(weekInFileName("Camp 2026 - W13")).toBeNull();
    expect(withoutWeek("Bunk W2")).toBe("Bunk W2");
    // The words Week and Wk always count.
    expect(weekInFileName("Wk 2 Girls")).toBe("Week 2");
  });

  // INGEST-4.7
  it("INGEST-4.7: a date of numbers may be read either way; the readings are both kept", () => {
    expect(labelDates("Week of 7/6")).toEqual([
      { month: 7, day: 6 },
      { month: 6, day: 7 }
    ]);
    expect(labelDates("Week of 7/7")).toEqual([{ month: 7, day: 7 }]);
    expect(labelDates("Week of 7/13")).toEqual([{ month: 7, day: 13 }]);
    expect(labelDates("Week of Jul 6")).toEqual([{ month: 7, day: 6 }]);
  });

  const seasonOf = (list) =>
    existingSetup({
      weeks: list.map(([Id, Name, start, end]) => ({
        Id,
        Name,
        StartDate__c: start,
        EndDate__c: end
      }))
    });

  // INGEST-4.7
  it("INGEST-4.7: only one reading lands in a season week: that week, said in the notes", () => {
    const existing = seasonOf([
      ["w1", "Week 1", "2027-07-05", "2027-07-09"],
      ["w2", "Week 2", "2027-07-12", "2027-07-16"]
    ]);
    const rows = weekColumnSheet("Week of", ["6/7", "13/7"]);
    const p = propose([file("Camp.csv", [sheetOf("Camp", rows)])], existing);
    expect(p.versions.map((v) => v.weekId).sort()).toEqual(["w1", "w2"]);
    expect(asked(p, "week|")).toEqual([]);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "Week of 6/7 is read as July 6, in Week 1: read the other way round, it is in none of the weeks."
    );
  });

  // INGEST-4.7
  it("INGEST-4.7 counter-case: both readings land in season weeks: asked", () => {
    const existing = seasonOf([
      ["w1", "Week 1", "2027-06-07", "2027-06-11"],
      ["w2", "Week 2", "2027-07-05", "2027-07-09"]
    ]);
    const rows = weekColumnSheet("Week of", ["6/7", "7/13"]);
    const p = propose([file("Camp.csv", [sheetOf("Camp", rows)])], existing);
    expect(asked(p, "week|").map((c) => c.id)).toContain("week|Week of 6/7");
  });

  // INGEST-4.5
  it("INGEST-4.5: the session note only when the session decided; Session 2 Week 1 is asked", () => {
    const existing = seasonOf([
      ["w1", "Week 1", "2027-06-28", "2027-07-02"],
      ["w2", "Week 2", "2027-07-05", "2027-07-09"]
    ]);
    const filesNamed = (names) =>
      names.map((name, w) =>
        file(
          `${name}.xlsx`,
          GROUPS.map((g, gi) => sheetOf(g, groupRows(w, gi)))
        )
      );
    const plain = propose(filesNamed(["Camp Week 1", "Camp Week 2"]), existing);
    expect(plain.notes.some((n) => n.type === "sessionWeek")).toBe(false);
    const both = propose(
      filesNamed(["Camp Session 2 Week 1", "Camp Session 2 Week 2"]),
      existing
    );
    expect(
      asked(both, "week|")
        .map((c) => c.id)
        .sort()
    ).toEqual(["week|Session 2, Week 1", "week|Session 2, Week 2"]);
    expect(both.notes.some((n) => n.type === "sessionWeek")).toBe(false);
  });
});

describe("review of PR 176: days of their own that clash", () => {
  const twoOdd = (blocksOn) =>
    [0, 1, 2].map((w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(
          `Week ${w + 1}`,
          weekRows(w, (d) => blocksOn(w, d))
        )
      ])
    );
  const thursday = [...BLOCKS.slice(0, 3), "Activity B 1:00-2:00"];

  // INGEST-4.8
  it("INGEST-4.8: two days of their own in one week are asked: special days or a second program", () => {
    const files = twoOdd((w, d) => {
      if (w === 1 && d === 4) return SHORT_FRIDAY;
      if (w === 1 && d === 3) return thursday;
      return BLOCKS;
    });
    const p = propose(files);
    const card = questionCards(p, terms, {}).find(
      (c) => c.id === "ownDays|Week 2"
    );
    expect(card.title).toBe(
      "Are Thursday and Friday of Week 2 special days, or a second program?"
    );
    expect(card.answer).toBeNull();
    expect(p.reading.timetables.length).toBeGreaterThan(1);
    const answered = propose(files, existingSetup(), {
      "ownDays|Week 2": "special"
    });
    expect(answered.reading.timetables).toHaveLength(1);
    expect(answered.timetables[0].ownDays.map((o) => o.day).sort()).toEqual([
      "Friday",
      "Thursday"
    ]);
  });

  // INGEST-4.8
  it("INGEST-4.8 counter-case: one day of its own in a week is not asked", () => {
    const p = propose(
      twoOdd((w, d) => (w === 1 && d === 4 ? SHORT_FRIDAY : BLOCKS))
    );
    expect(
      questionCards(p, terms, {}).some((c) => c.id.startsWith("ownDays|"))
    ).toBe(false);
  });

  // INGEST-4.9
  it("INGEST-4.9: two programs' own Fridays in one week: which is asked, never two special days", () => {
    const weeks = [
      ["w1", "Week 1", "2027-06-28", "2027-07-02"],
      ["w2", "Week 2", "2027-07-05", "2027-07-09"],
      ["w3", "Week 3", "2027-07-12", "2027-07-16"]
    ].map(([Id, Name, start, end]) => ({
      Id,
      Name,
      StartDate__c: start,
      EndDate__c: end
    }));
    const existing = existingSetup({ weeks });
    const late = [
      "Period 1 9:15-10:00",
      "Period 2 10:05-10:50",
      "Lunch 12:15-1:00",
      "Period 3 1:05-1:50",
      "Period 4 1:55-2:40"
    ];
    const lateShort = [...late.slice(0, 3), "Activity C 1:05-2:40"];
    const seniors = ["Senior 1", "Senior 2"];
    const files = [0, 1, 2].flatMap((w) => [
      file(`Juniors - Week ${w + 1}.csv`, [
        sheetOf(
          "J",
          weekRows(w, (d) => (w === 1 && d === 4 ? SHORT_FRIDAY : BLOCKS))
        )
      ]),
      file(`Seniors - Week ${w + 1}.csv`, [
        sheetOf(
          "S",
          weekRows(w, (d) => (w === 1 && d === 4 ? lateShort : late), seniors)
        )
      ])
    ]);
    const p = propose(files, existing);
    const clash = questionCards(p, terms, {}).find((c) =>
      c.id.startsWith("specialDayClash|")
    );
    expect(clash.id).toBe("specialDayClash|Week 2|Friday");
    expect(planFor(p, existing, "a00000000000001AAA").specialDays).toEqual([]);
    const program = clash.options[0].value;
    const answered = propose(files, existing, { [clash.id]: program });
    const saved = planFor(answered, existing, "a00000000000001AAA").specialDays;
    expect(saved).toHaveLength(1);
    expect(answered.unmatched.some((u) => u.why === "specialDayClash")).toBe(
      true
    );
  });
});

// INGEST-4.10
describe("INGEST-4.10: a doubled cell in a week that has a day of its own", () => {
  it("INGEST-4.10: a merge on Monday runs over Monday's blocks, not the short Friday's between them", () => {
    const files = [0, 1, 2].map((w) =>
      file(
        `Camp 2026 - Week ${w + 1}.xlsx`,
        GROUPS.map((g, gi) => {
          const rows = groupRows(
            w,
            gi,
            BLOCKS,
            w === 1 ? SHORT_FRIDAY : BLOCKS
          );
          const sheet = sheetOf(g, rows);
          if (w === 1 && gi === 0) {
            // Bunk 1's Monday Period 3 doubled into Period 4: the merge covers the Activity A
            // row between them (p3 + 1), which Monday does not have.
            const p3 = rows.findIndex((r) => /^Period 3/.test(r[0]));
            const p4 = rows.findIndex((r) => /^Period 4/.test(r[0]));
            for (let r = p3 + 1; r <= p4; r++) rows[r][1] = "";
            sheet.merges = [{ s: { r: p3, c: 1 }, e: { r: p4, c: 1 } }];
          }
          return sheet;
        })
      )
    );
    const week2 = groupRows(1, 0, BLOCKS, SHORT_FRIDAY).map((r) => r[0]);
    expect(week2.slice(5, 8)).toEqual([
      "Period 3 1:00-1:45",
      "Activity A 1:00-2:35",
      "Period 4 1:50-2:35"
    ]);
    const p = propose(files);
    expect(p.reading.timetables).toHaveLength(1);
    const t = p.timetables[0];
    const run = p.usable.find(
      (x) =>
        x.week === "Week 2" &&
        x.group === "Bunk 1" &&
        x.day === "Monday" &&
        /^Period 3/.test(x.block)
    );
    expect(run.blocks.map((i) => t.blocks[i].name)).toEqual([
      "Period 3",
      "Period 4"
    ]);
    // A double period: two blocks long, not the three rows the merge covers.
    expect(run.span).toBe(2);
  });

  it("INGEST-4.10 counter-case: a doubled cell in a week with no day of its own runs on as before", () => {
    const files = [0, 1].map((w) =>
      file(`Camp 2026 - Week ${w + 1}.xlsx`, [
        (() => {
          const rows = groupRows(w, 0);
          const sheet = sheetOf(GROUPS[0], rows);
          const p3 = rows.findIndex((r) => /^Period 3/.test(r[0]));
          rows[p3 + 1][1] = "";
          sheet.merges = [{ s: { r: p3, c: 1 }, e: { r: p3 + 1, c: 1 } }];
          return sheet;
        })()
      ])
    );
    const p = propose(files);
    const t = p.timetables[0];
    const run = p.usable.find(
      (x) =>
        x.group === "Bunk 1" && x.day === "Monday" && /^Period 3/.test(x.block)
    );
    expect(run.blocks.map((i) => t.blocks[i].name)).toEqual([
      "Period 3",
      "Period 4"
    ]);
  });
});

// INGEST-4.11
describe("INGEST-4.11: a special day in a camp of two programs covers both", () => {
  const weeks = [
    ["w1", "Week 1", "2027-06-28", "2027-07-02"],
    ["w2", "Week 2", "2027-07-05", "2027-07-09"],
    ["w3", "Week 3", "2027-07-12", "2027-07-16"]
  ].map(([Id, Name, start, end]) => ({
    Id,
    Name,
    StartDate__c: start,
    EndDate__c: end
  }));
  const late = [
    "Period 1 9:15-10:00",
    "Period 2 10:05-10:50",
    "Lunch 12:15-1:00",
    "Period 3 1:05-1:50",
    "Period 4 1:55-2:40"
  ];
  const seniors = ["Senior 1", "Senior 2"];
  const files = [0, 1, 2].flatMap((w) => [
    file(`Juniors - Week ${w + 1}.csv`, [
      sheetOf(
        "J",
        weekRows(w, (d) => (w === 1 && d === 4 ? SHORT_FRIDAY : BLOCKS))
      )
    ]),
    file(`Seniors - Week ${w + 1}.csv`, [
      sheetOf(
        "S",
        weekRows(w, () => late, seniors)
      )
    ])
  ]);

  it("INGEST-4.11: the other program's groups are in the special day, on their own blocks, with nothing asked", () => {
    const existing = existingSetup({ weeks });
    const p = propose(files, existing);
    expect(p.timetables).toHaveLength(2);
    expect(
      questionCards(p, terms, {}).filter((c) => c.answer === null)
    ).toEqual([]);
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(plan.specialDays).toHaveLength(1);
    const [day] = plan.specialDays;
    expect(day.name).toBe("Week 2 Friday");
    expect(day.grid.g.map(([, name]) => name)).toEqual([...GROUPS, ...seniors]);
    // Both programs' blocks, in time order: the Juniors' short Friday and the Seniors' day.
    expect(day.grid.b.map((b) => b[2])).toEqual([
      "09:00",
      "09:15",
      "09:50",
      "10:05",
      "11:30",
      "12:15",
      "13:00",
      "13:05",
      "13:55"
    ]);
    // A Senior's Friday Period 1 is in their row, in their block.
    const senior = day.grid.r[GROUPS.length].split(",");
    const at915 = day.grid.b.findIndex((b) => b[2] === "09:15");
    const item = day.grid.i[Number(senior[at915]) - 1];
    expect(item[2]).toBe(cellOf(1, 0, 4, 0, late[0]));
    expect(senior[0]).toBe("");
    // The Seniors' Week 2 has no regular Friday: the special day replaces it.
    const seniorWeek2 = plan.versions.find(
      (v) => v.programKey === p.timetables[1].key && v.weekId === "w2"
    );
    expect(seniorWeek2.days.map((d) => d.date)).not.toContain("2027-07-09");
    expect(
      plan.versions
        .find((v) => v.programKey === p.timetables[1].key && v.weekId === "w1")
        .days.map((d) => d.date)
    ).toContain("2027-07-02");
  });

  it("INGEST-4.11 counter-case: the day of its own left out leaves the other program's Friday as it is", () => {
    const existing = existingSetup({ weeks });
    const p = propose(files, existing, { "ownDays|Week 2": "leaveOut" });
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(plan.specialDays).toEqual([]);
    const seniorWeek2 = plan.versions.find(
      (v) => v.programKey === p.timetables[1].key && v.weekId === "w2"
    );
    expect(seniorWeek2.days.map((d) => d.date)).toContain("2027-07-09");
  });
});

describe("INGEST-4.12: a day with its own times every week", () => {
  const weeks = [
    ["w1", "Week 1", "2027-06-28", "2027-07-02"],
    ["w2", "Week 2", "2027-07-05", "2027-07-09"],
    ["w3", "Week 3", "2027-07-12", "2027-07-16"]
  ].map(([Id, Name, start, end]) => ({
    Id,
    Name,
    StartDate__c: start,
    EndDate__c: end
  }));
  const existing = existingSetup({ weeks });
  /** Week w's days stacked; its Friday on SHORT_FRIDAY, its cells week `fridayWeek(w)`'s. */
  const shortFridayRows = (w, fridayWeek = () => 0) =>
    DAYS.flatMap((_, d) => [
      ...(d === 4
        ? dayGrid(fridayWeek(w), d, SHORT_FRIDAY)
        : dayGrid(w, d, BLOCKS)),
      []
    ]);
  const weekFiles = (count, fridayWeek) =>
    Array.from({ length: count }, (_, w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(`Week ${w + 1}`, shortFridayRows(w, fridayWeek))
      ])
    );

  it("INGEST-4.12: a Friday on its own times in every week is one special day, on each week's Friday", () => {
    const p = propose(weekFiles(3), existing);
    expect(p.reading.timetables).toHaveLength(1);
    expect(asked(p, "")).toEqual([]);
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(plan.specialDays).toHaveLength(1);
    const [day] = plan.specialDays;
    expect(day).toMatchObject({ weekId: "w1", day: "Friday", name: "Friday" });
    expect(day.also).toEqual([
      { weekId: "w2", weekKey: null },
      { weekId: "w3", weekKey: null }
    ]);
    expect(day.grid.b.map((b) => b[3])).toEqual([
      "09:45",
      "10:35",
      "12:15",
      "14:35"
    ]);
    expect(plan.timeBlocks).toHaveLength(5);
    plan.versions.forEach((v) => expect(v.days).toHaveLength(4));
  });

  it("INGEST-4.12: a cell that differs from week to week is placed in no week, and listed", () => {
    // Bunk 1's Friday differs each week (its rotation follows the week); the rest are the same.
    const files = Array.from({ length: 2 }, (_, w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(
          `Week ${w + 1}`,
          DAYS.flatMap((day, d) => {
            const grid =
              d === 4 ? dayGrid(0, d, SHORT_FRIDAY) : dayGrid(w, d, BLOCKS);
            if (d === 4) grid[2][1] = w ? "Archery" : "Canoe";
            return [...grid, []];
          })
        )
      ])
    );
    const p = propose(files, existing);
    const [day] = p.specialDays;
    expect(day.also).toHaveLength(1);
    expect(day.grid.r[0].split(",")[0]).toBe("");
    expect(day.grid.r[1].split(",")[0]).not.toBe("");
    const why = p.unmatched.filter((x) => x.why === "differsByWeek");
    expect(why.every((x) => x.group === "Bunk 1")).toBe(true);
    expect(why.map((x) => x.text).sort()).toEqual(
      expect.arrayContaining(["Archery", "Canoe"])
    );
  });

  it("INGEST-4.12: the same on by-group pages that hold every day's blocks", () => {
    const files = [0, 1].map((w) =>
      file(
        `Camp 2026 - Week ${w + 1}.xlsx`,
        GROUPS.map((g, gi) =>
          sheetOf(g, groupRows(0, gi, BLOCKS, SHORT_FRIDAY))
        )
      )
    );
    const p = propose(files, existing);
    expect(p.reading.timetables).toHaveLength(1);
    expect(p.timetables[0].blocks.filter((b) => !b.ownDay)).toHaveLength(5);
    expect(p.specialDays).toHaveLength(1);
    expect(p.specialDays[0].also).toHaveLength(1);
  });

  it("INGEST-4.12: a one-week file's mid-week day asks Every week, or just this once?", () => {
    const files = [file("Camp.csv", [sheetOf("Camp", shortFridayRows(0))])];
    const one = existingSetup({ weeks: [weeks[0]] });
    const p = propose(files, one);
    const [card] = asked(p, "everyWeek|");
    expect(card.title).toBe(
      "Friday has its own times. Every week, or just this once?"
    );
    expect(card.options.map((o) => o.label)).toEqual([
      "Every week",
      "Just this once"
    ]);
    expect(p.reading.timetables).toHaveLength(1);
    // Unanswered or just this once: one special day.
    expect(p.specialDays).toHaveLength(1);
    expect(p.specialDays[0].also || []).toEqual([]);
  });

  it("INGEST-4.12: Every week puts that one special day on every week's day of the season", () => {
    const files = [file("Camp.csv", [sheetOf("Camp", shortFridayRows(0))])];
    const answers = {
      "everyWeek|Friday": "every",
      "week|the file's week": "Week 1"
    };
    const p = propose(files, existing, answers);
    expect(p.specialDays).toHaveLength(1);
    expect(p.specialDays[0].also.map((w) => w.weekId)).toEqual(["w2", "w3"]);
    const once = propose(files, existing, {
      ...answers,
      "everyWeek|Friday": "once"
    });
    expect(once.specialDays[0].also || []).toEqual([]);
  });

  it("INGEST-4.12: a weekend day in a one-week file is every week, without asking", () => {
    const SAT = ["Saturday"];
    const rows = [...DAYS, ...SAT].flatMap((day, d) => {
      const grid = dayGrid(0, d % 5, d === 5 ? SHORT_FRIDAY : BLOCKS);
      grid[0] = [day];
      return [...grid, []];
    });
    const satWeeks = weeks.map((w) => ({
      ...w,
      EndDate__c: w.EndDate__c.replace(/(\d\d)$/, (x) =>
        String(Number(x) + 1).padStart(2, "0")
      )
    }));
    const p = propose(
      [file("Camp.csv", [sheetOf("Camp", rows)])],
      existingSetup({ weeks: satWeeks }),
      { "week|the file's week": "Week 1" }
    );
    expect(asked(p, "everyWeek|")).toEqual([]);
    expect(p.specialDays).toHaveLength(1);
    expect(p.specialDays[0]).toMatchObject({
      day: "Saturday",
      name: "Saturday"
    });
    expect(p.specialDays[0].also).toHaveLength(2);
  });
});

describe("INGEST-4.13: the regular day ending early is the regular day", () => {
  const DAY = [...BLOCKS, "Dismissal 2:40-3:00"];
  const weeks = [
    ["w1", "Week 1", "2027-06-28", "2027-07-02"],
    ["w2", "Week 2", "2027-07-05", "2027-07-09"]
  ].map(([Id, Name, start, end]) => ({
    Id,
    Name,
    StartDate__c: start,
    EndDate__c: end
  }));
  const existing = existingSetup({ weeks });
  /** Every group at Dismissal in a Dismissal row. */
  const withDismissal = (grid) =>
    grid.map((r) => {
      if (!/^Dismissal/.test(r[0])) return r;
      return [r[0], ...GROUPS.map(() => "Dismissal")];
    });
  /** Two weeks; Friday's grid made by `friday(grid)` from the regular day's. */
  const files = (fridayBlocks, friday = (g) => g) =>
    [0, 1].map((w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(
          `Week ${w + 1}`,
          DAYS.flatMap((_, d) => [
            ...(d === 4
              ? friday(withDismissal(dayGrid(w, d, fridayBlocks)))
              : withDismissal(dayGrid(w, d, DAY))),
            []
          ])
        )
      ])
    );
  const dismissal = (p) =>
    p.reading.placements.filter(
      (x) => x.day === "Friday" && x.group === "Bunk 1" && x.week === "Week 1"
    );
  // CORE-3.7: Dismissal stays one fixed activity, starting earlier on Friday.
  const fridayDismissal = (plan) => {
    expect(
      plan.recurringActivities.filter((r) => r.name === "Dismissal")
    ).toEqual([]);
    const fixed = plan.fixedActivities.filter((r) => r.name === "Dismissal");
    expect(fixed).toHaveLength(1);
    return fixed[0];
  };

  it("INGEST-4.13: prefix-early-end → regular: Dismissal on a shorter block of its own, nothing after, is the regular day", () => {
    const fri = [...BLOCKS.slice(0, 4), "Dismissal 1:50-2:10"];
    const p = propose(files(fri), existing);
    expect(asked(p, "")).toEqual([]);
    expect(p.specialDays).toEqual([]);
    expect(p.timetables[0].blocks.map((b) => b.label)).toHaveLength(6);
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(plan.specialDays).toEqual([]);
    // Dismissal holds the rest of Friday: from Period 4 to the day's end.
    expect(fridayDismissal(plan)).toMatchObject({
      length: 1,
      earlyDay: "Friday",
      earlyBlocks: 1
    });
    expect(
      dismissal(p).find((x) => x.text === "Dismissal").blockKeys
    ).toHaveLength(2);
  });

  it("INGEST-4.13: Dismissal written in the last period, the rest of the day blank, runs to the day's end", () => {
    const p = propose(
      files(DAY, (g) =>
        g.map((r, i) => {
          if (i < 2 || !/^Period 4|^Dismissal/.test(r[0])) return r;
          const text = /^Period 4/.test(r[0]) ? "Dismissal at 1:50" : "";
          return [r[0], ...GROUPS.map(() => text)];
        })
      ),
      existing
    );
    expect(asked(p, "")).toEqual([]);
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(fridayDismissal(plan)).toMatchObject({
      length: 1,
      earlyDay: "Friday",
      earlyBlocks: 1
    });
    expect(plan.activities.map((a) => a.name)).not.toContain(
      "Dismissal at 1:50"
    );
  });

  it("INGEST-4.13: a group renamed after reading (Bunk 1 in two divisions) keeps its early end", () => {
    const read = { page: 0, row: 7, group: "Bunk 1", day: "Friday" };
    const named = { ...read, recordName: "Bunk 1", group: "Bunk 1 (Juniors)" };
    expect(cellAt(named)).toBe(cellAt(read));
  });

  it("INGEST-4.13 counter-case: truly different → special: a day of its own flow stays a special day", () => {
    // Friday's afternoon recut into one long block, Dismissal at its usual time: not an early end.
    const fri = [
      ...BLOCKS.slice(0, 3),
      "Activity A 1:00-2:35",
      "Dismissal 2:40-3:00"
    ];
    const p = propose(files(fri), existing);
    expect(p.specialDays).toHaveLength(1);
    expect(p.specialDays[0].name).toBe("Friday");
  });
});

describe("INGEST-4.14: a single-day file", () => {
  const weeks = [
    {
      Id: "w1",
      Name: "Week 1",
      StartDate__c: "2026-06-29",
      EndDate__c: "2026-07-03"
    }
  ];
  const existing = existingSetup({ weeks });
  const rows = [
    ["Time", "Bunk 1", "Bunk 2"],
    ["9:00-10:00", "Relay races", "Tug of war"],
    ["10:00-11:00", "Tug of war", "Relay races"],
    ["11:00-12:00", "Lunch", "Lunch"]
  ];
  const fieldDay = (name = "field-day.csv") => [
    file(name, [sheetOf("Sheet1", rows)])
  ];

  it("INGEST-4.14: a one-day file naming no day is not refused: which day is asked, and the answer makes it a special day on that day", () => {
    const before = propose(fieldDay(), existing);
    const [card] = asked(before, "oneDay|");
    expect(card.title).toBe(
      "This looks like a single-day schedule. Which day is field-day.csv?"
    );
    expect(card.options.map((o) => o.value)).toContain("Thursday");
    expect(before.reading.pages[0].noDay).toBe(false);
    expect(
      importNotes(before, terms)
        .map((n) => n.text)
        .join(" ")
    ).not.toMatch(/does not say which day/);

    const answers = { "oneDay|field-day.csv": "Thursday" };
    const p = propose(fieldDay(), existing, answers);
    expect(p.reading.placements).toHaveLength(6);
    const plan = planFor(p, existing, "a00000000000001AAA", { answers });
    expect(plan.specialDays).toHaveLength(1);
    expect(plan.specialDays[0]).toMatchObject({
      weekId: "w1",
      day: "Thursday"
    });
    expect(plan.specialDays[0].grid.r).toHaveLength(2);
    // Its blocks are the special day's own, never the program's; no empty version.
    expect(plan.timeBlocks).toEqual([]);
    expect(plan.versions).toEqual([]);
    expect(importNotes(p, terms).map((n) => n.text)).toContain(
      "field-day.csv looks like a single-day schedule, so it comes in as a special day on Thursday, with its own times."
    );
  });

  it("INGEST-4.14 counter-case: a one-day file naming its day is read as that day, as before", () => {
    const p = propose(fieldDay("color-war-wednesday.csv"), existing);
    expect(asked(p, "oneDay|")).toEqual([]);
    const plan = planFor(p, existing, "a00000000000001AAA");
    expect(plan.specialDays).toEqual([]);
    expect(plan.versions[0].days).toHaveLength(1);
  });

  it("INGEST-4.14: beside a week's files, the answered day is the special day on the week asked, and the week's groups join it", () => {
    const files = [
      file("Camp - Week 1.csv", [sheetOf("Week 1", weekRows(0))]),
      ...fieldDay()
    ];
    const answers = {
      "oneDay|field-day.csv": "Wednesday",
      "week|the file's week": "Week 1"
    };
    const p = propose(files, existing, answers);
    const plan = planFor(p, existing, "a00000000000001AAA", { answers });
    expect(plan.specialDays).toHaveLength(1);
    expect(plan.specialDays[0]).toMatchObject({
      weekId: "w1",
      day: "Wednesday"
    });
    expect(plan.specialDays[0].grid.g.map((g) => g[1]).sort()).toEqual(
      expect.arrayContaining(GROUPS)
    );
    const week = plan.versions.find((v) => v.days.length);
    expect(week.days).toHaveLength(4);
  });

  it("INGEST-4.14 counter-case: left out, nothing is read from it", () => {
    const answers = { "oneDay|field-day.csv": LEAVE_OUT };
    const p = propose(fieldDay(), existing, answers);
    expect(p.reading.placements).toHaveLength(0);
  });
});
