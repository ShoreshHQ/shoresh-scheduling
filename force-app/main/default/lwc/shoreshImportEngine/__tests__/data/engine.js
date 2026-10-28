// The import engine as the screens call it, for tests (not a test itself). The existing season
// is written in tests with bare names and handed over as the package would send it: unchanged
// normally, shoresh__-prefixed in the namespaced run (npm run test:unit:namespaced).
import * as engine from "c/shoreshImportEngine";
import { NAMESPACE_PREFIX } from "c/shoreshSchema";
import { nsRecord } from "shoresh-jest/namespace";

export {
  LEAVE_OUT,
  foundLists,
  importNotes,
  questionCards,
  readAsGroups,
  undoMessage,
  unplacedLines
} from "c/shoreshImportEngine";

export function buildProposal(input) {
  return engine.buildProposal({ ...input, existing: nsRecord(input.existing) });
}

/** Every key in a value (record, list, plan) that names a custom field or relationship. */
export function customKeys(value) {
  if (Array.isArray(value)) {
    return value.flatMap(customKeys);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) => [
    ...(/__(c|r)$/.test(key) ? [key] : []),
    ...customKeys(inner)
  ]);
}

/**
 * The save the screen would send. In the namespaced run every custom name it writes must carry
 * the prefix: a bare one would reach the server misnamed, so it fails the test here.
 */
export function planFor(proposal, existing, ...rest) {
  const plan = engine.planFor(proposal, nsRecord(existing), ...rest);
  const bare = customKeys(plan).filter((k) => !k.startsWith(NAMESPACE_PREFIX));
  if (JSON.stringify(plan).includes('"undefined":')) {
    throw new Error("The plan names a field that doesn't exist");
  }
  if (NAMESPACE_PREFIX && bare.length) {
    throw new Error(`The plan writes bare names: ${bare.join(", ")}`);
  }
  return plan;
}
