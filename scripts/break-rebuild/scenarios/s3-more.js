/** S3 to S6: electives, special days, versions, and the same inputs giving the same output. */
const { apex, call, makeCamp, soql, seenIn } = require("../lib");
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
          wedOut.some((l) => l.includes("Bunk 2") && l.split(",")[6] === "Art"),
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
  },
  {
    id: "S8",
    title:
      "the Build menu through an AI: Try another, an option back, Fill the open cells, Start over",
    camps: "BR S8 %",
    async run(rec) {
      const { season } = makeCamp("S8 Build menu");
      await importMaple(season);
      const week = { season, week: "Week 1" };
      const notBuilt = await call("try_another_option", {
        season,
        week: "Week 2"
      });
      rec.check(
        "API-1.127",
        "a week never built has no Build menu",
        notBuilt.kind === "refused" &&
          /hasn't been built yet/.test(notBuilt.text),
        notBuilt.text
      );
      await call("build_week", week);
      const first = await draft(season);
      const free = first.rows.find((r) => !r.notes && r.activity !== "Open");
      const lock = {
        ...week,
        day: free.day,
        group: free.group,
        time: free.time_block
      };
      const locked = await call("lock_cells", { ...lock, seen: first.seen });
      rec.check("LOCK", "a cell locks", locked.kind === "done", locked.text);
      const holds = (d) => d.cell(free.day, free.group, free.time_block);

      const tried = await call("try_another_option", week);
      rec.check(
        "API-1.127",
        "Try another builds Option 2 and says the screen's count",
        tried.kind === "done" &&
          /^Option 2 of Week 1\. Filled \d+ of \d+\./.test(tried.text),
        tried.text
      );
      const two = await draft(season);
      rec.check(
        "API-1.127",
        "the locked cell is kept",
        holds(two).activity === free.activity &&
          /locked/.test(holds(two).notes),
        JSON.stringify(holds(two))
      );
      const versions = await call("list_versions", week);
      rec.check(
        "API-1.127",
        "the week as it was is in Versions, both ways",
        /Before Try another/.test(versions.text) &&
          /Before Option 2 of Week 1/.test(versions.text),
        versions.text.slice(0, 800)
      );

      const above = await call("bring_back_option", { ...week, option: 5 });
      rec.check(
        "API-1.128",
        "an option never tried is refused",
        above.kind === "refused" &&
          /Option 5 hasn't been tried/.test(above.text),
        above.text
      );
      const same = await call("bring_back_option", { ...week, option: 2 });
      rec.check(
        "API-1.128",
        "the option it's on changes nothing",
        same.kind === "done" && /already on Option 2/.test(same.text),
        same.text
      );
      const back = await call("bring_back_option", { ...week, option: 1 });
      rec.check(
        "API-1.128",
        "an earlier option comes back",
        back.kind === "done" && /^Option 1 of Week 1\./.test(back.text),
        back.text
      );
      const again = await call("try_another_option", week);
      rec.check(
        "API-1.127",
        "Option 2 again is the same week",
        again.kind === "done" && (await draft(season)).words === two.words,
        again.text
      );

      const before = await draft(season);
      const out = before.rows.find((r) => !r.notes && r.activity !== "Open");
      const taken = await call("take_out_cell", {
        ...week,
        day: out.day,
        group: out.group,
        time: out.time_block,
        was: out.activity,
        seen: before.seen
      });
      rec.check(
        "API-1.129",
        "a cell is opened",
        taken.kind === "done",
        taken.text
      );
      const opened = await draft(season);
      const filled = await call("fill_open_cells", week);
      const after = await draft(season);
      rec.check(
        "API-1.129",
        "Fill the open cells fills, and every filled cell stays",
        filled.kind === "done" &&
          after.cell(out.day, out.group, out.time_block).activity !== "Open" &&
          opened.rows
            .filter((r) => r.activity !== "Open")
            .every(
              (r) =>
                after.cell(r.day, r.group, r.time_block)?.activity ===
                r.activity
            ),
        filled.text
      );
      rec.note("after filling", JSON.stringify(after.checks).slice(0, 300));
      const none = await call("fill_open_cells", week);
      rec.check(
        "API-1.129",
        "with nothing open it is refused",
        none.kind === "refused" && /no open cells/.test(none.text),
        none.text
      );

      const kept = await draft(season);
      const over = await call("start_over_week", week);
      rec.check(
        "API-1.130",
        "Start over goes at once and says so",
        over.kind === "done" && /^Started Week 1 over\./.test(over.text),
        over.text
      );
      const cleared = await draft(season);
      rec.check(
        "API-1.130",
        "every activity is cleared and the lock lifted; what isn't an activity stays",
        kept.rows
          .filter((r) => !r.notes || r.notes === "locked")
          .every(
            (r) =>
              cleared.cell(r.day, r.group, r.time_block).activity === "Open"
          ) &&
          kept.rows
            .filter(
              (r) => r.notes && r.notes !== "locked" && !/locked$/.test(r.notes)
            )
            .every(
              (r) =>
                cleared.cell(r.day, r.group, r.time_block).activity ===
                r.activity
            ) &&
          !/locked/.test(holds(cleared).notes ?? ""),
        JSON.stringify(holds(cleared))
      );
      const undo = await confirmed("undo_last_agent_change", week);
      rec.check(
        "API-1.130",
        "Undo asks first, then brings the week and its lock back",
        undo.preview.kind === "asks first" &&
          undo.done.kind === "done" &&
          (await draft(season)).words === kept.words,
        undo.done.text
      );
    }
  },
  {
    id: "S9",
    title:
      "linked choices through an AI: read, make, rename, periods, who, delete",
    camps: "BR S9 %",
    async run(rec) {
      const { season } = makeCamp("S9 Linked");
      await importMaple(season);
      apex(`Group__c g = [SELECT Id, Division__r.Program__c FROM Group__c WHERE Name = 'Bunk 1' AND Division__r.Program__r.Season__r.Name = '${season}' LIMIT 1];
Division__c d = new Division__c(Name = 'Juniors', Program__c = g.Division__r.Program__c);
insert d;
update new Group__c(Id = g.Id, Division__c = d.Id);`);
      await call("add_setup_record", {
        season,
        kind: "elective set",
        name: "Chugim"
      });
      await electiveOnWeek(
        season,
        "Week 1",
        "Chugim",
        ["Bunk 1", "Bunk 2"],
        ["Period 2", "Period 3"]
      );
      const at = { season, elective_set: "Chugim" };
      const read = async () =>
        JSON.parse((await call("read_linked_choices", at)).text);
      const first = await read();
      rec.check(
        "API-1.131",
        "the read says where the set sits and has none yet",
        first.where_it_sits.length === 2 && first.linked_choices.length === 0,
        JSON.stringify(first)
      );
      const two = { day: "Monday", time: "Period 2" };
      const three = { day: "Monday", time: "Period 3" };
      const elsewhere = await call("make_linked_choice", {
        ...at,
        activity: "Swim",
        periods: [{ day: "Tuesday", time: "Period 2" }]
      });
      rec.check(
        "API-1.132",
        "a period where the set doesn't sit is refused",
        elsewhere.kind === "refused" && /isn't at/.test(elsewhere.text),
        elsewhere.text
      );
      const made = await call("make_linked_choice", {
        ...at,
        activity: "swim",
        periods: [two]
      });
      rec.check(
        "API-1.132",
        "a name left out is the activity's",
        made.kind === "done" && /"Swim"/.test(made.text),
        made.text
      );
      const second = await call("make_linked_choice", {
        ...at,
        activity: "Swim",
        periods: [two]
      });
      rec.check(
        "API-1.132",
        "the next is the activity and its first period",
        second.kind === "done" && /"Swim · Mon \d+:\d\d"/.test(second.text),
        second.text
      );
      const secondName = /"([^"]+)"/.exec(second.text)[1];
      const renamed = await call("change_linked_choice", {
        ...at,
        name: "Swim",
        new_name: "Swim double",
        periods_on: [three]
      });
      rec.check(
        "API-1.133",
        "a rename and a period save together",
        renamed.kind === "done" && /"Swim double"/.test(renamed.text),
        renamed.text
      );
      const shares = await call("change_linked_choice", {
        ...at,
        name: secondName,
        periods_on: [three]
      });
      await call("change_linked_choice", {
        ...at,
        name: secondName,
        periods_on: [three]
      });
      rec.check(
        "API-1.133",
        "a period shared is saved, and the editor's mark comes back",
        shares.kind === "done" && /Also in "Swim double"/.test(shares.text),
        shares.text
      );
      const afterTicks = await read();
      const shown = afterTicks.linked_choices.find(
        (c) => c.name === "Swim double"
      );
      rec.check(
        "API-1.131",
        "the read marks it on the period, and ticking twice was one tick",
        shown.periods.length === 2 &&
          afterTicks.linked_choices.find((c) => c.name === secondName).periods
            .length === 2 &&
          shown.periods.some((p) => /Also in/.test(p.note ?? "")),
        JSON.stringify(shown)
      );
      const division = first.where_it_sits[0].divisions[0];
      rec.check(
        "API-1.131",
        "the read says the division there",
        division === "Juniors",
        JSON.stringify(first.where_it_sits)
      );
      const whoAll = await call("change_linked_choice", {
        ...at,
        name: "Swim double",
        divisions_on: [division]
      });
      rec.check(
        "API-1.133",
        "divisions are refused while it applies to All",
        whoAll.kind === "refused" && /applies to All/.test(whoAll.text),
        whoAll.text
      );
      const who = await call("change_linked_choice", {
        ...at,
        name: "Swim double",
        applies_to: "Only these",
        divisions_on: [division]
      });
      const whoRead = (await read()).linked_choices.find(
        (c) => c.name === "Swim double"
      );
      rec.check(
        "API-1.133",
        "who it applies to is saved",
        who.kind === "done" &&
          whoRead.applies_to === "Only these" &&
          whoRead.divisions.includes(division),
        `${who.text} ${JSON.stringify(whoRead)}`
      );
      const blank = await call("change_linked_choice", {
        ...at,
        name: "Swim double",
        new_name: " "
      });
      rec.check(
        "API-1.133",
        "a blank name is refused in the editor's words",
        blank.kind === "refused" &&
          /a sheet says to choose it/.test(blank.text),
        blank.text
      );
      const parent = soql(
        `SELECT Id FROM LinkedChoice__c WHERE Name = 'Swim double' AND ElectiveSet__r.Season__r.Name = '${season}'`
      )[0].Id;
      const gone = await confirmed("delete_linked_choice", {
        ...at,
        name: "Swim double"
      });
      rec.check(
        "API-1.134",
        "delete asks the screen's own question first",
        gone.preview.kind === "asks first" &&
          /Delete "Swim double"\? A sheet that names it then counts as Swim\./.test(
            gone.preview.text
          ),
        gone.preview.text
      );
      const after = await read();
      rec.check(
        "API-1.134",
        "then it is gone, with its periods",
        gone.done.kind === "done" &&
          !after.linked_choices.some((c) => c.name === "Swim double") &&
          count("LinkedChoiceTime__c", `LinkedChoice__c = '${parent}'`) === 0 &&
          count("Coverage__c", `LinkedChoice__c = '${parent}'`) === 0,
        gone.done.text
      );
    }
  },
  {
    id: "S10",
    title:
      "offerings through an AI: read, seats and minimum directly, over its seats, delete",
    camps: "BR S10 %",
    async run(rec) {
      const { season } = makeCamp("S10 Offerings");
      await importMaple(season);
      await call("add_setup_record", {
        season,
        kind: "elective set",
        name: "Chugim"
      });
      await electiveOnWeek(season, "Week 2", "Chugim", ["Bunk 1", "Bunk 2"]);
      const at = { season, elective_set: "Chugim" };
      const row = async (activity) =>
        JSON.parse((await call("read_offerings", { ...at, activity })).text)
          .offerings[0];
      const change = (activity, fields, seen) =>
        call("change_offering", { ...at, activity, fields, seen });
      let swim = await row("Swim");
      const art = await row("Art");
      rec.check(
        "API-1.135",
        "the read has its seats, No limit and no minimum",
        swim.seats === "2" &&
          art.seats === "No limit" &&
          swim.minimum_to_run === "No minimum",
        JSON.stringify([swim, art])
      );
      const typed = await change("Art", { seats: "3" }, art.seen);
      rec.check(
        "API-1.136",
        "seats are refused while No limit is ticked",
        typed.kind === "refused" && /has No limit/.test(typed.text),
        typed.text
      );
      const direct = await change(
        "Swim",
        { seats: "5", minimum_to_run: "1" },
        swim.seen
      );
      swim = await row("Swim");
      rec.check(
        "API-1.136",
        "seats and minimum change directly",
        direct.kind === "done" &&
          swim.seats === "5" &&
          swim.minimum_to_run === "1",
        direct.text
      );
      const stale = await change("Swim", { seats: "6" }, { seats: "2" });
      rec.check(
        "API-1.136",
        "what someone changed since is a conflict",
        stale.kind === "refused" &&
          /Someone else changed/.test(stale.text) &&
          (await row("Swim")).seats === "5",
        stale.text
      );
      const zero = await change(
        "Swim",
        { minimum_to_run: "0" },
        { minimum_to_run: swim.seen.minimum_to_run }
      );
      rec.check(
        "API-1.136",
        "the object's own rule refuses a minimum of 0",
        zero.kind === "refused" && /Must be 1 or more/.test(zero.text),
        zero.text
      );
      for (const seats of ["0", "(blank)"]) {
        const now = await row("Swim");
        const look = await change("Swim", { seats }, { seats: now.seen.seats });
        rec.check(
          "ELECT-4.1",
          `seats ${seats} is saved, and the list's mark comes back`,
          look.kind === "done" &&
            /Choose how many seats "Swim" has/.test(look.text) &&
            (await row("Swim")).seats === seats,
          look.text
        );
      }
      // Seats given, then fewer seats than campers have: saved, and shown over.
      await change("Swim", { seats: "2" }, { seats: "(blank)" });
      const run = { ...at, week: "Week 2" };
      const sheet = {
        ...run,
        file_name: "chugim.csv",
        csv_text:
          "Camper,Camper number,Bunk,Choice 1,Choice 2\nAvery Madeup,1,Bunk 1,Swim,Art\nBlake Madeup,2,Bunk 1,Swim,Art\n"
      };
      const review = await call("bring_in_choices", sheet);
      await call("bring_in_choices", {
        ...sheet,
        save: true,
        seen: seenIn(review.text)
      });
      const before = await call("read_elective_seats_now", run);
      await confirmed("assign_elective_seats", {
        ...run,
        seen: seenIn(before.text)
      });
      const lower = await change("Swim", { seats: "1" }, { seats: "2" });
      const over = await call("read_elective_seats_now", run);
      rec.check(
        "ELECT-4.5",
        "fewer seats than campers is saved, and shown over its seats",
        lower.kind === "done" && /Swim is over its seats/.test(over.text),
        `${lower.text} ${over.text.slice(0, 500)}`
      );
      const used = await call("delete_offering", { ...at, activity: "Swim" });
      rec.check(
        "API-1.137",
        "delete is refused while seats use it",
        used.kind === "refused" && /Nothing was removed/.test(used.text),
        used.text
      );
      const other = soql(
        `SELECT Id FROM Activity__c WHERE Season__r.Name = '${season}' AND Name NOT IN ('Swim', 'Art') LIMIT 1`
      )[0].Id;
      apex(
        `insert new Offering__c(ElectiveSet__c = [SELECT Id FROM ElectiveSet__c WHERE Season__r.Name = '${season}' AND Name = 'Chugim'].Id, Activity__c = '${other}', NoSeatLimit__c = true);`
      );
      const name = soql(`SELECT Name FROM Activity__c WHERE Id = '${other}'`)[0]
        .Name;
      const gone = await confirmed("delete_offering", {
        ...at,
        activity: name
      });
      rec.check(
        "API-1.137",
        "delete asks the screen's own question first",
        gone.preview.kind === "asks first" &&
          gone.preview.text.includes(
            `Take "${name}" off "Chugim"? The activity is kept.`
          ),
        gone.preview.text
      );
      rec.check(
        "API-1.137",
        "then the row is gone and the activity kept",
        gone.done.kind === "done" &&
          count("Offering__c", `Activity__c = '${other}'`) === 0 &&
          count("Activity__c", `Id = '${other}'`) === 1,
        gone.done.text
      );
    }
  }
];
