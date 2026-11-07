/** What several break-and-rebuild scenarios share: last year's samples and reading a week back. */
const fs = require("fs");
const path = require("path");
const { ROOT, call, soql, apex, esc } = require("./lib");

const SAMPLES = path.join(ROOT, "docs/samples");
const sample = (...p) => fs.readFileSync(path.join(SAMPLES, ...p), "utf8");

/** Maple Grove's by-group files (docs/samples/import). */
const mapleFiles = () =>
  fs
    .readdirSync(path.join(SAMPLES, "import"))
    .filter((f) => /Bunk \d\.csv$/.test(f))
    .map((f) => ({ file_name: f, csv_text: sample("import", f) }));

const MUSIC = "similar|activity|music|musik|Music|Musik";
const seenOf = (t) => /seen: "([^"]+)"/.exec(t)?.[1];

/** Reviews then saves files through Import last year; answers the review's final answer. */
async function importYear(season, files, answers = {}) {
  const review = await call("import_last_year", { season, files, answers });
  if (review.kind !== "done") return review;
  return call("import_last_year", {
    season,
    files,
    answers,
    save: true,
    seen: seenOf(review.text)
  });
}

/** Maple Grove in a camp, with Week 1's file kept as a version. */
const importMaple = (season) =>
  importYear(season, mapleFiles(), {
    [MUSIC]: "a",
    "week|the file's week": "Week 1"
  });

/** The week's draft as read_week_draft says it: { seen, checks, cell(day, group, time), rows }. */
async function draft(season, week = "Week 1", extra = {}, as) {
  const said = await call("read_week_draft", { season, week, ...extra }, as);
  if (said.kind !== "done") throw new Error(`read_week_draft: ${said.text}`);
  const body = JSON.parse(said.text);
  const rows = body.records.map((r) =>
    Object.fromEntries(body.columns.map((c, i) => [c, r[i]]))
  );
  return {
    ...body,
    rows,
    cell: (day, group, time) =>
      rows.find(
        (r) => r.day === day && r.group === group && r.time_block === time
      ),
    /** The cells' words, for comparing two reads of the same week. */
    words: rows
      .map((r) => `${r.date}|${r.group}|${r.time_block}|${r.activity}|${r.notes ?? ""}`)
      .join("\n")
  };
}

const checksOf = async (season, week = "Week 1", as) => {
  const said = await call("read_week_checks", { season, week }, as);
  if (said.kind !== "done") throw new Error(`read_week_checks: ${said.text}`);
  return JSON.parse(said.text);
};

const count = (object, where) =>
  soql(`SELECT Id FROM ${object} WHERE ${where}`).length;
const names = (object, where) =>
  soql(`SELECT Name FROM ${object} WHERE ${where}`)
    .map((r) => r.Name)
    .sort();

/**
 * An elective set on a week, as Manual Build's screen places it: test setup through Apex, since
 * an AI has no way to put an elective on a cell (campaign finding Q4). Monday, on the block named.
 */
function electiveOnWeek(season, week, set, groups, block = "Period 2") {
  return call("start_manual_week", { season, week }).then(() =>
    apex(`Schedule__c s = [SELECT Id FROM Schedule__c WHERE Program__r.Season__r.Name = '${esc(season)}' AND Week__r.Name = '${esc(week)}' AND Origin__c = 'Manual' AND Status__c = 'Draft' LIMIT 1];
ElectiveSet__c e = [SELECT Id, Name FROM ElectiveSet__c WHERE Season__r.Name = '${esc(season)}' AND Name = '${esc(set)}'];
ScheduleDays.DayGrid day = ScheduleDays.read(s.Id)[0];
ScheduleGrid g = day.grid;
g.items.add(new ScheduleGrid.Item('E', e.Id, e.Name));
String mark = String.valueOf(g.items.size());
Integer b = 0;
for (Integer i = 0; i < g.blocks.size(); i++) { if (g.blocks[i].name == '${esc(block)}') { b = i; } }
Set<String> names = new Set<String>{ ${groups.map((n) => `'${esc(n)}'`).join(", ")} };
for (Integer i = 0; i < g.groups.size(); i++) { if (names.contains(g.groups[i].name)) { g.rows[i][b] = mark; } }
ScheduleDaySaves.write(s.Id, new List<ScheduleDaySaves.DaySave>{ new ScheduleDaySaves.DaySave(day.day, g, day.revision) });`)
  );
}

const confirmed = async (action, input, as) => {
  const preview = await call(action, input, as);
  const confirm = /confirm: "([^"]+)"/.exec(preview.text)?.[1];
  return {
    preview,
    done: confirm
      ? await call(action, { ...input, confirm }, as)
      : preview
  };
};

module.exports = {
  SAMPLES,
  sample,
  mapleFiles,
  MUSIC,
  seenOf,
  importYear,
  importMaple,
  draft,
  checksOf,
  count,
  names,
  electiveOnWeek,
  confirmed
};
