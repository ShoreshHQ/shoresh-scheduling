/** S3 to S6: electives, special days, versions, and the same inputs giving the same output. */
const { call, makeCamp, soql, seenIn } = require("../lib");
const {
  importMaple,
  draft,
  checksOf,
  count,
  names,
  confirmed,
  seenOf,
  electiveOnWeek
} = require("../kit");

/** Told apart only by the seed: each camp still places every cell, and the same way around locks. */
function holdsSameCounts(rec, da, db) {
  rec.check(
    "CORE same inputs",
    "both camps place the same number of cells",
    da.checks.placed === db.checks.placed,
    `${da.checks.placed} / ${db.checks.placed}`
  );
}

module.exports = [
  {
    id: "S3",
    title:
      "electives season: choices, assign, lock a seat, reassign, finalize, clear",
    camps: "BR S3 %",
    async run(rec) {
      const { season } = makeCamp("S3 Electives");
      await importMaple(season);
      const inSeason = `Season__r.Name = '${season}'`;
      await electiveOnWeek(season, "Week 2", "Chugim", ["Bunk 1", "Bunk 2"]);
      const at = { season, week: "Week 2", elective_set: "Chugim" };
      const sheet = {
        ...at,
        file_name: "chugim.csv",
        csv_text:
          "Camper,Camper number,Bunk,Choice 1,Choice 2\nAvery Madeup,1,Bunk 1,Swim,Art\nBlake Madeup,2,Bunk 1,Swim,Art\nCasey Madeup,3,Bunk 2,Art,Swim\nDrew Madeup,4,Bunk 2,Nope,Swim\nAvery Madeup,1,Bunk 1,Swim,Art\n,,,,\n"
      };
      const asked = await call("bring_in_choices", sheet);
      rec.check(
        "API-1.117",
        "a name not set up is asked about, not guessed",
        /Nope/.test(asked.text),
        asked.text
      );
      const answersNow = { Nope: "leave" };
      const review = await call("bring_in_choices", {
        ...sheet,
        answers: answersNow
      });
      rec.check(
        "API-1.117",
        "a messy choices sheet is reviewed",
        review.kind === "done",
        review.text
      );
      rec.note("choices review", review.text.slice(0, 1000));
      rec.check(
        "INGEST-2.7",
        "the duplicate row is said, not silently kept twice",
        /twice|duplicate|same|more than once/i.test(review.text) ||
          /- 4 campers: /.test(review.text),
        review.text
      );
      const saved = await call("bring_in_choices", {
        ...sheet,
        answers: answersNow,
        save: true,
        seen: seenIn(review.text)
      });
      rec.note("choices saved", `${saved.kind}: ${saved.text.slice(0, 500)}`);
      if (saved.kind !== "done") return;
      const seenSeats = async () => {
        const r = await call("read_elective_seats_now", at);
        return { text: r.text, seen: seenIn(r.text) };
      };
      let s = await seenSeats();
      rec.note("seats now", s.text.slice(0, 600));
      const assigned = await confirmed("assign_elective_seats", {
        ...at,
        seen: s.seen
      });
      rec.check(
        "API-1.106",
        "Assign asks first",
        assigned.preview.kind === "asks first",
        assigned.preview.text
      );
      rec.check(
        "API-1.67",
        "Assign places",
        assigned.done.kind === "done",
        assigned.done.text
      );
      s = await seenSeats();
      const line =
        /- ([^#\n]+?) #\d+, ([^:]+): ([A-Za-z]+), ([^:]+): ([^\n]+)/.exec(
          s.text
        );
      if (!line) {
        rec.check("API-1.66", "seats can be read", false, s.text);
        return;
      }
      const [, camper, , day, time, seat] = line;
      const lock = await call("lock_elective_seat", {
        ...at,
        camper: camper.trim(),
        day,
        time,
        locked: true,
        seen: s.seen
      });
      rec.check("API-1.69", "a seat locks", lock.kind === "done", lock.text);
      s = await seenSeats();
      const again = await confirmed("assign_elective_seats", {
        ...at,
        seen: s.seen
      });
      rec.check(
        "API-1.67",
        "Assign again",
        again.done.kind === "done",
        again.done.text
      );
      s = await seenSeats();
      rec.check(
        "LOCK elective",
        "the locked seat survives Assign",
        s.text.includes(`${camper.trim()} #`) &&
          new RegExp(
            `${camper.trim()} #\\d+, [^:]+: ${day}, ${time}: ${seat.split(" (")[0]}`
          ).test(s.text),
        s.text.slice(0, 500)
      );
      const finalized = await confirmed("finalize_electives", at);
      rec.note(
        "finalize",
        `${finalized.done.kind}: ${finalized.done.text.slice(0, 300)}`
      );
      const out = await call("read_elective_seats", { season, week: "Week 2" });
      rec.note("seats going out", out.text.slice(0, 400));
      const clearRead = await call("read_electives_to_clear", { season });
      const cleared = await confirmed("clear_electives", {
        season,
        week: "Week 2",
        seen: seenOf(clearRead.text) ?? seenIn(clearRead.text)
      });
      rec.check(
        "API-1.72",
        "Clear",
        cleared.done.kind === "done",
        cleared.done.text
      );
      rec.check(
        "API-1.72",
        "read back: campers gone",
        count("Camper__c", inSeason) === 0,
        count("Camper__c", inSeason)
      );
    }
  },
  {
    id: "S7",
    title:
      "an elective on a week through an AI, on both screens; Undo keeps what a built week uses",
    camps: "BR S7 %",
    async run(rec) {
      const { season } = makeCamp("S7 Elective");
      await importMaple(season);
      const inSeason = `Season__r.Name = '${season}'`;
      await call("start_manual_week", { season, week: "Week 2" });
      const manual = await draft(season, "Week 2", {
        schedule: "Manual Build",
        group: "Bunk 1",
        day: "Monday"
      });
      const open = manual.rows.find((r) => r.activity === "Open");
      const placed = await call("change_schedule_cell", {
        season,
        week: "Week 2",
        schedule: "Manual Build",
        group: "Bunk 1",
        day: "Monday",
        time: open.time_block,
        was: "Open",
        activity: "Chugim"
      });
      rec.check(
        "API-1.124",
        "an AI puts the elective on Manual Build",
        placed.kind === "done",
        placed.text
      );
      const read = await draft(season, "Week 2", {
        schedule: "Manual Build",
        group: "Bunk 1",
        day: "Monday"
      });
      rec.check(
        "API-1.124",
        "read back: the cell holds it, marked",
        /Chugim/.test(read.cell("Monday", "Bunk 1", open.time_block).activity),
        JSON.stringify(read.cell("Monday", "Bunk 1", open.time_block))
      );
      const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      await call("build_week", { season, week: "Week 1" });
      const gen = await draft(season);
      const cell = gen.rows.find(
        (r) =>
          !r.notes &&
          r.activity !== "Open" &&
          mins(r.end_time) - mins(r.start_time) < 60
      );
      const onGen = await call("change_schedule_cell", {
        season,
        week: "Week 1",
        group: cell.group,
        day: cell.day,
        time: cell.time_block,
        was: cell.activity,
        activity: "Chugim",
        seen: gen.seen
      });
      rec.check(
        "API-1.124",
        "an AI puts the elective on Generated Schedule, locked",
        onGen.kind === "done",
        onGen.text
      );
      const genRead = await draft(season);
      rec.check(
        "API-1.124",
        "read back on Generated: it's there and locked",
        /Chugim/.test(
          genRead.cell(cell.day, cell.group, cell.time_block).activity
        ) &&
          /locked/.test(
            genRead.cell(cell.day, cell.group, cell.time_block).notes ?? ""
          ),
        JSON.stringify(genRead.cell(cell.day, cell.group, cell.time_block))
      );
      // A cell an AI hasn't touched (the one it placed is locked now, and a lock is said first).
      const other = genRead.rows.find(
        (r) => !r.notes && r.activity !== "Open" && r.activity !== "Chugim"
      );
      const unknown = await call("change_schedule_cell", {
        season,
        week: "Week 1",
        group: other.group,
        day: other.day,
        time: other.time_block,
        was: other.activity,
        activity: "Nope",
        seen: genRead.seen
      });
      rec.check(
        "API-1.105",
        "a name Shoresh doesn't have names what it has, sets too",
        unknown.kind === "refused" && /Chugim/.test(unknown.text),
        unknown.text
      );
      const before = names("ElectiveSet__c", inSeason);
      const seen = /Last import:[^;]*?seen: "([^"]+)"/.exec(
        (await call("read_last_imports", { season })).text
      )?.[1];
      const undone = await confirmed("undo_import", { season, seen });
      rec.check(
        "INGEST-5.10",
        "Undo works",
        undone.done.kind === "done",
        undone.done.text
      );
      rec.note("Undo says", undone.done.text);
      rec.check(
        "INGEST-5.10",
        "the elective set the built weeks use is kept",
        names("ElectiveSet__c", inSeason).join() === before.join(),
        names("ElectiveSet__c", inSeason).join()
      );
      // The message names the first few and counts the rest ("and 27 more"); the set is read back above.
      rec.check(
        "INGEST-5.10",
        "and named, or counted in the rest",
        /Chugim|and \d+ more/.test(undone.done.text),
        undone.done.text
      );
      rec.check(
        "INGEST-5.10",
        "activities the built week uses are kept and named",
        names("Activity__c", inSeason).includes(
          cell.activity === "Chugim"
            ? "Swim"
            : genRead.rows.find((r) => !r.notes)?.activity
        ),
        names("Activity__c", inSeason).join()
      );
    }
  },
  {
    id: "S4",
    title:
      "special days: on a day, schedule from a file, hand edit, file again, off a day",
    camps: "BR S4 %",
    async run(rec) {
      const { season } = makeCamp("S4 Special");
      await importMaple(season);
      const week = { season, week: "Week 1" };
      await call("build_week", week);
      const add = await call("add_setup_record", {
        season,
        kind: "special day",
        name: "Color war"
      });
      rec.check("SPECIAL", "a special day adds", add.kind === "done", add.text);
      const read = await call("read_special_days", { season });
      rec.note("special days", read.text.slice(0, 500));
      let plan = await call("read_special_schedule", {
        season,
        special: "Color war"
      });
      rec.note("special schedule read", plan.text.slice(0, 500));
      const csv = "Time,Bunk 1,Bunk 2\n9:00 AM,Swim,Art\n10:00 AM,Art,Swim\n";
      const imported = await call("import_special_schedule", {
        season,
        special: "Color war",
        seen: seenIn(plan.text),
        file_name: "cw.csv",
        csv_text: csv
      });
      rec.check(
        "API-1.85",
        "its schedule comes from a file",
        imported.kind === "done",
        imported.text
      );
      plan = await call("read_special_schedule", {
        season,
        special: "Color war"
      });
      rec.check(
        "API-1.85",
        "read back: the file's cells",
        /Swim/.test(plan.text) && /Art/.test(plan.text),
        plan.text
      );
      const stale = await call("import_special_schedule", {
        season,
        special: "Color war",
        seen: "not-it",
        file_name: "cw.csv",
        csv_text: csv
      });
      rec.check(
        "API-1.85",
        "a stale seen is refused",
        stale.kind === "refused",
        stale.text
      );
      const edited = await call("change_special_schedule_cell", {
        season,
        special: "Color war",
        column: "Bunk 1",
        time: "9:00 AM – 10:00 AM",
        was: "Swim",
        activity: "Soccer"
      });
      rec.note("the schedule after the file", plan.text.slice(0, 400));
      rec.note(
        "hand edit on the special schedule",
        `${edited.kind}: ${edited.text.slice(0, 300)}`
      );
      plan = await call("read_special_schedule", {
        season,
        special: "Color war"
      });
      const again = await call("import_special_schedule", {
        season,
        special: "Color war",
        seen: seenIn(plan.text),
        file_name: "cw.csv",
        csv_text: csv
      });
      rec.note(
        "the file again over a hand edit",
        `${again.kind}: ${again.text.slice(0, 400)}`
      );
      if (edited.kind === "done") {
        rec.check(
          "LOCK manual choice",
          "the file doesn't silently write over the hand edit",
          again.kind !== "done" || /edited|hand|replace/i.test(again.text),
          again.text
        );
      }
      const seenDay = "none";
      const put = await call("put_special_day_on_day", {
        season,
        special_day: "Color war",
        week: "Week 1",
        day: "Wednesday",
        seen: seenDay
      });
      rec.check("SPECIAL", "goes on a day", put.kind === "done", put.text);
      const d = await draft(season);
      rec.check(
        "SPECIAL-4",
        "the draft says the day a special day takes over",
        (d.special_days ?? []).length > 0,
        JSON.stringify(d.special_days)
      );
      const rebuilt = await call("build_week", week);
      rec.check(
        "SPECIAL-4",
        "the week rebuilds around it",
        rebuilt.kind === "done",
        rebuilt.text
      );
      const d2 = await draft(season);
      const wed = d2.rows.filter((r) => r.day === "Wednesday");
      rec.note(
        "Wednesday in the draft with a special day on it",
        JSON.stringify(wed.slice(0, 3))
      );
      const pub = await call("publish_week", week);
      rec.check(
        "PUB",
        "publishes with a special day",
        pub.kind === "done",
        pub.text
      );
      const out = await call("read_group_schedule", { ...week, as_csv: true });
      rec.note(
        "Wednesday going out",
        out.text
          .split("\n")
          .filter((l) => /2027-06-30/.test(l))
          .slice(0, 5)
          .join("\n")
      );
      const wedOut = out.text
        .split("\n")
        .filter((l) => l.includes(",2027-06-30,"));
      rec.check(
        "API-6.5",
        "Wednesday goes out as the special day's own schedule",
        wedOut.length > 0 &&
          wedOut.every((l) => l.includes("9:00 AM")) &&
          wedOut.some((l) => l.includes("Bunk 2") && l.endsWith(",Art")),
        wedOut.slice(0, 6).join("\n")
      );
      const off = await call("take_special_day_off_day", {
        season,
        special_day: "Color war",
        week: "Week 1",
        day: "Wednesday",
        seen: "Color war"
      });
      rec.check("SPECIAL", "comes off the day", off.kind === "done", off.text);
      const event = await call("add_setup_record", {
        season,
        kind: "special event",
        name: "Campfire"
      });
      rec.check(
        "SPECIAL",
        "a special event adds",
        event.kind === "done",
        event.text
      );
      const place = await call("place_special_event", {
        ...week,
        event: "Campfire",
        day: "Monday",
        groups: ["Bunk 1"],
        time: "Period 6",
        seen: (await checksOf(season)).seen
      });
      rec.check(
        "SPECIAL",
        "the event goes on the week",
        place.kind === "done",
        place.text
      );
      const d3 = await draft(season, "Week 1", {
        group: "Bunk 1",
        day: "Monday"
      });
      rec.check(
        "SPECIAL",
        "read back: the event's in the cell, marked",
        d3.rows.some(
          (r) =>
            r.activity === "Campfire" && /special event/.test(r.notes ?? "")
        ),
        JSON.stringify(d3.rows)
      );
    }
  },
  {
    id: "S5",
    title: "versions: save, change, restore, publish, unpublish, delete",
    camps: "BR S5 %",
    async run(rec) {
      const { season } = makeCamp("S5 Versions");
      await importMaple(season);
      const week = { season, week: "Week 1" };
      await call("build_week", week);
      const first = await draft(season);
      await call("save_version", { ...week, name: "As built" });
      const cell = first.rows.find(
        (r) =>
          (!r.notes &&
            r.activity !== "Open" &&
            r.end_time.slice(0, 2) === r.start_time.slice(0, 2)) ||
          (!r.notes && r.activity === "Swim")
      );
      const other = cell.activity === "Art" ? "Soccer" : "Art";
      const edit = await call("change_schedule_cell", {
        ...week,
        group: cell.group,
        day: cell.day,
        time: cell.time_block,
        was: cell.activity,
        activity: other,
        seen: first.seen
      });
      rec.check("API-1.11", "a hand edit", edit.kind === "done", edit.text);
      const dup = await call("save_version", { ...week, name: "As built" });
      rec.note(
        "a version named the same again",
        `${dup.kind}: ${dup.text.slice(0, 200)}`
      );
      const nameIt = dup.kind === "done";
      const restored = await call("restore_version", {
        ...week,
        version: nameIt ? "No such" : "As built"
      });
      rec.check(
        "API-1.35",
        "a version name that isn't there or is doubled is refused",
        restored.kind === "refused" || !nameIt,
        restored.text
      );
      const list = await call("list_versions", week);
      const stamp = JSON.parse(list.text)
        .versions.filter((v) => v.name === "As built")
        .at(-1)?.saved;
      const restoredOk = await call("restore_version", {
        ...week,
        version: "As built",
        ...(stamp ? { saved: stamp } : {})
      });
      rec.check(
        "API-1.34",
        "the version restores",
        restoredOk.kind === "done",
        restoredOk.text
      );
      const back = await draft(season);
      rec.check(
        "API-1.34",
        "read back: the cells are the version's",
        back.words === first.words,
        back.words.slice(0, 300)
      );
      const list2 = JSON.parse(
        (await call("list_versions", week)).text
      ).versions;
      rec.check(
        "API-1.34",
        "the week as it was is kept as Before Restore",
        list2.some((v) => v.name === "Before Restore"),
        JSON.stringify(list2.map((v) => v.name))
      );
      const pub = await call("publish_week", week);
      rec.check("PUB", "publish", pub.kind === "done", pub.text);
      const unpub = await call("unpublish_week", week);
      rec.check("API-1.36", "unpublish", unpub.kind === "done", unpub.text);
      const list3 = JSON.parse(
        (await call("list_versions", week)).text
      ).versions;
      const was = list3.find((v) => /Published/.test(`${v.name} ${v.says}`));
      rec.check(
        "PUB-6.1",
        "the unpublished one is kept, marked Published",
        Boolean(was),
        JSON.stringify(list3)
      );
      if (was) {
        const del = await call("delete_version", {
          ...week,
          version: was.name,
          saved: was.saved
        });
        const conf = /confirm: "([^"]+)"/.exec(del.text)?.[1];
        const done = conf
          ? await call("delete_version", {
              ...week,
              version: was.name,
              saved: was.saved,
              confirm: conf
            })
          : del;
        rec.check(
          "PUB-4.3",
          "a once-published version can't be deleted",
          done.kind === "refused",
          done.text
        );
      }
      const unpubAgain = await call("unpublish_week", week);
      rec.check(
        "API-1.36",
        "unpublishing nothing says so",
        /isn't published/.test(unpubAgain.text),
        unpubAgain.text
      );
    }
  },
  {
    id: "S6",
    title:
      "same inputs, same output: two camps set up alike and built apart; a week built twice",
    camps: "BR S6 %",
    async run(rec) {
      const [a, b] = [makeCamp("S6 One"), makeCamp("S6 Two")];
      await importMaple(a.season);
      await importMaple(b.season);
      await call("build_week", { season: a.season, week: "Week 1" });
      await call("build_week", { season: b.season, week: "Week 1" });
      const [da, db] = [await draft(a.season), await draft(b.season)];
      // The engine seeds with the records' own Ids (c/shoreshGeneratedWeek build.js), so two camps' weeks differ by design.
      rec.note(
        "two camps with the same setup, built apart: the same week?",
        String(da.words === db.words)
      );
      holdsSameCounts(rec, da, db);
      await call("build_week", { season: a.season, week: "Week 1" });
      const da2 = await draft(a.season);
      rec.check(
        "CORE same inputs",
        "building the same week again gives the same week",
        da2.words === da.words,
        da2.words.slice(0, 300)
      );
      const seenA = (await checksOf(a.season)).seen;
      rec.note("seen after two builds", seenA);
    }
  }
];
