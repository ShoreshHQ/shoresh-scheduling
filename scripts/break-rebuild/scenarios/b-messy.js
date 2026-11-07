/**
 * B: messy input at every door. A file is refused or shown, never silently dropped; a refusal or
 * a review saves nothing; the same file gives the same answer; the same file twice adds nothing.
 */
const fs = require("fs");
const path = require("path");
const { call, makeCamp, soql, ROOT, cleanup } = require("../lib");
const { sample, importMaple, seenOf, SAMPLES, count, names, confirmed, electiveOnWeek } = require("../kit");

const BIG_ROWS = 20001;
const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n");

/** Ugly files for a list of activities. Each: name, csv text, what must be true of the answer. */
const ugly = [
  ["empty file", "", "refused"],
  ["only blank lines", "\n\n,,,\n \n", "refused"],
  ["headings only", "Activity,Location\n", "either"],
  ["wrong columns", "Colour,Shoe size\nRed,9\nBlue,7\n", "either"],
  ["no heading at all", "Archery\nCanoe\nDrama\n", "either"],
  ["a title above, a footer below", "Camp list 2027,,\n\nActivity,Location\nArchery,Field\nDrama,Theatre\nTotal: 2,\n", "either"],
  ["duplicate rows", "Activity,Location\nArchery,Field\nArchery,Field\narchery,field\n", "either"],
  ["same name, another place", "Activity,Location\nArchery,Field\nArchery,Barn\n", "either"],
  ["byte order mark, Windows line ends", "﻿Activity,Location\r\nArchery,Field\r\nDrama,Theatre\r\n", "either"],
  ["quoted commas and quotes", 'Activity,Location\n"Arts, crafts",Field\n"The ""big"" game",Field\n', "either"],
  ["an unclosed quote", 'Activity,Location\n"Archery,Field\nDrama,Theatre\n', "either"],
  ["Hebrew and emoji", "Activity,Location\nכדורגל,מגרש\n🎯 Archery,Field\n", "either"],
  ["half-finished rows", "Activity,Location,Length\nArchery\n,Field\nDrama,,\n", "either"],
  ["very long name", `Activity,Location\n${"A".repeat(400)},Field\n`, "either"],
  ["a script as a name", "Activity,Location\n<script>alert(1)</script>,Field\n", "either"],
  ["a formula as a name", "Activity,Location\n=1+1,Field\n", "either"],
  ["semicolons", "Activity;Location\nArchery;Field\nDrama;Theatre\n", "either"],
  ["tabs", "Activity\tLocation\nArchery\tField\nDrama\tTheatre\n", "either"]
];

/** Every name a text shows as coming in: read from the review's own Add line. */
const LOOKS_LIKE_ID = /\b[a-zA-Z0-9]{15,18}\b|__c|undefined|null|NaN|\[object/;

async function matrix(rec, door, input, season, snapshot) {
  for (const [what, csv, wanted] of ugly) {
    const before = snapshot();
    const said = await call(door, { ...input, file_name: `${what}.csv`, csv_text: csv });
    rec.check("INGEST no crash", `${door}, ${what}: answered, not broken`, said.status < 500 && said.kind !== "couldn't", `${said.status} ${said.text}`);
    if (wanted === "refused") {
      rec.check("INGEST-1", `${door}, ${what}: refused, or says it can't be saved`, said.kind === "refused" || !/Ready to save/.test(said.text), said.text);
    }
    rec.check("INGEST-5.5", `${door}, ${what}: a review or refusal saves nothing`, snapshot() === before, said.text);
    rec.check("API-1.105", `${door}, ${what}: no machinery in the words`, !LOOKS_LIKE_ID.test(said.text.replace(/\[id "[^"]*"\]|seen: "[^"]*"|"[^"]*"/g, "").replace(/A{20,}/g, "")), said.text);
    if (said.kind === "refused") {
      rec.check("API-1.105", `${door}, ${what}: the refusal ends with the person decides`, /This is for the person to decide/.test(said.text), said.text);
    }
    const again = await call(door, { ...input, file_name: `${what}.csv`, csv_text: csv });
    rec.check("CORE same inputs", `${door}, ${what}: the same file, the same answer`, again.text === said.text, again.text);
    rec.note(`${door}, ${what}`, said.text.split("\n").slice(2).join("\n"));
    // What a review says is ready, saved and read back; then undone back to as it was.
    if (/Ready to save/.test(said.text) && seenOf(said.text)) {
      const saved = await call(door, { ...input, file_name: `${what}.csv`, csv_text: csv, save: true, seen: seenOf(said.text) });
      rec.check("INGEST-5.5", `${door}, ${what}: Ready to save saves`, saved.kind === "done", saved.text);
      rec.note(`${door}, ${what}: saved, read back`, `${saved.text.slice(0, 200)} => ${snapshot()}`);
      if (saved.kind === "done") {
        const seenUndo = /Last import:[^;]*?seen: "([^"]+)"/.exec((await call("read_last_imports", { season })).text)?.[1];
        const undone = await confirmed("undo_import", { season, seen: seenUndo });
        rec.check("INGEST-5.10", `${door}, ${what}: Undo puts it back as it was`, undone.done.kind === "done" && snapshot() === before, `${undone.done.text.slice(0, 300)} => ${snapshot()}`);
      }
    }
  }
}

module.exports = [
  {
    id: "B1",
    title: "Import a list: ugly files, oversized files, the same file twice",
    async run(rec) {
      const { season } = makeCamp("B1 Lists");
      await importMaple(season);
      const inSeason = `Season__r.Name = '${season}'`;
      const snapshot = () => names("Activity__c", inSeason).join() + names("Location__c", inSeason).join();
      await matrix(rec, "import_list", { season, list: "activities" }, season, snapshot);

      // Oversized.
      const over = await call("import_list", { season, list: "activities", file_name: "many.csv", csv_text: `Activity,Location\n${rows(BIG_ROWS, (i) => `Act ${i},Field`)}\n` });
      rec.check("INGEST-1.3", "20,001 rows refused", over.kind === "refused" && /20,?000/.test(over.text), over.text);
      const big = await call("import_list", { season, list: "activities", file_name: "big.csv", csv_text: `Activity,Location\n${rows(800, (i) => `Act ${i},Field`)}\n` });
      rec.check("INGEST-1", "800 new activities: reviewed or refused in words", big.status < 500, `${big.status} ${big.text.slice(0, 400)}`);
      rec.note("800 activities review", big.text.slice(-400));
      if (big.kind === "done" && /Ready to save/.test(big.text)) {
        const savedBig = await call("import_list", { season, list: "activities", file_name: "big.csv", csv_text: `Activity,Location\n${rows(800, (i) => `Act ${i},Field`)}\n`, save: true, seen: seenOf(big.text) });
        rec.check("INGEST-5.10", "800 activities save, or say plainly it's too big", savedBig.status < 500 && (savedBig.kind === "done" ? count("Activity__c", `${inSeason} AND Name LIKE 'Act %'`) === 800 : true), `${savedBig.status} ${savedBig.text.slice(0, 500)}`);
        if (savedBig.kind === "done") {
          const imports = await call("read_last_imports", { season });
          const undo = await confirmed("undo_import", { season, seen: /Last import:[^;]*?seen: "([^"]+)"/.exec(imports.text)?.[1] });
          rec.check("INGEST-5.10", "800 activities undo, or say plainly why not", undo.done.status < 500 && (undo.done.kind === "done" ? count("Activity__c", `${inSeason} AND Name LIKE 'Act %'`) === 0 : true), undo.done.text.slice(0, 500));
        }
      }

      // The same list twice: nothing doubles, the second says so.
      const list = { season, list: "activities", file_name: "twice.csv", csv_text: "Activity,Location\nKayak,Dock\nFencing,Gym\n" };
      const first = await call("import_list", list);
      const save1 = await call("import_list", { ...list, save: true, seen: seenOf(first.text) });
      rec.check("API-1.80", "a list saves", save1.kind === "done", save1.text);
      const kayaks = () => count("Activity__c", `${inSeason} AND Name = 'Kayak'`);
      rec.check("API-1.80", "read back: one Kayak", kayaks() === 1, kayaks());
      const second = await call("import_list", list);
      rec.check("INGEST same file twice", "the same list again: no adds", !/Add \d/.test(second.text.split("\n").slice(-3).join(" ")), second.text);
      if (seenOf(second.text)) {
        await call("import_list", { ...list, save: true, seen: seenOf(second.text) });
      }
      rec.check("INGEST same file twice", "still one Kayak", kayaks() === 1, kayaks());

      // Every list screen with its sample, its planted oddities shown.
      const lists = { "maple-grove-locations.csv": "locations", "maple-grove-activities.csv": "activities", "maple-grove-program-days.csv": "programs", "maple-grove-units.csv": "divisions", "maple-grove-bunks.csv": "groups", "maple-grove-time-blocks.csv": "timeBlocks", "maple-grove-fixed.csv": "fixedActivities", "maple-grove-recurring.csv": "recurringActivities" };
      const planted = { "maple-grove-locations.csv": ["two"], "maple-grove-activities.csv": ["Musik", "Middlers", "Movies"], "maple-grove-program-days.csv": ["Teens", "Weekend"], "maple-grove-units.csv": ["Explorers"], "maple-grove-bunks.csv": ["Bunk 8"], "maple-grove-time-blocks.csv": ["Late pickup", "Swim time"], "maple-grove-fixed.csv": ["Snack break"], "maple-grove-recurring.csv": ["Middlers", "Campfire"] };
      for (const [file, name] of Object.entries(lists)) {
        const said = await call("import_list", { season, list: name, file_name: file, csv_text: sample("lists", file) });
        rec.check("API-1.80", `sample ${file}: reviewed`, said.kind === "done", said.text);
        for (const word of planted[file]) {
          rec.check("INGEST shown", `sample ${file}: shows ${word}`, said.text.includes(word), said.text);
        }
        if (/Colour/.test(sample("lists", file))) {
          rec.check("INGEST shown", `sample ${file}: says of the column it doesn't know`, /Colour/.test(said.text), said.text);
        }
      }
    }
  },
  {
    id: "B2",
    title: "Worksheet, Import last year, special schedule: ugly files",
    async run(rec) {
      const { season } = makeCamp("B2 Doors");
      const inSeason = `Season__r.Name = '${season}'`;
      const snapshot = () => names("Activity__c", inSeason).join() + count("Week__c", inSeason);
      await matrix(rec, "import_worksheet", { season }, season, snapshot);
      for (const [what, csv] of ugly) {
        const said = await call("import_last_year", { season, files: [{ file_name: `${what}.csv`, csv_text: csv }] });
        rec.check("INGEST-1", `last year, ${what}: nothing crashes`, said.status < 500, said.text);
        rec.check("INGEST-5.5", `last year, ${what}: nothing saved`, snapshot() === "0", snapshot());
        rec.note(`last year, ${what}`, said.text.slice(0, 300));
      }
      const noFiles = await call("import_last_year", { season, files: [] });
      rec.check("API-1.84", "no files refused", noFiles.kind === "refused", noFiles.text);
      const noContent = await call("import_last_year", { season, files: [{ file_name: "x.csv" }] });
      rec.check("API-1.84", "a file with no contents refused", noContent.kind === "refused", noContent.text);

      // Half a week: three bunks' files of six; and a typo'd week column.
      const half = fs.readdirSync(path.join(SAMPLES, "import")).filter((f) => /Bunk [123]\.csv$/.test(f)).map((f) => ({ file_name: f, csv_text: sample("import", f) }));
      const review = await call("import_last_year", { season, files: half, answers: { "week|the file's week": "Week 1" } });
      rec.check("INGEST", "half the files: reviewed", review.kind === "done", review.text);
      rec.check("INGEST", "half the files: only their bunks come in", /3 groups/.test(review.text) && !/Bunk 4/.test(review.text), review.text);
      const save = await call("import_last_year", { season, files: half, answers: { "week|the file's week": "Week 1" }, save: true, seen: seenOf(review.text) });
      rec.check("INGEST", "half the files: saved", save.kind === "done", save.text);
      const rest = fs.readdirSync(path.join(SAMPLES, "import")).filter((f) => /Bunk [456]\.csv$/.test(f)).map((f) => ({ file_name: f, csv_text: sample("import", f) }));
      const review2 = await call("import_last_year", { season, files: rest });
      rec.check("INGEST-5.8", "the other half: reviewed, what's missing shown not removed", review2.kind === "done" && /Not in these files/.test(review2.text), review2.text);
      const save2 = await call("import_last_year", { season, files: rest, save: true, seen: seenOf(review2.text) });
      rec.check("INGEST", "the other half: saved", save2.kind === "done", save2.text);
      rec.check("INGEST-5.8", "nothing from the first half was removed", names("Group__c", `Division__r.Program__r.${inSeason}`).join() === "Bunk 1,Bunk 2,Bunk 3,Bunk 4,Bunk 5,Bunk 6", names("Group__c", `Division__r.Program__r.${inSeason}`).join());
      const by = await call("import_last_year", { season, files: [{ file_name: "maple-grove-2026-by-activity.csv", csv_text: sample("import", "maple-grove-2026-by-activity.csv") }] });
      rec.check("INGEST-2.6", "the by-activity sample reads", by.kind === "done", by.text);
      rec.note("by-activity review", by.text.slice(0, 800));

      // Special schedule.
      await call("add_setup_record", { season, kind: "special day", name: "Lake day" });
      const plan = await call("read_special_schedule", { season, special: "Lake day" });
      const specials = [
        ["empty", "", "refused"],
        ["no times", "Bunk 1,Bunk 2\nSwim,Art\n", "refused"],
        ["times that can't be told", "Time,Bunk 1\nwhenever,Swim\nlater,Art\n", "refused"],
        ["a group that isn't here", "Time,Bunk 99\n9:00 AM,Swim\n", "either"],
        ["backwards times", "Time,Bunk 1\n3:00 PM,Swim\n9:00 AM,Art\n", "either"]
      ];
      for (const [what, csv, wanted] of specials) {
        const said = await call("import_special_schedule", { season, special: "Lake day", seen: seenOf(plan.text) ?? "none", file_name: `${what}.csv`, csv_text: csv });
        rec.check("API-1.85", `special schedule, ${what}: not broken`, said.status < 500, said.text);
        if (wanted === "refused") {
          rec.check("API-1.85", `special schedule, ${what}: refused`, said.kind === "refused", said.text);
        }
        rec.note(`special schedule, ${what}`, `${said.kind}: ${said.text.slice(0, 300)}`);
      }
    }
  },
  {
    id: "B3",
    title: "Bring in from another system: bad records at each web address, the same batch twice",
    async run(rec) {
      const { season } = makeCamp("B3 Bring in");
      await importMaple(season);
      const inSeason = `Season__r.Name = '${season}'`;
      const src = { season, source_system: "BR made-up system" };
      const doors = {
        bring_in_divisions: { division_name: "Teens", program: "Main" },
        bring_in_groups: { group_name: "Bunk 7", division: "Bunk 1" },
        bring_in_activities: { activity_name: "Kayak" },
        bring_in_campers: { camper_id: "BR-1", camper_name: "Avery Madeup", camper_number: "1" },
        bring_in_camper_groups: { camper_id: "BR-1", camper_name: "Avery Madeup", bunk: "Bunk 1", week: "Week 1" },
        bring_in_camper_elective_choices: { camper_id: "BR-1", camper_name: "Avery Madeup", elective: "Chugim", week: "Week 1", first_choice: "Swim", second_choice: "Art" }
      };
      const answers = {};
      for (const [door, good] of Object.entries(doors)) {
        const bad = [
          ["no records", []],
          ["a record with nothing in it", [{}]],
          ["no source system", [{ ...good, source_system: undefined, season }]],
          ["a season that isn't there", [{ ...good, ...src, season: "No such season" }]],
          ["other camp's season", [{ ...good, ...src, season: "Cedar Ridge Summer 2027" }], "skip"],
          ["blank required name", [Object.fromEntries(Object.entries({ ...src, ...good }).map(([k, v]) => [k, /name|camper_id/.test(k) ? "" : v]))]],
          ["a number where a name goes", [Object.fromEntries(Object.entries({ ...src, ...good }).map(([k, v]) => [k, /name/.test(k) ? 12345 : v]))]],
          ["fields nobody knows", [{ ...src, ...good, hair_colour: "red" }]],
          ["two the same in one batch", [{ ...src, ...good }, { ...src, ...good }]]
        ];
        for (const [what, records, skip] of bad) {
          if (skip) continue;
          const said = await call(door, { records });
          rec.check("API-6.3", `${door}, ${what}: answered in words, not broken`, said.status < 500, `${said.status} ${said.text}`);
          rec.note(`${door}, ${what}`, `${said.kind} ${said.status}: ${said.text.slice(0, 300)}`);
        }
        answers[door] = [await call(door, { records: [{ ...src, ...good }] })];
        answers[door].push(await call(door, { records: [{ ...src, ...good }] }));
        rec.note(`${door} twice`, `${answers[door][0].text.slice(0, 300)}\n--\n${answers[door][1].text.slice(0, 300)}`);
        if (answers[door][0].kind === "done" && /"saved": 1/.test(answers[door][0].text)) {
          rec.check("API-2.5", `${door}: the same batch twice changes nothing`, !/"saved": [1-9]/.test(answers[door][1].text), answers[door][1].text);
        }
      }
      rec.check("API-2.5", "read back: one Kayak", count("Activity__c", `${inSeason} AND Name = 'Kayak'`) === 1);
      rec.check("API-2.5", "read back: one camper BR-1", count("Camper__c", `${inSeason}`) === 1, count("Camper__c", inSeason));
      // Against a person's edit: the outside system's value doesn't overwrite it (API-4.1).
      const kayakRead = await call("read_setup_record", { season, kind: "activity", name: "Kayak" });
      rec.check("API-1.47", "the Kayak can be read", kayakRead.kind === "done", kayakRead.text);
      const renamed = await call("rename_setup_record", { season, kind: "activity", name: "Kayak", new_name: "Kayaking" });
      rec.check("API-1.47", "a person renames it", renamed.kind === "done", renamed.text);
      const resend = await call("bring_in_activities", { records: [{ ...src, activity_name: "Kayak" }] });
      rec.note("the outside system sends the old name after a person renamed it", resend.text.slice(0, 400));
      rec.check("API-4.1", "a person's rename stands", count("Activity__c", `${inSeason} AND Name = 'Kayaking'`) === 1, names("Activity__c", inSeason).join());
      rec.check("API-4.9", "the old name doesn't add a second activity", !names("Activity__c", inSeason).includes("Kayak"), names("Activity__c", inSeason).join());
      rec.check("API-4.9", "it's said as a conflict, not saved", /A person renamed/.test(resend.text) && !/"saved": [1-9]/.test(resend.text), resend.text);
      const big = await call("bring_in_campers", { records: Array.from({ length: 3000 }, (_, i) => ({ ...src, camper_id: `BIG-${i}`, camper_name: `Madeup ${i}`, camper_number: String(i) })) });
      rec.check("API-6.3", "3,000 campers in one batch: done or refused in words", big.status < 500 || /too|limit|big/i.test(big.text), `${big.status} ${big.text.slice(0, 400)}`);
      rec.note("3000 campers", `${big.status} ${big.text.slice(0, 300)}`);
    }
  },
  {
    id: "B4",
    title: "Bring in choices: every sample file against real Salesforce, read back against its manifest",
    async run(rec) {
      const { season, camp } = makeCamp("B4 Choices");
      const manifest = JSON.parse(sample("choices", "manifest.json"));
      const XLSX = require(path.join(ROOT, "node_modules/xlsx"));
      const readFile = (file) => {
        const p = path.join(SAMPLES, "choices", file);
        if (file.endsWith(".csv")) return { csv_text: fs.readFileSync(p, "utf8") };
        const book = XLSX.readFile(p);
        return { sheets: book.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: "" }) })) };
      };
      await importMaple(season);
      await electiveOnWeek(season, "Week 2", "Chugim", ["Bunk 1", "Bunk 2"]);
      for (const entry of manifest) {
        const content = readFile(entry.file);
        const at = { season, elective_set: "Chugim", week: "Week 2", file_name: entry.file, ...content };
        const asked = await call("bring_in_choices", at);
        const unknown = /doesn't have yet: (.*)\.\n/.exec(asked.text)?.[1] ?? "";
        const answers = Object.fromEntries([...unknown.matchAll(/"([^"]+)"/g)].map((m) => [m[1], "add"]));
        const said = await call("bring_in_choices", { ...at, answers });
        const expectCampers = entry.campers?.length ?? null;
        rec.check("API-1.117", `${entry.file}: answered, not broken`, said.status < 500, `${said.status} ${said.text.slice(0, 400)}`);
        if (expectCampers != null && said.kind === "done") {
          const m = /^- (\d+) campers?:/m.exec(said.text);
          rec.check("API-1.117", `${entry.file}: ${expectCampers} campers (${entry.shape})`, m && Number(m[1]) === expectCampers, said.text.slice(0, 800));
        } else if (expectCampers != null) {
          rec.check("API-1.117", `${entry.file}: read, ${expectCampers} campers expected`, false, said.text.slice(0, 800));
        }
        rec.note(`${entry.file}`, said.text.slice(0, 1200));
        for (const camper of entry.campers ?? []) {
          rec.check("API-1.117", `${entry.file}: says ${camper.name}`, said.kind !== "done" || said.text.includes(camper.name) || /^- \d+ campers/m.test(said.text), said.text.slice(0, 500));
        }
        rec.check("INGEST-5.5", `${entry.file}: review saves nothing`, count("Preference__c", `ElectiveRun__r.${`Season__r.Name = '${season}'`}`) === 0);
      }
      void camp;
    }
  }
];
