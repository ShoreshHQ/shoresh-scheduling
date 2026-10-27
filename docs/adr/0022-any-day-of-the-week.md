# 0022: Any day of the week

Status: proposed (2026-10-27). Product decision: Greg, 2026-10-27. Supersedes the Monday-to-Friday
parts of ADRs 0004, 0006, 0007, 0014, 0015 and 0018, and protocol rule 3.12's count.

## Choices

1. **A program runs on any day, Saturday and Sunday included.** `Program__c` and
   `RecurringActivity__c` gain `Saturday__c` and `Sunday__c` (checkboxes, unticked by default);
   both `AtLeastOneDay` rules count all seven. `LinkedChoiceTime__c.Weekday__c`,
   `SpecialDate__c.Day__c` and `Activity__c.EarlyWeekByDay__c` gain Saturday and Sunday, after
   Friday, so the values already saved keep their places. Weekend-only programs are allowed.

2. **Monday first everywhere a day is stored or keyed** (`SetTimePlan.WEEKDAYS`,
   `c/shoreshImportEngine` `WEEKDAYS`, deletion keys): Monday-to-Friday keys read as before.
   Days are **shown** in the order the week runs: from the first day after the longest run of days
   off (`WeekCalendar.firstDayOf`, `text.js` `firstDayOf`), so a Sunday-to-Thursday camp reads
   "Sunday to Thursday" and its Programs strip starts on Sunday. Every day of the week: Monday
   first, or the season's first day when making weeks.

3. **A week's shape comes from the camp.** "Fill in weeks" follows the days the season's programs
   run between them (Monday to Friday when there are none): each week starts on their first day
   and holds the days that fall in the season, so short first and last weeks are kept. An import
   that fills an empty season's weeks sends the days its grids run (`fillWeeks[].days`,
   "Sunday+Monday+..."); the save makes the weeks from those days and refuses any it doesn't know.
   Directors can still edit week dates.

4. **An imported Saturday or Sunday is a day like any other.** The "left out: Shoresh plans
   Monday to Friday" note is gone; a weekend placement in a week without that day is "that week
   has no such day". A list cell reads "Sat", "Sun", "Sat/Sun", ranges over the weekend
   ("Sun-Thu", "Fri thru Mon"); "weekdays" is Monday to Friday, "every day" all seven (for a
   recurring activity, every day its program runs). A dash spanning five days or more is a range
   without asking.

5. **Early-week goal "by <day>" counts from the week's first day up to that day** (Sunday-start
   week, by Tuesday = Sunday, Monday, Tuesday), still in days of the run (special days and days a
   group isn't in are skipped, not counted against it). The week's first day is its first date,
   a special day too (`model.weekStart`). This drops the false "short by" notes a Sunday start
   gave.

6. **A new program starts on the days the camp's other programs run** (Monday to Friday for the
   first), as Fill in weeks does.

## Not done here

- Roots' illustrations (`shoreshRootsFaces`, `shoreshRootsLooks`) still draw five days.
