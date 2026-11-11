# 0027. An elective set's time, and what last year's schedule named

Date: 2026-11-10. Status: accepted (coordinator, UX pass finding 3, option (i) in its smallest
form; the package is not released, so new fields are an ordinary change).

## Context

Import last year read "Chugim: Tuesday, Period 6, every group" and noted "Field day" and "Zoo
trip", but none of it reached the new weeks. The generator never places an elective set, so a
fresh week had no Chugim until the director typed it into every week by hand; Special events stayed
empty; Roots said "Nothing needs a look"; and "Set it up" existed only on a cell of last year's
version, which no fresh week has. Greg's principle: do what the same action does by hand, and show
it.

## Choices

1. **A set has a time, as a recurring activity has one** (ELECT-7.1 to 7.3): a time block and its
   days, fields on `ElectiveSet__c` itself (`TimeBlock__c`, `Monday__c` to `Sunday__c`), the same
   shape as `RecurringActivity__c`. A recurring activity's own record was not reused: it is an
   activity of its own (location, length, who), read by the clash checks and some twenty other
   places, so pointing one at a set would blur ADR 0004's fixed and recurring activities.
   No time block means no time.
2. **Who:** every group of the time block's program at camp then. A set read for some groups only
   is rare in a file and is still placed by hand; a "who" for a set's time (Coverage rows, as a
   recurring activity's) can follow if a camp needs it.
3. **Where it is placed:** Start a blank week, and a first Generate (which begins from the same
   blank week, `BlankWeek`), put the set there as one set cell across the groups, after the fixed
   and recurring activities, exactly as typing it does. A slot already taken keeps what it has and
   the set is named as not placed there. It is never added back later: the director's move or
   clear wins, and Rebuild keeps placed sets as it always has. The clash checks don't read set
   times.
4. **Import last year** keeps a new set's time when every cell of it is one and the same block on
   days of the week; a double period (a linked choice's) or a set over several blocks keeps none.
   A set the camp already has keeps its own time. Undo removes the set with its time.
5. **The Electives screen** shows and edits the time in the set's row with the recurring screen's
   columns (time block, days). Copy season carries it into the copy's own time block. Deleting the
   time block leaves the set with no time (`SetNull`).
6. **What last year's schedule named** (SPECIAL-1.4): the special days and events an imported
   version names with no record are cards on Roots' hand ("Field day, not set up yet"). Opening one
   makes the special day or event by name on no day (never on a date by itself) and opens it on
   Special events, where the director puts it on a day.

## Consequences

- A fresh week shows the set where last year had it; the seats screen finds it there.
- New package fields; the Shoresh Scheduler permission set grants them.
