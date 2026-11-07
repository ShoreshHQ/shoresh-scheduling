/**
 * A: many made-up camps set up from nothing: only the camp and season are made directly; the rest
 * comes through Import last year's files or add_setup_record, then is built, read back and judged
 * by what must hold of any week.
 */
const { call, makeCamp, soql } = require("../lib");
const {
  importYear,
  draft,
  checksOf,
  names,
  count,
  seenOf,
  confirmed
} = require("../kit");

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ALL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

/** One by-group file for a bunk: blocks down, days across; a mealtime on every day. */
function bunkFile(camp, bunk, days, blocks, activities, turn) {
  const lines = [["Time", ...days].join(",")];
  blocks.forEach(([name, time, fixed], b) => {
    const cells = days.map(
      (_, d) => fixed ?? activities[(turn + b * 3 + d * 7) % activities.length]
    );
    lines.push([`${name} (${time})`, ...cells].join(","));
  });
  return {
    file_name: `${camp} - ${bunk}.csv`,
    csv_text: `${lines.join("\n")}\n`
  };
}

const DAY_BLOCKS = [
  ["Period 1", "9:00 - 9:50"],
  ["Period 2", "10:00 - 10:50"],
  ["Lunch", "11:00 - 11:50", "Lunch"],
  ["Period 3", "12:00 - 12:50"],
  ["Period 4", "1:00 - 1:50"]
];

/** What must hold of any built week: one thing per cell, the fixed where fixed. */
function holds(rec, d, label, { groups, fixed = {} }) {
  const seen = new Map();
  for (const r of d.rows) {
    const key = `${r.date}|${r.group}|${r.start_time}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const doubled = [...seen].filter(([, n]) => n > 1).map(([k]) => k);
  rec.check(
    "CORE one cell",
    `${label}: no group does two things at once`,
    doubled.length === 0,
    doubled.slice(0, 10).join("; ")
  );
  const inWeek = new Set(d.rows.map((r) => r.group));
  rec.check(
    "CORE every group",
    `${label}: every group is in the week`,
    groups.every((g) => inWeek.has(g)),
    [...inWeek].join()
  );
  for (const [block, activity] of Object.entries(fixed)) {
    const wrong = d.rows.filter(
      (r) => r.time_block === block && r.activity !== activity
    );
    rec.check(
      "CORE fixed",
      `${label}: ${activity} at ${block} for everyone`,
      wrong.length === 0,
      JSON.stringify(wrong.slice(0, 3))
    );
  }
}

async function campFromFiles(rec, short, opts, files, answers, expect) {
  const { season } = makeCamp(short, opts);
  const started = Date.now();
  const saved = await importYear(season, files, {
    "week|the file's week": "Week 1",
    ...answers
  });
  rec.check(
    "API-1.84",
    `${short}: imports from nothing`,
    saved.kind === "done",
    saved.text
  );
  rec.note(
    `${short}: import took ${Math.round((Date.now() - started) / 1000)}s`,
    saved.text.slice(0, 500)
  );
  const inSeason = `Season__r.Name = '${season}'`;
  const groups = names("Group__c", `Division__r.Program__r.${inSeason}`);
  const activities = names("Activity__c", inSeason);
  rec.check(
    "INGEST read back",
    `${short}: ${expect.groups.length} groups, as the files have`,
    groups.join() === [...expect.groups].sort().join(),
    groups.join()
  );
  rec.check(
    "INGEST read back",
    `${short}: ${expect.activities} activities`,
    activities.length === expect.activities,
    activities.join()
  );
  const weeks = names("Week__c", inSeason);
  rec.check(
    "WEEK read back",
    `${short}: ${opts.weeks} weeks from the season's dates`,
    weeks.length === opts.weeks,
    weeks.join()
  );
  const b0 = Date.now();
  const built = await call("build_week", { season, week: "Week 1" });
  rec.check("API-1.20", `${short}: builds`, built.kind === "done", built.text);
  rec.note(`${short}: build took ${Math.round((Date.now() - b0) / 1000)}s`);
  const d = built.kind === "done" ? await draft(season) : null;
  if (d) {
    holds(rec, d, short, { groups: expect.groups, fixed: expect.fixed });
    rec.note(
      `${short}: counter`,
      JSON.stringify({
        placed: d.checks.placed,
        still: d.checks.still_needed,
        open: d.rows.filter((r) => r.activity === "Open").length
      })
    );
  }
  const p0 = Date.now();
  const published = await call("publish_week", { season, week: "Week 1" });
  rec.check(
    "PUB",
    `${short}: publishes`,
    published.kind === "done",
    published.text
  );
  rec.note(`${short}: publish took ${Math.round((Date.now() - p0) / 1000)}s`);
  return { season, d };
}

const nums = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

module.exports = [
  {
    id: "A1",
    title: "tiny day camp from nothing: 2 bunks, 3 activities",
    camps: "BR A1 %",
    async run(rec) {
      const acts = ["Swim", "Art", "Soccer"];
      const bunks = ["Red", "Blue"];
      await campFromFiles(
        rec,
        "A1 Tiny",
        { weeks: 1 },
        bunks.map((b, i) => bunkFile("Tiny", b, WEEKDAYS, DAY_BLOCKS, acts, i)),
        {},
        { groups: bunks, activities: 3, fixed: { Lunch: "Lunch" } }
      );
    }
  },
  {
    id: "A2",
    title: "overnight camp: 7-day weeks, early and evening blocks, 8 weeks",
    camps: "BR A2 %",
    async run(rec) {
      const blocks = [
        ["Reveille", "7:00 - 7:30", "Reveille"],
        ["Breakfast", "7:30 - 8:15", "Breakfast"],
        ["Morning 1", "8:30 - 9:45"],
        ["Morning 2", "10:00 - 11:15"],
        ["Lunch", "12:00 - 12:45", "Lunch"],
        ["Rest", "1:00 - 2:00", "Rest hour"],
        ["Afternoon", "2:15 - 3:30"],
        ["Dinner", "5:30 - 6:15", "Dinner"],
        ["Evening", "7:00 - 8:30"],
        ["Lights out", "9:30 - 10:00", "Lights out"]
      ];
      const acts = [
        "Canoe",
        "Sailing",
        "Riflery",
        "Hike",
        "Crafts",
        "Ropes",
        "Campfire songs",
        "Tennis"
      ];
      const bunks = nums(8, (i) => `Cabin ${i}`);
      const start = "2027-06-27"; // a Sunday
      const { d } = await campFromFiles(
        rec,
        "A2 Overnight",
        { start, weeks: 8, days: 7 },
        bunks.map((b, i) =>
          bunkFile("Overnight", b, ALL_DAYS, blocks, acts, i)
        ),
        {},
        {
          groups: bunks,
          activities: acts.length,
          fixed: { Lunch: "Lunch", Dinner: "Dinner" }
        }
      );
      if (d) {
        const days = new Set(d.rows.map((r) => r.day));
        rec.check(
          "PROG days",
          "the week has all seven days",
          days.size === 7,
          [...days].join()
        );
        rec.check(
          "INGEST-2.10",
          "an evening block stays in the evening",
          d.rows.some(
            (r) =>
              r.time_block === "Evening" &&
              Number(r.start_time.slice(0, 2)) >= 19
          ),
          JSON.stringify(d.rows.find((r) => r.time_block === "Evening"))
        );
        rec.check(
          "INGEST-2.10",
          "Lights out is at night",
          d.rows.some(
            (r) =>
              r.activity === "Lights out" &&
              Number(r.start_time.slice(0, 2)) >= 21
          ),
          JSON.stringify(d.rows.find((r) => r.activity === "Lights out"))
        );
      }
    }
  },
  {
    id: "A3",
    title: "huge camp: 40 bunks, 60 activities, 8 weeks",
    camps: "BR A3 %",
    async run(rec) {
      const blocks = [
        ["Period 1", "8:30 - 9:15"],
        ["Period 2", "9:20 - 10:05"],
        ["Period 3", "10:10 - 10:55"],
        ["Period 4", "11:00 - 11:45"],
        ["Lunch", "12:00 - 12:45", "Lunch"],
        ["Period 5", "1:00 - 1:45"],
        ["Period 6", "1:50 - 2:35"],
        ["Period 7", "2:40 - 3:25"]
      ];
      const acts = nums(
        60,
        (i) => `Activity Number ${String(i).padStart(2, "0")}x`
      );
      const bunks = nums(40, (i) => `Bunk ${i}`);
      const { season } = await campFromFiles(
        rec,
        "A3 Huge",
        { weeks: 8 },
        bunks.map((b, i) => bunkFile("Huge", b, WEEKDAYS, blocks, acts, i)),
        {},
        { groups: bunks, activities: 60, fixed: { Lunch: "Lunch" } }
      );
      for (const w of ["Week 2", "Week 8"]) {
        const b = await call("build_week", { season, week: w });
        rec.check("API-1.20", `huge: ${w} builds`, b.kind === "done", b.text);
      }
      const checks = await checksOf(season);
      rec.note("huge counter", checks.placed);
      const copyRead = await call("download_schedule", {
        season,
        week: "Week 1"
      });
      rec.check(
        "API-1.88",
        "huge: its schedule downloads",
        copyRead.kind === "done",
        copyRead.text.slice(0, 300)
      );
      const seen = /Last import:[^;]*?seen: "([^"]+)"/.exec(
        (await call("read_last_imports", { season })).text
      )?.[1];
      const undone = await confirmed("undo_import", { season, seen });
      rec.check(
        "INGEST-5.10",
        "huge: Undo import works or says plainly why not",
        undone.done.status < 500,
        undone.done.text
      );
      rec.note("huge: Undo says", undone.done.text.slice(0, 400));
    }
  },
  {
    id: "A4",
    title:
      "same names: the same bunk name in two divisions, an activity named like a group",
    camps: "BR A4 %",
    async run(rec) {
      const { season } = makeCamp("A4 Same", { weeks: 1 });
      const add = async (kind, name, program, fields) => {
        const said = await call("add_setup_record", {
          season,
          kind,
          name,
          ...(program ? { program } : {}),
          ...(fields ? { fields } : {})
        });
        rec.check(
          "API-1.47",
          `adds ${kind} ${name}`,
          said.kind === "done",
          said.text
        );
        return said;
      };
      await add(
        "program",
        "Main",
        null,
        Object.fromEntries(WEEKDAYS.map((d) => [d.toLowerCase(), "yes"]))
      );
      await add("division", "Boys", "Main");
      await add("division", "Girls", "Main");
      await add("group", "Bunk 1", "Main", { division: "Boys" });
      const twin = await call("add_setup_record", {
        season,
        kind: "group",
        name: "Bunk 1",
        program: "Main",
        fields: { division: "Girls" }
      });
      rec.check(
        "DIV same names",
        "a second Bunk 1, in the other division, is allowed",
        twin.kind === "done",
        twin.text
      );
      rec.note("second Bunk 1", twin.text.slice(0, 300));
      await add("time block", "Period 1", "Main", {
        start_time: "9:00 AM",
        end_time: "10:00 AM",
        part_of_day: "Morning"
      });
      await add("time block", "Period 2", "Main", {
        start_time: "10:00 AM",
        end_time: "11:00 AM",
        part_of_day: "Morning"
      });
      await add("location", "Field", null, { groups_that_fit: "2" });
      await add("activity", "Bunk 1", null, {
        location: "Field",
        length: "1",
        times_per_week_min: "1",
        times_per_week_max: "5"
      });
      await add("activity", "Soccer", null, {
        location: "Field",
        length: "1",
        times_per_week_min: "1",
        times_per_week_max: "5"
      });
      const weeks = await call("fill_in_weeks", {
        season,
        seen: { start_date: "2027-06-28", end_date: "2027-07-02" }
      });
      rec.note("fill_in_weeks", weeks.text.slice(0, 300));
      const built = await call("build_week", { season, week: "Week 1" });
      rec.check(
        "API-1.20",
        "builds with two Bunk 1s",
        built.kind === "done",
        built.text
      );
      const d = await draft(season);
      rec.check(
        "API-1.123",
        "the draft names the same-named groups",
        (d.groups_with_the_same_name ?? []).includes("Bunk 1"),
        JSON.stringify(d.groups_with_the_same_name)
      );
      const bunks = new Set(
        d.rows.filter((r) => r.group === "Bunk 1").map((r) => r.notes)
      );
      rec.check(
        "API-1.123",
        "each Bunk 1's rows say which it is",
        bunks.size >= 2,
        [...bunks].join(" | ")
      );
      const cell = d.rows.find(
        (r) => r.group === "Bunk 1" && r.day === "Monday"
      );
      const ambiguous = await call("change_schedule_cell", {
        season,
        week: "Week 1",
        group: "Bunk 1",
        day: "Monday",
        time: cell.time_block,
        was: cell.activity,
        activity: "Soccer",
        seen: d.seen
      });
      rec.check(
        "CORE never guessed",
        'a change to "Bunk 1" asks which, or names it; never picks one silently',
        ambiguous.kind === "refused" || /Boys|Girls/.test(ambiguous.text),
        ambiguous.text
      );
      const pub = await call("publish_week", { season, week: "Week 1" });
      rec.check("PUB", "publishes", pub.kind === "done", pub.text);
      const out = await call("read_group_schedule", {
        season,
        week: "Week 1",
        as_csv: true
      });
      const inOut = out.text
        .split("\n")
        .filter((l) => l.includes("Bunk 1")).length;
      rec.check(
        "PUB",
        "what goes out tells the two Bunk 1s apart, or doesn't merge them",
        inOut >= 10,
        out.text.slice(0, 400)
      );
      rec.note(
        "what goes out for two Bunk 1s",
        out.text.split("\n").slice(0, 5).join("\n")
      );
      const importAgain = await call("import_list", {
        season,
        list: "groups",
        file_name: "same.csv",
        csv_text: "Bunk,Unit\nBunk 1,Boys\nBunk 1,Girls\nBunk 1,Girls\n"
      });
      rec.note(
        "a groups list naming both Bunk 1s",
        importAgain.text.slice(0, 500)
      );
    }
  },
  {
    id: "A5",
    title: "rotating schedule: Day 1 to Day 6 rather than weekdays",
    camps: "BR A5 %",
    async run(rec) {
      const { season } = makeCamp("A5 Rotating", { weeks: 2 });
      const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
      const bunks = ["Aleph", "Bet", "Gimel"];
      const acts = ["Swim", "Art", "Soccer", "Music", "Drama", "Tennis"];
      const files = bunks.map((b, i) =>
        bunkFile("Rotating", b, days, DAY_BLOCKS, acts, i)
      );
      const review = await call("import_last_year", { season, files });
      rec.check(
        "INGEST-1",
        "a rotating file is answered, not broken",
        review.status < 500,
        review.text
      );
      rec.note("rotating schedule review", review.text);
      rec.note(
        "A5 known open: rotating schedules aren't supported yet (Greg decided to build them)"
      );
      const save = seenOf(review.text)
        ? await call("import_last_year", {
            season,
            files,
            save: true,
            seen: seenOf(review.text),
            answers: { "week|the file's week": "Week 1" }
          })
        : review;
      rec.note(
        "rotating schedule saved",
        `${save.kind}: ${save.text.slice(0, 500)}`
      );
      // Known open item: Greg decided to build rotating schedules (2026-11-06). Until then this
      // logs what the reader does. A review that says ready must still save (INGEST-4.14).
      if (/Ready to save/.test(review.text)) {
        rec.check(
          "INGEST-4.14",
          "a review that says Ready to save saves",
          save.kind === "done",
          save.text
        );
      }
      const groups = names(
        "Group__c",
        `Division__r.Program__r.Season__r.Name = '${season}'`
      );
      rec.note("rotating groups read back", groups.join());
    }
  },
  {
    id: "A6",
    title: "two programs on different time blocks",
    camps: "BR A6 %",
    async run(rec) {
      const { season } = makeCamp("A6 Programs", { weeks: 1 });
      const morningBlocks = [
        ["AM 1", "8:00 - 8:45"],
        ["AM 2", "9:00 - 9:45"],
        ["Snack", "10:00 - 10:20", "Snack"],
        ["AM 3", "10:30 - 11:15"]
      ];
      const fullBlocks = DAY_BLOCKS;
      const acts = ["Swim", "Art", "Soccer", "Music"];
      const files = [
        ...["Sprouts 1", "Sprouts 2"].map((b, i) =>
          bunkFile("Tots", b, WEEKDAYS, morningBlocks, acts, i)
        ),
        ...["Oak", "Maple"].map((b, i) =>
          bunkFile("Full", b, WEEKDAYS, fullBlocks, acts, i + 3)
        )
      ];
      const review = await call("import_last_year", {
        season,
        files,
        answers: { "week|the file's week": "Week 1" }
      });
      rec.note("two programs review", review.text);
      rec.check(
        "INGEST-4.11",
        "two sets of times read as two programs or asked",
        /2 programs|program/i.test(review.text),
        review.text
      );
      const asked = [...review.text.matchAll(/\[id "(program\|[^"]+)"\]/g)].map(
        (m) => m[1]
      );
      const answers = { "week|the file's week": "Week 1" };
      for (const id of asked) answers[id] = "new";
      // Leaving the can-wait questions for later: does the season get the week the notes promise?
      const later = await call("import_last_year", {
        season,
        files,
        answers,
        save: true,
        seen: seenOf(review.text)
      });
      rec.note(
        "saved with questions left for later",
        `${later.kind}: ${later.text.slice(0, 500)}`
      );
      // Open finding F13: the review's note and "kept as a version" line promise this; the save follows settled().
      rec.note(
        "F13: a week promised while questions wait, weeks after the save",
        names("Week__c", `Season__r.Name = '${season}'`).join() || "none"
      );
      const seenUndo = /Last import:[^;]*?seen: "([^"]+)"/.exec(
        (await call("read_last_imports", { season })).text
      )?.[1];
      await confirmed("undo_import", { season, seen: seenUndo });
      for (const [g, d] of [
        ["Maple", "Full"],
        ["Oak", "Full"],
        ["Sprouts 1", "Tots"],
        ["Sprouts 2", "Tots"]
      ])
        answers[`division|${g}`] = d;
      const r2 = await call("import_last_year", { season, files, answers });
      const saved = await call("import_last_year", {
        season,
        files,
        answers,
        save: true,
        seen: seenOf(r2.text)
      });
      rec.check(
        "API-1.84",
        "two programs import",
        saved.kind === "done",
        saved.text
      );
      const programs = names("Program__c", `Season__r.Name = '${season}'`);
      rec.note("programs read back", programs.join());
      rec.check(
        "PROG",
        "two programs came in",
        programs.length === 2,
        programs.join()
      );
      for (const program of programs) {
        const built = await call("build_week", {
          season,
          week: "Week 1",
          program
        });
        rec.check(
          "PROG",
          `program ${program} builds alone`,
          built.kind === "done",
          built.text
        );
      }
      const noneNamed = await call("build_week", { season, week: "Week 1" });
      rec.note(
        "build naming no program, with two",
        `${noneNamed.kind}: ${noneNamed.text.slice(0, 300)}`
      );
      for (const program of programs) {
        const d = await draft(season, "Week 1", { program });
        const blocks = new Set(d.rows.map((r) => r.time_block));
        rec.note(`${program} blocks`, [...blocks].join());
        rec.check(
          "PROG-own-blocks",
          `${program} has only its own blocks`,
          !(blocks.has("AM 1") && blocks.has("Period 1")),
          [...blocks].join()
        );
        const published = await call("publish_week", {
          season,
          week: "Week 1",
          program
        });
        rec.check(
          "PUB-1.1",
          `${program} publishes on its own`,
          published.kind === "done",
          published.text
        );
      }
      const pubs = count(
        "Schedule__c",
        `Program__r.Season__r.Name = '${season}' AND Status__c = 'Published'`
      );
      rec.check(
        "PUB-1.1",
        "each program's week has its own published version",
        pubs === 2,
        pubs
      );
    }
  }
];
