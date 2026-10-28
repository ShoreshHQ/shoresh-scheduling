# WEEK: Weeks and seasons

> **Sub-protocol WEEK** of the [Shoresh protocol](README.md). It sits on CORE layers 1 and 2
> ([core.md](core.md)), with one statement each on layers 4 and 6, and never overrides them: it
> uses Season (CORE-1.2), Week (CORE-1.4), Day (CORE-1.5), Minimum (CORE-1.19) and Spread across
> the week (CORE-1.32) as CORE defines them. It gives every other protocol its days.

Which days a week has, where weeks come from, and how one week stands apart from the others.
Any day of the week, weekends included, is ADR [0022](../adr/0022-any-day-of-the-week.md).

Statement `WEEK-n.m`: n is the CORE layer it sits on. In the Test column, **gap** means no test
names it yet; **not built** and **contradicted** say the code does not do it today.

| ID       | Statement                                                                                                                                                                                                       | Source                                        | Test                                                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| WEEK-1.1 | A program, and so a week, MAY run on any day, Saturday and Sunday included; a weekend-only program is allowed.                                                                                                  | Greg 2026-10-27; ADR 0022 §1                  | programs.test.js "reads a weekend-only program"; WeekendDaysTest; ProgramAndWeekRulesTest.aProgramMayRunOnlyOnTheWeekend |
| WEEK-1.2 | Days MUST be shown in the order the week runs, from the first day after the longest run of days off ("Sunday to Thursday").                                                                                     | ADR 0022 §2                                   | weekends.test.js "start on the first day after the days off", "are said in the order the week runs"; WeekCalendarTest    |
| WEEK-1.3 | A season and a week MUST end on or after the day they start.                                                                                                                                                    | `Season__c`, `Week__c` rule EndOnOrAfterStart | ProgramAndWeekRulesTest.aSeasonOrAWeekCannotEndBeforeItStarts                                                            |
| WEEK-1.4 | Copying a season MUST copy its setup to new dates, every week moved by the same number of days, and MUST leave the season copied unchanged.                                                                     | CORE-1.2; wiki protocol D (WEEK-1.2 sketch)   | SeasonCopierTest (three methods)                                                                                         |
| WEEK-2.1 | Fill in weeks MUST follow the days the season's programs run (Monday to Friday when there are none): each week starts on their first day and holds the days inside the season, short first and last weeks kept. | Greg 2026-10-27; ADR 0022 §3                  | weekends.test.js (four tests); WeekCalendarTest.shortFirstAndLastWeeksAreKept; WeekendDaysTest (two methods)             |
| WEEK-2.2 | A season with no weeks MUST get its weeks from its dates; the director MUST NOT have to add weeks by hand first.                                                                                                | Greg 2026-10-17 (wiki protocol E 42)          | shoreshCampSetup.test.js "fills in weeks from the season dates"; SeasonSetupControllerTest; workbook.test.js             |
| WEEK-2.3 | An import into a season with no weeks MUST make the weeks from the days its grids run, weekends included; the save MUST refuse weeks that no longer match the season's dates, saving nothing.                   | ADR 0022 §3                                   | weekends.test.js (three tests); WeekendDaysTest.importingASundayToThursdayGrid…; ImportFillWeeksTest                     |
| WEEK-2.4 | An imported cell on a day its week does not have MUST be listed with the reason "that week has no such day", never dropped.                                                                                     | ADR 0022 §4; CORE-2.3                         | version.test.js "placements that cannot be placed are listed with the reason, never dropped"                             |
| WEEK-2.5 | One letter MUST NOT be read as a day (S is Saturday or Sunday, T Tuesday or Thursday).                                                                                                                          | ADR 0022 §4; CORE-2.3                         | weekends.test.js "one letter is not a day"                                                                               |
| WEEK-4.1 | An early-week goal "by <day>" MUST count the first N days of that week's own run, the named day included, N being the named day's place counted from the camp's first day of the week.                          | Greg 2026-10-17, 2026-10-25; ADR 0022 §5      | checks.test.js (two tests); weekends.test.js "an early-week goal counts from it"                                         |
| WEEK-4.2 | In a short (holiday) week the camp MAY choose to shrink minimums; the choice MUST be the camp's own and MUST default to keep (CORE-5.9).                                                                        | Greg 2026-10-27                               | shortWeek.test.js (five tests); SeasonSetupControllerTest theShortWeekChoiceSavesReachesTheScreenAndIsCopied             |
| WEEK-6.1 | Building or changing one week MUST NOT rebuild, reshuffle or otherwise change another week.                                                                                                                     | Decision 0005 (Greg 2026-10-15)               | otherWeeks.test.js "building and changing week 1 leaves what week 2 builds exactly as it was"                            |

## Not here

- Decision 0005 also says a later week takes earlier weeks into account. Nothing does that today,
  and its word "fairness" is withdrawn (Greg 2026-10-27, CORE-6.4); if it is ever built, WEEK-6.1
  still holds: the effect on a later week is shown, never applied silently.
