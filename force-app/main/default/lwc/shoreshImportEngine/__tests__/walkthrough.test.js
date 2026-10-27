// docs/try-camp-setup.md section 14, step by step: what Greg will see.
import {
  buildProposal,
  foundLists,
  LEAVE_OUT,
  planFor,
  questionCards
} from "./data/engine";
import { existingSetup, samples, terms, findSamplesFrom } from "./data/samples";

findSamplesFrom(__dirname);

const DAY_FIELDS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const toMinutes = (clock) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));

/** The season as the server would read it back after saving a plan (Ids are the plan's keys). */
function afterSave(plan) {
  const programs = plan.programs.map((p) => {
    const record = { Id: p.key, Name: p.name };
    DAY_FIELDS.forEach((d) => {
      record[`${d}__c`] = p.days.includes(d);
    });
    return {
      program: record,
      timeBlocks: plan.timeBlocks
        .filter((b) => b.programKey === p.key)
        .map((b) => ({
          Id: b.key,
          Name: b.name,
          StartTime__c: toMinutes(b.start) * 60000,
          EndTime__c: toMinutes(b.end) * 60000,
          SortOrder__c: b.sortOrder
        })),
      divisions: plan.divisions
        .filter((d) => d.programKey === p.key)
        .map((d) => ({
          division: { Id: d.key, Name: d.name },
          groups: plan.groups
            .filter((g) => g.divisionKey === d.key)
            .map((g) => ({ Id: g.key, Name: g.name }))
        })),
      fixedActivities: plan.fixedActivities
        .filter((f) => f.programKey === p.key)
        .map((f, i) => ({
          Id: `F${i}`,
          Name: f.name,
          TimeBlock__c: f.blockKey,
          Length__c: f.length
        })),
      recurringActivities: plan.recurringActivities
        .filter((r) => r.programKey === p.key)
        .map((r, i) => {
          const item = {
            Id: `R${i}`,
            Name: r.name,
            TimeBlock__c: r.blockKey,
            Length__c: r.length
          };
          DAY_FIELDS.forEach((d) => {
            item[`${d}__c`] = r.days.includes(d);
          });
          return item;
        })
    };
  });
  return existingSetup({
    programs,
    activities: plan.activities.map((a) => ({
      Id: a.key,
      Name: a.name,
      Length__c: a.length
    })),
    electives: {
      sets: plan.electiveSets.map((x) => ({ Id: x.key, Name: x.name })),
      offerings: [],
      linkedChoices: []
    }
  });
}

describe("Import last year, as the walkthrough tells it", () => {
  let firstPlan;

  it("into an empty season: one similar name, then everything added", () => {
    const files = samples("all-camp");
    const empty = existingSetup();
    const preview = questionCards(
      buildProposal({ files, existing: empty, terms, answers: {} }),
      terms,
      {}
    );
    const similar = preview.filter((c) => c.stage === "preview" && !c.select);
    expect(similar.map((c) => c.title)).toEqual([
      "Are “Music” and “Musik” the same activity?"
    ]);
    const answers = { [similar[0].id]: "a" };
    // Library time is all of Juniors once, in a one-week file: a genuine split (rule 3), asked.
    const asked = questionCards(
      buildProposal({ files, existing: empty, terms, answers }),
      terms,
      answers
    ).filter((c) => c.stage === "review" && !c.flag);
    expect(asked.map((c) => c.subject)).toEqual(["Library time"]);
    answers[asked[0].id] = "recurring";

    const proposal = buildProposal({ files, existing: empty, terms, answers });
    const lists = Object.fromEntries(
      foundLists(proposal, terms).map((l) => [l.key, l.items])
    );
    expect(lists.programs.map((i) => [i.name, i.detail, i.tag])).toEqual([
      ["Main", "Monday to Friday", "new"]
    ]);
    expect(lists.timeBlocks).toHaveLength(7);
    expect(lists.groups.map((i) => `${i.name} ${i.detail}`)).toEqual([
      "Bunk 1 Juniors",
      "Bunk 2 Juniors",
      "Bunk 3 Juniors",
      "Bunk 4 Seniors",
      "Bunk 5 Seniors",
      "Bunk 6 Seniors"
    ]);
    expect(lists.fixedActivities.map((i) => i.name)).toEqual(["Lunch"]);
    expect(
      lists.recurringActivities.map((i) => `${i.name}: ${i.detail}`)
    ).toEqual([
      "Library time: Period 4 on Wednesday, Juniors",
      "Morning meeting: Period 1 on Monday, everyone"
    ]);
    expect(lists.activities.find((i) => i.name === "Boating").detail).toBe(
      "1 a week · 2 time blocks long · Seniors only"
    );
    expect(lists.noted.map((i) => i.name)).toEqual(["Field day", "Zoo trip"]);
    // Chugim is an elective set now (slice E9), read without a question.
    expect(proposal.electives.sets.map((s) => s.name)).toEqual(["Chugim"]);

    const review = questionCards(proposal, terms, answers).filter(
      (c) => c.stage === "review" && !c.flag
    );
    // Answered: nothing left to ask.
    expect(review.filter((c) => !(c.id in answers))).toEqual([]);

    firstPlan = planFor(
      buildProposal({ files, existing: empty, terms, answers }),
      empty,
      "season1"
    );
    expect(firstPlan.programs).toHaveLength(1);
    expect(firstPlan.timeBlocks).toHaveLength(7);
    expect(firstPlan.divisions).toHaveLength(2);
    expect(firstPlan.groups).toHaveLength(6);
    expect(firstPlan.activities).toHaveLength(7);
    expect(firstPlan.fixedActivities).toHaveLength(1);
    expect(firstPlan.electiveSets).toEqual([
      { key: "ES|Chugim", id: null, name: "Chugim" }
    ]);
    expect(firstPlan.recurringActivities.map((r) => r.name)).toEqual([
      "Library time",
      "Morning meeting"
    ]);
  });

  it("then all eight files into that season: everything matched, the camp's Music, one disagreement", () => {
    const existing = afterSave(firstPlan);
    const files = [
      ...samples("all-camp"),
      ...samples("Bunk"),
      ...samples("by-activity")
    ];
    expect(files).toHaveLength(8);
    const first = buildProposal({ files, existing, terms, answers: {} });
    expect(
      [...new Set(first.reading.pages.map((p) => p.layout))].sort()
    ).toEqual(["allCamp", "byActivity", "byGroup"]);
    expect(
      first.reading.pages
        .filter((p) => p.layout === "byGroup")
        .map((p) => p.name)
    ).toEqual(["Bunk 1", "Bunk 2", "Bunk 3", "Bunk 4", "Bunk 5", "Bunk 6"]);
    const similar = questionCards(first, terms, {}).filter(
      (c) => c.stage === "preview" && !c.select
    );
    expect(similar.map((c) => c.title)).toEqual([
      "Are “Musik” and “Music” the same activity?"
    ]);
    expect(similar[0].options[0].label).toBe("Same: use “Music”");
    const answers = { [similar[0].id]: "b" };

    const proposal = buildProposal({ files, existing, terms, answers });
    const lists = foundLists(proposal, terms);
    const tags = new Set(
      lists
        .filter((l) => l.key !== "noted")
        .flatMap((l) => l.items.map((i) => i.tag))
    );
    expect([...tags]).toEqual(["already set up"]);
    const review = questionCards(proposal, terms, answers).filter(
      (c) => c.stage === "review" && !c.flag
    );
    expect(review.map((c) => c.title)).toEqual([
      "The files disagree about Bunk 3, Tuesday, Period 2. Which is right?"
    ]);
    answers[review[0].id] = LEAVE_OUT;

    const plan = planFor(
      buildProposal({ files, existing, terms, answers }),
      existing,
      "season1"
    );
    const setupLists = [
      "programs",
      "timeBlocks",
      "divisions",
      "groups",
      "locations",
      "activities",
      "fixedActivities",
      "recurringActivities",
      "electiveSets",
      "offerings",
      "linkedChoices"
    ];
    const added = setupLists.flatMap((key) => plan[key]);
    expect(added).toEqual([]);
  });
});
