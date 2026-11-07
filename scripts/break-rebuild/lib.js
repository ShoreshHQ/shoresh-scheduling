/**
 * The break-and-rebuild campaign's kit (wiki projects/shoresh-break-rebuild-2026-11.md): the org
 * lock taken per scenario, calls through the connector as a camp gets it, as any signed-in person,
 * read-backs from the org, and made-up camps named "BR ... (made up)" that are made and taken out
 * again. Not run in CI. It never reads or changes a camp whose name doesn't start with "BR ".
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const SHIPPED = path.join(
  ROOT,
  "force-app/main/default/staticresources/ShoreshConnect"
);
const ORG = "shoresh-test";
const LOCK = "/tmp/shoresh-test-org.lock";
const PREFIX = "BR ";
const code = require(path.join(SHIPPED, "code.js"));

// ---------- the org: CI not using it, the lock, the code in it ----------

function ciUsingTheOrg() {
  for (const status of [
    "in_progress",
    "queued",
    "waiting",
    "pending",
    "requested"
  ]) {
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
      const { jobs } = JSON.parse(
        execFileSync("gh", [
          "run",
          "view",
          String(databaseId),
          "--repo",
          "ShoreshHQ/shoresh-scheduling",
          "--json",
          "jobs"
        ])
      );
      // A run that hasn't listed its jobs yet may be about to take the org.
      if (
        !jobs.length ||
        jobs.some((j) => /Scratch org/.test(j.name) && j.status !== "completed")
      ) {
        return true;
      }
    }
  }
  return false;
}

const sleep = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Runs fn holding the org lock, waiting (lock free) while CI or someone else has the org. */
async function withOrg(fn) {
  let said = false;
  for (;;) {
    let busy = true;
    try {
      busy = ciUsingTheOrg();
    } catch {
      // GitHub can't be asked just now: treated as busy, and asked again.
    }
    if (!busy) {
      try {
        fs.mkdirSync(LOCK);
        break;
      } catch {
        // someone else has it
      }
    }
    if (!said) {
      console.error("  waiting for the org (CI or another session has it)");
      said = true;
    }
    sleep(60000);
  }
  // Stopped by hand: the lock goes, so the next run doesn't wait on it forever.
  const stopped = () => {
    fs.rmSync(LOCK, { recursive: true, force: true });
    process.exit(130);
  };
  process.once("SIGINT", stopped);
  process.once("SIGTERM", stopped);
  try {
    return await fn();
  } finally {
    process.off("SIGINT", stopped);
    process.off("SIGTERM", stopped);
    fs.rmdirSync(LOCK);
  }
}

function sfJson(args) {
  const run = spawnSync("sf", [...args, "--json"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, SF_DISABLE_AUTOUPDATE: "true" }
  });
  try {
    return JSON.parse(run.stdout);
  } catch {
    return { status: run.status, message: run.stderr || run.stdout };
  }
}

/** Every record of a query (read as the admin unless as names another signed-in person). */
function soql(query, as = ORG) {
  const said = sfJson(["data", "query", "-q", query, "--target-org", as]);
  if (!said.result) throw new Error(`Query refused: ${query}: ${said.message}`);
  return said.result.records;
}

/** Runs anonymous Apex as the admin; throws what it says if it fails. */
function apex(source) {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "br-apex-")),
    "run.apex"
  );
  fs.writeFileSync(file, source);
  const said = sfJson(["apex", "run", "--file", file, "--target-org", ORG]);
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  if (!said.result?.success) {
    throw new Error(
      said.result?.compileProblem ||
        said.result?.exceptionMessage ||
        said.message ||
        "no answer"
    );
  }
  return said.result.logs || "";
}

/** The Apex classes in this checkout that the org holds differently: a CI deploy can change them. */
function classesOffBranch() {
  const dir = path.join(ROOT, "force-app/main/default/classes");
  const inOrg = new Map(
    soql("SELECT Name, Body FROM ApexClass WHERE NamespacePrefix = null").map(
      (c) => [c.Name, c.Body]
    )
  );
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".cls"))
    .filter((f) => {
      const name = f.slice(0, -4);
      return (
        (inOrg.get(name) ?? "").trimEnd() !==
        fs.readFileSync(path.join(dir, f), "utf8").trimEnd()
      );
    })
    .map((f) => f.slice(0, -4));
}

/** Puts this checkout's code in the org; call it holding the lock. Throws unless it succeeded. */
function deployBranch() {
  const said = sfJson([
    "project",
    "deploy",
    "start",
    "--source-dir",
    path.join(ROOT, "force-app"),
    "--target-org",
    ORG,
    "--test-level",
    "NoTestRun",
    "--ignore-conflicts",
    "--wait",
    "30"
  ]);
  if (said.result?.status !== "Succeeded") {
    throw new Error(`The deploy didn't succeed: ${said.message}`);
  }
}

// ---------- calls through the connector ----------

/** One action through code mode (the connector's own client), as the person signed in as `as`. */
async function call(action, input = {}, as = ORG) {
  if (!code[action]) throw new Error(`No action ${action}`);
  const said = await code[action](input, { org: as });
  const kind = said.asksFirst ? "asks first" : said.ok ? "done" : "refused";
  return { ...said, kind, text: String(said.text ?? "") };
}

const seenIn = (text) => /seen: "?([^"\s]+?)"?(?:[\s.,;]|$)/.exec(text)?.[1];

// ---------- made-up camps ----------

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/**
 * A camp and season and nothing else: what the first-time screen makes (numbered: the season
 * form's Days choice, "Day 1, Day 2…"). Answers the names.
 */
function makeCamp(
  short,
  { start = "2027-06-28", weeks = 2, days = 5, numbered = false } = {}
) {
  const camp = `${PREFIX}${short} (made up)`;
  const season = `${PREFIX}${short} 2027`;
  const [y, m, d] = start.split("-").map(Number);
  apex(`Date s = Date.newInstance(${y}, ${m}, ${d});
Camp__c c = new Camp__c(Name = '${esc(camp)}', TimeZone__c = 'America/New_York');
insert c;
insert new Season__c(Camp__c = c.Id, Name = '${esc(season)}', StartDate__c = s, EndDate__c = s.addDays(${7 * (weeks - 1) + days - 1}), Status__c = 'Planning', NumberedDays__c = ${numbered});`);
  return { camp, season };
}

/**
 * Takes out made-up BR camps, children first; touches no other camp. LIKE ignores case, so the
 * names are checked again, case and all, before anything is deleted.
 */
function cleanup(like = `${PREFIX}%`) {
  if (!/^BR [A-Za-z0-9 ]*%$/.test(like)) {
    throw new Error(`Not a BR camp pattern: ${like}`);
  }
  const pass = `List<Camp__c> camps = new List<Camp__c>();
for (Camp__c c : [SELECT Id, Name FROM Camp__c WHERE Name LIKE '${esc(like)}' LIMIT 5]) {
  if (c.Name.startsWith('${PREFIX}')) { camps.add(c); }
}
if (camps.isEmpty()) { return; }
Set<Id> campIds = new Map<Id, Camp__c>(camps).keySet();
Set<Id> s = new Map<Id, Season__c>([SELECT Id FROM Season__c WHERE Camp__c IN :campIds]).keySet();
delete [SELECT Id FROM Assignment__c WHERE ElectiveRun__r.Season__c IN :s];
delete [SELECT Id FROM Preference__c WHERE ElectiveRun__r.Season__c IN :s];
delete [SELECT Id FROM ElectiveRun__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialDate__c WHERE Season__c IN :s];
delete [SELECT Id FROM PlanPart__c WHERE Season__c IN :s];
List<Schedule__c> schedules = [SELECT Id FROM Schedule__c WHERE Program__r.Season__c IN :s];
for (Schedule__c schedule : schedules) {
  schedule.Status__c = 'Version';
  schedule.PublishedAt__c = null;
  schedule.PublishedBy__c = null;
  schedule.PublishKey__c = null;
}
PublishedGuard.allow();
update schedules;
delete schedules;
PublishedGuard.done();
delete [SELECT Id FROM WeekException__c WHERE Week__r.Season__c IN :s];
delete [SELECT Id FROM Coverage__c WHERE Season__c IN :s];
delete [SELECT Id FROM LinkedChoiceTime__c WHERE LinkedChoice__r.ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM LinkedChoice__c WHERE ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM Offering__c WHERE ElectiveSet__r.Season__c IN :s];
delete [SELECT Id FROM ElectiveSet__c WHERE Season__c IN :s];
delete [SELECT Id FROM ActivityEligibility__c WHERE Activity__r.Season__c IN :s];
delete [SELECT Id FROM Camper__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialEvent__c WHERE Season__c IN :s];
delete [SELECT Id FROM SpecialDay__c WHERE Season__c IN :s];
delete [SELECT Id FROM Import__c WHERE Season__c IN :s];
delete [SELECT Id FROM Send__c WHERE Season__c IN :s];
delete [SELECT Id FROM FixedActivity__c WHERE Program__r.Season__c IN :s];
delete [SELECT Id FROM RecurringActivity__c WHERE Program__r.Season__c IN :s];
delete [SELECT Id FROM Activity__c WHERE Season__c IN :s];
delete [SELECT Id FROM Location__c WHERE Season__c IN :s];
delete [SELECT Id FROM LocationType__c WHERE Season__c IN :s];
delete [SELECT Id FROM Week__c WHERE Season__c IN :s];
delete [SELECT Id FROM Program__c WHERE Season__c IN :s];
delete [SELECT Id FROM Season__c WHERE Id IN :s];
delete [SELECT Id FROM ImportAnswer__c WHERE Camp__c IN :campIds];
delete [SELECT Id FROM LearnedEvent__c WHERE Camp__c IN :campIds];
delete [SELECT Id FROM CampLabel__c WHERE Camp__c IN :campIds];
delete camps;`;
  const left = () =>
    soql(
      `SELECT Name FROM Camp__c WHERE Name LIKE '${esc(like)}' LIMIT 5`
    ).some((c) => c.Name.startsWith(PREFIX));
  while (left()) {
    apex(pass);
  }
}

// ---------- the record of a run ----------

class Record {
  constructor(scenario) {
    this.scenario = scenario;
    this.rows = [];
  }
  /** A check against a rule. Failures keep what was said, so they can be written down. */
  check(rule, what, passed, said = "") {
    this.rows.push({
      rule,
      what,
      passed: Boolean(passed),
      said: String(said).slice(0, 2000)
    });
    console.log(
      `${passed ? "  ok " : "FAIL "} [${rule}] ${what}${passed ? "" : `\n       ${String(said).slice(0, 600).replace(/\n/g, "\n       ")}`}`
    );
    return Boolean(passed);
  }
  /** Something seen that needs a person's eye, neither passed nor failed. */
  note(what, said = "") {
    this.rows.push({
      rule: "note",
      what,
      passed: true,
      note: true,
      said: String(said).slice(0, 2000)
    });
    console.log(
      `note  ${what}${said ? `\n       ${String(said).slice(0, 400).replace(/\n/g, "\n       ")}` : ""}`
    );
  }
}

module.exports = {
  ROOT,
  ORG,
  PREFIX,
  SHIPPED,
  ciUsingTheOrg,
  withOrg,
  soql,
  apex,
  sfJson,
  classesOffBranch,
  deployBranch,
  call,
  seenIn,
  makeCamp,
  cleanup,
  esc,
  Record
};
