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
  await step(S, "Season details: a blank name says why, readably", seasonError);
  await step(S, "Weeks", async () => {
    await openFromMenu("Weeks", /^Weeks\b/);
    await axe("Weeks");
  });
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
      await shown(
        `${table} [data-row-key="add"][data-field="Name"] input`
      ).focus();
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
    "New season: heading, then Cancel back to the button",
    async () => {
      const b = await tabTo(named(/^New season$/, { tag: "button" }));
      if (!b) throw new Error("New season not reached with Tab.");
      await press("Enter", 800);
      await expectFocus("New season", "Opening it: focus on its heading", {
        tag: /^h[1-3]$/,
        name: /new season/i
      });
      await axe("New season");
      if (!(await tabTo(named(/^Cancel$/), { max: 15 })))
        throw new Error("Cancel not reached.");
      await press("Enter", 800);
      await expectFocus("New season", "Cancel: focus back on New season", {
        tag: "button",
        name: /^New season$/
      });
    }
  );
  await step(
    S,
    "Copy this season: heading, then Cancel back to the button",
    async () => {
      const b = await tabTo(named(/^Copy this season$/, { tag: "button" }));
      if (!b) throw new Error("Copy this season not reached with Tab.");
      await press("Enter", 800);
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
        "Cancel: focus back on Copy this season",
        {
          tag: "button",
          name: /^Copy this season$/
        }
      );
    }
  );
  await step(S, "Season pencil: open and close keep focus on it", async () => {
    // The pencil sits just before New season and Copy this season (where the step before left
    // focus), so Shift+Tab reaches it at once; going forward would cross the whole screen first.
    const b =
      (await tabTo(named(/^Edit /, { tag: "button" }), {
        back: true,
        max: 10
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
    // Into the box (it comes after New season and Copy this season), back to the pencil.
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
  await step(S, "Fixed activities", async () => {
    await openFromMenu("Fixed activities", /^Fixed activities/);
    await axe("Fixed activities");
  });
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
    hoverOutlines(S)
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

/** The grid's cells on screen, as { key, name, classes } (through the grid's shadow root). */
async function gridCells() {
  return shown('c-shoresh-schedule-grid[data-id="edit-grid"]')
    .first()
    .evaluate((g) =>
      [...(g.shadowRoot || g).querySelectorAll("[data-cell]")].map((c) => {
        const name = c.querySelector(".cell-name");
        return {
          key: c.dataset.cell,
          name: name ? name.textContent.trim() : "",
          classes: c.className
        };
      })
    );
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
 * outlines every other cell of it, and never an Open cell.
 */
async function hoverOutlines(S) {
  const cells = await gridCells();
  const counts = new Map();
  cells
    .filter((c) => /\bcell_activity\b/.test(c.classes) && c.name)
    .forEach((c) => counts.set(c.name, (counts.get(c.name) || 0) + 1));
  const [name] = [...counts].find(([, n]) => n > 1) || [];
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
  await press("Tab", 200);
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
