# 0009: Namespace-safe names

Status: accepted (2026-10-17). Built in PRs #28–#32, #34, #36 and the close-out. Plan: wiki
`projects/shoresh-namespace-plan`. Greg chose the prefix `shoresh` (2026-10-17); it is registered
later, from the one-time namespace org, with his go-ahead.

## Why

Shoresh ships as a managed package. Once it has its namespace, Salesforce names every custom
object, field and relationship with the prefix: `Week__c` becomes `shoresh__Week__c`,
`StartDate__c` becomes `shoresh__StartDate__c`. Typed Apex (`new Week__c(StartDate__c = …)`,
static SOQL) and metadata are renamed for us. Names written as text are not. A screen reading
`record.StartDate__c` would see blanks, a save naming `"Season__c"` would fail, and an Apex
check comparing names as text would refuse good data (Undo, for one, would have said every
import "can't be read").

## The rules

1. **No field or object name written as text** anywhere in `force-app`: not as a string, a
   property (`record.StartDate__c`), a template binding, or a name built from text
   (`day + '__c'`, `` `${d}__c` ``). The one home for names is:
   - **LWC: `c/shoreshSchema`.** It is generated from the object metadata
     (`node scripts/generate-shoresh-schema.js`; a Jest test fails when it is out of date) and
     imports every object and field from `@salesforce/schema`, so the compiler adds the prefix.
     Use `OBJECT.Week`, `FIELD.Week.StartDate`, `PARENT.Season.CopiedFrom` (a lookup's parent),
     `CHILDREN.Activity.Eligibilities` (child lists), `FIELD.Program[day]` for days. Templates
     bind names through getters (`object-api-name={objects.Week}`). Inputs are named for what
     they are (`data-field="start"`) and mapped to fields in JS.
   - **Apex: typed references and `ShoreshSchema`.** `ShoreshSchema.field(type, name)` turns a
     name, bare or prefixed and in any case, into the field; `populatedFields(record)` gives the
     fields a record was sent with; `queryName()` and `childRelationship()` build dynamic SOQL;
     `localName()` gives the bare name. Allow-lists are sets of field references, and every name
     from the screen or a log is turned into its field before it is checked or used.
2. **Each object's own fields.** A fixed and a recurring activity, or who-can-do-it and
   who-it-covers rows, share local names but are different fields. Code picks the object's own
   field set and never borrows another's.
3. **Stored names are bare local names.** An import's log (`Import__c.Created__c`/`Changed__c`)
   keeps `Week__c` and `StartDate__c`, never the prefixed name, and Undo's fingerprints name
   fields the same way, so a log means the same before and after registration. A remembered
   answer whose key names a field uses `localName()` too (`change|weeks|<id>|EndDate__c|…`).
   Logs written before this work already used local names and stay readable.
4. **Never mistake a subscriber's field for ours.** In a customer's org, an admin (or another
   package) can add a field with the same local name to one of our objects. `ShoreshSchema`
   only maps this package's own custom fields (full name = our prefix + local name) and
   standard fields.
5. **Refuse, don't guess.** A name that resolves to no field, or one field sent twice in two
   spellings, is refused plainly. The editable table refuses an object it doesn't know with an
   error card rather than editing or saving half-right.

## The guards (all in CI's "LWC Jest and Code Analyzer" job)

- **`scripts/namespace-safety.js`** (`npm run check:namespace`): fails on any field or object
  name written as text in LWC JavaScript, LWC templates, or Apex string literals, plus Apex
  `getName()`. It catches every suffix the namespace goes in front of (`__c`, `__r`, `__mdt`,
  `__e`, `__Share`, `__History`, `__x`, `__b`). Tests and the two schema homes aren't scanned.
  It allows none.
- **The namespaced Jest run** (`npm run test:unit:namespaced`): every component's tests run with
  every schema import named `shoresh__…`. Tests hand records in through `nsRecord()` and check
  what a component sends through `bareRecord()` (`jest/namespace.js`), which fails on a bare or
  undefined name. New components are covered automatically; an exclusion needs a reason in
  `jest.namespaced.config.js`.
- **Apex tests with the prefix simulated:** `ShoreshSchema.simulatedPrefix = 'shoresh__'` makes
  Shoresh read names as the namespaced package will. Import and Undo are tested with plans and
  logs spelled with the prefix.
- **Mutation checks when converting code (review practice):** swap each converted name back to
  its bare spelling, one at a time, and confirm the namespaced run fails. A swap that still
  passes is a read or write no test checks.

## What only registration can prove

The prefix is simulated inside Shoresh and Jest; the platform still reports bare names here.
After the namespace is registered and set in `sfdx-project.json`:

1. `sf package version create --code-coverage` runs every Apex test in a namespaced build org:
   the first real proof that `getPopulatedFieldsAsMap()` keys, describe names and
   `getSObject(field)` behave as designed.
2. Renew the test org (it becomes namespaced), deploy, run CI, and walk through
   `docs/try-camp-setup.md`: every setup screen, list and workbook import, Undo, Manual Build
   and the schedule page. This proves records reach the screens with `shoresh__` keys and that
   the compiled schema imports carry the prefix.
