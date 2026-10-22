#!/usr/bin/env node
/**
 * Real-browser accessibility check of the Shoresh tab in the test org (shoresh-test).
 * Local only, never in CI: it signs in to the shared test org and changes the made-up camp.
 *
 * Drives Camp setup, Manual Build, Generated Schedule, Versions, Publish and Update to match
 * setup with the keyboard only (Tab, Enter, Space, Escape, arrows, typing) and checks:
 * - where focus is after each menu, dialog and tool closes (through shadow roots);
 * - that the live regions say something after saves, builds and publishing;
 * - that every enabled rail action is reachable with Tab, and that the rail's menus (Edit,
 *   Build, the counter, Published) open, move with the arrows and close with Escape;
 * - that the week's '›' arrow, dim once it reaches the last week, leaves focus on the week;
 * - that a field's error (a blank season name, put back after) reads at 4.5:1 on the surface
 *   behind it;
 * - that "Same location?" merges a place typed twice, and Ctrl+Z / Ctrl+Shift+Z undo and redo
 *   on Manual Build (also with nothing focused), never inside a box;
 * - that a placement's bottom handle stretches it with a real mouse drag on Manual Build (the
 *   one place the check uses the mouse: Greg's drag, 2026-10-21), the span growing live, a ghost
 *   on the slot that stops it, and the longer placement kept on letting go;
 * - that a drawer tile held from the keyboard outlines its activity's cells and draws "fits
 *   here" only on Open cells, and Escape lets go; that pointing at a cell outlines the other
 *   cells of its activity (the mouse again); and that Accept in the counter's dropdown is reached
 *   with the arrows, hides its line, is said, and moves focus on (ADR 0008 part 8);
 * - that cells chosen with Shift+Right on Manual Build are copied with Ctrl/Cmd+C and pasted with
 *   Ctrl/Cmd+V on the next time block, said, focus kept on the grid, and undone in one step
 *   (ADR 0008 part 9);
 * - that a setup table row in the shared pattern (ADR 0015 choice 11) shows its week ticks
 *   while it is edited, Tab reaching them; that unticking a week with placements asks first
 *   and, cancelled, leaves focus back on the tick, still ticked; and that its details open from
 *   its chevron with focus kept there; that a place whose type is changed in its details moves
 *   to its new section with the cursor kept in its notes, the move said; that a bunk given
 *   another unit in its details says what changes before it is saved, and once saved moves to
 *   that unit's section with the cursor in its name, the move said; with --shots it also saves each restyled setup screen at rest and a
 *   group row under the pointer, for docs/design/screens/;
 * - step 3b (ADR 0015 choice 12): on Activities, that a row's "how often" numbers show while it
 *   is edited, Tab reaching them, and that its chevron opens its details beside the table with
 *   focus on their heading, Close putting focus back on the chevron; that an activity whose
 *   priority is changed in its details moves to that priority's section, still marked open, the
 *   cursor kept on Priority, and Close finds its chevron there; on Recurring activities,
 *   that a row's day ticks show while it is edited, Tab reaching them; and that New season and
 *   Copy this season open from the camp row's small menu (Season actions) and Cancel puts focus
 *   back on it;
 * - Special events (ADR 0014 choices 11 and 12): a special day added by keyboard says what it
 *   started from; its details open from its chevron with focus on their heading; its schedule
 *   opens from Open schedule with focus on its name, a name typed into a cell is saved and said,
 *   and the way back puts focus on Open schedule (choices 14 and 15); "Put on a day" puts it on
 *   a week's day by keyboard, what was done said and focus back on Put on a day (slice 4); Close
 *   puts focus back on the chevron; taken off that day (by Apex: Take off comes in slice 6), it
 *   is deleted again;
 * - rules Shoresh guessed (ADR 0006 §21): an activity's how often, marked as an import would
 *   mark it, carries the needs-a-look corner; Tab reaches it, Enter opens its words with the
 *   cursor on Looks right, Escape puts the cursor back on the mark, and Looks right clears it,
 *   said, with the cursor on that row's "at least" box;
 * - the living dot field on Roots (ADR 0015 choice 13): it is drawn, hidden from screen readers,
 *   glows when the mouse moves near it and settles back to rest, logs no errors, and with reduced
 *   motion asked for (emulated) it stays still while the mouse moves;
 * - that a locked cell on Generated Schedule shows the padlock in its bottom-right corner, with
 *   no edge drawn for the lock, clear of its name and of the needs-a-look corner, both visible
 *   (Greg, 2026-10-22; ADR 0015 choice 6);
 * - the Schedules page with special days and events (ADR 0014 slice 5): on a version made for the
 *   check (by Apex) with a special day on Tuesday and an event on Monday, the Tuesday pill names
 *   the special day and its line shows under the grid; an event's "Open <name>" reached by Tab
 *   shows its own schedule with focus on the way back ("← Monday"), and back puts focus on that
 *   Open again; axe on both. The special day, the event and the version are deleted after;
 * - axe-core (WCAG 2.0/2.1/2.2 A and AA) on each screen.
 * It writes a plain report (default docs/a11y-browser-check-<today>.md). It fixes nothing.
 *
 * The sign-in link comes from `sf org open --url-only --json` and stays in memory: it is never
 * printed, logged or written, and every message is scrubbed of links and session ids
 * (scripts/a11y-browser-check-lib.js). Uses Google Chrome as installed on this Mac (no browser
 * download).
 *
 * Usage: node scripts/a11y-browser-check.mjs [--report <path>] [--headed] [--shots <dir>]
 * How to run, and the org rules it follows: docs/ci-setup.md.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const { AxeBuilder } = require("@axe-core/playwright");
const {
  describeFocus,
  formatFocus,
  focusMatches,
  scrub,
  Results,
  renderReport
} = require("./a11y-browser-check-lib.js");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORG = "shoresh-test";
// The check's own made-up camp, set up by the walkthrough's seed (scripts/apex/sample-version.apex)
// under another name, so "Sample Camp (made up)" stays as the walkthrough expects it. Each run
// makes its one week fresh (seedCamp), so Start, Generate and Save version happen every time.
const CAMP = "Keyboard check camp (made up)";
const SEED = join("scripts", "apex", "sample-version.apex");
const SEED_NAME = "final String CAMP_NAME = 'Sample Camp (made up)';";
const TAB_PATH = "/lightning/n/Shoresh_Camp_Setup";
const APP = "c-shoresh-camp-setup";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// The fixed activity the check deletes and adds again in its camp, so the run's week no longer
// matches setup (for Update to match setup). Period 6 is free every day on the made-up camp.
const SETUP_CHANGE = "Assembly";
const SETUP_CHANGE_BLOCK = /^Period 6$/;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const today = new Date().toISOString().slice(0, 10);
const reportPath = resolve(
  ROOT,
  argValue("--report", `docs/a11y-browser-check-${today}.md`)
);
const shotsDir = resolve(
  argValue("--shots", join(tmpdir(), "a11y-browser-check"))
);
const headed = args.includes("--headed");

const say = (text) => console.log(scrub(text));
const run = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

// ---------- before the browser: CI, the org, the made-up camp ----------

function refuseInCi() {
  if (process.env.CI) {
    say(
      "This check is local only (it signs in to the shared test org). Not run in CI."
    );
    process.exit(1);
  }
}

/** CLAUDE.md: don't use the test org while a CI run is using it. */
function refuseWhileCiRuns() {
  const busy = () =>
    ["in_progress", "queued"].some((status) => {
      const out = run("gh", [
        "run",
        "list",
        "--repo",
        "ShoreshHQ/shoresh-scheduling",
        "--status",
        status,
        "--json",
        "databaseId"
      ]);
      return JSON.parse(out).length > 0;
    });
  try {
    if (busy()) {
      say("A CI run is using the test org. Try again when it has finished.");
      process.exit(1);
    }
  } catch (e) {
    say(`Could not ask GitHub whether CI is using the test org: ${e.message}`);
    process.exit(1);
  }
}

/** Runs anonymous Apex in the test org; returns its debug log. */
function apex(code) {
  const dir = mkdtempSync(join(tmpdir(), "a11y-browser-check-"));
  const file = join(dir, "run.apex");
  writeFileSync(file, code);
  let out;
  try {
    out = run("sf", [
      "apex",
      "run",
      "--file",
      file,
      "--target-org",
      ORG,
      "--json"
    ]);
  } catch (e) {
    out = e.stdout || "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  let result;
  try {
    result = JSON.parse(out).result;
  } catch {
    throw new Error("Anonymous Apex gave no answer from the test org.");
  }
  if (!result || !result.success) {
    throw new Error(
      `Anonymous Apex failed: ${(result && (result.compileProblem || result.exceptionMessage)) || "no reason given"}`
    );
  }
  return result.logs || "";
}

/**
 * The check's camp (first run only), then the check's own week in it, made fresh: the week an
 * earlier run added (the latest), with its drafts and saved versions deleted, so Start, Generate
 * and Save version happen again and the camp gains no more weeks. Published schedules are kept
 * history (`PublishedHistory`, `PublishedGuard`): they stay, and this run publishes the same week
 * again. Only the first run adds a week. Returns the week's name.
 */
function seedCamp() {
  const count = JSON.parse(
    run("sf", [
      "data",
      "query",
      "--target-org",
      ORG,
      "--json",
      "--query",
      `SELECT COUNT() FROM Camp__c WHERE Name = '${CAMP}'`
    ])
  ).result.totalSize;
  if (count === 0) {
    say(`Setting up "${CAMP}" with the walkthrough's seed (${SEED})...`);
    const seed = readFileSync(join(ROOT, SEED), "utf8");
    if (!seed.includes(SEED_NAME))
      throw new Error(`${SEED} no longer names its camp as expected.`);
    apex(seed.replace(SEED_NAME, `final String CAMP_NAME = '${CAMP}';`));
  }
  const logs = apex(`
Camp__c camp = [SELECT Id FROM Camp__c WHERE Name = '${CAMP}' LIMIT 1];
Season__c season = [SELECT Id, EndDate__c FROM Season__c WHERE Camp__c = :camp.Id ORDER BY CreatedDate LIMIT 1];
List<Week__c> weeks = [SELECT Id, Name, StartDate__c FROM Week__c WHERE Season__c = :season.Id ORDER BY StartDate__c DESC];
Week__c week;
if (weeks.size() > 1) {
  week = weeks[0];
  List<Schedule__c> drafts = [SELECT Id FROM Schedule__c WHERE Week__c = :week.Id AND Status__c != 'Published' AND PublishedAt__c = NULL AND PublishedBy__c = NULL AND PublishKey__c = NULL];
  delete drafts;
  System.debug('A11Y_RESET[' + drafts.size() + ']');
} else {
  Date monday = weeks.isEmpty() ? Date.newInstance(2027, 6, 28) : weeks[0].StartDate__c.addDays(7);
  Integer n = weeks.size() + 1;
  if (season.EndDate__c < monday.addDays(4)) {
    season.EndDate__c = monday.addDays(4);
    update season;
  }
  week = new Week__c(Season__c = season.Id, Name = 'Week ' + n, StartDate__c = monday, EndDate__c = monday.addDays(4), SortOrder__c = n);
  insert week;
}
System.debug('A11Y_WEEK[' + week.Name + ']');
`);
  // The log also echoes the code above, quote marks and all: only the debug line matches.
  const week = /A11Y_WEEK\[([^\]']+)\]/.exec(logs);
  if (!week) throw new Error("The check's week was not reported back.");
  const reset = /A11Y_RESET\[(\d+)\]/.exec(logs);
  say(
    reset
      ? `Made ${week[1]} of "${CAMP}" fresh (${reset[1]} draft or saved schedules deleted); the check works on it.`
      : `Added ${week[1]} to "${CAMP}"; the check works on it.`
  );
  return week[1];
}

/**
 * An activity of the check's camp marked as an import marks what it guessed (SetupGuessRecords): its
 * how often, with the value it holds now, so the Activities screen shows the needs-a-look corner
 * on it. Looks right clears it in the check, so every run marks it again. Returns its name.
 */
function seedGuess() {
  const logs = apex(`
Camp__c camp = [SELECT Id FROM Camp__c WHERE Name = '${CAMP}' LIMIT 1];
Activity__c activity = [SELECT Id, Name FROM Activity__c WHERE Season__r.Camp__c = :camp.Id ORDER BY Season__r.CreatedDate, SortOrder__c NULLS LAST, Name LIMIT 1];
SetupGuessRecords.remember(camp.Id, new Map<Id, Set<String>>{ activity.Id => new Set<String>{ SetupGuessValues.OFTEN } });
System.debug('A11Y_GUESS[' + activity.Name + ']');
`);
  const name = /A11Y_GUESS\[([^\]']+)\]/.exec(logs);
  if (!name) throw new Error("The guessed activity was not reported back.");
  return name[1];
}

/** The sign-in link, kept in memory only. Any failure is reported without it. */
function signInUrl() {
  try {
    const out = JSON.parse(
      run("sf", [
        "org",
        "open",
        "--target-org",
        ORG,
        "--url-only",
        "--json",
        "--path",
        TAB_PATH
      ])
    );
    return out.result.url;
  } catch {
    throw new Error(
      "Could not get a sign-in link for the test org (is it expired? scripts/renew-test-org.sh)."
    );
  }
}

// ---------- in the browser ----------

const results = new Results();
let page;
let week; // the check's week, made fresh for this run, e.g. "Week 2"
let guessed; // the activity marked as guessed for this run (seedGuess)
let shotCount = 0;
const pause = (ms) => page.waitForTimeout(ms);

async function focus() {
  return page.evaluate(`(${describeFocus.toString()})(document)`);
}

async function press(key, settle = 120) {
  await page.keyboard.press(key);
  await pause(settle);
}

async function type(text) {
  await page.keyboard.type(text, { delay: 20 });
}

/**
 * Presses Tab (or Shift+Tab) until focus, inside Shoresh, satisfies `test`; null if it never
 * does. Salesforce's own header is passed over, never pressed.
 */
async function tabTo(test, { max = 140, back = false, anywhere = false } = {}) {
  for (let i = 0; i < max; i++) {
    await press(back ? "Shift+Tab" : "Tab", 30);
    const f = await focus();
    if (f && (anywhere || f.components.includes(APP)) && test(f)) return f;
  }
  return null;
}

const named =
  (re, more = {}) =>
  (f) =>
    re.test(f.name) && Object.entries(more).every(([k, v]) => f[k] === v);

/** Waits up to `ms` for focus to match; returns the last place seen. */
async function waitFocus(expected, ms = 3000) {
  const end = Date.now() + ms;
  let f = await focus();
  while (!focusMatches(f, expected) && Date.now() < end) {
    await pause(150);
    f = await focus();
  }
  return f;
}

const describeExpected = (expected) =>
  Object.entries(expected)
    .map(([k, v]) => `${k} ${v instanceof RegExp ? v.source : v}`)
    .join(", ");

async function expectFocus(screen, step, expected) {
  const f = await waitFocus(expected);
  if (focusMatches(f, expected)) {
    results.pass(screen, step, `Focus on ${formatFocus(f)}.`);
  } else {
    await shot(screen, step);
    results.fail(
      screen,
      step,
      `Focus on ${formatFocus(f)}; expected ${describeExpected(expected)}.`
    );
  }
  return f;
}

/** Focus must not fall to the page when the control it was on goes away. */
async function expectFocusKept(screen, step) {
  // Any element at all, within 3 seconds (a screen may move focus once it has redrawn).
  const f = await waitFocus({});
  if (f) {
    results.pass(screen, step, `Focus on ${formatFocus(f)}.`);
  } else {
    await shot(screen, step);
    results.fail(
      screen,
      step,
      "Focus fell to the page (nothing focused after 3 seconds)."
    );
  }
  return f;
}

// Live regions, one selector at a time: Playwright's piercing of a selector list (or `.or`)
// missed a region in a component slotted into another's shadow (the counter's Accept line),
// while each selector alone finds it.
const LIVE = ["[aria-live]", '[role="status"]', '[role="alert"]'];

/** Runs `fn` (an evaluateAll function) on every live region in Shoresh, each kind in turn. */
async function eachLive(fn) {
  const out = [];
  for (const selector of LIVE) {
    out.push(
      ...((await page.locator(APP).locator(selector).evaluateAll(fn)) || [])
    );
  }
  return out;
}

async function liveTexts() {
  // An element that is both (aria-live and a role) is counted under each, before and after alike.
  return eachLive((els) =>
    els
      // Only regions on screen: screens visited earlier stay in the page, hidden.
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
  );
}

/**
 * Runs `action`, then waits for a live region to say something matching `re` that it was not
 * already saying (or that went away and came back).
 */
/**
 * Watches every live region now in Shoresh: each time one's content changes, its text is
 * logged (window.__a11yLive). Screen readers speak a region when it changes, so the same words
 * set again count as said again.
 */
async function watchLive() {
  await page.evaluate(() => {
    (window.__a11yObservers || []).forEach((o) => o.disconnect());
    window.__a11yObservers = [];
    window.__a11yLive = [];
  });
  await eachLive((els) => {
    // Only regions on screen: screens visited earlier stay in the page, hidden. One observer per
    // element, even when two selectors find it.
    for (const el of els.filter((e) => e.getClientRects().length > 0)) {
      if (el.__a11yWatched === window.__a11yObservers) continue;
      el.__a11yWatched = window.__a11yObservers;
      const o = new MutationObserver(() => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t) window.__a11yLive.push(t);
      });
      o.observe(el, { childList: true, subtree: true, characterData: true });
      window.__a11yObservers.push(o);
    }
    return [];
  });
}

/**
 * Runs `action`, then waits for a live region to say something matching `re`: an existing
 * region whose content changed to it, or a new region (one drawn by the action) saying it.
 */
async function expectLive(screen, step, re, action, ms = 20000) {
  // How many regions say each matching text now; a screen kept in the page (an earlier
  // visit's Manual Build, say) may still be saying the same words.
  const tally = (texts) => {
    const counts = new Map();
    for (const t of texts.filter((x) => re.test(x)))
      counts.set(t, (counts.get(t) || 0) + 1);
    return counts;
  };
  const before = tally(await liveTexts());
  await watchLive();
  await action();
  const end = Date.now() + ms;
  let texts = [];
  while (Date.now() < end) {
    const changed = await page.evaluate(() => window.__a11yLive || []);
    texts = await liveTexts();
    const now = tally(texts);
    const hit =
      changed.find((t) => re.test(t)) ||
      [...now].find(([t, n]) => n > (before.get(t) ?? 0))?.[0];
    if (hit) {
      results.pass(screen, step, `Said: "${hit}".`);
      return hit;
    }
    await pause(100);
  }
  await shot(screen, step);
  results.fail(
    screen,
    step,
    `No live region said ${re.source}. They said: ${texts.map((t) => `"${t}"`).join(", ") || "nothing"}.`
  );
  return null;
}

/** The element itself from axe's selector path (the shadow hosts above it are left out). */
const lastPart = (target) =>
  String([].concat(target).flat(Infinity).pop() || "");

async function axe(screen) {
  try {
    const r = await new AxeBuilder({ page })
      .include(APP)
      .withTags(AXE_TAGS)
      .analyze();
    results.axeVersion = r.testEngine.version;
    for (const v of r.violations) {
      results.fail(
        screen,
        `axe: ${v.id}`,
        `${v.help} (${v.impact}). ${v.nodes.length} element(s), first: ${lastPart(v.nodes[0].target)}.`
      );
    }
    const unsure = r.incomplete
      .map((v) => `${v.id} (${v.nodes.length})`)
      .join(", ");
    if (!r.violations.length) {
      results.pass(
        screen,
        "axe",
        `No violations (${r.passes.length} rules passed).` +
          (unsure
            ? ` axe could not decide, for a person to look at: ${unsure}.`
            : "")
      );
    }
  } catch (e) {
    results.notRun(screen, "axe", e.message);
  }
}

async function shot(screen, step) {
  try {
    mkdirSync(shotsDir, { recursive: true });
    shotCount += 1;
    const name = `${String(shotCount).padStart(2, "0")}-${`${screen}-${step}`
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 60)}.png`;
    await page.screenshot({ path: join(shotsDir, name) });
  } catch {
    // A screenshot is a help, never a reason to stop.
  }
}

/** Runs one step; anything that throws is "not run" with why, and the check goes on. */
async function step(screen, name, body) {
  say(`${screen}: ${name}`);
  try {
    await body();
  } catch (e) {
    await shot(screen, name);
    results.notRun(screen, name, e.message.split("\n")[0]);
  }
}

const isMenuLink = (re) => (f) =>
  f.tag === "a" && f.components.includes("c-shoresh-menu") && re.test(f.name);

/** Opens a screen from the Shoresh menu by keyboard; focus should be on its heading. */
async function openFromMenu(screen, re, heading = new RegExp(`^${screen}$`)) {
  // The menu comes before every screen, so Shift+Tab reaches it first from a heading or a
  // table row (focus stays on the next row after a delete, and a long Weeks table outgrows
  // going forward). From near the page's end, forward wraps round.
  const link =
    (await tabTo(isMenuLink(re), { back: true })) ||
    (await tabTo(isMenuLink(re), { max: 280 }));
  if (!link)
    throw new Error(`The menu entry for ${screen} was not reached with Tab.`);
  await press("Enter", 1500);
  await expectFocus(screen, "Open from the menu: focus on the heading", {
    tag: /^h[1-3]$/,
    name: heading
  });
}

/** Chooses this run's week in the screen's Week picker, by keyboard. */
async function pickWeek() {
  if (!(await tabTo(named(/^Week\b/, { tag: "button" }), { max: 10 }))) {
    throw new Error("The Week picker was not reached with Tab.");
  }
  await chooseOption(new RegExp(`^${week}$`));
  await pause(2500);
}

/**
 * The week's arrows at the last week (the check's week is the camp's last): '‹' to the week
 * before, then '›' back, which goes dim under focus, so focus should land on the week itself
 * ("Week 3, Week"), never on the page. Ends with the check's week shown again.
 */
async function weekArrowEnd(screen) {
  const toPrevious = named(/^Previous: /, { tag: "button" });
  if (!(await tabTo(toPrevious, { back: true, max: 10 }))) {
    results.notRun(
      screen,
      "Week arrows: the last week",
      "No '‹' arrow to press (the camp has one week)."
    );
    return;
  }
  await press("Enter", 2500);
  if (
    !(await tabTo(named(new RegExp(`^Next: ${week}$`), { tag: "button" }), {
      max: 10
    }))
  ) {
    throw new Error(`The '›' arrow back to ${week} was not reached with Tab.`);
  }
  await press("Enter", 2500);
  await expectFocus(
    screen,
    "Week arrows: at the last week, focus on the week",
    {
      tag: "button",
      name: new RegExp(`^${week}, Week$`)
    }
  );
}

/** Opens a menu button or combobox and chooses the option whose text matches `re`. */
async function chooseOption(re, { max = 30 } = {}) {
  await press("Enter", 400);
  for (let i = 0; i < max; i++) {
    const text = await page.evaluate(() => {
      let el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
      }
      if (!el) return "";
      const id = el.getAttribute("aria-activedescendant");
      if (id) {
        const option = el.getRootNode().querySelector(`[id="${id}"]`);
        // innerText: the option's words are in its own (synthetic) shadow root.
        return option
          ? (option.innerText || "").replace(/\s+/g, " ").trim()
          : "";
      }
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    });
    if (re.test(text)) {
      await press("Enter", 600);
      return text;
    }
    await press("ArrowDown", 120);
  }
  await press("Escape");
  throw new Error(`No option ${re.source} in the list.`);
}

/** Every enabled rail control is reached by Tab, in one pass from the first. */
async function toolbarReach(screen) {
  const controls = page
    .locator("c-shoresh-week-editor .rail")
    .locator(
      'button, input, select, a[href], [role="combobox"], [tabindex="0"]'
    );
  const expected = new Map();
  const handles = await controls.elementHandles();
  for (const [i, h] of handles.entries()) {
    const name = await h.evaluate((el, n) => {
      const box = el.getBoundingClientRect();
      const shown =
        box.width > 0 &&
        box.height > 0 &&
        getComputedStyle(el).visibility !== "hidden";
      if (!shown || el.disabled || el.getAttribute("tabindex") === "-1")
        return null;
      el.setAttribute("data-a11y-check", String(n));
      return (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }, i);
    if (name !== null) expected.set(String(i), name);
  }
  if (!expected.size) throw new Error("No rail controls found.");
  // Start just before the rail: back out of it if focus is already in it.
  for (let i = 0; i < 40; i++) {
    const f = await focus();
    if (!f || f.checkMark === null) break;
    await press("Shift+Tab", 30);
  }
  const first = await tabTo((f) => f.checkMark !== null);
  if (!first) {
    results.fail(
      screen,
      "Rail: reachable by Tab",
      "No rail control was reached with Tab."
    );
    return;
  }
  const reached = new Set([first.checkMark]);
  let misses = 0;
  for (let i = 0; i < 60 && misses < 3; i++) {
    await press("Tab", 30);
    const f = await focus();
    if (f && f.checkMark !== null) {
      reached.add(f.checkMark);
      misses = 0;
    } else {
      misses += 1;
    }
  }
  const missing = [...expected]
    .filter(([k]) => !reached.has(k))
    .map(([, n]) => n);
  const names = [...expected.values()].join(", ");
  if (missing.length) {
    results.fail(
      screen,
      "Rail: every action reachable by Tab",
      `Not reached: ${missing.join(", ")}. Rail: ${names}.`
    );
  } else {
    results.pass(
      screen,
      "Rail: every action reachable by Tab",
      `All ${expected.size} reached: ${names}.`
    );
  }
}

/**
 * A rail menu (ADR 0008 part 7): focus on its word (where it is already, else back with
 * Shift+Tab, else on with Tab), then Enter opens it, with focus on its first row when it is a
 * menu. Returns the word's focus, or null when it was not reached.
 */
async function openRailMenu(re, { max = 60 } = {}) {
  const isWord = named(re, { tag: "button" });
  const now = await focus();
  const word =
    (now && now.components.includes(APP) && isWord(now) ? now : null) ||
    (await tabTo(isWord, { back: true, max })) ||
    (await tabTo(isWord, { max: max * 3 }));
  if (!word) return null;
  await press("Enter", 500);
  return word;
}

/** Inside an open rail menu: Down until the row whose words match `re` has focus. */
async function arrowTo(re, { max = 20 } = {}) {
  for (let i = 0; i < max; i++) {
    const f = await focus();
    if (f && re.test(f.name)) return f;
    await press("ArrowDown", 80);
  }
  return null;
}

// Screens visited earlier stay in the page, hidden: only what is on screen counts.
const shown = (selector) =>
  page.locator(APP).locator(`${selector} >> visible=true`);
const exists = async (selector) => (await shown(selector).count()) > 0;

const grid = (f) => f.inGrid;
// What Update to match setup says when it ends: done, matches, or refused.
const UPDATE_SAID =
  /Updated |matches setup|nothing was updated|was not updated/;
// "✓ Saved" (c-shoresh-saved-mark) or "Saved …", never "… not saved".
const SAVED = /^(✓ )?Saved\b/;

// ---------- the screens ----------

/**
 * Every field error shown in Shoresh: its words' colour, the surface behind it (the first
 * ancestor with a background, across shadow roots) and their WCAG contrast.
 */
function errorContrasts(app) {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const behind = (el) => {
    for (let e = el; e; e = e.parentElement || e.getRootNode().host) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if (c.length >= 3 && (c.length < 4 || c[3] > 0)) return c.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const found = [];
  const walk = (root) => {
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) walk(el.shadowRoot);
      if (
        el.matches(".slds-form-element__help, .slds-text-color_error") &&
        el.getClientRects().length &&
        el.textContent.trim()
      ) {
        const fg = rgb(getComputedStyle(el).color);
        const bg = behind(el);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        found.push({
          text: el.textContent.replace(/\s+/g, " ").trim(),
          color: `rgb(${fg.slice(0, 3).join(", ")})`,
          surface: `rgb(${bg.join(", ")})`,
          ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
        });
      }
    });
  };
  walk(app.shadowRoot || app);
  return found;
}

/**
 * The season's details on the shelf: a blank name is refused and the field says why. Its
 * words must read at 4.5:1 on the surface behind them (Salesforce's error red, not Shoresh's
 * colour), and axe looks at the screen with the error shown. The name goes back as it was.
 */
async function seasonError() {
  const S = "Season details";
  const edit = await tabTo(named(/^Edit\b/, { tag: "button" }), {
    max: 40,
    back: true
  });
  if (!edit)
    throw new Error("The season's Edit button was not reached with Tab.");
  await press("Enter", 800);
  const box = await tabTo(named(/ name$/i, { tag: "input" }), { max: 10 });
  if (!box) throw new Error("The season's name box was not reached with Tab.");
  const original = await page.evaluate(() => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement)
      a = a.shadowRoot.activeElement;
    return a ? a.value : "";
  });
  if (!original) throw new Error("The season has no name to put back.");
  await press("ControlOrMeta+a");
  await press("Backspace");
  await press("Tab", 800);
  const list = await page.locator(APP).evaluate(errorContrasts);
  const said = list
    .map((e) => `"${e.text}" ${e.color} on ${e.surface}, ${e.ratio}:1`)
    .join("; ");
  if (!list.length) {
    await shot(S, "Blank name");
    results.fail(S, "Blank name: the field says why", "No error was shown.");
  } else if (list.some((e) => e.ratio < 4.5)) {
    await shot(S, "Blank name");
    results.fail(S, "Blank name: the error reads at 4.5:1", said);
  } else {
    results.pass(S, "Blank name: the error reads at 4.5:1", said);
  }
  await axe("Season details, blank name");
  // Put the name back exactly as it was, and close the details.
  if (
    !(await tabTo(named(/ name$/i, { tag: "input" }), { max: 10, back: true }))
  )
    throw new Error("The season's name box was not reached again.");
  await type(original);
  await press("Enter", 2500);
  if (await tabTo(named(/^Edit\b/, { tag: "button" }), { max: 10, back: true }))
    await press("Enter", 500);
}

/** Whether the focused element (through shadow roots) is ticked. */
const focusedChecked = () =>
  page.evaluate(() => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement)
      a = a.shadowRoot.activeElement;
    return a ? a.checked : null;
  });

/**
 * From a group's week ticks: Space unticks Week 1, which has the seed's placements, so the
 * "Turn off ... for Week 1?" question opens with focus in it; Escape cancels it, and focus must
 * come back to the tick (WCAG 2.4.3), still ticked. The question covers the row and takes focus,
 * so this proves the row keeps its ticks shown while it is open. Nothing is saved.
 */
async function askedAboutAWeek(G) {
  const STEP =
    "Unticking a week with placements: the question, then focus back on the tick";
  const isWeek1 = (f) =>
    !!f &&
    f.tag === "input" &&
    f.type === "checkbox" &&
    / runs in Week 1$/.test(f.name);
  const now = await focus();
  const tick = isWeek1(now) ? now : await tabTo(isWeek1, { max: 12 });
  if (!tick || !(await focusedChecked())) {
    await shot(G, "Week 1 tick");
    results.fail(G, STEP, "No ticked Week 1 tick was reached on the row.");
    return;
  }
  await press("Space", 300);
  const asked = await waitFocus({ inDialog: true }, 8000);
  if (!focusMatches(asked, { inDialog: true })) {
    await shot(G, "No question");
    // Put the week back if it was turned off without a question.
    if (isWeek1(await focus()) && !(await focusedChecked()))
      await press("Space", 2000);
    results.fail(
      G,
      STEP,
      `No question opened; focus on ${formatFocus(asked)}.`
    );
    return;
  }
  await press("Escape", 800);
  const back = await expectFocus(G, STEP, {
    tag: "input",
    type: "checkbox",
    name: / runs in Week 1$/
  });
  if (isWeek1(back)) {
    const kept = await focusedChecked();
    if (kept) results.pass(G, "Cancel keeps the week ticked", "Still ticked.");
    else results.fail(G, "Cancel keeps the week ticked", "The tick is off.");
  }
}

/**
 * A setup table row in the shared pattern (ADR 0015 choice 11), on Groups: Tab into a group's
 * name box, then on to its week ticks (shown only while the row is pointed at or edited, so
 * reaching them by Tab proves they show), then its details chevron: Enter opens the details
 * under the row with focus kept on the chevron (aria-expanded), axe looks at them open, and
 * Enter closes them.
 */
async function setupRow() {
  const G = "Groups";
  await openFromMenu(G, /^Groups\b/);
  await axe("Groups");
  const box = await tabTo(
    (f) =>
      f.tag === "input" &&
      f.components.includes("c-shoresh-editable-table") &&
      !/^Add /.test(f.name),
    { max: 30 }
  );
  if (!box) throw new Error("No group's name box was reached with Tab.");
  const tick = await tabTo(
    (f) =>
      f.tag === "input" && f.type === "checkbox" && / runs in /.test(f.name),
    { max: 12 }
  );
  if (tick) {
    results.pass(
      G,
      "While a row is edited, its week ticks show and Tab reaches them",
      `Reached "${tick.name}".`
    );
  } else {
    await shot(G, "Week ticks");
    results.fail(
      G,
      "While a row is edited, its week ticks show and Tab reaches them",
      "No week tick was reached from the row's name box."
    );
  }
  await askedAboutAWeek(G);
  // Past the row's week ticks (one per week) and its delete.
  const chevron = await tabTo(named(/ details$/, { tag: "button" }), {
    max: 60
  });
  if (!chevron) throw new Error("The row's details chevron was not reached.");
  await press("Enter", 600);
  await expectFocus(G, "Opening a row's details: focus stays on its chevron", {
    tag: "button",
    name: / details$/
  });
  const expanded = await page.evaluate(() => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement)
      a = a.shadowRoot.activeElement;
    return a ? a.getAttribute("aria-expanded") : null;
  });
  if (expanded === "true") {
    results.pass(
      G,
      "The chevron says its details are open",
      "aria-expanded true."
    );
  } else {
    results.fail(
      G,
      "The chevron says its details are open",
      `aria-expanded ${expanded}.`
    );
  }
  await axe("Groups, a row's details open");
  if (args.includes("--shots")) {
    await page.screenshot({ path: join(shotsDir, "setup-groups-details.png") });
  }
  await press("Enter", 400);
}

/**
 * A bunk moved to another unit on Groups (ADR 0006 §16, ADR 0015 choice 11): Bunk 1's unit
 * changed to Seniors in its details shows "What changes" before it is saved (the seed's Library
 * time covers Juniors only), then Enter in its name box saves it, the move is said and the
 * cursor goes with it to its name box in Seniors. Moved back the same way, so the camp ends as
 * it began.
 */
async function bunkMoves() {
  const G = "Groups";
  const BUNK = "Bunk 1";
  await openFromMenu(G, /^Groups\b/);
  const groups = 'c-shoresh-editable-table[data-id="groups"]';
  // Which unit's table, and which box, has the cursor (through shadow roots).
  const where = () =>
    page.evaluate(() => {
      let el = document.activeElement;
      let division = null;
      let field = null;
      while (el) {
        if (el.tagName === "C-SHORESH-EDITABLE-TABLE")
          division = el.heading || null;
        if (el.dataset && el.dataset.field) field = el.dataset.field;
        if (!el.shadowRoot || !el.shadowRoot.activeElement) break;
        el = el.shadowRoot.activeElement;
      }
      return { division, field };
    });
  /** Bunk 1's name box, wherever it is on screen. */
  const nameBox = async () => {
    const inputs = shown(`${groups} lightning-input[data-field="Name"] input`);
    const at = (
      await inputs.evaluateAll((els) => els.map((e) => e.value))
    ).indexOf(BUNK);
    if (at < 0) throw new Error(`${BUNK} is not on Groups.`);
    return inputs.nth(at);
  };
  /** Bunk 1's unit chosen in its details, its note read, then Enter in its name box. */
  const move = async (from, to, expectedNote) => {
    await (await nameBox()).focus();
    const chevron = new RegExp(`^${BUNK} details$`);
    if (!(await tabTo(named(chevron, { tag: "button" }), { max: 60 })))
      throw new Error(`${BUNK}'s details chevron not reached with Tab.`);
    await press("Enter", 600);
    if (!(await tabTo((f) => f.role === "combobox", { max: 6 })))
      throw new Error(`${BUNK}'s unit not reached with Tab.`);
    await chooseOption(new RegExp(`^${to}$`));
    // The note, once the server has said what the bunk's schedules hold.
    await pause(2500);
    const notes = await shown(`${groups} [data-id="note"]`).evaluateAll(
      (cells) =>
        cells.map((c) => (c.innerText || "").replace(/\s+/g, " ").trim())
    );
    const note = notes.find((n) => n.startsWith(`Moves to ${to}:`));
    const noteStep = `${BUNK} to ${to}: "What changes" says so before it is saved`;
    if (note && (!expectedNote || expectedNote.test(note))) {
      results.pass(G, noteStep, `Said: "${note}".`);
    } else {
      await shot(G, noteStep);
      results.fail(
        G,
        noteStep,
        `Notes shown: ${notes.map((n) => `"${n}"`).join(", ") || "none"}.`
      );
    }
    // Back in its name box (the row is still where it was until it is saved).
    await (await nameBox()).focus();
    await expectLive(
      G,
      `${BUNK} to ${to}: the move is said`,
      new RegExp(`^${BUNK} moved to ${to}$`),
      () => press("Enter", 3000)
    );
    const now = await where();
    const step = `${BUNK} to ${to}: the cursor goes with it to its name in ${to}`;
    if (
      now.field === "Name" &&
      (now.division || "").endsWith(to) &&
      now.division !== from
    ) {
      results.pass(G, step, `Name, in ${now.division}.`);
    } else {
      await shot(G, step);
      results.fail(
        G,
        step,
        `Focus on ${formatFocus(await focus())} (unit ${now.division}, box ${now.field}).`
      );
    }
  };
  await move("Juniors", "Seniors", /no longer in Library time \(for Juniors\)/);
  await move("Seniors", "Juniors", /is now in Library time \(for Juniors\)/);
}

/**
 * Locations in a section per type (ADR 0015 choice 11): a place whose type is changed in its
 * details, then Enter in its notes, moves to its new section, and the cursor goes with it to
 * the same box (WCAG 2.4.3), the move said. The step adds a type, moves Pool there and back,
 * then deletes the type, so the camp ends as it began.
 */
async function placeChangesType() {
  const L = "Locations";
  const TYPE = "Check type";
  await openFromMenu(L, /^Locations\b/);
  const places = 'c-shoresh-editable-table[data-id="locations"]';
  const types = 'c-shoresh-editable-table[data-id="location-types"]';
  const typeNames = () =>
    shown(`${types} lightning-input[data-field="Name"] input`).evaluateAll(
      (inputs) => inputs.map((i) => i.value).filter(Boolean)
    );
  if ((await typeNames()).includes(TYPE)) {
    throw new Error(
      `"${TYPE}" is already a type: a run before this one stopped part way.`
    );
  }
  await shown(`${types} [data-row-key="add"][data-field="Name"] input`).focus();
  await type(TYPE);
  await press("Enter", 3000);
  if (!(await typeNames()).includes(TYPE))
    throw new Error(`"${TYPE}" was not added.`);
  // Pool's details: from its name box, Tab to its chevron.
  const inputs = shown(`${places} lightning-input[data-field="Name"] input`);
  const at = (
    await inputs.evaluateAll((els) => els.map((e) => e.value))
  ).indexOf("Pool");
  if (at < 0) throw new Error("Pool is not on Locations.");
  await inputs.nth(at).focus();
  if (!(await tabTo(named(/^Pool details$/, { tag: "button" }), { max: 40 })))
    throw new Error("Pool's details chevron not reached with Tab.");
  await press("Enter", 600);
  // Which section, and which box, has the cursor (through shadow roots).
  const where = () =>
    page.evaluate(() => {
      let el = document.activeElement;
      let section = null;
      let field = null;
      while (el) {
        if (el.tagName === "C-SHORESH-EDITABLE-TABLE")
          section = el.dataset.type;
        if (el.dataset && el.dataset.field) field = el.dataset.field;
        if (!el.shadowRoot || !el.shadowRoot.activeElement) break;
        el = el.shadowRoot.activeElement;
      }
      return { section, field };
    });
  /** Type changed with the arrows, Tab to Notes, Enter: the move is said and the cursor follows. */
  const move = async (arrow, to, back) => {
    if (!(await tabTo((f) => f.role === "combobox", { max: 6, back })))
      throw new Error("Pool's type not reached with Tab.");
    const from = (await where()).section;
    await press("Enter", 400);
    await press(arrow, 200);
    await press("Enter", 400);
    if (!(await tabTo(named(/^Notes$/, { tag: "input" }), { max: 4 })))
      throw new Error("Pool's notes not reached with Tab.");
    await expectLive(
      L,
      `Pool to ${to} from its details: the move is said`,
      new RegExp(`^Pool moved to ${to}$`),
      () => press("Enter", 3000)
    );
    const now = await where();
    const step = `Pool to ${to}: the cursor goes with it to its notes in the new section`;
    if (now.field === "Notes__c" && now.section !== from) {
      results.pass(
        L,
        step,
        `Notes, in the section for type "${now.section || "none"}".`
      );
    } else {
      await shot(L, step);
      results.fail(
        L,
        step,
        `Focus on ${formatFocus(await focus())} (section ${now.section}, box ${now.field}).`
      );
    }
  };
  // The type's choices: None, then the camp's types, the new one among them.
  await move("ArrowDown", TYPE, false);
  await move("ArrowUp", "No location type", true);
  // The type goes again: its row's delete, then the question's button.
  const rows = shown(`${types} lightning-input[data-field="Name"] input`);
  const row = (
    await rows.evaluateAll((els) => els.map((e) => e.value))
  ).indexOf(TYPE);
  await rows.nth(row).focus();
  if (!(await tabTo(named(new RegExp(`^Delete ${TYPE}$`)), { max: 10 })))
    throw new Error(`"${TYPE}"'s delete not reached with Tab.`);
  await press("Enter", 1200);
  const go = await tabTo(
    (g) => g.inDialog && (g.dataId === "yes" || /^(OK|Delete)\b/.test(g.name)),
    { max: 6, anywhere: true }
  );
  if (!go) throw new Error("The delete question's button not reached.");
  await press("Enter", 3000);
  if ((await typeNames()).includes(TYPE))
    throw new Error(`"${TYPE}" was not deleted: delete it by hand.`);
}

/**
 * With --shots: each restyled setup screen at rest, and a group row under the pointer (the
 * mock-up's hover), saved by name for docs/design/screens/. Screenshots only; nothing is checked.
 */
async function setupShots() {
  if (!args.includes("--shots")) return;
  mkdirSync(shotsDir, { recursive: true });
  for (const [screen, re] of [
    ["Weeks", /^Weeks\b/],
    ["Divisions", /^Divisions\b/],
    ["Time blocks", /^Time blocks\b/],
    ["Locations", /^Locations\b/],
    ["Activities", /^Activities\b/],
    ["Fixed activities", /^Fixed activities/],
    ["Recurring activities", /^Recurring activities/],
    ["Groups", /^Groups\b/]
  ]) {
    await openFromMenu(screen, re);
    await page.mouse.move(2, 2);
    await pause(400);
    await page.screenshot({
      path: join(
        shotsDir,
        `setup-${screen.toLowerCase().replace(/ /g, "-")}.png`
      )
    });
  }
  const row = shown(
    'c-shoresh-editable-table[data-id="groups"] tr.row:not(.add-row)'
  ).nth(1);
  if ((await row.count()) > 0) {
    await row.hover();
    await pause(300);
    await page.screenshot({ path: join(shotsDir, "setup-groups-hover.png") });
    await page.mouse.move(2, 2);
  }
}

/**
 * The living dot field behind Roots (wiki decision 49, ADR 0015 choice 13): drawn, decoration
 * only, glowing under a moving mouse and settling back to the same picture, no errors in the
 * console, and still (the same picture under a moving mouse) when reduced motion is asked for.
 */
async function dotField() {
  const S = "Roots";
  const field = shown('[data-screen="roots"] c-shoresh-dot-field').first();
  const canvas = field.locator('canvas[data-id="dots"]');
  const errors = [];
  const onConsole = (m) => {
    if (m.type() === "error") errors.push(m.text());
  };
  const onError = (e) => errors.push(e.message);
  page.on("console", onConsole);
  page.on("pageerror", onError);
  const picture = () => canvas.evaluate((c) => c.toDataURL());
  const motion = () =>
    field.locator('[data-id="field"]').getAttribute("data-motion");
  // Along the field's top edge, right of the title: dots, no words.
  const sweep = async () => {
    const box = await field.boundingBox();
    const y = box.y + 12;
    await page.mouse.move(box.x + box.width - 200, y);
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(box.x + box.width - 200 + i * 20, y);
      await pause(16);
    }
  };
  try {
    await field.scrollIntoViewIfNeeded();
    const hidden = await canvas.getAttribute("aria-hidden");
    const rest = await picture();
    const blank = await canvas.evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return !d.some((v, i) => i % 4 === 3 && v > 0);
    });
    if (hidden !== "true" || blank) {
      results.fail(
        S,
        "The dot field is drawn, for the eye only",
        `aria-hidden: ${hidden}; ${blank ? "nothing drawn" : "drawn"}.`
      );
    } else {
      results.pass(
        S,
        "The dot field is drawn, for the eye only",
        "Dots drawn; the canvas is hidden from screen readers."
      );
    }
    const live = await motion();
    await sweep();
    const glowing = await picture();
    await page.mouse.move(2, 2);
    await pause(4000);
    const settled = await picture();
    if (live === "live" && glowing !== rest && settled === rest) {
      results.pass(
        S,
        "The dot field glows under the mouse, then settles",
        "Changed while the mouse moved; the same as at rest four seconds later."
      );
    } else {
      await shot(S, "Dot field glow");
      results.fail(
        S,
        "The dot field glows under the mouse, then settles",
        `motion ${live}; ${glowing === rest ? "no glow" : "glowed"}; ${settled === rest ? "settled" : "not settled"}.`
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await pause(300);
    const still = await motion();
    const before = await picture();
    await sweep();
    const after = await picture();
    if (still === "still" && after === before) {
      results.pass(
        S,
        "The dot field is still with reduced motion",
        "Reduced motion asked for: the same picture while the mouse moved."
      );
    } else {
      await shot(S, "Dot field reduced motion");
      results.fail(
        S,
        "The dot field is still with reduced motion",
        `motion ${still}; ${after === before ? "unchanged" : "changed"} under the mouse.`
      );
    }
  } finally {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.mouse.move(2, 2);
    page.off("console", onConsole);
    page.off("pageerror", onError);
  }
  // Salesforce's own page logs its own errors; ours name a Shoresh component or the field.
  const ours = errors.filter((t) => /shoresh|dot.?field/i.test(t));
  if (ours.length) {
    results.fail(
      S,
      "The dot field logs no errors",
      `${ours.length} error(s), first: ${scrub(ours[0]).slice(0, 200)}`
    );
  } else {
    results.pass(
      S,
      "The dot field logs no errors",
      `No Shoresh errors in the console (${errors.length} from Salesforce's own page).`
    );
  }
}

async function campSetup() {
  const S = "Camp setup";
  await step(S, "Menu reachable by Tab from the top of the page", async () => {
    const f = await tabTo(isMenuLink(/^Roots/));
    if (f)
      results.pass(
        S,
        "Menu reachable by Tab from the top of the page",
        "Reached Roots."
      );
    else throw new Error("The menu was not reached with Tab.");
  });
  await step(S, "Roots", async () => {
    await press("Enter", 1500);
    await expectFocus("Roots", "Open from the menu: focus on the heading", {
      tag: /^h[1-3]$/,
      name: /^Roots$/
    });
    await axe("Roots");
  });
  await step(S, "Roots: the living dot field", dotField);
  await step(S, "Season details: a blank name says why, readably", seasonError);
  await step(S, "Weeks", async () => {
    await openFromMenu("Weeks", /^Weeks\b/);
    await axe("Weeks");
  });
  await step(S, "Groups: a row's week ticks and details by keyboard", setupRow);
  await step(S, "Groups: a bunk moved to another unit", bunkMoves);
  await step(S, "Setup screens: screenshots", setupShots);
  await step(S, "Programs: add a card, then delete it", async () => {
    await openFromMenu("Programs", /^Programs\b/);
    const cards = () =>
      shown(
        '[data-screen="programs"] c-shoresh-program lightning-input[data-id="name"] input'
      );
    const before = await cards().count();
    if (!(await tabTo(named(/^Add program$/i, { tag: "button" }), { max: 10 })))
      throw new Error("Add program not reached with Tab.");
    await press("Enter", 3000);
    // Only the card this step added is deleted: never the camp's own programs.
    const names = await cards().evaluateAll((inputs) =>
      inputs.map((i) => i.value)
    );
    const added = names[names.length - 1];
    if (names.length !== before + 1 || !/^Program \d+$/.test(added || "")) {
      throw new Error(
        `No new program card to delete (cards: ${names.join(", ")}).`
      );
    }
    for (let i = 0; i < names.length; i++) {
      if (!(await tabTo(named(/^Delete this program$/i), { max: 40 })))
        throw new Error("The new card's Delete was not reached with Tab.");
    }
    await press("Enter", 1200);
    const go = await tabTo(
      (g) =>
        g.inDialog && (g.dataId === "yes" || /^(OK|Delete)\b/.test(g.name)),
      { max: 6, anywhere: true }
    );
    if (!go) throw new Error("The delete question's button not reached.");
    await expectLive(
      "Programs",
      `Deleting the card ${added}: it is said`,
      new RegExp(`^Deleted ${added}`),
      () => press("Enter")
    );
    await expectFocus(
      "Programs",
      "After deleting the last card: focus on the card above's name",
      { tag: "input", name: /program name/i }
    );
  });
  await step(S, "Camp words: a word is saved and said", async () => {
    await openFromMenu("Camp words", /^Camp words/, /^Words .* uses$/);
    await axe("Camp words");
    // The first row's two boxes (singular and plural): both are needed, or both cleared.
    const box = await tabTo(
      (f) => f.tag === "input" && f.components.includes("c-shoresh-camp-labels")
    );
    if (!box) throw new Error("No camp word box reached with Tab.");
    const value = () =>
      page.evaluate(() => {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
          el = el.shadowRoot.activeElement;
        }
        return el.value;
      });
    const replace = async (text) => {
      await press("ControlOrMeta+a", 50);
      if (text) await type(text);
      else await press("Backspace");
    };
    const singular = await value();
    await press("Tab", 200);
    const plural = await value();
    const [one, many] =
      singular === "Cabin" ? ["Hut", "Huts"] : ["Cabin", "Cabins"];
    await replace(many);
    await press("Shift+Tab", 200);
    await replace(one);
    await expectLive(
      "Camp words",
      "Leaving a changed pair of words: Saved is said",
      SAVED,
      () => press("Tab", 200)
    );
    await replace(plural);
    await press("Shift+Tab", 200);
    await replace(singular);
    await expectLive(
      "Camp words",
      "Putting the words back: Saved is said again",
      SAVED,
      () => press("Tab", 200)
    );
  });
  await step(
    S,
    "Locations: Same location? merges a place typed twice",
    async () => {
      await openFromMenu("Locations", /^Locations\b/);
      const L = "Locations";
      const table = 'c-shoresh-editable-table[data-id="locations"]';
      const names = () =>
        shown(`${table} lightning-input[data-field="Name"] input`).evaluateAll(
          (inputs) => inputs.map((i) => i.value).filter(Boolean)
        );
      const before = await names();
      // The seed's Pool, with Swim there; the step adds "pool" and merges it back, so the camp
      // ends as it began.
      if (!before.includes("Pool") || before.includes("pool")) {
        throw new Error(
          `The camp's places are not as expected: ${before.join(", ")}.`
        );
      }
      // Each type is its own section with its own blank row: the first one.
      await shown(`${table} [data-row-key="add"][data-field="Name"] input`)
        .first()
        .focus();
      await type("pool");
      await press("Enter", 3000);
      if (!(await names()).includes("pool"))
        throw new Error("pool was not added.");
      const button = named(/^Same location\? pool$/i, { tag: "button" });
      if (!(await tabTo(button, { back: true, max: 60 }))) {
        throw new Error("pool's Same location? not reached with Tab.");
      }
      await press("Enter", 800);
      await expectFocus(L, "Same location? opens: focus inside the question", {
        inDialog: true
      });
      await axe("Same location?");
      if (!(await tabTo(named(/^Merge$/, { tag: "button" }), { max: 8 }))) {
        throw new Error("Merge not reached with Tab.");
      }
      await press("Enter", 4000);
      const after = await names();
      if (
        after.includes("pool") ||
        after.filter((n) => n === "Pool").length !== 1 ||
        (await exists("c-shoresh-same-location"))
      ) {
        await shot(L, "Merge");
        results.fail(
          L,
          "Merge: one Pool is left",
          `Places now: ${after.join(", ")}.`
        );
      } else {
        results.pass(
          L,
          "Merge: one Pool is left",
          `Places now: ${after.join(", ")}.`
        );
      }
      await expectFocus(L, "After merging: focus on the kept place's row", {
        tag: "input"
      });
    }
  );
  await step(
    S,
    "Locations: a place whose type changes takes the cursor to its new section",
    placeChangesType
  );
  /** The camp row's small menu (step 3b): Enter opens it on New season; the arrows move. */
  const seasonAction = async (re) => {
    const menu =
      (await tabTo(named(/^Season actions$/, { tag: "button" }), {
        back: true,
        max: 60
      })) ||
      (await tabTo(named(/^Season actions$/, { tag: "button" }), { max: 280 }));
    if (!menu) throw new Error("Season actions not reached with Tab.");
    await press("Enter", 500);
    for (let i = 0; i < 3; i++) {
      const f = await focus();
      if (f && re.test(f.name)) {
        await press("Enter", 800);
        return;
      }
      await press("ArrowDown", 200);
    }
    throw new Error(`${re} not reached in Season actions with the arrows.`);
  };
  await step(
    S,
    "New season: from Season actions, heading, then Cancel back to the menu",
    async () => {
      await seasonAction(/^New season$/);
      await expectFocus("New season", "Opening it: focus on its heading", {
        tag: /^h[1-3]$/,
        name: /new season/i
      });
      await axe("New season");
      if (!(await tabTo(named(/^Cancel$/), { max: 15 })))
        throw new Error("Cancel not reached.");
      await press("Enter", 800);
      await expectFocus("New season", "Cancel: focus back on Season actions", {
        tag: "button",
        name: /^Season actions$/
      });
    }
  );
  await step(
    S,
    "Copy this season: from Season actions, heading, then Cancel back to the menu",
    async () => {
      await seasonAction(/^Copy this season$/);
      await expectFocus(
        "Copy this season",
        "Opening it: focus on its heading",
        {
          tag: /^h[1-3]$/,
          name: /copy season/i
        }
      );
      await axe("Copy this season");
      if (!(await tabTo(named(/^Cancel$/), { max: 15 })))
        throw new Error("Cancel not reached.");
      await press("Enter", 800);
      await expectFocus(
        "Copy this season",
        "Cancel: focus back on Season actions",
        {
          tag: "button",
          name: /^Season actions$/
        }
      );
    }
  );
  await step(S, "Season pencil: open and close keep focus on it", async () => {
    // The pencil sits just before Season actions in the menu's camp row (where the step before
    // left focus), so Shift+Tab reaches it at once.
    const b =
      (await tabTo(named(/^Edit /, { tag: "button" }), {
        back: true,
        max: 6
      })) || (await tabTo(named(/^Edit /, { tag: "button" }), { max: 280 }));
    if (!b) throw new Error("The season's pencil not reached with Tab.");
    await press("Enter", 800);
    await expectFocus(
      "Season details",
      "Opening it: focus stays on the pencil",
      {
        tag: "button",
        name: /^Edit /
      }
    );
    await axe("Season details");
    // Into the box (after the camp row's controls), back to the pencil.
    if (!(await tabTo((f) => f.tag === "input", { max: 6 }))) {
      throw new Error("The season's name box not reached with Tab.");
    }
    if (
      !(await tabTo(named(/^Edit /, { tag: "button" }), { back: true, max: 6 }))
    ) {
      throw new Error("Shift+Tab from the box did not reach the pencil.");
    }
    await press("Enter", 800);
    await expectFocus(
      "Season details",
      "Closing it: focus stays on the pencil",
      {
        tag: "button",
        name: /^Edit /
      }
    );
    if (await exists('lightning-input[data-field="start"]')) {
      throw new Error("The season's box did not close.");
    }
  });
  await step(
    S,
    "Activities: how often and the details beside the table",
    activityPanel
  );
  await step(
    S,
    "Activities: a priority changed in the details moves the row to its section",
    activityChangesPriority
  );
  await step(
    S,
    "Activities: a guessed how often is marked, and Looks right clears it",
    guessedMark
  );
  await step(S, "Fixed activities", async () => {
    await openFromMenu("Fixed activities", /^Fixed activities/);
    await axe("Fixed activities");
  });
  await step(
    S,
    "Recurring activities: a row's day ticks by keyboard",
    recurringRow
  );
  await step(
    S,
    "Special events: a special day added, its details and schedule, put on a day, then deleted",
    specialEvents
  );
}

/**
 * Special events (ADR 0014 choices 11 and 12): axe on the screen; a special day typed into the
 * Special days section's blank row and added with Enter, what it started from read out (role
 * status); its chevron opens its details beside the list with focus on their heading, axe on
 * them open, Close putting focus back on the chevron; then the row's delete and the question's
 * button delete it again (only the special day this step added).
 */
async function specialEvents() {
  const E = "Special events";
  const DAY = "Check day";
  await openFromMenu(E, /^Special events/);
  await axe(E);
  const days = 'c-shoresh-editable-table[data-id="special-days"]';
  const names = () =>
    shown(`${days} lightning-input[data-field="Name"] input`).evaluateAll(
      (inputs) => inputs.map((i) => i.value).filter(Boolean)
    );
  if ((await names()).includes(DAY)) {
    throw new Error(
      `"${DAY}" is already a special day: a run before this one stopped part way.`
    );
  }
  await shown(`${days} [data-row-key="add"][data-field="Name"] input`).focus();
  await type(DAY);
  await expectLive(
    E,
    "A special day added: what it started from is said",
    new RegExp(`^"${DAY}" (starts from|has no)`),
    () => press("Enter", 4000)
  );
  if (!(await names()).includes(DAY))
    throw new Error(`"${DAY}" was not added.`);
  const inputs = shown(`${days} lightning-input[data-field="Name"] input`);
  const at = (
    await inputs.evaluateAll((els) => els.map((e) => e.value))
  ).indexOf(DAY);
  await inputs.nth(at).focus();
  const chevron = await tabTo(
    named(new RegExp(`^${DAY} details$`), { tag: "button" }),
    { max: 20 }
  );
  if (!chevron) throw new Error(`${DAY}'s details chevron not reached.`);
  await press("Enter", 1200);
  await expectFocus(E, "Opening an item's details: focus on their heading", {
    tag: /^h[1-3]$/,
    name: new RegExp(`^${DAY} details$`)
  });
  await axe("Special events, an item's details open");
  await specialSchedule(E, DAY);
  await putOnADay(E, DAY);
  if (
    !(await tabTo(
      named(new RegExp(`^Close ${DAY} details$`), { tag: "button" }),
      {
        max: 8,
        back: true
      }
    ))
  )
    throw new Error("The details' Close was not reached with Tab.");
  await press("Enter", 800);
  await expectFocus(E, "Closing the details: focus back on the row's chevron", {
    tag: "button",
    name: new RegExp(`^${DAY} details$`)
  });
  // On a day, it can't be deleted (ADR 0014 choice 8): taken off first. Take off comes with
  // slice 6, so here it is Apex, and only this step's special day in the check's camp.
  apex(`
delete [SELECT Id FROM SpecialDate__c WHERE SpecialDay__r.Name = '${DAY}' AND Season__r.Camp__r.Name = '${CAMP}'];
`);
  await inputs.nth(at).focus();
  if (!(await tabTo(named(new RegExp(`^Delete ${DAY}$`)), { max: 20 })))
    throw new Error(`"${DAY}"'s delete not reached with Tab.`);
  await press("Enter", 1200);
  const go = await tabTo(
    (g) => g.inDialog && (g.dataId === "yes" || /^(OK|Delete)\b/.test(g.name)),
    { max: 6, anywhere: true }
  );
  if (!go) throw new Error("The delete question's button not reached.");
  await press("Enter", 3000);
  if ((await names()).includes(DAY))
    throw new Error(`"${DAY}" was not deleted: delete it by hand.`);
}

/**
 * The schedule inside a special day (ADR 0014 choices 14 and 15), from its details: Open schedule
 * opens it with focus on its name, axe looks at it, a name typed into a cell is saved and said,
 * and "Special events" goes back with focus on Open schedule. The cell typed in is the special
 * day's own, which the step deletes after.
 */
async function specialSchedule(E, DAY) {
  if (!(await tabTo(named(/^Open schedule$/, { tag: "button" }), { max: 12 })))
    throw new Error("Open schedule was not reached with Tab.");
  await press("Enter", 3000);
  await expectFocus(E, "Open schedule: focus on the schedule's name", {
    tag: /^h[1-3]$/,
    name: new RegExp(`^${DAY}$`)
  });
  await axe("Special events, a special day's schedule");
  const cell = await tabTo(grid, { max: 40 });
  if (!cell)
    throw new Error("No cell of the special day's grid reached with Tab.");
  await press("Enter", 500);
  await expectFocus(
    E,
    "Enter on a special day's cell: focus in the typing box",
    {
      dataId: "slot-input"
    }
  );
  await type("Swim");
  await pause(400);
  await expectLive(
    E,
    "A name typed into a special day's cell: its save is said",
    /Swim/,
    () => press("Enter")
  );
  if (
    !(await tabTo(named(/^Special events$/, { tag: "button" }), {
      max: 40,
      back: true
    }))
  )
    throw new Error("The schedule's way back was not reached with Tab.");
  await press("Enter", 2000);
  await expectFocus(E, "Back to Special events: focus on Open schedule", {
    tag: "button",
    name: /^Open schedule$/
  });
}

/**
 * Put on a day (ADR 0014 slice 4), in the special day's details: from Open schedule, Shift+Tab
 * reaches "Put on a day"; Enter opens the week and day with focus on the week (axe looks at it);
 * Tab reaches "Put on" and Enter puts it on the first week's first day, what was done said (role
 * status) and focus back on "Put on a day".
 */
async function putOnADay(E, DAY) {
  if (
    !(await tabTo(named(/^Put on a day$/, { tag: "button" }), {
      max: 12,
      back: true
    }))
  )
    throw new Error("Put on a day was not reached with Tab.");
  await press("Enter", 800);
  await expectFocus(E, "Put on a day: focus on the week", {
    dataId: "place-week"
  });
  await axe("Special events, putting a special day on a day");
  if (!(await tabTo(named(/^Put on$/, { tag: "button" }), { max: 4 })))
    throw new Error("Put on was not reached with Tab.");
  await expectLive(
    E,
    "Put on a day: what was done is said",
    new RegExp(`^"${DAY}" is on \\w+day of "`),
    () => press("Enter", 3000)
  );
  await expectFocus(E, "Put on: focus back on Put on a day", {
    tag: "button",
    name: /^Put on a day$/
  });
}

/** The first saved row's name box in the screen's tables, reached with Tab. */
const rowNameBox = (max = 30) =>
  tabTo(
    (f) =>
      f.tag === "input" &&
      f.type !== "checkbox" &&
      f.components.includes("c-shoresh-editable-table") &&
      !/^Add /.test(f.name),
    { max }
  );

/**
 * Activities in the step 3b layout (docs/design/setup/activities.html): from a row's name box,
 * Tab reaches its "how often" numbers (bars at rest, the numbers in their place while the row is
 * edited); its chevron opens its details beside the table with focus on their heading, axe looks
 * at them open, and Close puts focus back on the chevron.
 */
async function activityPanel() {
  const A = "Activities";
  await openFromMenu(A, /^Activities\b/);
  await axe("Activities");
  if (!(await rowNameBox()))
    throw new Error("No activity's name box was reached with Tab.");
  const often = await tabTo(named(/: at least$/, { tag: "input" }), { max: 6 });
  const STEP =
    "While a row is edited, how often's numbers show and Tab reaches them";
  if (often) results.pass(A, STEP, `Reached "${often.name}".`);
  else {
    await shot(A, "How often");
    results.fail(
      A,
      STEP,
      "No 'at least' box was reached from the row's name box."
    );
  }
  const chevron = await tabTo(named(/ details$/, { tag: "button" }), {
    max: 40
  });
  if (!chevron) throw new Error("The row's details chevron was not reached.");
  await press("Enter", 1500);
  await expectFocus(A, "Opening a row's details: focus on their heading", {
    tag: /^h[1-3]$/,
    name: / details$/
  });
  await axe("Activities, a row's details open");
  if (args.includes("--shots")) {
    mkdirSync(shotsDir, { recursive: true });
    await page.mouse.move(2, 2);
    await pause(400);
    await page.screenshot({
      path: join(shotsDir, "setup-activities-details.png")
    });
  }
  if (
    !(await tabTo(named(/^Close .* details$/, { tag: "button" }), { max: 6 }))
  )
    throw new Error("The details' Close was not reached with Tab.");
  await press("Enter", 800);
  await expectFocus(A, "Closing the details: focus back on the row's chevron", {
    tag: "button",
    name: new RegExp(`^${chevron.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)
  });
}

/**
 * Rules Shoresh guessed are marked for a look (decision 45; ADR 0006 §21): the activity seeded
 * as guessed (seedGuess) carries the corner on its how often. By keyboard: Tab reaches the mark,
 * Enter opens its words with the cursor on Looks right, Escape closes them with the cursor back
 * on the mark; Enter again and Looks right clears the mark, said, with the cursor on the row's
 * "at least" box. axe looks at the page with the words open.
 */
async function guessedMark() {
  const A = "Activities";
  await openFromMenu(A, /^Activities\b/);
  const escaped = guessed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markName = new RegExp(
    `^How often for ${escaped}: guessed from your file$`
  );
  const mark = await tabTo(named(markName, { tag: "button" }), { max: 200 });
  if (!mark) throw new Error(`${guessed}'s guessed mark was not reached.`);
  results.pass(A, "A guessed how often: Tab reaches its mark", mark.name);
  await press("Enter", 400);
  await expectFocus(A, "Opening the mark: the cursor on Looks right", {
    tag: "button",
    name: /^Looks right$/
  });
  await axe("Activities, a guessed mark open");
  await press("Escape", 300);
  await expectFocus(A, "Escape: the cursor back on the mark", {
    tag: "button",
    name: markName
  });
  await press("Enter", 400);
  await expectLive(
    A,
    "Looks right: said",
    new RegExp(`^${escaped}: looks right$`),
    () => press("Enter", 200)
  );
  await expectFocus(A, "Looks right: the cursor on the row's at least box", {
    tag: "input",
    name: /: at least$/
  });
  const left = await shown('c-shoresh-guess-mark[data-id="guess"]').count();
  if (left === 0)
    results.pass(A, "Looks right: the mark is gone", "None left.");
  else results.fail(A, "Looks right: the mark is gone", `${left} still shown.`);
}

/**
 * Activities grouped by priority (desktop ActivitiesScreen.jsx, decision 45): an activity whose
 * priority is changed in its details moves to the other section, its row still marked open and
 * the cursor kept on Priority; Close puts the cursor on its chevron in the section it is in now.
 * The step changes the first activity to the other priority and back, so the camp ends as it
 * began.
 */
async function activityChangesPriority() {
  const A = "Activities";
  await openFromMenu(A, /^Activities\b/);
  const sections = 'c-shoresh-editable-table[data-id="activities"]';
  // Which section shows the activity (each is its own table), and whether its row is marked
  // open there.
  const sectionOf = (name) =>
    page
      .locator(APP)
      .locator(sections)
      .evaluateAll((tables, n) => {
        for (const t of tables) {
          const box = [
            ...t.shadowRoot.querySelectorAll(
              'lightning-input[data-field="Name"]'
            )
          ].find((i) => i.value === n && i.dataset.rowKey !== "add");
          if (box) {
            const chevron = t.shadowRoot.querySelector(
              `[data-id="details"][data-row-key="${box.dataset.rowKey}"]`
            );
            return {
              priority: t.dataset.priority,
              open: chevron && chevron.getAttribute("aria-expanded") === "true"
            };
          }
        }
        return null;
      }, name);
  const inputs = shown(`${sections} lightning-input[data-field="Name"] input`);
  const name = (await inputs.evaluateAll((els) => els.map((e) => e.value)))[0];
  if (!name) throw new Error("No activity in the camp.");
  const from = (await sectionOf(name)).priority;
  const to = from === "High" ? "Low" : "High";
  await inputs.first().focus();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const chevron = await tabTo(
    named(new RegExp(`^${escaped} details$`), { tag: "button" }),
    { max: 40 }
  );
  if (!chevron) throw new Error(`${name}'s details chevron not reached.`);
  await press("Enter", 1500);
  /** Priority, by keyboard: Enter opens it, the arrow picks the other, Enter chooses it. */
  const onPriority = (f) =>
    !!f && f.role === "combobox" && /^Priority/.test(f.name);
  const change = async (want, arrow) => {
    // The cursor stays on Priority after a change, so it may be there already.
    if (!onPriority(await focus()) && !(await tabTo(onPriority, { max: 20 })))
      throw new Error(`${name}'s Priority not reached with Tab.`);
    await press("Enter", 400);
    await press(arrow, 200);
    await press("Enter", 3000);
    const now = await sectionOf(name);
    const STEP = `${name} to ${want}: its row moves to the ${want} section, still marked open`;
    if (now && now.priority === want && now.open) {
      results.pass(A, STEP, `In the ${want} section, its chevron expanded.`);
    } else {
      await shot(A, STEP);
      results.fail(
        A,
        STEP,
        `Section ${now && now.priority}, chevron expanded ${now && now.open}.`
      );
    }
    await expectFocus(A, `${name} to ${want}: the cursor stays on Priority`, {
      role: "combobox",
      name: /^Priority/
    });
  };
  // The choices are High, then Low.
  await change(to, to === "High" ? "ArrowUp" : "ArrowDown");
  await change(from, from === "High" ? "ArrowUp" : "ArrowDown");
  await change(to, to === "High" ? "ArrowUp" : "ArrowDown");
  if (
    !(await tabTo(named(/^Close .* details$/, { tag: "button" }), {
      max: 20,
      back: true
    }))
  )
    throw new Error("The details' Close was not reached with Tab.");
  await press("Enter", 800);
  await expectFocus(
    A,
    `Closing the details: focus on ${name}'s chevron in the ${to} section`,
    { tag: "button", name: new RegExp(`^${escaped} details$`) }
  );
  // Back as it began: the details again, Priority back.
  await press("Enter", 1500);
  await change(from, from === "High" ? "ArrowUp" : "ArrowDown");
  if (
    !(await tabTo(named(/^Close .* details$/, { tag: "button" }), {
      max: 20,
      back: true
    }))
  )
    throw new Error("The details' Close was not reached with Tab.");
  await press("Enter", 800);
}

/**
 * Recurring activities in sections (docs/design/setup/fixed.html): from a row's name box, Tab
 * reaches its day ticks (the days in words at rest, a tick per day while the row is edited).
 * Nothing is changed.
 */
async function recurringRow() {
  const R = "Recurring activities";
  await openFromMenu(R, /^Recurring activities/);
  await axe("Recurring activities");
  if (!(await rowNameBox())) {
    results.notRun(
      R,
      "A row's day ticks by keyboard",
      "No recurring activity in the camp."
    );
    return;
  }
  const day = await tabTo(
    (f) =>
      f.tag === "input" &&
      f.type === "checkbox" &&
      /^(Monday|Tuesday|Wednesday|Thursday|Friday)$/.test(f.name),
    { max: 8 }
  );
  const STEP = "While a row is edited, its day ticks show and Tab reaches them";
  if (day) results.pass(R, STEP, `Reached "${day.name}".`);
  else {
    await shot(R, "Day ticks");
    results.fail(R, STEP, "No day tick was reached from the row's name box.");
  }
}

/**
 * The rail's counter ("29 of 35 placed"): Enter opens its dropdown (the bar, still needed,
 * under, over), axe looks at it open, and Escape closes it with focus still on the counter.
 */
async function counterMenu(S) {
  if (!(await openRailMenu(/^\d+ of \d+ placed\b/)))
    throw new Error("The counter not reached with Tab.");
  const opened = await page
    .locator(APP)
    .locator("c-shoresh-week-checks >> visible=true")
    .first()
    .evaluate((el) => {
      const pop = el.shadowRoot.querySelector('[data-id="counter"]');
      const word = pop.shadowRoot.querySelector('[data-id="button"]');
      return word.getAttribute("aria-expanded");
    });
  if (opened === "true") {
    results.pass(S, "The counter: Enter opens it", "aria-expanded is true.");
  } else {
    await shot(S, "The counter opens");
    results.fail(
      S,
      "The counter: Enter opens it",
      `aria-expanded is ${opened}.`
    );
  }
  await axe(`${S}: the counter open`);
  await press("Escape", 400);
  await expectFocus(S, "The counter: Escape closes it, focus on the counter", {
    name: /^\d+ of \d+ placed\b/
  });
}

async function manualBuild(openManual) {
  const S = "Manual Build";
  await step(S, "Open", openManual);
  await step(S, "Week arrows: the last week", () => weekArrowEnd(S));
  await step(S, "Start the week (when not started)", async () => {
    if (!(await exists('[data-id="start-week"]'))) {
      results.pass(S, "Start the week (when not started)", "Already started.");
      return;
    }
    if (!(await tabTo(named(/^Start a blank/))))
      throw new Error("Start not reached with Tab.");
    await expectLive(S, "Start a blank week: it is said", /Started/i, () =>
      press("Enter")
    );
    await expectFocusKept(
      S,
      "Start a blank week: focus not lost when the button goes"
    );
  });
  await step(S, "axe", () => axe(S));
  await step(S, "Rail", () => toolbarReach(S));
  await step(S, "The counter: open, Escape", () => counterMenu(S));
  await step(S, "The counter: Accept a line with the keyboard", () =>
    acceptLine(S)
  );
  await step(S, "Place an activity by typing", async () => {
    const cell = await tabTo(grid);
    if (!cell) throw new Error("No grid cell reached with Tab.");
    // Down to the second time block: the first holds the made-up camp's Morning meeting.
    await press("ArrowDown", 200);
    const here = (await focus()).name;
    const activity = /Swim/.test(here) ? "Art" : "Swim";
    await press("Enter", 500);
    await expectFocus(S, "Enter on a cell: focus in the typing box", {
      dataId: "slot-input"
    });
    await type(activity);
    await pause(400);
    await expectLive(
      S,
      `Return places ${activity}: it is said`,
      new RegExp(activity),
      () => press("Enter")
    );
    await expectFocus(S, "After placing: focus back on the cell", {
      inGrid: true
    });
    await press("Enter", 500);
    await press("Escape", 400);
    await expectFocus(S, "Escape in the typing box: focus back on the cell", {
      inGrid: true
    });
  });
  await step(
    S,
    "Ctrl+Z and Ctrl+Shift+Z, with focus anywhere but a box",
    async () => {
      // The step before left focus on the cell it placed an activity in: that placing is the
      // newest step.
      await expectLive(
        S,
        "Ctrl+Z on the grid: Undone is said",
        /^Undone: /,
        () => press("ControlOrMeta+z")
      );
      // Focus on the page itself, as after a click on the background or a drag.
      const cell = await page.evaluateHandle(() => {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
          el = el.shadowRoot.activeElement;
        }
        return el;
      });
      await cell.evaluate((el) => el.blur());
      if (await focus()) throw new Error("Focus did not leave the grid.");
      await expectLive(
        S,
        "Ctrl+Shift+Z with nothing focused: Redone is said",
        /^Redone: /,
        () => press("ControlOrMeta+Shift+z")
      );
      // A box keeps its own Ctrl+Z: typing in Filter and undoing it changes no schedule.
      const filter = shown(
        'c-shoresh-build-palette [data-id="palette-filter"]'
      );
      await filter.focus();
      await watchLive();
      await type("x");
      await press("ControlOrMeta+z", 1500);
      const said = await page.evaluate(() => window.__a11yLive || []);
      if (said.some((t) => /^Undone: /.test(t))) {
        await shot(S, "Ctrl+Z in Filter");
        results.fail(
          S,
          "Ctrl+Z in the Filter box: no schedule Undo",
          `Said: "${said.join('", "')}".`
        );
      } else {
        results.pass(
          S,
          "Ctrl+Z in the Filter box: no schedule Undo",
          "Nothing undone."
        );
      }
      await filter.fill("");
      await cell.evaluate((el) => el.focus());
    }
  );
  await step(S, "Stretch by the handle with the mouse, then its Undo", () =>
    stretchByHandle(S)
  );
  await step(S, "The drawer: hold a tile, its outlines and fits here", () =>
    holdTile(S)
  );
  await step(S, "Same-activity outlines: point at a cell", () =>
    hoverOutlines(S, { arrange: true })
  );
  await step(S, "Clear day, then its Undo", async () => {
    // Clear day is in the rail's Edit menu, after Undo and Redo.
    if (!(await openRailMenu(/^Edit$/))) {
      throw new Error("Edit not reached with Tab.");
    }
    await expectFocus(S, "Edit opens: focus on its first row", {
      role: "menuitem"
    });
    if (!(await arrowTo(/^Clear day$/))) {
      throw new Error("Clear day not reached with the arrows in Edit.");
    }
    await expectLive(
      S,
      "Clear day: it is said",
      /Cleared|Nothing to clear/i,
      () => press("Enter")
    );
    const f = await expectFocus(S, "Clear day: focus on the line's Undo", {
      dataId: "tool-undo"
    });
    if (f && f.dataId === "tool-undo") {
      await expectLive(S, "Its Undo: it is said", /^Undone/, () =>
        press("Enter")
      );
      await expectFocusKept(S, "Its Undo: focus not lost");
    }
  });
  await step(S, "Copy day to…, then focus", async () => {
    if (!(await openRailMenu(/^Edit$/)))
      throw new Error("Edit not reached with Tab.");
    if (!(await arrowTo(/^Copy day to/)))
      throw new Error("Copy day to… not reached with the arrows in Edit.");
    // Enter opens its days under it; Down goes to the first.
    await press("Enter", 400);
    await press("ArrowDown", 200);
    await expectFocus(S, "Copy day to… opens: Down reaches its first day", {
      role: "menuitem",
      name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/
    });
    await press("Escape", 400);
    await expectFocus(S, "Escape: focus back on Edit", { name: /^Edit$/ });
    await press("Enter", 500);
    if (!(await arrowTo(/^Copy day to/)))
      throw new Error("Copy day to… not reached again.");
    await press("Enter", 400);
    await press("ArrowDown", 200);
    await expectLive(S, "Choosing a day: it is said", /Copied|Nothing/i, () =>
      press("Enter")
    );
    const f = await expectFocus(S, "After copying: focus on the line's Undo", {
      dataId: "tool-undo"
    });
    if (f && f.dataId === "tool-undo") await press("Enter", 1500);
  });
  await step(S, "Copy and paste cells with the keys, then its Undo", () =>
    copyPasteCells(S)
  );
}

/** The drawer's activity names, in its order. */
async function drawerNames() {
  return shown("c-shoresh-build-palette")
    .first()
    .evaluate((d) =>
      [
        ...(d.shadowRoot || d).querySelectorAll(
          "[data-id='drawer-tiles'] .tile-name"
        )
      ]
        .map((n) => n.textContent.trim())
        .filter(Boolean)
    );
}

/**
 * Copy and paste (Greg decision 45, ADR 0008 part 9), keyboard only. Bunks 1 and 2 must hold an
 * activity each in the second time block (one is typed in first when Open), and a later block
 * must be Open for both. Shift+Right chooses the two cells (said, and both marked chosen),
 * Ctrl/Cmd+C copies them, Down lets the choice go and moves to that Open block, Ctrl/Cmd+V
 * pastes there with focus kept on the grid, and the two cells must then hold the copied
 * activities. Ctrl/Cmd+Z takes the paste back in one step: both cells Open again. "Nothing to
 * paste" is never a pass. Whatever was typed in to arrange it is undone after.
 */
async function copyPasteCells(S) {
  const name = "Copy and paste: the pasted cells hold the copied activities";
  const at = (cells, key) => cells.find((c) => c.key === key);
  let cells = await gridCells();
  const from = ["0-1", "1-1"];
  const names = await drawerNames();
  // As found, to put back: the activity in each, or null for Open.
  const found = from.map((k) => {
    const c = at(cells, k);
    return c && isPlaced(c) ? c.name : null;
  });
  let placed = 0;
  let to = null;
  try {
    for (const key of from) {
      const c = at(cells, key);
      if (c && isPlaced(c)) continue;
      if (!c || !isFreeOpen(c) || !names.length) {
        results.notRun(
          S,
          name,
          `${key} holds neither an activity nor an Open cell to type one into.`
        );
        return;
      }
      // Counted first: a typing that fails halfway may still have saved.
      placed += 1;
      await placeAt(key, names[(placed - 1) % names.length]);
      cells = await gridCells();
    }
    const copied = from.map((k) => at(cells, k).name);
    const rows = [...new Set(cells.map((c) => Number(c.key.split("-")[1])))]
      .filter((r) => r > 1)
      .sort((x, y) => x - y);
    const row = rows.find((r) =>
      ["0", "1"].every((g) => {
        const c = at(cells, `${g}-${r}`);
        return c && isFreeOpen(c);
      })
    );
    if (row === undefined) {
      results.notRun(
        S,
        name,
        "No later time block is Open for both Bunk 1 and Bunk 2 to paste onto."
      );
      return;
    }
    to = ["0", "1"].map((g) => `${g}-${row}`);
    await focusCell(from[0]);
    await expectLive(
      S,
      "Shift+Right: two cells chosen, said",
      /^2 selected$/,
      () => press("Shift+ArrowRight", 300)
    );
    const chosen = (await gridCells()).filter((c) =>
      /\bcell_chosen\b/.test(c.classes)
    );
    if (chosen.length === 2) {
      results.pass(S, "Shift+Right: two cells marked chosen", "2 marked.");
    } else {
      await shot(S, "Two cells chosen");
      results.fail(
        S,
        "Shift+Right: two cells marked chosen",
        `${chosen.length} marked.`
      );
    }
    await expectLive(S, "Ctrl+C: Copied is said", /^Copied /, () =>
      press("ControlOrMeta+c")
    );
    // Down lets the choice go and moves on; the paste lands at the cell with focus, Bunk 1's.
    for (let r = 1; r < row; r++) await press("ArrowDown", 200);
    if ((await focusedCellKey()) !== to[0]) await focusCell(to[0]);
    const said = await expectLive(
      S,
      "Ctrl+V on an Open block: it is said",
      /^(Pasted |Nothing pasted|Nothing to paste)/,
      () => press("ControlOrMeta+v")
    );
    await expectFocus(S, "After pasting: focus stays on the grid", {
      inGrid: true
    });
    if (!said || !/^Pasted /.test(said)) {
      results.notRun(
        S,
        name,
        `Nothing was pasted (${said ? `"${said}"` : "nothing said"}), so the paste and its Undo were not checked.`
      );
      return;
    }
    await pause(500);
    cells = await gridCells();
    const now = to.map((k) => (at(cells, k) || {}).name);
    if (now.every((n, i) => n === copied[i])) {
      results.pass(S, name, `${to.join(", ")} now hold ${copied.join(", ")}.`);
    } else {
      await shot(S, "Pasted cells");
      results.fail(
        S,
        name,
        `Copied ${copied.join(", ")}; ${to.join(", ")} hold ${now.join(", ")}.`
      );
    }
    await expectLive(
      S,
      "Ctrl+Z: the paste is undone in one step",
      /^Undone: Pasted /,
      () => press("ControlOrMeta+z")
    );
    await pause(500);
    cells = await gridCells();
    const back = to.map((k) => at(cells, k));
    if (back.every((c) => c && isFreeOpen(c))) {
      results.pass(
        S,
        "One Undo: both pasted cells are Open again",
        `${to.join(", ")} Open.`
      );
    } else {
      await shot(S, "After undoing the paste");
      results.fail(
        S,
        "One Undo: both pasted cells are Open again",
        `${to.map((k, i) => `${k} ${(back[i] || {}).name}`).join(", ")}.`
      );
    }
  } finally {
    // Put the camp back whatever happened above: the paste first (its cells were Open), then
    // what was typed in, each Undo said and stopping once the cells are as found.
    const isBack = async (keys, want) => {
      const now = await gridCells();
      return keys.every((k, i) => {
        const c = at(now, k);
        return c && (want[i] === null ? isFreeOpen(c) : c.name === want[i]);
      });
    };
    await focusCell(from[0]);
    if (to) {
      await undoSteps(1, {
        re: /^Undone: Pasted /,
        done: () => isBack(to, [null, null])
      });
    }
    await undoSteps(placed, { done: () => isBack(from, found) });
  }
}

/**
 * Greg's drag (2026-10-21): the activity placed in Bunk 1's second time block, its bottom handle
 * pressed a little below the visible bar (still in the handle's area, as a trackpad press lands),
 * moved down in small steps past the next block's line into the fixed activity after it, and let
 * go. While moving, the cell itself must span two blocks and the fixed activity carry the ghost;
 * after, the placement runs two blocks and that is said. Ctrl+Z puts it back.
 */
async function stretchByHandle(S) {
  const editGrid = shown(
    'c-shoresh-schedule-grid[data-id="edit-grid"]'
  ).first();
  const cellAt = (key) => editGrid.locator(`[data-cell="${key}"]`);
  const [from, open, stop] = ["0-1", "0-2", "0-3"].map(cellAt);
  const textOf = async (cell) =>
    ((await cell.textContent()) || "").replace(/\s+/g, " ").trim();
  if (!/\S/.test(await textOf(from)) || (await textOf(open)) !== "Open") {
    throw new Error(
      `Bunk 1 is not an activity then Open (it shows "${await textOf(from)}", "${await textOf(open)}").`
    );
  }
  if ((await stop.getAttribute("draggable")) === "true") {
    throw new Error(
      "The third time block is not a fixed activity in the made-up camp."
    );
  }
  const name = await textOf(from);
  await from.scrollIntoViewIfNeeded();
  await stop.scrollIntoViewIfNeeded();
  const bar = await from.locator("[data-handle-bar]").boundingBox();
  const target = await stop.boundingBox();
  if (!bar || !target)
    throw new Error("The handle or the slot below is not on screen.");
  const x = bar.x + bar.width / 2;
  const y = bar.y + bar.height / 2 + 6;
  const toY = target.y + target.height / 2;
  await page.mouse.move(x, y);
  await pause(200);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(x, y + ((toY - y) * i) / 20);
    await pause(30);
  }
  const during = await editGrid.evaluate((g) => {
    const root = g.shadowRoot || g;
    const growing = root.querySelector(".cell_stretching");
    const ghost = root.querySelector(".cell_stretch-blocked");
    return {
      growing: growing ? growing.dataset.cell : null,
      span: growing
        ? (/span (\d+);/.exec(growing.getAttribute("style")) || [])[1]
        : null,
      ghost: ghost ? `${ghost.dataset.cell} ${ghost.dataset.ghost}` : null
    };
  });
  if (during.growing === "0-1" && during.span === "2") {
    results.pass(
      S,
      "Stretch: the cell grows live under the pointer",
      "It spans 2 blocks while held."
    );
  } else {
    await shot(S, "Stretch while held");
    results.fail(
      S,
      "Stretch: the cell grows live under the pointer",
      `While held: growing ${during.growing || "nothing"}, span ${during.span || "none"}.`
    );
  }
  if (during.ghost === `0-3 ${name}`) {
    results.pass(
      S,
      "Stretch: the slot that stops it shows a ghost",
      `Ghost of ${name} on the fixed activity.`
    );
  } else {
    results.fail(
      S,
      "Stretch: the slot that stops it shows a ghost",
      `Ghost: ${during.ghost || "none"}.`
    );
  }
  await expectLive(
    S,
    "Stretch: letting go keeps it longer, and it is said",
    new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} runs 2 `),
    () => page.mouse.up()
  );
  await pause(1000);
  const span = await from.getAttribute("aria-rowspan");
  if (span === "2") {
    results.pass(
      S,
      "Stretch: the placement runs 2 blocks after letting go",
      "aria-rowspan 2."
    );
  } else {
    await shot(S, "Stretch after letting go");
    results.fail(
      S,
      "Stretch: the placement runs 2 blocks after letting go",
      `aria-rowspan ${span}.`
    );
  }
  await expectLive(S, "Stretch: Ctrl+Z puts it back", /^Undone: /, () =>
    press("ControlOrMeta+z")
  );
}

/**
 * The grid's cells on screen, as { key, name, classes, span } (through the grid's shadow root);
 * span is how many time blocks the cell runs.
 */
async function gridCells() {
  return shown('c-shoresh-schedule-grid[data-id="edit-grid"]')
    .first()
    .evaluate((g) =>
      [...(g.shadowRoot || g).querySelectorAll("[data-cell]")].map((c) => {
        const name = c.querySelector(".cell-name");
        return {
          key: c.dataset.cell,
          name: name ? name.textContent.trim() : "",
          classes: c.className,
          span: Number(c.getAttribute("aria-rowspan") || 1)
        };
      })
    );
}

/** A one-block cell a director can type an activity into: Open, not locked or away. */
const isFreeOpen = (c) =>
  /\bcell_open\b/.test(c.classes) &&
  !/\bcell_(locked|locked-empty|away)\b/.test(c.classes) &&
  c.span === 1;

/** A one-block placed activity a director put there (not a fixed one, not locked). */
const isPlaced = (c) =>
  /\bcell_activity\b/.test(c.classes) &&
  !/\bcell_locked\b/.test(c.classes) &&
  c.span === 1 &&
  c.name;

/** Puts focus on a grid cell by its key ("bunk-block"), as a click would. */
async function focusCell(key) {
  await shown('c-shoresh-schedule-grid[data-id="edit-grid"]')
    .first()
    .locator(`[data-cell="${key}"]`)
    .focus();
  await pause(200);
}

/** The key of the grid cell with focus, or null. */
async function focusedCellKey() {
  return page.evaluate(() => {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    const cell = el && el.closest && el.closest("[data-cell]");
    return cell ? cell.dataset.cell : null;
  });
}

/**
 * Arranging a step: types an activity into a cell (Enter, its name, Return) and waits until the
 * grid shows it there. Undo takes it back as one step. Throws if it never shows.
 */
async function placeAt(key, activity) {
  await focusCell(key);
  await press("Enter", 500);
  const f = await focus();
  if (!f || f.dataId !== "slot-input")
    throw new Error(`Enter on ${key} did not open the typing box.`);
  await type(activity);
  await pause(400);
  await press("Enter", 300);
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const c = (await gridCells()).find((x) => x.key === key);
    if (c && c.name === activity) return;
    await pause(200);
  }
  throw new Error(`${activity} did not show in ${key} after typing it.`);
}

/**
 * Undoes up to `n` steps with Ctrl/Cmd+Z (arranging, not checked). Each press must be said
 * ("Undone: ...", matching `re` when given) before the next; one that is not stops it, so a later
 * press can't take back a change the check did not make. `done`, when given, is asked first each
 * time and stops it once the cells are back as found.
 */
async function undoSteps(n, { re = /^Undone: /, done } = {}) {
  for (let i = 0; i < n; i++) {
    if (done && (await done())) return;
    await watchLive();
    await press("ControlOrMeta+z");
    const end = Date.now() + 15000;
    let said = null;
    while (!said && Date.now() < end) {
      const texts = await page.evaluate(() => window.__a11yLive || []);
      said = texts.find((t) => /^Undone: /.test(t));
      if (!said) await pause(100);
    }
    if (!said || !re.test(said)) {
      say(
        `Putting the camp back: Undo ${said ? `said "${said}"` : "said nothing"}; stopped there.`
      );
      return;
    }
  }
}

/**
 * The drawer (ADR 0008 part 8): Tab to a tile, Enter holds it (focus goes to the grid). Every
 * cell of its activity is outlined, "fits here" lands only on Open cells, and the tile says it
 * is held. Escape lets go and the outlines go. A screenshot of the hold goes next to the
 * mock-up's hold-archery.png when --shots is given.
 */
async function holdTile(S) {
  const isTile = (f) =>
    f.tag === "button" &&
    f.components.includes("c-shoresh-build-palette") &&
    f.dataId !== "palette-filter" &&
    f.type === "button";
  const tile = await tabTo(isTile, { max: 200 });
  if (!tile) throw new Error("No drawer tile reached with Tab.");
  const name = tile.name.split(",")[0].trim();
  await press("Enter", 800);
  await expectFocus(S, "Holding a tile: focus goes to the grid", {
    inGrid: true
  });
  const held = await gridCells();
  const same = held.filter((c) => /\bcell_same\b/.test(c.classes));
  const fits = held.filter((c) => /\bcell_fits\b/.test(c.classes));
  const ofIt = held.filter((c) => c.name === name);
  if (
    same.length === ofIt.length &&
    same.every((c) => c.name === name) &&
    fits.every((c) => /\bcell_open\b/.test(c.classes))
  ) {
    results.pass(
      S,
      "Holding a tile: its cells outlined, fits here only on Open cells",
      `${name}: ${same.length} outlined, ${fits.length} fit.`
    );
  } else {
    await shot(S, "Holding a tile");
    results.fail(
      S,
      "Holding a tile: its cells outlined, fits here only on Open cells",
      `${name}: ${same.length} outlined of ${ofIt.length}; fits on ${fits.map((c) => `${c.key} ${c.classes}`).join("; ") || "none"}.`
    );
  }
  const pressed = await shown("c-shoresh-build-palette")
    .first()
    .evaluate(
      (d) =>
        (d.shadowRoot || d).querySelector('button[aria-pressed="true"]') !==
        null
    );
  if (pressed) {
    results.pass(
      S,
      "Holding a tile: the tile says it is held",
      "aria-pressed."
    );
  } else {
    results.fail(
      S,
      "Holding a tile: the tile says it is held",
      "No tile is aria-pressed."
    );
  }
  if (args.includes("--shots")) {
    await page.screenshot({ path: join(shotsDir, "hold-tile.png") });
  }
  await axe(`${S}: a tile held`);
  await expectLive(S, "Escape lets go: it is said", /^Put back\.$/, () =>
    press("Escape", 400)
  );
  const after = await gridCells();
  const left = after.filter((c) => /\bcell_(same|fits)\b/.test(c.classes));
  if (left.length) {
    results.fail(
      S,
      "Escape: the outlines go",
      `Still outlined: ${left.map((c) => c.key).join(", ")}.`
    );
  } else {
    results.pass(S, "Escape: the outlines go", "None left.");
  }
}

/**
 * Same-activity outlines with the mouse (wiki decision 38): pointing at a placed activity
 * outlines every other cell of it, and never an Open cell. With `arrange` (Manual Build), when no
 * activity is placed twice on the day, one placed activity is typed into an Open cell of another
 * bunk first, and that is undone after.
 */
async function hoverOutlines(S, { arrange = false } = {}) {
  const tally = (list) => {
    const counts = new Map();
    list
      .filter((c) => /\bcell_activity\b/.test(c.classes) && c.name)
      .forEach((c) => counts.set(c.name, (counts.get(c.name) || 0) + 1));
    return counts;
  };
  let cells = await gridCells();
  let counts = tally(cells);
  let [name] = [...counts].find(([, n]) => n > 1) || [];
  let placed = 0;
  let undoAt = null;
  try {
    if (!name && arrange) {
      const first = cells.find(isPlaced);
      const bunk = first && first.key.split("-")[0];
      const open =
        first &&
        cells.find((c) => isFreeOpen(c) && c.key.split("-")[0] !== bunk);
      if (first && open) {
        placed = 1;
        undoAt = open.key;
        await placeAt(open.key, first.name);
        await page.mouse.move(2, 2);
        cells = await gridCells();
        counts = tally(cells);
        [name] = [...counts].find(([, n]) => n > 1) || [];
      }
    }
    if (!name) {
      results.notRun(
        S,
        "Pointing at a cell outlines its activity",
        "No activity is placed twice on this day."
      );
      return;
    }
    const target = cells.find((c) => c.name === name);
    const editGrid = shown(
      'c-shoresh-schedule-grid[data-id="edit-grid"]'
    ).first();
    const at = editGrid.locator(`[data-cell="${target.key}"]`);
    await at.scrollIntoViewIfNeeded();
    await at.hover();
    await pause(300);
    const now = await gridCells();
    const same = now.filter((c) => /\bcell_same\b/.test(c.classes));
    if (
      same.length === counts.get(name) - 1 &&
      same.every((c) => c.name === name && c.key !== target.key)
    ) {
      results.pass(
        S,
        "Pointing at a cell outlines its activity",
        `${name}: the other ${same.length} outlined.`
      );
    } else {
      await shot(S, "Hover outlines");
      results.fail(
        S,
        "Pointing at a cell outlines its activity",
        `${name}: outlined ${same.map((c) => `${c.key} ${c.name}`).join(", ") || "none"}.`
      );
    }
    if (args.includes("--shots")) {
      await page.screenshot({ path: join(shotsDir, "hover-cell.png") });
    }
    await page.mouse.move(2, 2);
    await pause(200);
  } finally {
    if (placed) {
      await page.mouse.move(2, 2);
      await focusCell(undoAt);
      // Done once the cell typed into is Open again.
      const done = async () => {
        const c = (await gridCells()).find((x) => x.key === undoAt);
        return Boolean(c && isFreeOpen(c));
      };
      await undoSteps(placed, { done });
    }
  }
}

/**
 * Accept (decision 43): open the counter, Down to a line's Accept, Enter. The line goes, it is
 * said, the dropdown stays open and focus moves on to a line (or the counter).
 */
async function acceptLine(S) {
  if (!(await openRailMenu(/^\d+ of \d+ placed\b/)))
    throw new Error("The counter not reached with Tab.");
  await press("ArrowDown", 150);
  const accept = await arrowTo(/^Accept: /, { max: 30 });
  if (!accept) {
    await press("Escape", 300);
    results.notRun(
      S,
      "Accept in the counter",
      "No line with Accept this week (nothing under, over or spread)."
    );
    return;
  }
  const line = accept.name.replace(/^Accept: /, "");
  await expectLive(S, "Accept: it is said", /^Accepted for this visit: /, () =>
    press("Enter", 500)
  );
  const left = await page
    .locator(APP)
    .locator("c-shoresh-week-checks >> visible=true")
    .first()
    .evaluate(
      (el, said) =>
        [...el.shadowRoot.querySelectorAll(".accept")].some(
          (b) => b.getAttribute("aria-label") === `Accept: ${said}`
        ),
      line
    );
  if (left) {
    results.fail(S, "Accept: the line goes", `Still listed: ${line}.`);
  } else {
    results.pass(S, "Accept: the line goes", `Hidden: ${line}.`);
  }
  await expectFocus(S, "Accept: focus on the next line or the counter", {
    name: /\S/
  });
  const f = await focus();
  if (!f || !f.components.includes("c-shoresh-week-checks")) {
    results.fail(
      S,
      "Accept: focus stays in the counter",
      `Focus on ${formatFocus(f)}.`
    );
  } else {
    results.pass(
      S,
      "Accept: focus stays in the counter",
      `Focus on ${formatFocus(f)}.`
    );
  }
  await press("Escape", 400);
}

async function generated(openGenerated) {
  const S = "Generated Schedule";
  await step(S, "Open", openGenerated);
  await step(S, "Week arrows: the last week", () => weekArrowEnd(S));
  await step(S, "Generate (when not generated)", async () => {
    if (!(await exists('[data-id="generate"]'))) {
      results.pass(S, "Generate (when not generated)", "Already generated.");
      return;
    }
    if (!(await tabTo(named(/^Generate a schedule/))))
      throw new Error("Generate not reached.");
    await expectLive(
      S,
      "Generate: it is said when it ends",
      /Filled \d+ of \d+/,
      () => press("Enter"),
      90000
    );
    await expectFocusKept(S, "Generate: focus not lost when the button goes");
  });
  await step(S, "axe", () => axe(S));
  await step(S, "Rail", () => toolbarReach(S));
  await step(S, "The counter: open, Escape", () => counterMenu(S));
  await step(S, "The counter: Accept a line with the keyboard", () =>
    acceptLine(S)
  );
  await step(S, "Same-activity outlines: point at a cell", () =>
    hoverOutlines(S)
  );
  await step(S, "Rebuild: the question, Escape, then Rebuild it", async () => {
    // Rebuild is in the rail's Build menu, first.
    if (!(await openRailMenu(/^Build$/))) throw new Error("Build not reached.");
    await expectFocus(S, "Build opens: focus on Rebuild", {
      role: "menuitem",
      name: /^Rebuild$/
    });
    await axe("Generated Schedule: Build open");
    await press("Enter", 600);
    await expectFocus(S, "Rebuild asks: focus on Cancel", {
      inDialog: true,
      name: /^Cancel$/
    });
    await axe("Generated Schedule: Rebuild question");
    await press("Escape", 600);
    await expectFocus(S, "Escape: focus back on Build", {
      name: /^Build$/
    });
    await press("Enter", 600);
    if (!(await arrowTo(/^Rebuild$/))) throw new Error("Rebuild not reached.");
    await press("Enter", 600);
    if (!(await tabTo(named(/^Rebuild it$/), { max: 6 })))
      throw new Error("Rebuild it not reached.");
    await expectLive(
      S,
      "Rebuild it: it is said when it ends",
      /Filled \d+ of \d+/,
      () => press("Enter"),
      90000
    );
    await expectFocusKept(S, "After Rebuild: focus not lost");
  });
  await step(S, "Lock, in Edit: open, Escape, lock a cell", async () => {
    if (!(await tabTo(grid))) throw new Error("No grid cell reached with Tab.");
    await press("ArrowDown", 200);
    // Lock's choices are in the rail's Edit menu, with the other hand edits (ADR 0010 §58).
    if (!(await openRailMenu(/^Edit$/))) {
      throw new Error("Edit not reached.");
    }
    await expectFocus(S, "Edit opens: focus on its first row", {
      role: "menuitem"
    });
    await press("Escape", 400);
    await expectFocus(S, "Escape: focus back on Edit", { name: /^Edit$/ });
    await press("Enter", 500);
    if (!(await arrowTo(/^(Lock|Unlock) /))) {
      throw new Error("No Lock choice in Edit.");
    }
    await expectLive(S, "Choosing Lock/Unlock: it is said", /lock/i, () =>
      press("Enter")
    );
    await expectFocusKept(S, "After locking: focus not lost");
  });
  await step(S, "The lock's look", () => lockLook(S));
  await step(S, "Start over, then its Undo", async () => {
    if (!(await openRailMenu(/^Build$/))) {
      throw new Error("Build not reached.");
    }
    if (!(await arrowTo(/^Start over$/))) {
      throw new Error("Start over not reached in Build.");
    }
    // No question: Start over keeps its Undo instead (ADR 0010).
    await expectLive(
      S,
      "Start over: it is said when it ends",
      /Filled \d+ of \d+/,
      () => press("Enter"),
      90000
    );
    const f = await expectFocus(
      S,
      "After Start over: focus on its line's Undo",
      {
        dataId: "start-over-undo"
      }
    );
    if (f && f.dataId === "start-over-undo") {
      await press("Enter", 300);
      await expectFocus(S, "Its Undo: focus back on Build", {
        name: /^Build$/
      });
      await pause(3000);
    }
  });
}

/**
 * The lock's look (Greg, 2026-10-22; ADR 0015 choice 6): every locked cell on the grid shows the
 * padlock (c-shoresh-lock) inside its bottom-right corner, draws no border or outline for the
 * lock, and the padlock overlaps neither the cell's name nor its needs-a-look corner, both shown.
 */
async function lockLook(S) {
  const name =
    "Locked cells: the padlock bottom right, no edge, clear of the mark";
  let found = await measureLocks();
  // A locked cell that also has the needs-a-look corner: lock one that has the mark when none does.
  let arranged = null;
  let retyped = null;
  try {
    if (!found.some((c) => c.lock && c.mark && c.mark !== "hidden")) {
      const isMarked = (c) =>
        /\bcell_look\b/.test(c.classes) &&
        !/\bcell_(locked|locked-empty|away)\b/.test(c.classes);
      let marked = (await gridCells()).find(isMarked);
      if (!marked) {
        // Break a rule on purpose: a bunk's activity typed over another of its cells that day
        // ("Twice in a day"), put back after.
        const cells = await gridCells();
        const bunkOf = (c) => c.key.split("-")[0];
        const pair = cells
          .filter(isPlaced)
          .map((a) => [
            a,
            cells.find(
              (b) => isPlaced(b) && bunkOf(b) === bunkOf(a) && b.name !== a.name
            )
          ])
          .find(([, b]) => b);
        if (pair) {
          const [a, b] = pair;
          // Noted first: a typing that fails halfway may still have saved.
          retyped = { key: b.key, name: b.name };
          await placeAt(b.key, a.name);
          // A hand edit on Generated Schedule is locked as it saves; then it is the cell wanted.
          const end = Date.now() + 8000;
          while (Date.now() < end && !marked && !arranged) {
            await pause(300);
            const c = (await gridCells()).find((x) => x.key === b.key);
            if (c && /\bcell_look\b/.test(c.classes)) {
              if (/\bcell_locked\b/.test(c.classes)) arranged = b.key;
              else marked = c;
            }
          }
          found = await measureLocks();
        }
      }
      if (marked) {
        await focusCell(marked.key);
        if (!(await openRailMenu(/^Edit$/)))
          throw new Error("Edit not reached.");
        if (!(await arrowTo(/^Lock /))) {
          await press("Escape", 300);
          throw new Error(`No Lock choice in Edit for ${marked.key}.`);
        }
        arranged = marked.key;
        await expectLive(
          S,
          `Lock ${marked.key}, which has the corner mark: it is said`,
          /lock/i,
          () => press("Enter")
        );
        await pause(500);
        found = await measureLocks();
      }
    }
    await judgeLocks(S, name, found);
  } finally {
    if (arranged) await unlockCell(arranged);
    if (retyped) {
      await placeAt(retyped.key, retyped.name);
      // Typed back by hand, it is locked again as it saves: it was not locked before.
      await pause(1500);
      const c = (await gridCells()).find((x) => x.key === retyped.key);
      if (c && /\bcell_locked\b/.test(c.classes)) await unlockCell(retyped.key);
    }
  }
}

/** Arranging, put back: unlocks a cell from the rail's Edit menu. */
async function unlockCell(key) {
  await focusCell(key);
  if ((await openRailMenu(/^Edit$/)) && (await arrowTo(/^Unlock /))) {
    await press("Enter", 1500);
  } else {
    await press("Escape", 300);
    say(`Could not unlock ${key} again (a draft, deleted next run).`);
  }
}

/** Every locked cell's box, padlock, name and corner mark, measured on screen. */
async function measureLocks() {
  return shown('c-shoresh-schedule-grid[data-id="edit-grid"]')
    .first()
    .evaluate((g) => {
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return {
          l: r.left,
          t: r.top,
          r: r.right,
          b: r.bottom,
          w: r.width,
          h: r.height
        };
      };
      const seen = (el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          st.visibility !== "hidden" &&
          st.display !== "none" &&
          r.width > 0 &&
          r.height > 0
        );
      };
      return [...(g.shadowRoot || g).querySelectorAll(".cell_locked")].map(
        (c) => {
          const inner = c.querySelector(".cell-inner");
          const st = getComputedStyle(inner);
          const outlined = /\bcell_(picked|chosen|same|fits|stretching)\b/.test(
            c.className
          );
          const lock = c.querySelector(".cell-lock c-shoresh-lock");
          const svg = lock && (lock.shadowRoot || lock).querySelector("svg");
          const nameEl = c.querySelector(
            ".cell-name:not(.slds-assistive-text)"
          );
          const corner = c.querySelector(".cell-dot c-shoresh-dot");
          const mark =
            corner &&
            (corner.shadowRoot || corner).querySelector(
              '[data-id="corner-mark"]'
            );
          return {
            key: c.dataset.cell,
            cell: box(inner),
            border: ["Top", "Right", "Bottom", "Left"].some(
              (side) => parseFloat(st[`border${side}Width`]) > 0
            ),
            outline:
              !outlined &&
              st.outlineStyle !== "none" &&
              parseFloat(st.outlineWidth) > 0,
            lock: svg && seen(svg) ? box(svg) : null,
            name: nameEl && nameEl.textContent.trim() ? box(nameEl) : null,
            mark: mark ? (seen(mark) ? box(mark) : "hidden") : null
          };
        }
      );
    });
}

async function judgeLocks(S, name, found) {
  if (!found.length) {
    results.notRun(S, name, "No locked cell on the day shown.");
    return;
  }
  const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const wrong = [];
  let withMark = 0;
  found.forEach((c) => {
    if (!c.lock) {
      wrong.push(`${c.key}: no padlock`);
      return;
    }
    if (c.border || c.outline)
      wrong.push(`${c.key}: an edge drawn for the lock`);
    const inCorner =
      c.lock.r <= c.cell.r &&
      c.lock.b <= c.cell.b &&
      c.lock.l >= c.cell.l + c.cell.w / 2 &&
      c.lock.t >= c.cell.t + c.cell.h / 2;
    if (!inCorner)
      wrong.push(`${c.key}: the padlock is not in the bottom-right corner`);
    if (c.name && overlap(c.lock, c.name))
      wrong.push(`${c.key}: the padlock covers the name`);
    if (c.mark === "hidden") wrong.push(`${c.key}: the corner mark is hidden`);
    else if (c.mark) {
      withMark += 1;
      if (overlap(c.lock, c.mark))
        wrong.push(`${c.key}: the padlock covers the corner mark`);
    }
  });
  if (args.includes("--shots")) {
    await page.screenshot({ path: join(shotsDir, "locked-cell.png") });
  }
  if (wrong.length) {
    await shot(S, "Lock look");
    results.fail(S, name, wrong.join("; ") + ".");
  } else {
    results.pass(
      S,
      name,
      `${found.length} locked cell(s), ${withMark} with the corner mark as well.`
    );
  }
  const both =
    "A locked cell with the corner mark: padlock and mark both shown, apart";
  const pair = found.find((c) => c.lock && c.mark && c.mark !== "hidden");
  if (!pair) {
    results.notRun(
      S,
      both,
      "No cell on the day shown has the corner mark to lock."
    );
  } else if (overlap(pair.lock, pair.mark)) {
    results.fail(S, both, `${pair.key}: they overlap.`);
  } else {
    results.pass(
      S,
      both,
      `${pair.key}: padlock at ${Math.round(pair.lock.l)},${Math.round(pair.lock.t)}, mark at ${Math.round(pair.mark.l)},${Math.round(pair.mark.t)}, no overlap.`
    );
  }
}

async function versions(S, openScreen) {
  await step(S, "Versions", async () => {
    await openScreen();
    const b = await tabTo((f) => f.dataId === "versions-button");
    if (!b) throw new Error("Versions not reached with Tab.");
    // Watch aria-expanded, to tell "never opened" from "opened and closed again".
    const button = shown('[data-id="versions-button"]').first();
    await button.evaluate((el) => {
      el.__a11yExpanded = [];
      new MutationObserver(() =>
        el.__a11yExpanded.push(el.getAttribute("aria-expanded"))
      ).observe(el, { attributes: true, attributeFilter: ["aria-expanded"] });
    });
    await press("Enter", 600);
    const open = await button.getAttribute("aria-expanded");
    if (open !== "true") {
      const seen = await button.evaluate((el) => el.__a11yExpanded.join(" → "));
      await shot(S, "Versions opens");
      results.fail(
        S,
        "Versions: Enter opens the list",
        seen
          ? `The list opened and closed again at once (aria-expanded: ${seen}).`
          : "The list did not open (aria-expanded stayed false)."
      );
      results.notRun(
        S,
        "Versions: Escape, Save version, rename",
        "The list does not open."
      );
      return;
    }
    results.pass(S, "Versions: Enter opens the list", "aria-expanded is true.");
    await axe(`${S}: Versions open`);
    await press("Escape", 400);
    await expectFocus(S, "Versions: Escape closes it, focus on Versions", {
      dataId: "versions-button"
    });
    await press("Enter", 600);
    // Past every version in the list: three stops each, and the week keeps the schedules each
    // run published (kept history), so the list grows run after run.
    if (!(await tabTo((f) => f.dataId === "save-name", { max: 400 }))) {
      throw new Error("Name current version… not reached.");
    }
    const name = `Keyboard check ${new Date().toISOString().slice(11, 19)}`;
    await type(name);
    await expectLive(
      S,
      "Save version: it is said",
      new RegExp(`Saved ${name}`),
      () => press("Enter")
    );
    await expectFocusKept(S, "Save version: focus not lost");
    const rename = await tabTo(
      named(new RegExp(`rename.*${name}|${name}.*rename`, "i")),
      {
        back: true,
        // Back past every version, as above.
        max: 400
      }
    );
    if (!rename) throw new Error("The new version's rename not reached.");
    await press("Enter", 500);
    await expectFocus(S, "rename: focus in the name box", {
      dataId: "rename-input"
    });
    await press("Escape", 500);
    await expectFocus(S, "Escape in the name box: focus back on its rename", {
      name: rename.name
    });
    await press("Escape", 400);
  });
}

async function publish(S, openScreen) {
  await step(S, "Publish and Unpublish", async () => {
    await openScreen();
    if (!(await tabTo((f) => f.dataId === "publish")))
      throw new Error("Publish not reached.");
    await press("Enter", 1500);
    let f = await focus();
    if (f && f.inDialog) {
      results.pass(
        S,
        "Publish asks first: focus in the question",
        `Focus on ${formatFocus(f)}.`
      );
      await axe(`${S}: Publish question`);
      await press("Escape", 600);
      await expectFocus(S, "Escape: focus back on Publish", {
        dataId: "publish"
      });
      await press("Enter", 1500);
      if (!(await tabTo(named(/^Publish$/, { inDialog: true }), { max: 6 }))) {
        throw new Error("The question's Publish not reached.");
      }
    }
    await expectLive(
      S,
      "Publish: it is said",
      /Published |already published/i,
      async () => {
        await press("Enter");
      }
    );
    await expectFocusKept(S, "After Publish: focus not lost");
    // Unpublish is in Published's dropdown, beside Publish on the rail.
    if (!(await openRailMenu(/^Published/)))
      throw new Error("Published not reached.");
    if (!(await tabTo((f2) => f2.dataId === "unpublish", { max: 4 })))
      throw new Error("Unpublish not reached.");
    await press("Enter", 800);
    await expectFocus(S, "Unpublish asks: focus on Cancel", {
      inDialog: true,
      name: /^Cancel$/
    });
    await press("Escape", 600);
    await expectFocus(S, "Escape: focus back on Published", {
      name: /^Published/
    });
    await press("Enter", 500);
    if (!(await tabTo((f2) => f2.dataId === "unpublish", { max: 4 })))
      throw new Error("Unpublish not reached again.");
    await press("Enter", 800);
    if (!(await tabTo(named(/^Unpublish$/, { inDialog: true }), { max: 6 }))) {
      throw new Error("The question's Unpublish not reached.");
    }
    await expectLive(S, "Unpublish: it is said", /Unpublished/i, () =>
      press("Enter")
    );
    f = await expectFocusKept(
      S,
      "After Unpublish (its button goes): focus not lost"
    );
  });
}

const CHECK_DAY = "Check visit day";
const CHECK_EVENT = "Check event";
const CHECK_VERSION = "Check specials (made up)";

/** Deletes the check's special day, event and version from its camp, if a run left them. */
function clearSpecials() {
  apex(`
Camp__c camp = [SELECT Id FROM Camp__c WHERE Name = '${CAMP}' LIMIT 1];
delete [SELECT Id FROM Schedule__c WHERE Name = '${CHECK_VERSION}' AND Status__c = 'Version' AND PublishedAt__c = NULL AND Program__r.Season__r.Camp__c = :camp.Id];
delete [SELECT Id FROM SpecialDate__c WHERE (SpecialDay__r.Name = '${CHECK_DAY}' OR SpecialEvent__r.Name = '${CHECK_EVENT}') AND Season__r.Camp__c = :camp.Id];
delete [SELECT Id FROM PlanPart__c WHERE (SpecialDay__r.Name = '${CHECK_DAY}' OR SpecialEvent__r.Name = '${CHECK_EVENT}') AND Season__r.Camp__c = :camp.Id];
delete [SELECT Id FROM SpecialDay__c WHERE Name = '${CHECK_DAY}' AND Season__r.Camp__c = :camp.Id];
delete [SELECT Id FROM SpecialEvent__c WHERE Name = '${CHECK_EVENT}' AND Season__r.Camp__c = :camp.Id];
`);
}

/**
 * A special day on Tuesday of the check's week (starting from the regular day, as one added on
 * the Special events screen does), an event with one time block and one station, and a version
 * of the week's Manual Build draft with the event in the first bunk's first time block on Monday:
 * the newest version, so the Schedules page opens it by itself.
 */
function seedSpecials() {
  clearSpecials();
  apex(`
Camp__c camp = [SELECT Id FROM Camp__c WHERE Name = '${CAMP}' LIMIT 1];
Week__c week = [SELECT Id, Season__c FROM Week__c WHERE Season__r.Camp__c = :camp.Id AND Name = '${week}' ORDER BY StartDate__c DESC LIMIT 1];
Schedule__c draft = [SELECT Id, Program__c FROM Schedule__c WHERE Week__c = :week.Id AND Status__c = 'Draft' AND Origin__c = 'Manual' LIMIT 1];
Id dayId = SetupTablesController.saveRow(new SpecialDay__c(Season__c = week.Season__c, Name = '${CHECK_DAY}', SortOrder__c = 99), null, null).id;
SpecialDates.place(dayId, week.Id, 'Tuesday');
SpecialEvent__c event = new SpecialEvent__c(Season__c = week.Season__c, Name = '${CHECK_EVENT}');
insert event;
SpecialScheduleFrame.Change block = new SpecialScheduleFrame.Change();
block.action = 'addBlock';
block.name = 'Relays';
block.startTime = '09:00';
block.endTime = '10:00';
SpecialScheduleController.changeFrame(event.Id, null, block);
SpecialScheduleFrame.Change station = new SpecialScheduleFrame.Change();
station.action = 'addStation';
station.name = 'Blue';
SpecialScheduleController.changeFrame(event.Id, 1, station);
List<ScheduleDaySaves.DaySave> saves = new List<ScheduleDaySaves.DaySave>();
List<ScheduleDays.DayGrid> days = ScheduleDays.read(draft.Id);
for (Integer i = 0; i < days.size(); i++) {
  ScheduleGrid grid = days[i].grid;
  if (i == 0) {
    grid.items.add(new ScheduleGrid.Item('S', event.Id, '${CHECK_EVENT}'));
    grid.rows[0][0] = String.valueOf(grid.items.size());
  }
  saves.add(new ScheduleDaySaves.DaySave(days[i].day, grid, null));
}
Schedule__c version = new Schedule__c(Program__c = draft.Program__c, Week__c = week.Id, Name = '${CHECK_VERSION}', Status__c = 'Version', Origin__c = 'Manual', VersionReason__c = 'SavedByHand');
insert version;
ScheduleDaySaves.write(version.Id, saves);
`);
}

/**
 * The Schedules page (ADR 0014 slice 5), on the version seedSpecials makes: the Tuesday pill
 * names the special day, and chosen, its line shows under the grid (axe); Monday's event is
 * listed under its grid, its Open reached by Tab shows the event's own schedule with focus on
 * "← Monday" (axe), and Enter there goes back with focus on that Open.
 */
async function schedulesPage() {
  const S = "Schedules";
  await step(S, "A special day and an event's own schedule", async () => {
    seedSpecials();
    try {
      await openFromMenu(S, /^Schedules$/);
      await pickWeek();
      const tuesday = named(new RegExp(`^Tuesday\\b.*· ${CHECK_DAY}$`), {
        tag: "button"
      });
      if (!(await tabTo(tuesday, { max: 40 })))
        throw new Error(
          `No Tuesday pill naming "${CHECK_DAY}" was reached with Tab.`
        );
      await press("Enter", 800);
      if (await exists('[data-id="special-line"]')) {
        results.pass(
          S,
          "A replaced day: its pill names the special day, its line is under the grid",
          `"${CHECK_DAY}" on Tuesday.`
        );
      } else {
        await shot(S, "A replaced day's line");
        results.fail(
          S,
          "A replaced day: its pill names the special day, its line is under the grid",
          "No special day's line under Tuesday's grid."
        );
      }
      await axe("Schedules, a day a special day replaces");
      if (
        !(await tabTo(named(/^Monday\b/, { tag: "button" }), {
          max: 10,
          back: true
        }))
      )
        throw new Error("The Monday pill was not reached with Tab.");
      await press("Enter", 800);
      const open = named(new RegExp(`^Open ${CHECK_EVENT}$`), {
        tag: "button"
      });
      if (!(await tabTo(open, { max: 80 })))
        throw new Error(`"Open ${CHECK_EVENT}" was not reached with Tab.`);
      await press("Enter", 800);
      await expectFocus(
        S,
        "Open an event's own schedule: focus on the way back",
        {
          tag: "button",
          name: /^← Monday$/
        }
      );
      await axe("Schedules, an event's own schedule");
      await press("Enter", 800);
      await expectFocus(S, "Back from the event: focus on its Open again", {
        tag: "button",
        name: new RegExp(`^Open ${CHECK_EVENT}$`)
      });
    } finally {
      clearSpecials();
    }
  });
}

/** Deletes the made-up fixed activity by keyboard; false when it isn't there. */
async function deleteSetupChange(S) {
  await openFromMenu(S, /^Fixed activities/);
  const del = await tabTo(named(new RegExp(`^Delete ${SETUP_CHANGE}$`)), {
    max: 40
  });
  if (!del) return false;
  await press("Enter", 1200);
  const f = await focus();
  if (f && f.inDialog) {
    // Shoresh's own question (c-shoresh-ask), or Salesforce's confirm box (OK).
    const own = f.components.includes(APP);
    results.pass(
      S,
      `Delete ${SETUP_CHANGE} asks: focus in the question`,
      `Focus on ${formatFocus(f)}${own ? "" : ", in Salesforce's own confirm box (lightning-confirm), not c-shoresh-ask"}.`
    );
    const go = await tabTo(
      (g) =>
        g.inDialog && (g.dataId === "yes" || /^(OK|Delete)\b/.test(g.name)),
      { max: 6, anywhere: true }
    );
    if (!go) throw new Error("The delete question's button not reached.");
    await expectLive(
      S,
      `Deleting ${SETUP_CHANGE}: it is said`,
      /Deleted|deleted|Saved/,
      () => press("Enter")
    );
  } else {
    results.notRun(
      S,
      `Deleting ${SETUP_CHANGE}: it is said`,
      "Deleted without a question."
    );
  }
  await expectFocusKept(S, `After deleting ${SETUP_CHANGE}: focus not lost`);
  return true;
}

/** Adds the made-up fixed activity in the blank row, by keyboard. */
async function addSetupChange(S) {
  await openFromMenu(S, /^Fixed activities/);
  const blank = await tabTo(named(/^Add Fixed activity\b/, { tag: "input" }), {
    max: 40
  });
  if (!blank) throw new Error("The blank row's name box not reached.");
  await type(SETUP_CHANGE);
  await press("Tab", 200);
  await chooseOption(SETUP_CHANGE_BLOCK);
  // Back to its name box: Enter there adds the row (its length is in the row's details now).
  await press("Shift+Tab", 200);
  await expectLive(
    S,
    `Adding ${SETUP_CHANGE} with Enter: it is said`,
    /Saved|Added/i,
    () => press("Enter")
  );
  await expectFocus(
    S,
    "After adding: focus back in the blank row's first box",
    {
      tag: "input",
      name: /^Add Fixed activity\b(?!.*(Length|Week))/
    }
  );
}

/**
 * Deletes the made-up fixed activity (adding it first if it isn't there) and adds it again,
 * so both a delete and an add are checked every run, and this run's week, started before,
 * no longer matches setup.
 */
async function changeSetup() {
  const S = "Fixed activities";
  await step(
    S,
    `Delete and add ${SETUP_CHANGE} (so the week no longer matches setup)`,
    async () => {
      if (!(await deleteSetupChange(S))) {
        await addSetupChange(S);
        if (!(await deleteSetupChange(S)))
          throw new Error(`${SETUP_CHANGE} was not added.`);
      }
      await addSetupChange(S);
    }
  );
}

async function updateToMatch(S, openScreen) {
  await step(S, "Update to match setup", async () => {
    await openScreen();
    await pause(2000);
    // Said at the menu's foot only (ADR 0015 §9): the screen has no box of its own.
    if (await exists('[data-id="update-to-match"]')) {
      results.fail(
        S,
        "Setup changed: said at the menu's foot only",
        "The screen still shows its own Update to match setup."
      );
    }
    if (!(await exists('[data-id="menu-update-to-match"]'))) {
      throw new Error(
        "No Update to match setup at the menu's foot after the setup change."
      );
    }
    if (
      !(await tabTo((f) => f.dataId === "menu-update-to-match", {
        back: true,
        max: 200
      }))
    ) {
      results.fail(
        S,
        "Update to match setup: reachable by Tab",
        "Not reached with Tab."
      );
      return;
    }
    await press("Enter", 1500);
    await expectFocus(S, "It opens: focus on Cancel", {
      inDialog: true,
      name: /^(Cancel|Close)$/
    });
    await axe(`${S}: Update to match setup`);
    await press("Escape", 600);
    await expectFocus(S, "Escape: focus back on Update to match setup", {
      dataId: "menu-update-to-match"
    });
    await press("Enter", 1500);
    // One row first, then the rest.
    if (await tabTo((f) => f.dataId === "update-one", { max: 10 })) {
      const said = await expectLive(
        S,
        "One row's Update: it is said",
        UPDATE_SAID,
        () => press("Enter")
      );
      if (said && /nothing was updated/i.test(said)) {
        const f = await waitFocus({ dataId: "menu-update-to-match" });
        await shot(S, "One row's Update refused");
        results.fail(
          S,
          "One row's Update: the cell is updated",
          `Refused with no one else editing: "${said}" The dialog closed; focus on ${formatFocus(f)}.`
        );
        // Update all, tried the same way, to see whether it is refused too.
        if (
          !(await tabTo((g) => g.dataId === "menu-update-to-match", {
            back: true,
            max: 200
          }))
        ) {
          throw new Error("Update to match setup not reached again.");
        }
        await press("Enter", 1500);
        if (!(await tabTo((g) => g.dataId === "update-all", { max: 40 }))) {
          throw new Error("Update all not reached.");
        }
        // The same words as the row's refusal may already be on screen, so look at the
        // result rather than for new words.
        await press("Enter", 4000);
        const now = await liveTexts();
        if (
          (await exists('[data-id="menu-update-to-match"]')) &&
          now.some((t) => /nothing was updated/i.test(t))
        ) {
          results.fail(
            S,
            "Update all: the week is updated",
            "Refused too: the week still doesn't match setup, and the screen says nothing was updated."
          );
          results.notRun(
            S,
            "Update all leaves nothing: focus on the grid",
            "Nothing was updated, so nothing to check."
          );
          return;
        }
        await expectFocus(S, "Update all leaves nothing: focus on the grid", {
          inGrid: true
        });
        return;
      }
      await expectFocus(S, "One row's Update: focus stays in the dialog", {
        inDialog: true
      });
    } else {
      results.fail(
        S,
        "One row's Update: reachable by Tab",
        "No row's Update reached with Tab."
      );
    }
    if (!(await tabTo((f) => f.dataId === "update-all", { max: 40 }))) {
      throw new Error("Update all not reached.");
    }
    await expectLive(S, "Update all: it is said", UPDATE_SAID, () =>
      press("Enter")
    );
    await expectFocus(S, "Update all leaves nothing: focus on the grid", {
      inGrid: true
    });
  });
}

async function main() {
  refuseInCi();
  refuseWhileCiRuns();
  week = seedCamp();
  guessed = seedGuess();
  const url = signInUrl();
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !headed
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  let commit = "unknown";
  try {
    commit = run("git", ["rev-parse", "--short", "HEAD"]).trim();
  } catch {
    // Not in a git checkout: the report says unknown.
  }
  try {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page
        .locator(APP)
        .locator("c-shoresh-menu")
        .waitFor({ timeout: 60000 });
    } catch {
      throw new Error("Could not open the Shoresh tab in the test org.");
    }
    await pause(3000);
    // Camp picker: shown only when the org has several camps.
    if (await exists('lightning-combobox[data-id="camp"]')) {
      await step("Camp setup", `Choose ${CAMP}`, async () => {
        if (!(await tabTo(named(/^Camp\b/, { tag: "button" }), { max: 40 }))) {
          throw new Error("The Camp picker was not reached with Tab.");
        }
        await chooseOption(new RegExp(`^${CAMP.replace(/[()]/g, "\\$&")}$`));
        await pause(4000);
      });
    }
    const openManual = async () => {
      await openFromMenu("Manual Build", /^Manual Build/);
      await pickWeek();
    };
    const openGenerated = async () => {
      await openFromMenu("Generated Schedule", /^Generated Schedule/);
      await pickWeek();
    };
    await campSetup();
    await manualBuild(openManual);
    await generated(openGenerated);
    await versions("Manual Build", openManual);
    await versions("Generated Schedule", openGenerated);
    // Update to match setup before Publish, so a refusal there can't come from publishing.
    await changeSetup();
    await updateToMatch("Manual Build", openManual);
    await updateToMatch("Generated Schedule", openGenerated);
    await publish("Manual Build", openManual);
    await publish("Generated Schedule", openGenerated);
    await schedulesPage();
  } finally {
    const version = browser.version();
    await browser.close();
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      renderReport(results, {
        date: today,
        commit,
        browser: `Google Chrome ${version}${headed ? "" : " (headless)"}`,
        axeVersion: results.axeVersion || "not run",
        camp: CAMP,
        week
      })
    );
  }
  say(
    `${results.count("pass")} passed, ${results.count("fail")} failed, ${results.count("not run")} not run.`
  );
  say(`Report: ${reportPath}`);
  if (shotCount) say(`Screenshots of each failure: ${shotsDir}`);
}

main().catch((e) => {
  say(`The check stopped: ${e.message}`);
  process.exit(1);
});
