// The schedule's Excel sheets and printed pages, worked out from an opened version (made-up data).
import { blockText, printPages, scheduleSheets } from "c/shoreshScheduleExport";
import { buildTerms } from "c/shoreshTerms";
import {
  LABELS,
  opened
} from "../../shoreshScheduleViews/__tests__/data/scheduleFixture";

const t = buildTerms(LABELS);
const CATALOGUE = [{ Id: "a1", Name: "Swim" }];
const P1 = "Period 1 (9:00 AM – 9:45 AM)";
const P2 = "Period 2 (10:00 AM – 10:45 AM)";
const LUNCH = "Lunch (12:00 PM – 12:45 PM)";

const sheetsOf = (view = opened()) => scheduleSheets(view, CATALOGUE, t);
const sheet = (sheets, name) => sheets.find((s) => s.name === name);

describe("c-shoresh-schedule-export", () => {
  describe("the Excel file", () => {
    it("has a sheet per day, then every bunk's week and every activity's, in camp words", () => {
      expect(sheetsOf().map((s) => s.name)).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday",
        "All Bunks",
        "All Activities"
      ]);
    });

    it("lays a day out as Daily View does: time blocks down the side, a column per bunk", () => {
      const monday = sheet(sheetsOf(), "Monday");
      expect(monday.rows).toEqual([
        ["Time block", "Bunk 1", "Bunk 2"],
        // Swim runs two blocks: written in both, as the desktop writes a slot per block.
        [P1, "Swim", "Chugim"],
        [P2, "Swim", "Pottery (removed)"],
        [LUNCH, "Lunch", "Lunch"]
      ]);
      expect(monday.widths).toEqual([22, 16, 16]);
      // Nothing placed is an empty cell, as on the desktop.
      expect(sheet(sheetsOf(), "Tuesday").rows[1]).toEqual([P1, "", "Swim"]);
    });

    it("says a day that can't be read can't be shown, and leaves it out of the flat sheets", () => {
      const sheets = sheetsOf();
      expect(sheet(sheets, "Wednesday").rows).toEqual([["Can't be shown"]]);
      const days = [
        ...sheet(sheets, "All Bunks").rows,
        ...sheet(sheets, "All Activities").rows
      ].map((row) => row[1]);
      expect(days).not.toContain("Wednesday");
    });

    it("lists each bunk's week, naming the kind of anything that is not an activity", () => {
      expect(sheet(sheetsOf(), "All Bunks").rows).toEqual([
        ["Bunk", "Day", "Time block", "Activity"],
        ["Bunk 1", "Monday", P1, "Swim"],
        ["Bunk 1", "Monday", P2, "Swim"],
        ["Bunk 1", "Monday", LUNCH, "[Fixed activity] Lunch"],
        ["Bunk 1", "Tuesday", P2, "Swim"],
        ["Bunk 1", "Tuesday", LUNCH, "[Fixed activity] Lunch"],
        ["Bunk 2", "Monday", P1, "[Chug] Chugim"],
        ["Bunk 2", "Monday", P2, "Pottery (removed)"],
        ["Bunk 2", "Monday", LUNCH, "[Fixed activity] Lunch"],
        ["Bunk 2", "Tuesday", P1, "Swim"],
        ["Bunk 2", "Tuesday", LUNCH, "[Fixed activity] Lunch"]
      ]);
    });

    it("lists where each activity runs, catalogue first, then one deleted since", () => {
      expect(sheet(sheetsOf(), "All Activities").rows).toEqual([
        ["Activity", "Day", "Time block", "Bunks"],
        ["Swim", "Monday", P1, "Bunk 1"],
        ["Swim", "Monday", P2, "Bunk 1"],
        ["Swim", "Tuesday", P1, "Bunk 2"],
        ["Swim", "Tuesday", P2, "Bunk 1"],
        ["Pottery (removed)", "Monday", P2, "Bunk 2"]
      ]);
    });

    it("never writes a name Excel would run as a formula", () => {
      const view = opened();
      view.days[0].groups[0] = {
        id: "g1",
        name: "=HYPERLINK(1)",
        gone: false
      };
      const sheets = sheetsOf(view);
      expect(sheet(sheets, "Monday").rows[0][1]).toBe("'=HYPERLINK(1)");
      expect(sheet(sheets, "All Bunks").rows[1][0]).toBe("'=HYPERLINK(1)");
    });

    it("gives a second day of the same name its date, so no sheet is lost", () => {
      const view = opened();
      view.days[1] = { ...view.days[1], dateValue: "2026-07-06" };
      expect(
        sheetsOf(view)
          .slice(0, 3)
          .map((s) => s.name)
      ).toEqual(["Monday", "Monday Jul 6", "Wednesday"]);
    });

    it("ELECT-6.3: lists an elective set's offerings in its cell, as the desktop does, on no other activity's row", () => {
      // The made-up week's Chugim, set up as an elective set with two offerings.
      const view = JSON.parse(JSON.stringify(opened()));
      const setUp = (node) => {
        if (Array.isArray(node)) {
          node.forEach(setUp);
        } else if (node && typeof node === "object") {
          if (node.kind === "E") {
            node.id = "es1";
          }
          Object.values(node).forEach(setUp);
        }
      };
      setUp(view);
      const sheets = scheduleSheets(
        view,
        CATALOGUE,
        t,
        new Map([["es1", ["Archery", "Drama"]]])
      );
      expect(sheet(sheets, "Monday").rows[1]).toEqual([
        P1,
        "Swim",
        "Chugim (Archery, Drama)"
      ]);
      // All Groups: the same words, no kind in brackets (desktop formatCellLabel).
      expect(sheet(sheets, "All Bunks").rows).toContainEqual([
        "Bunk 2",
        "Monday",
        P1,
        "Chugim (Archery, Drama)"
      ]);
      // A set with no offerings named reads as its name alone, unbracketed on All Groups too.
      const bare = scheduleSheets(view, CATALOGUE, t);
      expect(sheet(bare, "Monday").rows[1][2]).toBe("Chugim");
      expect(sheet(bare, "All Bunks").rows).toContainEqual([
        "Bunk 2",
        "Monday",
        P1,
        "Chugim"
      ]);
    });

    it("gives the same file for the same version, every time", () => {
      expect(JSON.stringify(sheetsOf())).toBe(JSON.stringify(sheetsOf()));
    });

    it("names a block by its times when that is its name, and says one is removed", () => {
      expect(
        blockText({
          name: "9:00 AM – 9:45 AM",
          startTime: "09:00",
          endTime: "09:45",
          gone: false
        })
      ).toBe("9:00 AM – 9:45 AM");
      expect(blockText({ name: "Free time", gone: true })).toBe(
        "Free time (removed)"
      );
    });
  });

  describe("the printout", () => {
    it("Daily View prints a page per day, each a timetable with a column per bunk", () => {
      const pages = printPages(opened(), "day", CATALOGUE, t);
      expect(pages.map((p) => p.title)).toEqual([
        "Monday, Jun 29",
        "Tuesday, Jun 30",
        "Wednesday, Jul 1"
      ]);
      const monday = pages[0].table;
      expect(monday.columns.map((c) => c.label)).toEqual(["Bunk 1", "Bunk 2"]);
      expect(monday.rows.map((r) => r.time)).toEqual([
        "Period 1, 9:00 AM – 9:45 AM",
        "Period 2, 10:00 AM – 10:45 AM",
        "Lunch, 12:00 PM – 12:45 PM"
      ]);
      // Swim spans both periods: one cell, two rows tall, and no cell under it.
      expect(
        monday.rows[0].cells.map((c) => [c.text, c.rowspan, c.note])
      ).toEqual([
        ["Swim", 2, null],
        ["Chugim", 1, "not set up yet"]
      ]);
      expect(monday.rows[1].cells.map((c) => c.text)).toEqual(["Pottery"]);
      expect(monday.rows[1].cells[0].note).toBe("(removed)");
      // A day that can't be read prints its title and says so.
      expect(pages[2].table).toBeNull();
    });

    it("prints nothing in an Open cell", () => {
      const tuesday = printPages(opened(), "day", CATALOGUE, t)[1].table;
      expect(tuesday.rows[0].cells[0]).toMatchObject({
        text: "",
        className: "cell cell_empty"
      });
    });

    it("Group View prints a page per bunk, a column per day", () => {
      const pages = printPages(opened(), "group", CATALOGUE, t);
      expect(pages.map((p) => p.title)).toEqual(["Bunk 1", "Bunk 2"]);
      const bunk1 = pages[0].table;
      expect(bunk1.columns.map((c) => [c.label, c.sub])).toEqual([
        ["Monday", "Jun 29"],
        ["Tuesday", "Jun 30"],
        ["Wednesday", "Jul 1"]
      ]);
      expect(bunk1.rows[0].cells.map((c) => c.text)).toEqual([
        "Swim",
        "",
        "Can't be shown"
      ]);
    });

    it("Activity View prints a page per activity that runs this week, with the bunks there", () => {
      const pages = printPages(
        opened(),
        "activity",
        [...CATALOGUE, { Id: "a2", Name: "Archery" }],
        t
      );
      // Archery isn't on this week: no empty page for it.
      expect(pages.map((p) => p.title)).toEqual(["Swim", "Pottery (removed)"]);
      const rows = pages[0].table.rows;
      expect(rows[0].cells.map((c) => c.text)).toEqual([
        "Bunk 1",
        "Bunk 2",
        "Can't be shown"
      ]);
      // The day that can't be read is one cell down the whole column.
      expect(rows[1].cells.map((c) => c.text)).toEqual(["Bunk 1", "Bunk 1"]);
    });

    it("prints nothing for nothing open", () => {
      expect(printPages(null, "day", CATALOGUE, t)).toEqual([]);
    });
  });
});
