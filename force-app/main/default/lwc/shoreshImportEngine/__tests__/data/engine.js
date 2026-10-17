// The import engine as the screens call it, for tests (not a test itself). The existing season
// is written in tests with bare names and handed over as the package would send it: unchanged
// normally, shoresh__-prefixed in the namespaced run (npm run test:unit:namespaced).
import * as engine from "c/shoreshImportEngine";
import { nsRecord } from "shoresh-jest/namespace";

export {
  LEAVE_OUT,
  foundLists,
  importNotes,
  questionCards,
  undoMessage,
  unplacedLines
} from "c/shoreshImportEngine";

export function buildProposal(input) {
  return engine.buildProposal({ ...input, existing: nsRecord(input.existing) });
}

export function planFor(proposal, existing, ...rest) {
  return engine.planFor(proposal, nsRecord(existing), ...rest);
}
