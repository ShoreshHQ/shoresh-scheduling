/**
 * CORE-3.9: the shared fixed-over examples (staticresources/ShoreshFixedOverExamples.json), which
 * the AI's port must also pass (AgentFixedOverTest): the Fixed activities table asks the same
 * question and keeps the same pieces. Ids here are the records' names.
 */
import { CHILDREN, FIELD } from "c/shoreshSchema";
import { buildTerms } from "c/shoreshTerms";
import { fixedOver } from "../fixedOver";

const { camp, examples } = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../../staticresources/ShoreshFixedOverExamples.json"
    ),
    "utf8"
  )
);

const terms = buildTerms([
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  }
]);
const FIXED = FIELD.FixedActivity;
const RECURRING = FIELD.RecurringActivity;
const EXCEPTION = FIELD.WeekException;

function entryOf(example) {
  const program = { Id: "Main", Name: "Main" };
  for (const day of [...camp.days, ...(example.programAlsoRuns || [])]) {
    program[FIELD.Program[day]] = true;
  }
  const saved = example.saved;
  return {
    program,
    timeBlocks: camp.timeBlocks.map((b) => ({
      Id: b.name,
      Name: b.name,
      [FIELD.TimeBlock.PartOfDay]: b.partOfDay
    })),
    divisions: camp.divisions.map((d) => ({
      division: { Id: d.name, Name: d.name },
      groups: d.groups.map((g) => ({
        Id: g,
        Name: g,
        [FIELD.Group.Availability]: (example.onlyMornings || []).includes(g)
          ? "MorningOnly"
          : "AllDay"
      }))
    })),
    fixedActivities: saved
      ? [
          {
            Id: saved.name,
            Name: saved.name,
            [FIXED.TimeBlock]: saved.timeBlock,
            [FIXED.Length]: 1
          }
        ]
      : [],
    recurringActivities: example.recurring.map((r) => {
      const item = {
        Id: r.name,
        Name: r.name,
        [RECURRING.TimeBlock]: r.timeBlock,
        [RECURRING.Length]: r.length,
        [CHILDREN.RecurringActivity.Coverages]: (r.covers || []).map((g) => ({
          [FIELD.Coverage.Group]: g
        }))
      };
      for (const day of r.days) {
        item[RECURRING[day]] = true;
      }
      return item;
    })
  };
}

/** The season's week-off marks, each Id "<row>|<week>". */
function marksOf(example) {
  const marks = [];
  for (const r of example.recurring) {
    for (const week of r.weeksOff || []) {
      marks.push({
        Id: `${r.name}|${week}`,
        [EXCEPTION.Week]: week,
        [EXCEPTION.RecurringActivity]: r.name
      });
    }
  }
  const saved = example.saved;
  for (const week of (saved && saved.weeksOff) || []) {
    marks.push({
      Id: `${saved.name}|${week}`,
      [EXCEPTION.Week]: week,
      [EXCEPTION.FixedActivity]: saved.name
    });
  }
  return marks;
}

function saveOf(example) {
  const record = example.saved ? { Id: example.saved.name } : {};
  if (example.save.name) {
    record.Name = example.save.name;
  }
  if (example.save.timeBlock) {
    record[FIXED.TimeBlock] = example.save.timeBlock;
  }
  return {
    record,
    extras: {
      weeksOff: (example.weeksOff || []).map((week) => ({ week })),
      weeksBackOn: (example.weeksBackOn || []).map(
        (week) => `${example.saved.name}|${week}`
      )
    }
  };
}

describe("CORE-3.9: shared fixed-over examples", () => {
  it.each(examples.map((e) => [e.name, e]))("%s", (name, example) => {
    const ask = fixedOver(
      entryOf(example),
      saveOf(example),
      camp.weeks.map((w) => ({ Id: w, Name: w })),
      marksOf(example),
      terms
    );
    // Each piece as the screen saw its recurring activity: by its name too.
    const expected = example.asks && {
      ...example.asks,
      around: example.asks.around.map((p) => ({ ...p, seenName: p.target }))
    };
    expect(
      ask && {
        heading: ask.heading,
        line: ask.lines.join(" "),
        around: ask.around
      }
    ).toEqual(expected);
  });
});
