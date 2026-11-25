/**
 * The shared rule examples (staticresources/ShoreshRuleExamples.json), which the Apex must also
 * pass (RuleExamplesTest), so the two can't drift apart.
 */
import { atCamp } from "c/shoreshSetupRules";
import { buildTerms } from "c/shoreshTerms";
import { describe as describeQuestion } from "../../shoreshLearned/kinds";
import { linkedChoiceName } from "../electives";
import { foldName } from "../names";

const {
  foldedNames,
  deletedLinkedChoices,
  learnedChoices,
  atCamp: atCampCases
} = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      __dirname,
      "../../../staticresources/ShoreshRuleExamples.json"
    ),
    "utf8"
  )
);

describe("the shared rule examples", () => {
  // INGEST-2.2
  it.each(foldedNames.map((e) => [e.name, e.fold]))(
    "folds %j to %j",
    (name, fold) => {
      expect(foldName(name)).toBe(fold);
    }
  );

  // MEMO-4.2
  it.each(deletedLinkedChoices.map((e) => [e.name, e]))(
    "remembers a deleted linked choice as %s",
    (name, e) => {
      expect(linkedChoiceName(e.activity, e.days, e.blocks)).toBe(name);
    }
  );

  // MEMO-4.4
  it.each(learnedChoices.map((e) => [e.question, e.answers]))(
    "offers %s only what the server takes",
    (question, answers) => {
      const { choices } = describeQuestion(question, "", buildTerms([]));
      expect(choices.map((c) => c.value).sort()).toEqual([...answers].sort());
    }
  );

  // GEN-2.6
  it.each(atCampCases.map((e) => [e.availability, e.partOfDay, e.atCamp]))(
    "a %s group in a %s block is at camp: %s",
    (availability, partOfDay, there) => {
      expect(atCamp(availability, partOfDay)).toBe(there);
    }
  );
});
