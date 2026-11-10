#!/usr/bin/env node
/**
 * E: the screens where a screen behaves differently from the connector, in a real browser, on a
 * made-up camp of its own (break-and-rebuild campaign). Special events' Import a list saved and
 * undone (SPECIAL-2.3 to 2.8), and cells pasted into Import a list (INGEST-1.6).
 * The sign-in link comes from `sf org open --url-only` and stays in memory (as a11y-browser-check).
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const {
  withOrg,
  makeCamp,
  cleanup,
  soql,
  sfJson,
  call,
  ORG,
  Record
} = require("./lib");
const { importMaple, names, count, draft } = require("./kit");

const rec = new Record("E1");
const LIKE = "BR E1 %";

async function run() {
  cleanup(LIKE);
  // Everything after the camp is made is inside the try, so a crash still takes the camp out.
  let browser;
  let page;
  let url = "";
  try {
    const { season, camp } = makeCamp("E1 Screens");
    await importMaple(season);
    const campId = soql(`SELECT Id FROM Camp__c WHERE Name = '${camp}'`)[0].Id;
    url = sfJson([
      "org",
      "open",
      "--target-org",
      ORG,
      "--url-only",
      "--path",
      `/lightning/n/Shoresh_Camp_Setup?c__camp=${campId}`
    ]).result.url;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    page = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const inSeason = `Season__r.Name = '${season}'`;
    const specials = () =>
      [
        ...names("SpecialDay__c", inSeason),
        ...names("SpecialEvent__c", inSeason)
      ].join();
    const openScreen = async (name) => {
      await page.getByRole("link", { name, exact: false }).first().click();
      await page.waitForTimeout(2500);
    };
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page
      .locator("c-shoresh-app, c-shoresh-roots")
      .first()
      .waitFor({ timeout: 120000 });
    await page.waitForTimeout(4000);

    await openScreen(/^Special events/);
    const panel = page.locator(
      '[data-screen="specialEvents"] [data-id="special-list"]'
    );
    await panel.getByRole("button", { name: "Import a list" }).click();
    await page.waitForTimeout(800);
    const file = (csv) => ({
      name: "specials.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv)
    });
    const csv =
      "Name,Type,Where,Notes\nLake day,Special day,,Bring towels\nCampfire,Event,Field,Bring wood\nNo kind here,,,\nField trip,Special day,Barn,\n";
    await panel
      .locator('c-shoresh-list-import input[data-id="file"]')
      .setInputFiles(file(csv));
    await page.waitForTimeout(2000);
    const shown = await panel.locator("c-shoresh-list-import").innerText();
    // Shown in the review now; never saved (read back after the save below).
    rec.check(
      "SPECIAL-2.4",
      "a row with no Type is shown",
      /No kind here/.test(shown),
      shown
    );
    rec.check(
      "SPECIAL-2.5",
      "a special day with a place is shown, with why",
      /Field trip/.test(shown) && /is the whole camp/.test(shown),
      shown
    );
    const review = await call("import_list", {
      season,
      list: "specialEvents",
      file_name: "specials.csv",
      csv_text: csv
    });
    rec.note(
      "the same file through the connector",
      `${review.kind}: ${review.text.slice(0, 800)}`
    );
    rec.check(
      "INGEST-5.5",
      "the review saves nothing",
      specials() === "",
      specials()
    );
    await panel.locator('c-shoresh-list-import [data-id="save"]').click();
    await page.waitForTimeout(5000);
    const after = await panel.innerText();
    rec.check(
      "SPECIAL-2.6",
      "saving adds the day and the event, read back",
      specials() === "Lake day,Campfire",
      specials()
    );
    rec.check(
      "SPECIAL-2.4",
      "the rows that couldn't be read weren't saved",
      !/No kind here|Field trip/.test(specials()),
      specials()
    );
    rec.check(
      "SPECIAL-2.6",
      "the save says what it added",
      /Added 1 special day[\s\S]*Added 1 special event/.test(after),
      after.slice(0, 800)
    );
    const plan = soql(`SELECT Id FROM PlanPart__c WHERE ${inSeason}`).length;
    rec.note("plan parts after the list added a special day", String(plan));
    const lakeDay = soql(
      `SELECT Id, Notes__c FROM SpecialDay__c WHERE ${inSeason} AND Name = 'Lake day'`
    )[0];
    rec.check(
      "SPECIAL-2.6",
      "the notes came in",
      lakeDay?.Notes__c === "Bring towels",
      JSON.stringify(lakeDay)
    );

    // Undo this import: the panel's own Undo, read back.
    const undo = panel.locator('c-shoresh-list-import [data-id="undo"]');
    rec.check(
      "SPECIAL-2.8",
      "the panel offers Undo",
      (await undo.count()) === 1,
      await panel.innerText()
    );
    if (await undo.count()) {
      await undo.click();
      await page.waitForTimeout(800);
      // The confirm says what goes: "Undo <file>?" with OK.
      rec.note(
        "Undo's confirm says, and any other dialog open",
        (await page.locator("[role=dialog]:visible").allInnerTexts()).join(
          " | "
        )
      );
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForTimeout(5000);
      rec.check(
        "SPECIAL-2.8",
        "Undo takes both away",
        specials() === "",
        specials()
      );
      rec.check(
        "SPECIAL-2.8",
        "their plans go with them",
        soql(`SELECT Id FROM PlanPart__c WHERE ${inSeason}`).length === 0,
        "plan parts left"
      );
    }

    // A special day whose schedule was saved since is kept and named.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("c-shoresh-app, c-shoresh-roots").first().waitFor();
    await page.waitForTimeout(4000);
    await openScreen(/^Special events/);
    await panel.getByRole("button", { name: "Import a list" }).click();
    await page.waitForTimeout(800);
    await panel
      .locator('c-shoresh-list-import input[data-id="file"]')
      .setInputFiles(
        file("Name,Type,Where,Notes\nLake day,Special day,,Bring towels\n")
      );
    await page.waitForTimeout(2000);
    await panel.locator('c-shoresh-list-import [data-id="save"]').click();
    await page.waitForTimeout(5000);
    const put = await call("put_special_day_on_day", {
      season,
      special_day: "Lake day",
      week: "Week 1",
      day: "Wednesday",
      seen: "none"
    });
    rec.check(
      "SPECIAL",
      "put on a day through the AI",
      put.kind === "done",
      put.text
    );
    const undoAgain = panel.locator('c-shoresh-list-import [data-id="undo"]');
    if (await undoAgain.count()) {
      await undoAgain.click();
      await page.waitForTimeout(800);
      // The confirm says what goes: "Undo <file>?" with OK.
      rec.note(
        "Undo's confirm says, and any other dialog open",
        (await page.locator("[role=dialog]:visible").allInnerTexts()).join(
          " | "
        )
      );
      await page.getByRole("button", { name: "OK", exact: true }).click();
      await page.waitForTimeout(5000);
      const said = await panel.innerText();
      rec.check(
        "SPECIAL-2.8",
        "a special day put on a day since is kept",
        names("SpecialDay__c", inSeason).includes("Lake day"),
        specials()
      );
      rec.check(
        "SPECIAL-2.8",
        "and named as kept",
        /kept[\s\S]{0,300}Lake day|Lake day[\s\S]{0,300}kept/i.test(said),
        said.slice(0, 600)
      );
    } else {
      rec.check("SPECIAL-2.8", "the second import offers Undo", false);
    }

    // Paste on Activities' Import a list (INGEST-1.6).
    await openScreen(/^Activities/);
    await page.getByRole("button", { name: "Import a list" }).first().click();
    await page.waitForTimeout(800);
    // The open list import (others on the page are closed or for other screens).
    const listImport = page.locator('[data-id="list-import"]:visible').first();
    await listImport.evaluate((panel) => {
      const data = new DataTransfer();
      data.setData(
        "text/plain",
        "Activity\tLocation\nPasted canoe, big\tDock\n"
      );
      panel.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          composed: true
        })
      );
    });
    await page.waitForTimeout(2000);
    const pastedText = await listImport.innerText();
    rec.check(
      "INGEST-1.6",
      "pasted cells are laid into the review, the comma kept",
      /Pasted canoe, big/.test(pastedText),
      pastedText.slice(0, 500)
    );
    rec.check(
      "INGEST-5.5",
      "a paste saves nothing",
      count("Activity__c", `${inSeason} AND Name LIKE 'Pasted%'`) === 0
    );
    rec.check(
      "errors",
      "no error in the page",
      errors.length === 0,
      errors.join("\n")
    );
  } catch (e) {
    await page
      ?.screenshot({ path: `${process.env.TMPDIR || "/tmp"}/br-e1-fail.png` })
      .catch(() => {});
    // The sign-in link carries a session: never in what's written down.
    rec.check(
      "crash",
      "E1 stopped early",
      false,
      url ? String(e.stack).split(url).join("<sign-in link>") : e.stack
    );
  } finally {
    await browser?.close();
    cleanup(LIKE);
  }
}

/**
 * The numbered-days screens (ADR 0025): the season form's Days choice, Import last year's "days by
 * number" tile, and Apply to other weeks' dialog (opened and cancelled; the connector applies in A5).
 */
const LIKE2 = "BR E2 %";
const dayFile = (bunk, turn) => {
  const acts = ["Swim", "Art", "Soccer", "Music", "Drama", "Tennis"];
  const days = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
  const rows = [["Time", ...days].join(",")];
  ["Period 1 (9:00 - 9:50)", "Period 2 (10:00 - 10:50)"].forEach((block, b) =>
    rows.push(
      [
        block,
        ...days.map((_, d) => acts[(turn + b * 3 + d * 7) % acts.length])
      ].join(",")
    )
  );
  return {
    name: `Numbered - ${bunk}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(`${rows.join("\n")}\n`)
  };
};

async function numbered() {
  cleanup(LIKE2);
  let browser;
  let page;
  let url = "";
  try {
    const { season, camp } = makeCamp("E2 Numbered", {
      weeks: 2,
      days: 6,
      numbered: true
    });
    const campId = soql(`SELECT Id FROM Camp__c WHERE Name = '${camp}'`)[0].Id;
    url = sfJson([
      "org",
      "open",
      "--target-org",
      ORG,
      "--url-only",
      "--path",
      `/lightning/n/Shoresh_Camp_Setup?c__camp=${campId}`
    ]).result.url;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    page = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    page.setDefaultTimeout(45000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page
      .locator("c-shoresh-app, c-shoresh-roots")
      .first()
      .waitFor({ timeout: 120000 });
    await page.waitForTimeout(4000);

    // The season form's Days choice: both ways, shown as they read; this season is by number.
    await page.locator('[data-id="edit-season"]').first().click();
    await page.waitForTimeout(1500);
    const days = page.locator('[data-id="day-naming"]');
    const daysText = await days.innerText();
    rec.check(
      "WEEK-1.5",
      "the season form offers Days by name or by number",
      /Mon Tue Wed/.test(daysText) && /Day 1 Day 2 Day 3/.test(daysText),
      daysText
    );
    rec.check(
      "WEEK-1.5",
      "a numbered season shows Day 1 Day 2 Day 3 chosen",
      await days.locator("input[value=numbered]").isChecked(),
      daysText
    );
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("c-shoresh-app, c-shoresh-roots").first().waitFor();
    await page.waitForTimeout(4000);

    // Import last year: Day 1 to Day 6 files show the "days by number" tile; nothing saved yet.
    await page
      .getByRole("button", { name: /Import last year/ })
      .first()
      .click();
    await page.waitForTimeout(1500);
    await page
      .locator('c-shoresh-import input[type="file"]')
      .first()
      .setInputFiles([dayFile("Aleph", 0), dayFile("Bet", 1)]);
    await page.waitForTimeout(6000);
    const review = await page.locator("c-shoresh-import").first().innerText();
    rec.note("Import last year, numbered files", review.slice(0, 1200));
    rec.check(
      "WEEK-2.6",
      'the review shows a "days by number" tile',
      /days? by number/.test(review),
      review.slice(0, 1200)
    );
    rec.check(
      "INGEST-5.5",
      "the review saves nothing",
      count(
        "Group__c",
        `Division__r.Program__r.Season__r.Name = '${season}'`
      ) === 0
    );

    // Apply to other weeks: the Versions panel offers it, and its dialog lists Week 2.
    const files = ["Aleph", "Bet"].map((bunk, turn) => ({
      file_name: `Numbered - ${bunk}.csv`,
      csv_text: dayFile(bunk, turn).buffer.toString()
    }));
    const answers = { "week|the file's week": "Week 1" };
    const looked = await call("import_last_year", { season, files, answers });
    await call("import_last_year", {
      season,
      files,
      answers,
      save: true,
      seen: /seen: "([^"]+)"/.exec(looked.text)?.[1]
    });
    await call("build_week", { season, week: "Week 1" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("c-shoresh-app, c-shoresh-roots").first().waitFor();
    await page.waitForTimeout(4000);
    await page
      .getByRole("link", { name: /^Generated Schedule/ })
      .first()
      .click();
    await page.waitForTimeout(5000);
    await page
      .locator('c-shoresh-generated-schedule [data-id="versions"]:visible')
      .first()
      .click();
    await page.waitForTimeout(2000);
    const applyButton = page.locator('[data-id="apply-weeks"]:visible').first();
    rec.check(
      "WEEK-6.2",
      "Versions offers Apply to other weeks",
      (await applyButton.count()) === 1 &&
        /Apply to other/.test(await applyButton.innerText())
    );
    await applyButton.click();
    await page.waitForTimeout(4000);
    const dialog = await page.locator('[data-id="apply"]').innerText();
    rec.note("Apply dialog", dialog.slice(0, 800));
    rec.check(
      "WEEK-6.2",
      "the Apply dialog lists Week 2",
      /Week 2/.test(dialog),
      dialog.slice(0, 800)
    );
    const draftBefore = count(
      "Schedule__c",
      `Program__r.Season__r.Name = '${season}' AND Week__r.Name = 'Week 2'`
    );
    await page
      .locator('[data-id="apply"]')
      .getByRole("button", { name: "Cancel" })
      .click();
    await page.waitForTimeout(1500);
    rec.check(
      "WEEK-6.2",
      "Cancel changes nothing",
      count(
        "Schedule__c",
        `Program__r.Season__r.Name = '${season}' AND Week__r.Name = 'Week 2'`
      ) === draftBefore
    );
  } catch (e) {
    await page
      ?.screenshot({ path: `${process.env.TMPDIR || "/tmp"}/br-e2-fail.png` })
      .catch(() => {});
    rec.check(
      "crash",
      "E2 stopped early",
      false,
      url ? String(e.stack).split(url).join("<sign-in link>") : e.stack
    );
  } finally {
    await browser?.close();
    cleanup(LIKE2);
  }
}

/**
 * Rotating days by clicking: Week 1 of a Day 1 to Day 6 camp applied to Weeks 2 and 3 through
 * Apply to other weeks, each published with Publish, and read back on the Schedules page.
 * Week 1 is imported and built through the connector (setup, not what is checked here).
 */
const LIKE3 = "BR E3 %";
const DAYS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6"];
const placed = (rows) =>
  rows
    .map((r) => `${r.day}|${r.group}|${r.time_block}|${r.activity}`)
    .sort()
    .join("\n");

async function rotating() {
  cleanup(LIKE3);
  let browser;
  let page;
  let url = "";
  try {
    const { season, camp } = makeCamp("E3 Rotating", {
      weeks: 3,
      days: 6,
      numbered: true
    });
    const files = ["Aleph", "Bet", "Gimel"].map((bunk, turn) => ({
      file_name: `Numbered - ${bunk}.csv`,
      csv_text: dayFile(bunk, turn).buffer.toString()
    }));
    const answers = { "week|the file's week": "Week 1" };
    const looked = await call("import_last_year", { season, files, answers });
    await call("import_last_year", {
      season,
      files,
      answers,
      save: true,
      seen: /seen: "([^"]+)"/.exec(looked.text)?.[1]
    });
    const built = await call("build_week", { season, week: "Week 1" });
    if (built.kind !== "done") throw new Error(`build_week: ${built.text}`);
    const week1 = await draft(season, "Week 1");
    rec.note("Week 1 as built", placed(week1.rows).slice(0, 600));

    const campId = soql(`SELECT Id FROM Camp__c WHERE Name = '${camp}'`)[0].Id;
    url = sfJson([
      "org",
      "open",
      "--target-org",
      ORG,
      "--url-only",
      "--path",
      `/lightning/n/Shoresh_Camp_Setup?c__camp=${campId}`
    ]).result.url;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    page = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page
      .locator("c-shoresh-app, c-shoresh-roots")
      .first()
      .waitFor({ timeout: 120000 });
    await page.waitForTimeout(4000);
    await page
      .getByRole("link", { name: /^Generated Schedule/ })
      .first()
      .click();
    await page.waitForTimeout(5000);
    const screen = page.locator("c-shoresh-generated-schedule");

    // Apply to other weeks: Weeks 2 and 3 ticked, applied, Close.
    await screen.locator('[data-id="versions"]:visible').first().click();
    await page.waitForTimeout(2000);
    await page.locator('[data-id="apply-weeks"]:visible').first().click();
    const dialog = page.locator('[data-id="apply"]');
    await dialog.locator("[data-week]").first().waitFor();
    await page.waitForTimeout(3000);
    rec.note("Apply dialog", (await dialog.innerText()).slice(0, 800));
    for (const box of await dialog.locator("input[type=checkbox]").all()) {
      if (!(await box.isDisabled()) && !(await box.isChecked())) {
        await box.check();
      }
    }
    const yes = dialog.locator('[data-id="yes"]');
    rec.note("Apply button", await yes.innerText());
    await yes.click();
    await dialog.locator('[data-id="close"]').waitFor({ timeout: 120000 });
    const applied = await dialog.innerText();
    rec.note("Apply dialog when done", applied.slice(0, 800));
    await dialog.locator('[data-id="close"]').click();
    await page.waitForTimeout(1500);
    for (const week of ["Week 2", "Week 3"]) {
      const after = await draft(season, week);
      rec.check(
        "WEEK-6.2",
        `${week} holds Week 1, day by numbered day`,
        placed(after.rows) === placed(week1.rows),
        placed(after.rows).slice(0, 600)
      );
    }

    // Publish Weeks 2 and 3 with the week picker's next arrow and Publish.
    const pickNext = async () => {
      await screen.locator('[data-id="week"] [data-id="next"]').click();
      await page.waitForTimeout(5000);
    };
    for (const week of ["Week 2", "Week 3"]) {
      await pickNext();
      await screen.locator('[data-id="publish"]').click();
      // A week with nothing to warn about publishes at once; otherwise the screen asks first.
      const ask = page.locator('[data-id="ask"]');
      const said = screen
        .locator('[data-id="notice"]')
        .filter({ hasText: `Published ${week}.` });
      await ask.or(said).first().waitFor();
      if (await ask.isVisible()) {
        rec.note(`Publish ${week} asks`, (await ask.innerText()).slice(0, 500));
        await ask.locator("button.slds-button_brand").click();
      }
      await said.waitFor();
      const at = soql(
        `SELECT PublishedAt__c FROM Schedule__c WHERE Program__r.Season__r.Name = '${season}' AND Week__r.Name = '${week}' AND PublishedAt__c != NULL`
      );
      rec.check("PUB", `${week} is published by clicking`, at.length === 1);
    }

    // The Schedules page: Week 2 and 3's published version, Daily View and Group View.
    await page
      .getByRole("link", { name: /^Saved versions/ })
      .first()
      .click();
    await page.waitForTimeout(5000);
    const schedules = page.locator("c-shoresh-schedules");
    const week1Day1 = week1.rows.filter(
      (r) => r.day === "Day 1" && r.activity !== "Open"
    );
    for (const week of ["Week 2", "Week 3"]) {
      await schedules.locator('[data-id="week"] [data-id="next"]').click();
      await page.waitForTimeout(5000);
      const rail = await schedules.locator('[data-id="rail"]').innerText();
      rec.check(
        "PUB",
        `the Schedules page opens ${week}'s published version`,
        rail.includes(week) && /Published/.test(rail),
        rail.slice(0, 400)
      );
      const pills = await schedules
        .locator('[data-id="day-pills"]')
        .innerText();
      rec.check(
        "WEEK-1.7",
        `${week}'s days are Day 1 to Day 6`,
        DAYS.every((d) => pills.includes(d)) &&
          !/Mon|Tue|Wed|Thu|Fri|Sat/.test(pills),
        pills
      );
      const daily = await schedules
        .locator('[data-id="daily-grid"]')
        .innerText();
      rec.check(
        "WEEK-6.2",
        `${week}'s Day 1 shows what Week 1's Day 1 holds`,
        week1Day1.every((r) => daily.includes(r.activity)),
        daily.slice(0, 600)
      );
      const out = await call("read_group_schedule", { season, week });
      rec.check(
        "PUB",
        `an AI reads ${week} as published, by Day number`,
        out.kind === "done" &&
          DAYS.every((d) => out.text.includes(d)) &&
          week1Day1.every((r) => out.text.includes(r.activity)),
        out.text.slice(0, 600)
      );
    }
    await schedules.locator('button[data-view="group"]').click();
    await page.waitForTimeout(2500);
    const group = await schedules.locator('[data-id="group-grid"]').innerText();
    const firstGroup = week1.rows.find((r) => r.activity !== "Open").group;
    rec.check(
      "WEEK-6.2",
      `Group View shows ${firstGroup}'s whole week of Week 1's activities`,
      week1.rows
        .filter((r) => r.group === firstGroup && r.activity !== "Open")
        .every((r) => group.includes(r.activity)),
      group.slice(0, 600)
    );
    rec.check(
      "crash",
      "no page errors",
      errors.length === 0,
      errors.join("\n").slice(0, 600)
    );
  } catch (e) {
    await page
      ?.screenshot({ path: `${process.env.TMPDIR || "/tmp"}/br-e3-fail.png` })
      .catch(() => {});
    rec.check(
      "crash",
      "E3 stopped early",
      false,
      url ? String(e.stack).split(url).join("<sign-in link>") : e.stack
    );
  } finally {
    await browser?.close();
    cleanup(LIKE3);
  }
}

// `node screens.mjs E3` runs only E3; with no name, all of them.
const only = process.argv[2];
for (const [id, fn] of [
  ["E1", run],
  ["E2", numbered],
  ["E3", rotating]
]) {
  if (!only || only === id) await withOrg(fn);
}
const failed = rec.rows.filter((r) => !r.passed);
console.log(
  `${rec.rows.filter((r) => !r.note).length - failed.length} passed, ${failed.length} failed.`
);
process.exitCode = failed.length ? 2 : 0;
