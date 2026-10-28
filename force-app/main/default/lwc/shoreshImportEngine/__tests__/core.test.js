/**
 * The CORE protocol's classification and import terms (docs/protocol/core.md), each proved on its
 * own against the real import. Synthetic camps only.
 */
import { buildProposal } from "./data/engine";
import { byGroupFiles, findSamplesFrom, terms } from "./data/samples";
import { versionName } from "../version";

findSamplesFrom(__dirname);

const GROUPS = [
  "Juniors - Bunk 1",
  "Juniors - Bunk 2",
  "Seniors - Bunk 3",
  "Seniors - Bunk 4"
];
const ROTATION = ["Swim", "Art", "Soccer", "Drama"];
const rotation = (g, d, b) => ROTATION[(g + b + d) % ROTATION.length];
const propose = (cell) =>
  buildProposal({
    files: byGroupFiles(GROUPS, cell),
    existing: null,
    terms,
    answers: {}
  });

function kindsOf(proposal, name) {
  return [
    proposal.fixed.some((f) => f.name === name) && "fixed",
    proposal.recurring.some((f) => f.name === name) && "recurring",
    proposal.activities.some((f) => f.name === name) && "activity"
  ].filter(Boolean);
}

describe("CORE layer 3: classification", () => {
  // CORE-3.1
  it("CORE-3.1: every name is exactly one of fixed, recurring or activity, and none is linked to another", () => {
    // Lunch for everyone; Flag for Juniors at a set time; the rest rotate.
    const p = propose((g, d, b) => {
      if (b === 2) return "Lunch";
      if (b === 0 && g < 2) return "Flag";
      return rotation(g, d, b);
    });
    for (const name of ["Lunch", "Flag", ...ROTATION]) {
      expect([name, kindsOf(p, name).length]).toEqual([name, 1]);
    }
    expect(kindsOf(p, "Lunch")).toEqual(["fixed"]);
    expect(kindsOf(p, "Flag")).toEqual(["recurring"]);
    // No item points at another.
    for (const item of [...p.fixed, ...p.recurring, ...p.activities]) {
      expect(Object.keys(item)).not.toContain("linkedTo");
    }
  });

  // CORE-3.2
  it("CORE-3.2: a name that is a set time for everyone every day is fixed before recurring is tried", () => {
    // Every group's block 2 every day is also "a set, repeating time": fixed wins.
    const p = propose((g, d, b) => {
      return b === 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(kindsOf(p, "Lunch")).toEqual(["fixed"]);
    // A set time short of everyone is recurring before activity is tried.
    const q = propose((g, d, b) => {
      return b === 2 && g < 2 ? "Lunch" : rotation(g, d, b);
    });
    expect(kindsOf(q, "Lunch")).toEqual(["recurring"]);
  });
});

describe("CORE layer 1: terms at import", () => {
  // CORE-1.26
  it("CORE-1.26: the imported week is labelled with the file it came from", () => {
    expect(versionName(["Summer 2025.xlsx"])).toBe(
      "Imported from Summer 2025.xlsx"
    );
  });
});
