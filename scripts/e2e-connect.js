#!/usr/bin/env node
/**
 * End-to-end check of the command line and code mode against the real test org (shoresh-test),
 * by the rules in docs/protocol/api.md (Command line API-1.109 to 1.113, Code mode API-1.114 to
 * 1.116, and API-1.105, 1.106, 1.108 they carry). Not run in CI: run it by hand, once, with
 *
 *   node scripts/e2e-connect.js
 *
 * It runs the connector as a camp gets it (the ShoreshConnect static resource's shoresh.js and
 * code.js, so the build engine and the screens' modules are there), on its own made-up camp,
 * "E2E Pinecrest (made up)", made by scripts/apex/e2e-pinecrest-seed.apex and taken out again
 * by scripts/apex/e2e-pinecrest-cleanup.apex. Every command names that camp's season, so no other
 * camp (Cedar Ridge, Hermes's) is ever read or changed. It holds the org lock
 * (/tmp/shoresh-test-org.lock) and refuses to start while a CI Scratch-org job is queued or
 * running. Files the downloads make in ~/Downloads are removed again. It prints a pass/fail table.
 *
 * The ask-first round trip (preview, then the same request with its confirm) is done once, on a
 * version this check saved itself: here the check is the person saying yes. A product script must
 * never do that without a person (API-1.116).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SHIPPED = path.join(
  ROOT,
  "force-app/main/default/staticresources/ShoreshConnect"
);
const ORG = "shoresh-test";
const LOCK = "/tmp/shoresh-test-org.lock";
const SEASON = "E2E Pinecrest Summer 2027";
const { PERSON_DECIDES, NOT_YET } = require(path.join(SHIPPED, "client.js"));
const { toolResult } = require(path.join(SHIPPED, "mcp.js"));

// ---------- the org: CI not using it, the lock, the camp ----------

function ciUsingTheOrg() {
  for (const status of ["in_progress", "queued"]) {
    const runs = JSON.parse(
      execFileSync("gh", [
        "run",
        "list",
        "--repo",
        "ShoreshHQ/shoresh-scheduling",
        "--status",
        status,
        "--json",
        "databaseId"
      ])
    );
    for (const { databaseId } of runs) {
      const jobs = JSON.parse(
        execFileSync("gh", [
          "run",
          "view",
          String(databaseId),
          "--repo",
          "ShoreshHQ/shoresh-scheduling",
          "--json",
          "jobs"
        ])
      ).jobs;
      if (
        jobs.some((j) => /Scratch org/.test(j.name) && j.status !== "completed")
      ) {
        return true;
      }
    }
  }
  return false;
}

function apex(file) {
  const out = spawnSync(
    "sf",
    [
      "apex",
      "run",
      "--file",
      path.join(ROOT, "scripts/apex", file),
      "--target-org",
      ORG,
      "--json"
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const said = JSON.parse(out.stdout || "{}");
  if (!said.result?.success) {
    throw new Error(
      `${file} failed: ${said.result?.compileProblem || said.result?.exceptionMessage || said.message || "no answer"}`
    );
  }
}

// ---------- one command, and the rules every answer is held to ----------

const DOWNLOADS = path.join(os.homedir(), "Downloads");
const listDownloads = () =>
  fs.existsSync(DOWNLOADS) ? new Set(fs.readdirSync(DOWNLOADS)) : new Set();

function cli(args) {
  const run = spawnSync(
    process.execPath,
    [path.join(SHIPPED, "shoresh.js"), ...args, "--org", ORG],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return { code: run.status, out: run.stdout, err: run.stderr };
}

const KIND = { 0: "done", 2: "refused", 3: "asks first", 1: "couldn't ask" };
// A sign-in address, session or token (API-1.113).
const SECRET =
  /frontdoor\.jsp|secur\/|login\.salesforce\.com|sid=|access_token|Bearer |00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]+/;

/** The rule checks for one command's answer: [ruleId, passed, why] each. */
function checksFor(action, takesSeason, said, expect, csv) {
  const { code, out, err } = said;
  const kind = KIND[code] ?? `exit ${code}`;
  const text = code === 2 || code === 1 ? err : out;
  const checks = [];
  checks.push([
    "API-1.111",
    code === 0 || code === 2 || code === 3,
    `exit ${code} (${kind})`
  ]);
  if (expect !== "any") {
    checks.push(["expected", kind === expect, `wanted ${expect}`]);
  }
  checks.push([
    "API-1.110",
    code === 2 || code === 1
      ? out === "" && err !== ""
      : out !== "" && (err === "" || (csv && /^Season used: /.test(err))),
    "stdout for done and ask-first, stderr for refusals"
  ]);
  if (code === 2) {
    checks.push([
      "API-1.105",
      text.includes(PERSON_DECIDES),
      "a refusal ends with the person decides"
    ]);
  }
  if (code === 3) {
    checks.push([
      "API-1.106",
      text.startsWith(NOT_YET) && /confirm: "[^"]+"/.test(text),
      "a preview says nothing was done and gives a confirm"
    ]);
  }
  if (takesSeason && code !== 1) {
    const used = /^Season used: (.*)\.$/m.exec(out + err)?.[1];
    checks.push([
      "API-1.108",
      used === SEASON,
      used ? `Season used: ${used}` : "no Season used line"
    ]);
  }
  checks.push(["API-1.113", !SECRET.test(out + err), "no sign-in or token"]);
  return checks;
}

const rows = [];
const ctx = {};

/** Runs one command, holds its answer to the rules, and keeps it for later steps. */
function step(action, input = {}, expect = "done") {
  const args = [action];
  const schema = require(path.join(SHIPPED, "capabilities.js")).byName(action)
    .inputSchema.properties;
  const withSeason = schema.season ? { season: SEASON, ...input } : input;
  for (const [field, value] of Object.entries(withSeason)) {
    if (field === "file" && action.startsWith("bring_in_")) {
      args.push("--file", value);
    } else if (value === true && field === "as_csv") {
      args.push("--csv");
    } else {
      args.push(
        `--${field}`,
        typeof value === "string" ? value : JSON.stringify(value)
      );
    }
  }
  const said = cli(args);
  const checks = checksFor(
    action,
    Boolean(schema.season),
    said,
    expect,
    input.as_csv === true
  );
  rows.push({
    what: `cli ${action}`,
    kind: KIND[said.code] ?? `exit ${said.code}`,
    checks,
    said: (said.code === 0 || said.code === 3 ? said.out : said.err).trim()
  });
  return said.code === 0 || said.code === 3 ? said.out : said.err;
}

/** A value an answer said, by its JSON name ("seen": "..."), or undefined. */
function said(text, name) {
  const m = new RegExp(
    `"${name}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\\{[^}]*\\})`
  ).exec(text);
  return m ? JSON.parse(m[1]) : undefined;
}
const confirmIn = (text) => /confirm: "([^"]+)"/.exec(text)?.[1];

// ---------- every command, once ----------

function everyCommand(tmp) {
  const week = { week: "Week 1" };
  step("list_seasons", {}, "done");
  // Setup reads and changes.
  const words = step("read_camp_words");
  step("read_setup_record", { kind: "activity", name: "Swim" });
  const swim = step("read_setup_record", { kind: "location", name: "Pool" });
  step(
    "change_setup_record",
    {
      kind: "location",
      name: "Pool",
      fields: { groups_that_fit: "3" },
      seen: { groups_that_fit: said(swim, "groups_that_fit") ?? "2" }
    },
    "any"
  );
  step(
    "add_setup_record",
    { kind: "location", name: "Lake", fields: { groups_that_fit: "2" } },
    "any"
  );
  step(
    "rename_setup_record",
    { kind: "location", name: "Lake", new_name: "Lakefront" },
    "any"
  );
  step("read_setup_delete", { kind: "location", name: "Lakefront" }, "any");
  const del = step(
    "delete_setup_record",
    { kind: "location", name: "Lakefront" },
    "asks first"
  );
  ctx.deleteConfirm = confirmIn(del);
  step("read_activity_rules", { name: "Art" });
  step(
    "change_activity_rules",
    { name: "Art", fields: { notes: "Bring smocks" }, seen: { notes: "" } },
    "any"
  );
  step(
    "fill_in_weeks",
    { seen: { start_date: "2027-07-05", end_date: "2027-07-16" } },
    "any"
  );
  step(
    "change_camp_words",
    { words: { group: "Bunk / Bunks" }, seen: { group: "(blank)" } },
    "any"
  );
  step(
    "change_season",
    { fields: { end_date: "2027-07-16" }, seen: { end_date: "2027-07-16" } },
    "any"
  );
  step("read_same_locations", { name: "Pool" }, "any");
  step("merge_locations", { name: "Pool", seen: { Pool: "3" } }, "any");
  step("read_setup_guesses");
  step(
    "confirm_setup_guess",
    {
      kind: "activity",
      name: "Swim",
      field: "how_often",
      seen: "1 to 5 a week"
    },
    "any"
  );
  step("read_proposed_offerings");
  step(
    "confirm_proposed_offering",
    { activity: "Swim", seen: "proposed" },
    "any"
  );
  const copy = step("read_season_copy", { start_date: "2028-07-03" }, "any");
  step(
    "copy_season",
    {
      name: "E2E Pinecrest Summer 2028",
      start_date: "2028-07-03",
      seen: said(copy, "seen") ?? { season: "x" }
    },
    "any"
  );
  // Bring in from another system.
  const file = (name, records) => {
    const f = path.join(tmp, `${name}.json`);
    fs.writeFileSync(f, JSON.stringify({ records }));
    return f;
  };
  const src = { season: SEASON, source_system: "E2E made-up system" };
  step(
    "bring_in_divisions",
    {
      file: file("divisions", [
        { ...src, division_name: "Juniors", program: "Main" }
      ])
    },
    "any"
  );
  step(
    "bring_in_groups",
    {
      file: file("groups", [
        { ...src, group_name: "Bunk 1", division: "Juniors" }
      ])
    },
    "any"
  );
  step(
    "bring_in_activities",
    { file: file("activities", [{ ...src, activity_name: "Swim" }]) },
    "any"
  );
  step(
    "bring_in_campers",
    {
      file: file("campers", [
        {
          ...src,
          camper_id: "E2E-1",
          camper_name: "Avery Madeup",
          camper_number: "1"
        }
      ])
    },
    "any"
  );
  step(
    "bring_in_camper_groups",
    {
      file: file("camper_groups", [
        {
          ...src,
          camper_id: "E2E-1",
          camper_name: "Avery Madeup",
          bunk: "Bunk 1",
          week: "Week 1"
        }
      ])
    },
    "any"
  );
  step(
    "bring_in_camper_elective_choices",
    {
      file: file("choices", [
        {
          ...src,
          camper_id: "E2E-1",
          camper_name: "Avery Madeup",
          elective: "Chugim",
          week: "Week 1",
          first_choice: "Swim",
          second_choice: "Art"
        }
      ])
    },
    "any"
  );
  // The week: build, check, publish, read.
  step("build_week", week);
  const checks = step("read_week_checks", week);
  ctx.seen = said(checks, "seen");
  const finding = /"([^"]+: \d+ of \d+)"/.exec(checks)?.[1];
  step(
    "accept_finding",
    { ...week, finding: finding ?? "Swim: 1 of 2" },
    "any"
  );
  step("publish_week", week);
  const csv = step("read_group_schedule", { ...week, as_csv: true });
  step("read_group_schedule", week);
  step("read_activity_schedule", week);
  step("read_elective_offerings", week, "any");
  step("read_elective_seats", week, "any");
  // A cell from what was published: Bunk 1, Monday, Period 1.
  const cell =
    /Week 1,2027-07-05,Bunk 1,Period 1,[^,]*,[^,]*,([^\n]*)/
      .exec(csv)?.[1]
      ?.trim() ?? "Art";
  const other = cell === "Soccer" ? "Art" : "Soccer";
  const at = { ...week, group: "Bunk 1", day: "Monday", time: "Period 1" };
  step(
    "change_schedule_cell",
    { ...at, was: cell, activity: other, seen: ctx.seen },
    "any"
  );
  const undo = step("undo_last_agent_change", week, "asks first");
  ctx.undoConfirm = confirmIn(undo);
  ctx.seen = said(step("read_week_checks", week), "seen");
  step(
    "move_cell",
    {
      ...week,
      day: "Monday",
      group: "Bunk 1",
      time: "Period 1",
      was: cell,
      to_day: "Tuesday",
      to_group: "Bunk 1",
      to_time: "Period 1",
      seen: ctx.seen
    },
    "any"
  );
  ctx.seen = said(step("read_week_checks", week), "seen");
  step(
    "take_out_cell",
    {
      ...week,
      day: "Wednesday",
      group: "Bunk 2",
      time: "Period 2",
      was: "x",
      seen: ctx.seen
    },
    "any"
  );
  step(
    "copy_cells",
    {
      ...week,
      day: "Monday",
      groups: ["Bunk 1"],
      time: "Period 2",
      to_day: "Thursday",
      to_group: "Bunk 3",
      to_time: "Period 2",
      seen: ctx.seen
    },
    "any"
  );
  ctx.seen = said(step("read_week_checks", week), "seen");
  step(
    "switch_to_rain_plans",
    { ...week, day: "Friday", seen: ctx.seen },
    "any"
  );
  ctx.seen = said(step("read_week_checks", week), "seen");
  step(
    "lock_cells",
    { ...week, day: "Monday", group: "Bunk 4", seen: ctx.seen },
    "any"
  );
  ctx.seen = said(step("read_week_checks", week), "seen");
  step(
    "unlock_cells",
    { ...week, day: "Monday", group: "Bunk 4", seen: ctx.seen },
    "any"
  );
  // A group or day left out is refused, never widened (API-1.107).
  step(
    "lock_cells",
    { ...week, day: "Monday", group: "", seen: ctx.seen },
    "refused"
  );
  step("read_setup_changes", week, "any");
  step("update_to_match_setup", { ...week, changes: [], seen: "x" }, "any");
  // Versions.
  step("save_version", { ...week, name: "E2E try" });
  step("list_versions", week);
  step(
    "rename_version",
    { ...week, version: "E2E try", name: "E2E try 2" },
    "any"
  );
  const delv = step(
    "delete_version",
    { ...week, version: "E2E try 2" },
    "asks first"
  );
  // A confirm that isn't this preview's is refused with nothing done (API-1.106).
  step(
    "delete_version",
    { ...week, version: "E2E try 2", confirm: "not-the-one" },
    "refused"
  );
  // The round trip, on this check's own version (here the check is the person saying yes).
  if (confirmIn(delv)) {
    step(
      "delete_version",
      { ...week, version: "E2E try 2", confirm: confirmIn(delv) },
      "done"
    );
  }
  step("restore_version", { ...week, version: "Published" }, "any");
  step("unpublish_week", week, "any");
  step("start_manual_week", { week: "Week 2" }, "any");
  // Electives (this camp has no elective set: Shoresh says so).
  step("read_elective_seats_now", week, "any");
  step("assign_elective_seats", { ...week, seen: "x" }, "any");
  step(
    "move_elective_seat",
    {
      ...week,
      camper: "Avery Madeup",
      day: "Monday",
      time: "Period 1",
      elective: "Swim",
      seen: "x"
    },
    "any"
  );
  step(
    "lock_elective_seat",
    {
      ...week,
      camper: "Avery Madeup",
      day: "Monday",
      time: "Period 1",
      locked: true,
      seen: "x"
    },
    "any"
  );
  step("start_new_elective_version", { ...week, seen: "x" }, "any");
  step("finalize_electives", week, "any");
  const clear = step("read_electives_to_clear", {}, "any");
  step("clear_electives", { seen: said(clear, "seen") ?? "x" }, "any");
  // Special days and events.
  step("add_setup_record", { kind: "special day", name: "Color war" }, "any");
  step("read_special_days");
  step(
    "put_special_day_on_day",
    {
      special_day: "Color war",
      week: "Week 2",
      day: "Wednesday",
      seen: "none"
    },
    "any"
  );
  step(
    "take_special_day_off_day",
    {
      special_day: "Color war",
      week: "Week 2",
      day: "Wednesday",
      seen: "Color war"
    },
    "any"
  );
  step(
    "place_special_event",
    {
      ...week,
      event: "Campfire",
      day: "Monday",
      groups: ["Bunk 1"],
      time: "Period 4"
    },
    "any"
  );
  const special = step(
    "read_special_schedule",
    { special: "Color war" },
    "any"
  );
  step(
    "change_special_schedule_cell",
    {
      special: "Color war",
      column: "Bunk 1",
      time: "Period 1",
      was: "Open",
      activity: "Swim"
    },
    "any"
  );
  step(
    "change_special_schedule_frame",
    {
      special: "Color war",
      action: "clear",
      seen: said(special, "seen") ?? "none"
    },
    "any"
  );
  step(
    "set_up_noted_item",
    { week: "Week 2", kind: "special day", name: "Color war" },
    "any"
  );
  // Imports.
  const csvText = "Activity,Location\nArchery,Field\n";
  step(
    "import_list",
    { list: "activities", file_name: "e2e.csv", csv_text: csvText },
    "any"
  );
  step("import_worksheet", { file_name: "e2e.csv", csv_text: csvText }, "any");
  step(
    "import_last_year",
    { files: [{ file_name: "e2e.csv", csv_text: csvText }] },
    "any"
  );
  step(
    "import_special_schedule",
    {
      special: "Color war",
      seen: said(special, "seen") ?? "none",
      file_name: "e2e.csv",
      csv_text: "Time,Bunk 1\n9:00 AM,Swim\n10:00 AM,Art\n"
    },
    "any"
  );
  const imports = step("read_last_imports", {}, "any");
  step("undo_import", { seen: said(imports, "seen") ?? "x" }, "any");
  step("read_failed_sends");
  // Files (removed from ~/Downloads afterwards).
  step("download_schedule", week, "any");
  step("download_special_schedule", { special: "Color war" }, "any");
  step("download_elective_files", week, "any");
  step("download_setup", {}, "any");
  // Learned answers.
  const learned = step("read_learned_answers", {}, "any");
  const answerId = said(learned, "answer_id");
  step(
    "change_learned_answer",
    {
      answer_id: answerId ?? "none",
      answer: "x",
      seen: said(learned, "seen") ?? "x"
    },
    "any"
  );
  step(
    "forget_learned_answer",
    { answer_id: answerId ?? "none", seen: said(learned, "seen") ?? "x" },
    "any"
  );
  step("forget_learned_pattern", { pattern: "none", seen: "x" }, "any");
  step("undo_learned_answer", { undo: "none" }, "any");
  // The ask-first previews from earlier were never confirmed: nothing was taken away.
  ctx.unconfirmed = [ctx.deleteConfirm, ctx.undoConfirm].filter(Boolean).length;
}

// ---------- code mode: one script, several calls ----------

async function codeMode() {
  const shoresh = require(path.join(SHIPPED, "code.js"));
  const opt = { org: ORG };
  const week = { season: SEASON, week: "Week 1" };
  const add = (what, checks, answer) =>
    rows.push({
      what: `code ${what}`,
      kind: answer.asksFirst ? "asks first" : answer.ok ? "done" : "refused",
      checks,
      said: String(answer.text).slice(0, 200)
    });

  const published = await shoresh.publish_week(week, opt);
  add(
    "publish_week",
    [
      [
        "API-1.114",
        published.ok && published.season === SEASON,
        `season ${published.season}`
      ]
    ],
    published
  );

  const seasons = await shoresh.list_seasons({}, opt);
  add(
    "list_seasons",
    [
      [
        "API-1.114",
        seasons.ok && seasons.text.includes(SEASON),
        "names the camp's season"
      ]
    ],
    seasons
  );

  // The same read through code mode and the command line: the same lines (API-1.114, 1.110).
  const read = await shoresh.read_group_schedule(week, opt);
  const typed = cli([
    "read_group_schedule",
    "--season",
    SEASON,
    "--week",
    "Week 1"
  ]);
  const lines = toolResult(read)
    .content.map((c) => c.text)
    .join("\n");
  add(
    "read_group_schedule",
    [
      [
        "API-1.114",
        lines === typed.out.trim(),
        "same lines as the command line and MCP"
      ],
      ["API-1.108", read.season === SEASON, `season ${read.season}`]
    ],
    read
  );

  const saved = await shoresh.save_version(
    { ...week, name: "E2E code mode" },
    opt
  );
  add(
    "save_version",
    [
      [
        "API-1.114",
        saved.ok && saved.season === SEASON,
        `season ${saved.season}`
      ]
    ],
    saved
  );

  const preview = await shoresh.delete_version(
    { ...week, version: "E2E code mode" },
    opt
  );
  add(
    "delete_version (no confirm)",
    [
      [
        "API-1.115",
        preview.ok === true && preview.asksFirst === true,
        "told apart from done"
      ],
      [
        "API-1.116",
        String(preview.text).startsWith(NOT_YET),
        "nothing done, nothing confirmed by itself"
      ]
    ],
    preview
  );

  const wrong = await shoresh.delete_version(
    { ...week, version: "E2E code mode", confirm: "not-the-one" },
    opt
  );
  add(
    "delete_version (wrong confirm)",
    [
      [
        "API-1.106",
        !wrong.ok && wrong.status === 409,
        `status ${wrong.status}`
      ],
      [
        "API-1.105",
        String(wrong.text).endsWith(PERSON_DECIDES),
        "ends with the person decides"
      ]
    ],
    wrong
  );

  const versions = await shoresh.list_versions(week, opt);
  add(
    "list_versions",
    [
      [
        "API-1.106",
        versions.ok && versions.text.includes("E2E code mode"),
        "the version is still there"
      ]
    ],
    versions
  );

  // The round trip, once, on this script's own version (the check is the person here).
  const ticket = confirmIn(preview.text);
  const done = await shoresh.delete_version(
    { ...week, version: "E2E code mode", confirm: ticket },
    opt
  );
  add(
    "delete_version (its own confirm)",
    [
      [
        "API-1.106",
        done.ok && !done.asksFirst,
        "done with the confirm its preview gave"
      ]
    ],
    done
  );
}

// ---------- the run ----------

function table() {
  let failed = 0;
  const out = [
    "",
    "what                                       answer      result  rules"
  ];
  for (const row of rows) {
    const bad = row.checks.filter(([, ok]) => !ok);
    if (bad.length) failed++;
    out.push(
      `${row.what.padEnd(42)} ${row.kind.padEnd(11)} ${bad.length ? "FAIL" : "pass"}    ${row.checks
        .map(([id, ok, why]) => (ok ? id : `${id} FAILED (${why})`))
        .join(", ")}`
    );
  }
  out.push(
    "",
    `${rows.length - failed} passed, ${failed} failed, of ${rows.length}.`
  );
  return { text: out.join("\n"), failed };
}

async function run() {
  if (ciUsingTheOrg()) {
    console.error(
      "A CI Scratch-org job is queued or running; try again when it's done."
    );
    return 1;
  }
  try {
    fs.mkdirSync(LOCK);
  } catch {
    console.error(`Someone holds the org lock (${LOCK}); try again later.`);
    return 1;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-connect-"));
  const before = listDownloads();
  try {
    apex("e2e-pinecrest-cleanup.apex");
    apex("e2e-pinecrest-seed.apex");
    everyCommand(tmp);
    await codeMode();
  } finally {
    try {
      apex("e2e-pinecrest-cleanup.apex");
    } catch (e) {
      console.error(`Cleanup didn't finish: ${e.message}`);
    }
    for (const f of listDownloads()) {
      if (!before.has(f)) fs.rmSync(path.join(DOWNLOADS, f), { force: true });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmdirSync(LOCK);
  }
  const { text, failed } = table();
  console.log(text);
  if (process.argv.includes("--answers")) {
    for (const row of rows)
      console.log(`\n## ${row.what} (${row.kind})\n${row.said.slice(0, 600)}`);
  }
  return failed ? 2 : 0;
}

if (require.main === module) {
  run().then(
    (code) => (process.exitCode = code),
    (e) => {
      console.error(e.message);
      process.exitCode = 1;
    }
  );
}
