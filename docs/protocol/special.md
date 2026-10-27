# SPECIAL protocol: special events and special days

One-off takeovers of a week. A **special day** (CORE-1.17) is its own day: it has its own time
blocks and its own grid, built in that schedule's own grid screen as on the desktop, and on its
date it takes the place of the regular day (Greg, 2026-10-27: nested). A **special event**
(CORE-1.16) takes over part of a day, over the cells it is put on, with a plan of its own.

SPECIAL sits on GEN's week. It uses CORE layer 1 (terms 1.16, 1.17), layer 4 (CORE-4.6: Shoresh
never places in a special cell), layer 5 (CORE-5.1: specials are laid down first and never
moved; CORE-5.8) and layer 6 (CORE-6.1). It never redefines a CORE term. Statement IDs, tests
and the index are as in [README.md](README.md). Where Greg's dated word differs from older text,
the dated word is written here.

## Already stated by GEN

These are GEN's rules and are not repeated as SPECIAL statements:

- GEN-1.4: every day replaced by a special day stops the build, saying so.
- GEN-2.2: a placed special event stays where it is in every build.
- GEN-2.8: a day a special day replaces is never built and comes back as it was.
- GEN-8.13: the search never moves a special.

## Statements

| ID          | Statement                                                                                                                                                                        | Source                                                 | Test                                                                                                                                                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPECIAL-1.1 | A special day MUST be its own day, with its own time blocks and grid, built in its own schedule's grid screen; on its date it MUST take the place of the regular day.            | CORE-1.17; Greg 2026-10-27 (nested); ADR 0014          | Jest shoreshSpecialSchedule "opens a special day: its name on the rail…"; shoreshScheduleViews specialDays "puts a special day's own schedule in its day's place…"                                                                                                                          |
| SPECIAL-1.2 | Something a file noted but not set up yet (a trip, an event, a special day) MUST stay where it is and be offered "Set it up"; Shoresh MUST NOT place one anew.                   | wiki draft D (trips "not set up yet"); ADR 0010 §3     | Apex GeneratedRefusalsTest somethingNotSetUpYetStaysWhereItIs; Jest shoreshWeekEditor specialDays "offers Set it up on a cell a file noted as an event"                                                                                                                                     |
| SPECIAL-2.1 | A new special day MUST start from the regular day: its time blocks and set-time activities, a morning-only group's afternoon left Open; with no time blocks it MUST start empty. | ADR 0014                                               | Apex SpecialDaySeedTest aNewSpecialDayStartsFromTheRegularDay, aMorningOnlyGroupKeepsItsAfternoonOpen, withNoTimeBlocksItStartsEmpty                                                                                                                                                        |
| SPECIAL-4.1 | Putting a special day on a day another special day already has MUST ask first; Shoresh MUST NOT replace it silently.                                                             | CORE-6.1; ADR 0014                                     | Jest shoreshSpecialDetails putOnDay "asks before replacing another special day…", takeOff "asks before putting back over…"; Apex SpecialPlacingTest aSpecialDayGoesOnADayAndAsksBeforeReplacingAnother                                                                                      |
| SPECIAL-4.2 | Taking a special day off a day MUST give the regular day back as it was, and leave any other special day where it is.                                                            | GEN-2.8; ADR 0014                                      | Apex SpecialPlacingTest takingASpecialDayOffGivesTheDayBackAsItWas, takingOffLeavesAnotherSpecialDayWhereItIs; Jest shoreshWeekEditor specialDays "takes the special day off…"                                                                                                              |
| SPECIAL-4.3 | Clear week MUST leave a replaced day as it is, saying so; Copy day MUST NOT copy from a replaced day.                                                                            | ADR 0014                                               | Jest shoreshWeekEditor specialDays "Clear week leaves a replaced day as it is…", "Copy day to refuses copying from a replaced day"                                                                                                                                                          |
| SPECIAL-4.4 | A special event MAY be put by hand over any cells, a fixed or recurring activity's included; only a Lock stops it.                                                               | Greg 2026-10-26 (a hand edit is always made); CORE-4.8 | Jest shoreshWeekEditor specialDays "puts an event over a fixed activity by hand…"                                                                                                                                                                                                           |
| SPECIAL-5.1 | The same setup MUST give the same special-day plan.                                                                                                                              | wiki draft D; CORE-5.8                                 | Apex SpecialDaySeedTest theSameSetupAlwaysGivesTheSamePlan                                                                                                                                                                                                                                  |
| SPECIAL-6.1 | A replaced day MUST show as its special day (its name on the day, its own time blocks) on Manual Build, Generated Schedule, the Schedules page, the Excel file and the printout. | ADR 0014                                               | Jest shoreshWeekEditor specialDays "names the special day on its day's pill", "shows a replaced day's own schedule read-only…"; shoreshSchedules specials "shows a replaced day as its special day…", "takes the special day and the event's schedule into the Excel file and the printout" |
| SPECIAL-6.2 | A replaced day MUST be left out of the checks and counts, and still be shown.                                                                                                    | GEN-2.8; ADR 0014                                      | Jest shoreshEngine specials "leaves a replaced day out of the check, but shows it"; shoreshWeekEditor specialDays "leaves a replaced day out of the checks and counts"; shoreshScheduleViews specialDays "counts nothing on a replaced day in Activity View…"                               |
| SPECIAL-6.3 | Publish MUST carry the special day and each event's own schedule; a day newly replaced or given back MUST be listed as a change to publish.                                      | ADR 0014                                               | Apex ScheduleSpecialsTest publishCarriesTheSpecialDayAndTheEventsOwnSchedules, aDayReplacedOrNoLongerReplacedIsAChangeToPublish                                                                                                                                                             |

## Open, not written as statements

- Who a special day covers (whole camp, or chosen programs or divisions) has no dated Greg word
  beyond "nested" (wiki draft F1); not stated here.
- Deleting a special day that is on a day refuses in Salesforce; the desktop deleted its
  placements. No dated ruling (wiki draft E row 60).
