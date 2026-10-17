/**
 * Test helpers for namespace-safe fixtures. Write fixtures with bare names, as today, and pass
 * every record a mocked Apex method returns through nsRecord(). In the normal Jest run it changes
 * nothing; in the namespaced run (npm run test:unit:namespaced) it renames `StartDate__c` to
 * `shoresh__StartDate__c`, which is what Salesforce will send once the package has its namespace.
 *
 *   import { nsRecord, nsName } from "shoresh-jest/namespace";
 *   getSeasonSetup.mockResolvedValue(nsRecord(SETUP));
 *   expect(saved).toEqual(nsRecord([{ sobjectType: nsName("Week__c"), StartDate__c: "2026-06-29" }]));
 *
 * The prefix comes from c/shoreshSchema, so the two can never disagree.
 */
import { NAMESPACE_PREFIX } from "c/shoreshSchema";

const CUSTOM = /__(c|r)$/;

/** A bare custom name as the package has it: "Week__c" -> "shoresh__Week__c" when namespaced. */
export function nsName(name) {
  return CUSTOM.test(name) && !name.startsWith(NAMESPACE_PREFIX)
    ? NAMESPACE_PREFIX + name
    : name;
}

/**
 * A copy of a fixture (record, list, or anything holding them) with every custom key renamed by
 * nsName(), including child lists (Coverages__r) and parents (Program__r). Values stay as they
 * are, except `sobjectType`, which names an object.
 */
export function nsRecord(value) {
  if (Array.isArray(value)) {
    return value.map(nsRecord);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const copy = {};
  for (const [key, inner] of Object.entries(value)) {
    copy[nsName(key)] =
      key === "sobjectType" && typeof inner === "string"
        ? nsName(inner)
        : nsRecord(inner);
  }
  return copy;
}
