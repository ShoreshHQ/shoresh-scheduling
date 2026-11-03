/**
 * The shared cell examples (staticresources/ShoreshCellExamples.json), which Apex must also pass
 * (CellExamplesTest): the engine reads what a cell holds, and the week editor words a locked
 * cell's refusal, as the server does.
 */
import { isCarryOn, isSetTime, owner, startsActivity } from "c/shoreshEngine";
import { lockedWords } from "../../shoreshWeekEditor/handEdits";

const { cells, locked } = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../../staticresources/ShoreshCellExamples.json"
    ),
    "utf8"
  )
);

describe("shared cell examples", () => {
  it.each(cells.map((c) => [c.name, c]))("%s", (name, cell) => {
    expect({
      owner: owner(cell.slot),
      carriesOn: isCarryOn(cell.slot),
      setTime: isSetTime(cell.slot),
      startsActivity: startsActivity(cell.slot)
    }).toEqual({
      owner: cell.owner,
      carriesOn: cell.carriesOn,
      setTime: cell.setTime,
      startsActivity: cell.startsActivity
    });
  });

  it.each(locked.map((c) => [c.words, c]))("%s", (words, cell) => {
    const ctx = {
      week: [
        {
          dateValue: "2026-07-06",
          groups: [{ name: cell.group }],
          blocks: [{ name: cell.block }]
        }
      ],
      dayNameOf: () => cell.weekday
    };
    expect(lockedWords(ctx, { day: 0, group: 0, block: 0 })).toBe(words);
  });
});
