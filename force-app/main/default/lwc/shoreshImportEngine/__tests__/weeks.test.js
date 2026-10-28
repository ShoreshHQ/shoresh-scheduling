// Weeks in the files (docs/import/weeks.md, INGEST-4.n): a "Week" column, the week in a file's
// name, one week's day with its own time blocks, and a week named by a date.
import {
  buildProposal,
  importNotes,
  planFor,
  questionCards
} from "./data/engine";
import { existingSetup, terms } from "./data/samples";
import { splitWeekColumn, sheetToPages } from "../sheets";
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
      day: "Friday"
    });
    expect(
      p.reading.placements.some(
        (x) =>
          x.week === "Week 2" &&
          x.day === "Friday" &&
          /^Activity A/.test(x.block)
      )
    ).toBe(true);
    expect(importNotes(p, terms).map((n) => n.text)).toContainEqual(
      expect.stringMatching(
        /^Week 2's Friday comes in as a special day with its own times/
      )
    );
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

  it("INGEST-4.3 counter-case: a Friday that differs in every week is not one week's day", () => {
    const files = [0, 1].map((w) =>
      file(`Camp - Week ${w + 1}.csv`, [
        sheetOf(
          `Week ${w + 1}`,
          weekRows(w, (d) => (d === 4 ? SHORT_FRIDAY : BLOCKS))
        )
      ])
    );
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
