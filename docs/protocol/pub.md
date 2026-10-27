# PUB protocol: Publishing

Marking one version of a program's week as final, replacing it, taking it back, and keeping
every earlier one. PUB reads any finished week (built by hand, generated or imported); it uses
CORE's terms (layer 1, Published and Version) and explanation (layer 6), and never changes what
it publishes. It never redefines a CORE term. The numbering, statuses and tests are in
[README.md](README.md). Sources: wiki `projects/shoresh-protocol.md` (D, E 28, E 81), wiki
decision 0002, ADR 0008 part 5, `PublishedGuard`. Greg's latest dated word wins.

A statement whose Test cell starts "gap" has no test yet; "contradicted" means today's code does
otherwise.

| ID      | Statement                                                                                                                                       | Source                        | Test                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| PUB-1.1 | Each program's week MUST have at most one published version; each program publishes on its own.                                                 | wiki D, E 81; decision 0002   | GeneratedPublishTest                                          |
| PUB-4.1 | Publishing MUST NOT change the schedule: the published copy is the week as it was, locks and all.                                               | wiki D; ADR 0008 part 5       | SchedulePublishTest, GeneratedPublishTest                     |
| PUB-4.2 | Edits made after publishing MUST NOT touch the published copy.                                                                                  | ADR 0008 part 5               | SchedulePublishTest                                           |
| PUB-4.3 | A published or earlier published schedule MUST change only through Publish, Unpublish and rename, and MUST NOT be deleted.                      | decision 0002; PublishedGuard | PublishedGuardTest                                            |
| PUB-4.4 | A week changed, or published by someone else, since its preview MUST NOT be published over.                                                     | ADR 0008 part 5               | SchedulePublishTest                                           |
| PUB-6.1 | Every earlier published version MUST be kept, including one unpublished.                                                                        | wiki D; ADR 0008 part 5       | SchedulePublishTest, GeneratedPublishTest, PublishedGuardTest |
| PUB-6.2 | **Contradicted.** The publish summary MUST use counter words (CORE-6.5). Today it says "Filled: 7 of 10" and "Overlapping: 1" (shoreshPublish). | wiki D, E 28                  | gap: contradicted                                             |
| PUB-6.3 | Publishing again MUST first show what changes from the published copy.                                                                          | ADR 0008 part 5               | shoreshPublish shoreshPublish.test.js, SchedulePublishTest    |
