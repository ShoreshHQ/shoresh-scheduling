#!/usr/bin/env node
/**
 * Real-browser accessibility check of the Shoresh tab in the test org (shoresh-test).
 * Local only, never in CI: it signs in to the shared test org and changes the made-up camp.
 *
 * Drives Camp setup, Manual Build, Generated Schedule, Versions, Publish and Update to match
 * setup with the keyboard only (Tab, Enter, Space, Escape, arrows, typing) and checks:
 * - where focus is after each menu, dialog and tool closes (through shadow roots);
 * - that the live regions say something after saves, builds and publishing;
 * - that every enabled toolbar action is reachable with Tab;
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
// adds a new week to it, so Start, Generate and a first Publish happen every time.
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

/** The check's camp (first run only), then a new week in it. Returns the week's name. */
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
List<Week__c> weeks = [SELECT StartDate__c, SortOrder__c FROM Week__c WHERE Season__c = :season.Id ORDER BY StartDate__c DESC];
Date monday = weeks.isEmpty() ? Date.newInstance(2027, 6, 28) : weeks[0].StartDate__c.addDays(7);
Integer n = weeks.size() + 1;
if (season.EndDate__c < monday.addDays(4)) {
  season.EndDate__c = monday.addDays(4);
  update season;
}
insert new Week__c(Season__c = season.Id, Name = 'Week ' + n, StartDate__c = monday, EndDate__c = monday.addDays(4), SortOrder__c = n);
System.debug('A11Y_WEEK=Week ' + n + '=');
`);
  const week = /A11Y_WEEK=(Week \d+)=/.exec(logs);
  if (!week) throw new Error("The new week was not reported back.");
  say(`Added ${week[1]} to "${CAMP}"; the check works on it.`);
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
let week; // the week this run added, e.g. "Week 3"
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

async function liveTexts() {
  return page
    .locator(APP)
    .locator('[aria-live], [role="status"], [role="alert"]')
    .evaluateAll((els) =>
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
  await page
    .locator(APP)
    .locator('[aria-live], [role="status"], [role="alert"]')
    .evaluateAll((els) => {
      // Only regions on screen: screens visited earlier stay in the page, hidden.
      for (const el of els.filter((e) => e.getClientRects().length > 0)) {
        const o = new MutationObserver(() => {
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t) window.__a11yLive.push(t);
        });
        o.observe(el, { childList: true, subtree: true, characterData: true });
        window.__a11yObservers.push(o);
      }
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
  // table row (focus stays on the next row after a delete, and the check's camp gains a week
  // each run, so Weeks outgrows going forward). From near the page's end, forward wraps round.
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

/** Every enabled toolbar control is reached by Tab, in one pass from the first. */
async function toolbarReach(screen) {
  const controls = page
    .locator("c-shoresh-week-editor .toolbar")
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
  if (!expected.size) throw new Error("No toolbar controls found.");
  // Start just before the toolbar: back out of it if focus is already in it.
  for (let i = 0; i < 40; i++) {
    const f = await focus();
    if (!f || f.checkMark === null) break;
    await press("Shift+Tab", 30);
  }
  const first = await tabTo((f) => f.checkMark !== null);
  if (!first) {
    results.fail(
      screen,
      "Toolbar: reachable by Tab",
      "No toolbar control was reached with Tab."
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
      "Toolbar: every action reachable by Tab",
      `Not reached: ${missing.join(", ")}. Toolbar: ${names}.`
    );
  } else {
    results.pass(
      screen,
      "Toolbar: every action reachable by Tab",
      `All ${expected.size} reached: ${names}.`
    );
  }
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
  await step(S, "Weeks", async () => {
    await openFromMenu("Weeks", /^Weeks\b/);
    await axe("Weeks");
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
    const b = await tabTo(named(/^Edit /, { tag: "button" }));
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

async function manualBuild(openManual) {
  const S = "Manual Build";
  await step(S, "Open", openManual);
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
  await step(S, "Toolbar", () => toolbarReach(S));
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
  await step(S, "Clear day, then its Undo", async () => {
    if (!(await tabTo(named(/^Clear day$/, { tag: "button" })))) {
      throw new Error("Clear day not reached with Tab.");
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
    if (!(await tabTo(named(/^Copy day to/))))
      throw new Error("Copy day to… not reached.");
    await press("Enter", 500);
    await expectFocus(S, "Copy day to… opens: focus on its first choice", {
      role: "menuitem"
    });
    await press("Escape", 400);
    await expectFocus(S, "Escape: focus back on Copy day to…", {
      name: /^Copy day to/
    });
    await press("Enter", 500);
    await expectLive(S, "Choosing a day: it is said", /Copied|Nothing/i, () =>
      press("Enter")
    );
    const f = await expectFocus(S, "After copying: focus on the line's Undo", {
      dataId: "tool-undo"
    });
    if (f && f.dataId === "tool-undo") await press("Enter", 1500);
  });
}

async function generated(openGenerated) {
  const S = "Generated Schedule";
  await step(S, "Open", openGenerated);
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
  await step(S, "Toolbar", () => toolbarReach(S));
  await step(S, "Rebuild: the question, Escape, then Rebuild it", async () => {
    if (!(await tabTo(named(/^Rebuild$/, { tag: "button" }))))
      throw new Error("Rebuild not reached.");
    await press("Enter", 600);
    await expectFocus(S, "Rebuild asks: focus on Cancel", {
      inDialog: true,
      name: /^Cancel$/
    });
    await axe("Generated Schedule: Rebuild question");
    await press("Escape", 600);
    await expectFocus(S, "Escape: focus back on Rebuild", {
      name: /^Rebuild$/
    });
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
  await step(S, "Lock menu: open, Escape, lock a cell", async () => {
    if (!(await tabTo(grid))) throw new Error("No grid cell reached with Tab.");
    await press("ArrowDown", 200);
    if (!(await tabTo(named(/^Lock\b/), { back: true, max: 30 }))) {
      throw new Error("Lock not reached.");
    }
    await press("Enter", 500);
    await expectFocus(S, "Lock opens: focus on its first choice", {
      role: "menuitem"
    });
    await press("Escape", 400);
    await expectFocus(S, "Escape: focus back on Lock", { name: /^Lock\b/ });
    await press("Enter", 500);
    await expectLive(S, "Choosing Lock/Unlock: it is said", /lock/i, () =>
      press("Enter")
    );
    await expectFocusKept(S, "After locking: focus not lost");
  });
  await step(S, "Start over, then its Undo", async () => {
    if (!(await tabTo(named(/^Start over$/, { tag: "button" })))) {
      throw new Error("Start over not reached.");
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
      await expectFocus(S, "Its Undo: focus back on Start over", {
        name: /^Start over$/
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
    if (!(await tabTo((f) => f.dataId === "save-name", { max: 60 }))) {
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
        max: 60
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
    if (!(await tabTo((f2) => f2.dataId === "unpublish")))
      throw new Error("Unpublish not reached.");
    await press("Enter", 800);
    await expectFocus(S, "Unpublish asks: focus on Cancel", {
      inDialog: true,
      name: /^Cancel$/
    });
    await press("Escape", 600);
    await expectFocus(S, "Escape: focus back on Unpublish", {
      dataId: "unpublish"
    });
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
    if (!(await exists('[data-id="update-to-match"]'))) {
      throw new Error(
        "No Update to match setup on the screen after the setup change."
      );
    }
    if (!(await tabTo((f) => f.dataId === "update-to-match"))) {
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
      dataId: "update-to-match"
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
        const f = await waitFocus({ dataId: "update-to-match" });
        await shot(S, "One row's Update refused");
        results.fail(
          S,
          "One row's Update: the cell is updated",
          `Refused with no one else editing: "${said}" The dialog closed; focus on ${formatFocus(f)}.`
        );
        // Update all, tried the same way, to see whether it is refused too.
        if (!(await tabTo((g) => g.dataId === "update-to-match"))) {
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
          (await exists('[data-id="update-to-match"]')) &&
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
