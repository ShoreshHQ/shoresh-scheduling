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
const { withOrg, makeCamp, cleanup, soql, apex, sfJson, call, ORG, Record } = require("./lib");
const { importMaple, names, count } = require("./kit");

const rec = new Record("E1");
const LIKE = "BR E1 %";

async function run() {
  cleanup(LIKE);
  const { season, camp } = makeCamp("E1 Screens");
  await importMaple(season);
  const campId = soql(`SELECT Id FROM Camp__c WHERE Name = '${camp}'`)[0].Id;
  const url = sfJson(["org", "open", "--target-org", ORG, "--url-only", "--path", `/lightning/n/Shoresh_Camp_Setup?c__camp=${campId}`]).result.url;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const inSeason = `Season__r.Name = '${season}'`;
  const specials = () => [...names("SpecialDay__c", inSeason), ...names("SpecialEvent__c", inSeason)].join();
  const openScreen = async (name) => {
    await page.getByRole("link", { name, exact: false }).first().click();
    await page.waitForTimeout(2500);
  };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.locator("c-shoresh-app, c-shoresh-roots").first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(4000);

    await openScreen(/^Special events/);
    const panel = page.locator('[data-screen="specialEvents"] [data-id="special-list"]');
    await panel.getByRole("button", { name: "Import a list" }).click();
    await page.waitForTimeout(800);
    const file = (csv) => ({ name: "specials.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    const csv = "Name,Type,Where,Notes\nLake day,Special day,,Bring towels\nCampfire,Event,Field,Bring wood\nNo kind here,,,\nField trip,Special day,Barn,\n";
    await panel.locator('c-shoresh-list-import input[data-id="file"]').setInputFiles(file(csv));
    await page.waitForTimeout(2000);
    const shown = await panel.locator("c-shoresh-list-import").innerText();
    rec.check("SPECIAL-2.4", "a row with no Type isn't read, and says why", /No kind here/.test(shown), shown);
    rec.check("SPECIAL-2.5", "a special day with a place isn't read, and says why", /Field trip/.test(shown), shown);
    const review = await call("import_list", { season, list: "special", file_name: "specials.csv", csv_text: csv });
    rec.note("the same file through the connector", `${review.kind}: ${review.text.slice(0, 800)}`);
    rec.check("INGEST-5.5", "the review saves nothing", specials() === "", specials());
    await panel.locator('c-shoresh-list-import [data-id="save"]').click();
    await page.waitForTimeout(5000);
    const after = await panel.innerText();
    rec.check("SPECIAL-2.6", "saving adds the day and the event, read back", specials() === "Lake day,Campfire", specials());
    rec.check("SPECIAL-2.6", "the save says what a new special day left out, or just what it added", /added|Added|Lake day/.test(after), after.slice(0, 800));
    const plan = soql(`SELECT Id FROM PlanPart__c WHERE ${inSeason}`).length;
    rec.note("plan parts after the list added a special day", String(plan));
    const lakeDay = soql(`SELECT Id, Notes__c FROM SpecialDay__c WHERE ${inSeason} AND Name = 'Lake day'`)[0];
    rec.check("SPECIAL-2.6", "the notes came in", lakeDay?.Notes__c === "Bring towels", JSON.stringify(lakeDay));

    // Undo this import: the panel's own Undo, read back.
    const undo = panel.locator('c-shoresh-list-import [data-id="undo"]');
    rec.check("SPECIAL-2.8", "the panel offers Undo", (await undo.count()) === 1, await panel.innerText());
    if (await undo.count()) {
      await undo.click();
      await page.waitForTimeout(800);
      const ask = page.getByRole("button", { name: /^Undo/ });
      if ((await ask.count()) > 1) await ask.last().click();
      await page.waitForTimeout(5000);
      rec.check("SPECIAL-2.8", "Undo takes both away", specials() === "", specials());
      rec.check("SPECIAL-2.8", "their plans go with them", soql(`SELECT Id FROM PlanPart__c WHERE ${inSeason}`).length === 0, "plan parts left");
    }

    // A special day whose schedule was saved since is kept and named.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("c-shoresh-app, c-shoresh-roots").first().waitFor();
    await page.waitForTimeout(4000);
    await openScreen(/^Special events/);
    await panel.getByRole("button", { name: "Import a list" }).click();
    await page.waitForTimeout(800);
    await panel.locator('c-shoresh-list-import input[data-id="file"]').setInputFiles(file("Name,Type,Where,Notes\nLake day,Special day,,Bring towels\n"));
    await page.waitForTimeout(2000);
    await panel.locator('c-shoresh-list-import [data-id="save"]').click();
    await page.waitForTimeout(5000);
    const put = await call("put_special_day_on_day", { season, special_day: "Lake day", week: "Week 1", day: "Wednesday", seen: "none" });
    rec.check("SPECIAL", "put on a day through the AI", put.kind === "done", put.text);
    const undoAgain = panel.locator('c-shoresh-list-import [data-id="undo"]');
    if (await undoAgain.count()) {
      await undoAgain.click();
      await page.waitForTimeout(800);
      const ask = page.getByRole("button", { name: /^Undo/ });
      if ((await ask.count()) > 1) await ask.last().click();
      await page.waitForTimeout(5000);
      const said = await panel.innerText();
      rec.check("SPECIAL-2.8", "a special day put on a day since is kept", names("SpecialDay__c", inSeason).includes("Lake day"), specials());
      rec.check("SPECIAL-2.8", "and named", /Lake day/.test(said), said.slice(0, 600));
    } else {
      rec.check("SPECIAL-2.8", "the second import offers Undo", false);
    }

    // Paste on Activities' Import a list (INGEST-1.6).
    await openScreen(/^Activities/);
    const acts = page.locator('[data-screen="activities"], c-shoresh-activities').first();
    await acts.getByRole("button", { name: "Import a list" }).click();
    await page.waitForTimeout(800);
    const pasted = await page.evaluate(() => {
      const find = (root) => {
        for (const el of root.querySelectorAll("*")) {
          if (el.dataset?.id === "list-import") return el;
          if (el.shadowRoot) { const hit = find(el.shadowRoot); if (hit) return hit; }
        }
        return null;
      };
      const panel = find(document);
      if (!panel) return false;
      const data = new DataTransfer();
      data.setData("text/plain", "Activity\tLocation\nPasted canoe, big\tDock\n");
      panel.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, composed: true }));
      return true;
    });
    await page.waitForTimeout(2000);
    const pastedText = pasted ? await page.locator("c-shoresh-list-import").first().innerText() : "";
    rec.check("INGEST-1.6", "pasted cells are laid into the review, the comma kept", /Pasted canoe, big/.test(pastedText), pastedText.slice(0, 500));
    rec.check("INGEST-5.5", "a paste saves nothing", count("Activity__c", `${inSeason} AND Name LIKE 'Pasted%'`) === 0);
    rec.check("errors", "no error in the page", errors.length === 0, errors.join("\n"));
  } catch (e) {
    await page.screenshot({ path: `${process.env.TMPDIR || "/tmp"}/br-e1-fail.png` }).catch(() => {});
    rec.check("crash", "E1 stopped early", false, e.stack);
  } finally {
    await browser.close();
    cleanup(LIKE);
  }
}

await withOrg(run);
void apex;
const failed = rec.rows.filter((r) => !r.passed);
console.log(`${rec.rows.filter((r) => !r.note).length - failed.length} passed, ${failed.length} failed.`);
process.exitCode = failed.length ? 2 : 0;
