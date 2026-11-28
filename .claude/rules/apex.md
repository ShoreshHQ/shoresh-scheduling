---
paths:
  - "force-app/**/*.cls"
  - "force-app/**/*.trigger"
  - "force-app/**/*.cls-meta.xml"
  - "force-app/**/*.trigger-meta.xml"
---

# Apex

Lessons from real failures in this repo. They load when Apex files are touched.

- **Apex tests that act as a scheduler create their records inside the same `System.runAs`.** Under
  sharing the scheduler can't see a camp the test's admin made, so such tests pass locally in review
  and fail only in the org (seen in #45, #46, #48). Keep a whole request well under 100 SOQL queries;
  its test must assert the bound with `Limits.getQueries()` for a realistic camp.
- **Read camp words, labels and describe data once per request**, never per row or in a loop (#60).
- **Every new Apex class or trigger ships with its `-meta.xml`** (#55). `npm run check:meta`,
  `check:name-clash` (Apex ignores case; #46, #48) and `check:reserved-words` (`number`, #46) catch
  these locally and in CI; see `docs/ci-setup.md`.
- **Compile against the test org before pushing Apex:**
  `sf project deploy start --dry-run --source-dir force-app --target-org shoresh-test --test-level NoTestRun --ignore-conflicts`,
  with 0 errors. It runs no tests and changes nothing, but it is still a deployment: run it only
  when no CI run is using the org. If the org is busy, push without it: CI's deploy step fails
  within minutes on a compile error. It can't catch a clash with a class only `main` has deleted,
  since the org may still hold it. #46 and #48 were pushed with Apex that didn't compile.
- **Test setup goes before `Test.startTest()`**, so the code under test gets its own limits; read
  `Limits.getQueries()` (or the bound you care about) before `Test.stopTest()`, and assert async
  results after it.
