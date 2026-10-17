// The list engine as the screens call it, for tests (not a test itself). The season is written
// in tests with bare names and handed over as the package would send it: unchanged normally,
// shoresh__-prefixed in the namespaced run (npm run test:unit:namespaced). What a save would
// send must name every field the package's way (a bare name fails the namespaced run); it is
// then given back with bare names, so the tests' expectations read the same in both runs.
import * as lists from "c/shoreshLists";
import { NAMESPACE_PREFIX, localName } from "c/shoreshSchema";
import { nsRecord } from "shoresh-jest/namespace";

export {
  CHANGE,
  KEEP,
  LIST_SCREENS,
  UNUSED,
  changeAllCounts,
  changeAllLabel,
  columnKey,
  findSheets,
  listScreen,
  questionCards,
  rainAddKey,
  sanitizeCell,
  sheetName,
  shownValue,
  similarCards,
  unescapeCell,
  waitingFor,
  workbookCards,
  workbookWaiting
} from "c/shoreshLists";

const CUSTOM = /__(c|r)$/;

/** A save's keys with the prefix taken off, after checking each one has it (namespaced run). */
function asSent(value) {
  if (Array.isArray(value)) {
    return value.map(asSent);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const result = {};
  for (const [key, inner] of Object.entries(value)) {
    if (CUSTOM.test(key) && !key.startsWith(NAMESPACE_PREFIX)) {
      throw new Error(
        `The save names a field without the package's prefix: ${key}`
      );
    }
    result[CUSTOM.test(key) ? localName(key) : key] = asSent(inner);
  }
  return result;
}

export function listProposal(input) {
  return lists.listProposal({ ...input, setup: nsRecord(input.setup) });
}

export function workbookProposal(input) {
  return lists.workbookProposal({ ...input, setup: nsRecord(input.setup) });
}

export function listRows(screenKey, setup, t) {
  return lists.listRows(screenKey, nsRecord(setup), t);
}

export function campWorkbookSheets(setup, t) {
  return lists.campWorkbookSheets(nsRecord(setup), t);
}

export function listPlan(...args) {
  return asSent(lists.listPlan(...args));
}

export function workbookPlan(...args) {
  return asSent(lists.workbookPlan(...args));
}
