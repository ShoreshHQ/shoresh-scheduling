/** S2: a whole season: import, build, lock, hand edit, rebuild, publish, undo the import, copy. */
const { call, makeCamp, soql } = require("../lib");
const { importMaple, draft, checksOf, count, names, confirmed, seenOf } = require("../kit");

module.exports = [
  {
    id: "S2",
    camps: "BR S2 %",
    title: "season: import, build, lock, hand edit, rebuild, publish, undo import, copy",
    async run(rec) {
      const { season } = makeCamp("S2 Season");
      const week = { season, week: "Week 1" };
      const inSeason = `Season__r.Name = '${season}'`;
      rec.check("API-1.84", "import saved", (await importMaple(season)).kind === "done");
      const built = await call("build_week", week);
      rec.check("API-1.20", "the week builds", built.kind === "done", built.text);
      let d = await draft(season);
      rec.check("CORE placed", "every cell the week has is placed", /^(\d+) of \1 placed/.test(d.checks.placed), d.checks.placed);

      // Pick an ordinary cell to lock and another to change by hand.
      const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      const free = d.rows.filter(
        (r) =>
          !r.notes &&
          r.activity !== "Open" &&
          mins(r.end_time) - mins(r.start_time) < 60
      );
      const toLock = free.find((r) => r.group === "Bunk 1");
      const toEdit = free.find((r) => r.group === "Bunk 2" && r.day === "Tuesday");
      const newName = toEdit.activity === "Art" ? "Soccer" : "Art";

      const noSeen = await call("lock_cells", { ...week, day: toLock.day, group: "Bunk 1", time: toLock.time_block });
      rec.check("LOCK-4.7", "a lock with no seen is refused", noSeen.kind === "refused", noSeen.text);
      const locked = await call("lock_cells", { ...week, day: toLock.day, group: "Bunk 1", time: toLock.time_block, seen: d.seen });
      rec.check("API-1.37", "the cell locks", locked.kind === "done", locked.text);
      d = await draft(season);
      rec.check("LOCK-4.8", "the week read names the lock", /locked/.test(d.cell(toLock.day, "Bunk 1", toLock.time_block).notes ?? ""), JSON.stringify(d.cell(toLock.day, "Bunk 1", toLock.time_block)));
      const fixed = d.rows.find((r) => r.activity === "Lunch");
      const lockFixed = await call("lock_cells", { ...week, day: fixed.day, group: fixed.group, time: fixed.time_block, seen: d.seen });
      rec.note("Locking a fixed activity (LOCK-1.3 says not offered)", `${lockFixed.kind}: ${lockFixed.text}`);
      d = await draft(season);

      const stale = await call("change_schedule_cell", { ...week, group: "Bunk 2", day: toEdit.day, time: toEdit.time_block, was: toEdit.activity, activity: newName, seen: "2020-01-01:1" });
      rec.check("LOCK-4.8", "a change from an old read is refused", stale.kind === "refused", stale.text);
      const overLock = await call("change_schedule_cell", { ...week, group: "Bunk 1", day: toLock.day, time: toLock.time_block, was: toLock.activity, activity: toLock.activity === "Art" ? "Soccer" : "Art", seen: d.seen });
      rec.check("LOCK-4.4", "a change over a locked cell isn't made silently", overLock.kind !== "done" || /locked/i.test(overLock.text), overLock.text);
      d = await draft(season);
      const edit = await call("change_schedule_cell", { ...week, group: "Bunk 2", day: toEdit.day, time: toEdit.time_block, was: toEdit.activity, activity: newName, seen: d.seen });
      rec.check("API-1.11", "a hand edit saves", edit.kind === "done", edit.text);
      d = await draft(season);
      const edited = d.cell(toEdit.day, "Bunk 2", toEdit.time_block);
      rec.check("API-1.11", "read back: the cell holds the new activity", edited.activity === newName, JSON.stringify(edited));
      rec.check("LOCK-1.1", "the hand edit locked the cell it changed", /locked/.test(edited.notes ?? ""), JSON.stringify(edited));
      rec.check("LOCK-1.1", "the lock made earlier is still there", /locked/.test(d.cell(toLock.day, "Bunk 1", toLock.time_block).notes ?? ""));

      // A Save version of what's there, a rebuild, the same inputs.
      const before = d;
      const rebuilt = await call("build_week", week);
      rec.check("LOCK-5.1", "the week rebuilds", rebuilt.kind === "done", rebuilt.text);
      d = await draft(season);
      rec.check("LOCK-4.3", "the rebuild keeps the locked cell", d.cell(toLock.day, "Bunk 1", toLock.time_block).activity === toLock.activity, JSON.stringify(d.cell(toLock.day, "Bunk 1", toLock.time_block)));
      rec.check("LOCK-4.3", "the rebuild keeps the hand edit", d.cell(toEdit.day, "Bunk 2", toEdit.time_block).activity === newName, JSON.stringify(d.cell(toEdit.day, "Bunk 2", toEdit.time_block)));
      rec.note("Rebuild changed unlocked cells?", String(d.words !== before.words));

      // Publish: a copy; later edits don't touch it.
      const published = await call("publish_week", week);
      rec.check("PUB-4.1", "publish", published.kind === "done", published.text);
      const out = await call("read_group_schedule", { ...week, as_csv: true });
      const outLine = out.text.split("\n").find((l) => l.includes(`,Bunk 2,${toEdit.time_block},`) && l.includes(toEdit.date));
      rec.check("PUB-4.1", "what goes out holds the hand edit", outLine?.includes(newName), outLine ?? out.text);
      const later = d.rows.find((r) => !r.notes && r.group === "Bunk 3" && r.activity !== "Open");
      const later2 = later.activity === "Art" ? "Soccer" : "Art";
      const change2 = await call("change_schedule_cell", { ...week, group: "Bunk 3", day: later.day, time: later.time_block, was: later.activity, activity: later2, seen: (await checksOf(season)).seen });
      rec.check("API-1.11", "an edit after publishing saves", change2.kind === "done", change2.text);
      const out2 = await call("read_group_schedule", { ...week, as_csv: true });
      rec.check("PUB-4.2", "the edit doesn't touch what's published", out2.text === out.text, out2.text.slice(0, 500));
      const draftNow = await call("read_week_draft", { ...week, group: "Bunk 3", day: later.day });
      rec.check("API-1.123", "the draft shows the edit", draftNow.text.includes(later2));

      // Undo the import: what a person made stays, and the published week stays (PUB-4.3).
      const pub1 = count("Schedule__c", `Program__r.${inSeason} AND Status__c = 'Published'`);
      const beforeUndo = names("Activity__c", inSeason);
      const seen = /Last import:[^;]*?seen: "([^"]+)"/.exec((await call("read_last_imports", { season })).text)?.[1];
      const undo = await confirmed("undo_import", { season, seen });
      rec.check("API-1.106", "Undo import asks first", undo.preview.kind === "asks first", undo.preview.text);
      rec.note("Undo import after build and publish says", `${undo.done.kind}: ${undo.done.text}`);
      rec.check("PUB-4.3", "the published week survives Undo import", count("Schedule__c", `Program__r.${inSeason} AND Status__c = 'Published'`) === pub1);
      rec.check("INGEST-5.10", "activities the built week uses are kept", d.rows.filter((r) => !r.notes && r.activity !== "Open").every((r) => names("Activity__c", inSeason).includes(r.activity)), `${beforeUndo.join()} -> ${names("Activity__c", inSeason).join()}`);
      rec.check("INGEST-5.10", "and named", /Kept/.test(undo.done.text) && undo.done.text.includes(toLock.activity), undo.done.text);
      const outAfter = await call("read_group_schedule", { ...week, as_csv: true });
      rec.check("PUB-4.3", "what's published reads the same after Undo import", outAfter.text === out.text, outAfter.text.slice(0, 500));
      if (undo.done.kind === "done") {
        let after;
        try {
          after = await draft(season);
        } catch (e) {
          after = null;
          rec.note("Week after Undo import can't be read", e.message);
        }
        if (after) {
          const lockNow = after.cell(toLock.day, "Bunk 1", toLock.time_block);
          rec.check("LOCK product", "a locked cell's activity survives Undo import", lockNow?.activity === toLock.activity, JSON.stringify(lockNow));
        }
      }

      // Import again after the Undo: the camp comes back, hand work kept, ready to copy.
      const back = await importMaple(season);
      rec.check("INGEST-5.10", "after Undo the same files import again", back.kind === "done", back.text);
      rec.check("INGEST-5.10", "and nothing doubles", new Set(names("Activity__c", inSeason)).size === names("Activity__c", inSeason).length, names("Activity__c", inSeason).join());
      rec.note("Import again after Undo says", back.text);
      let again;
      try {
        again = await draft(season);
      } catch (e) {
        rec.note("Week after importing again can't be read", e.message);
      }
      if (again) {
        rec.check("LOCK product", "the lock and the hand edit are still there after Undo and import again", again.cell(toLock.day, "Bunk 1", toLock.time_block)?.activity === toLock.activity && /locked/.test(again.cell(toLock.day, "Bunk 1", toLock.time_block)?.notes ?? "") && again.cell(toEdit.day, "Bunk 2", toEdit.time_block)?.activity === newName, JSON.stringify([again.cell(toLock.day, "Bunk 1", toLock.time_block), again.cell(toEdit.day, "Bunk 2", toEdit.time_block)]));
      }

      // Copy to next season: setup moves, the season copied stays, seen required.
      const next0 = "BR S2 Season 2028";
      const copyFrom = names("Activity__c", inSeason);
      const weeksFrom = soql(`SELECT Name, StartDate__c FROM Week__c WHERE ${inSeason} ORDER BY StartDate__c`);
      const preview = await call("read_season_copy", { season, start_date: "2028-06-26" });
      rec.check("API-1.61", "the copy's dates can be read", preview.kind === "done", preview.text);
      const wouldRun = /would run (.*?)\. /.exec(preview.text)?.[1] ?? "";
      const seenCopy = Object.fromEntries(wouldRun.split("; ").map((part) => part.split(": ")));
      const wrongShape = await call("copy_season", { season, name: next0, start_date: "2028-06-26", seen: "2028-06-26" });
      rec.check("API-1.105", "a wrong seen is refused saying what's wrong with it", wrongShape.kind === "refused" && /seen|dates/i.test(wrongShape.text) && !/fields/.test(wrongShape.text), wrongShape.text);
      const next = next0;
      const noSeenCopy = await call("copy_season", { season, name: next, start_date: "2028-06-26" });
      rec.check("API-1.62", "a copy with no seen is refused", noSeenCopy.kind === "refused", noSeenCopy.text);
      const copied = await confirmed("copy_season", { season, name: next, start_date: "2028-06-26", seen: seenCopy });
      rec.check("API-1.106", "Copy asks first", copied.preview.kind === "asks first", copied.preview.text);
      rec.check("WEEK-1.4", "the copy is made", copied.done.kind === "done", copied.done.text);
      const inNext = `Season__r.Name = '${next}'`;
      rec.check("WEEK-1.4", "activities copied", names("Activity__c", inNext).join() === copyFrom.join(), names("Activity__c", inNext).join());
      const weeksTo = soql(`SELECT Name, StartDate__c FROM Week__c WHERE ${inNext} ORDER BY StartDate__c`);
      const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
      rec.check("WEEK-1.4", "every week moved by the same number of days", weeksTo.length === weeksFrom.length && new Set(weeksTo.map((w, i) => days(weeksFrom[i].StartDate__c, w.StartDate__c))).size === 1, JSON.stringify(weeksTo));
      rec.check("WEEK-1.4", "the season copied is unchanged", names("Activity__c", inSeason).join() === copyFrom.join());
      rec.check("API-1.108", "with two seasons open and none named, the AI is refused", (await call("list_seasons", {})).kind === "done");
      const noneNamed = await call("read_week_checks", { week: "Week 1" });
      rec.note("A request naming no season when many camps exist", `${noneNamed.kind}: ${noneNamed.text.slice(0, 300)}`);
      const nextBuild = await call("build_week", { season: next, week: "Week 1" });
      rec.check("WEEK-1.4", "the copied season can build its week", nextBuild.kind === "done", nextBuild.text);
      const nextDraft = await draft(next);
      rec.check("WEEK-1.4", "the copied week is on the new dates", nextDraft.rows[0].date.startsWith("2028-06"), nextDraft.rows[0].date);
      rec.note("The copied week's cells carry locks?", String(nextDraft.rows.filter((r) => /locked/.test(r.notes ?? "") && !/fixed|recurring/.test(r.notes)).length));
    }
  }
];
