# 0026: An elective period inside a special day

Status: accepted (2026-11-10). Product decision: Greg, 2026-11-10: a special day (Color War,
Visiting Day) can hold a real elective period, with seats and camper choices like a regular day.
Neither the desktop nor Salesforce had this, so there is no desktop spec; it reuses the screens and
words of ADR [0014](0014-special-days-and-events-data.md) (special days) and ADR
[0018](0018-electives-data.md) (electives). Before this, the special day's grid took only typed
activities, so "Chugim" there was an activity of that name.

## Choices

1. **A special day's cell takes an elective set as Manual Build's does** (SPECIAL-1.3). On the
   special day's own schedule, typing in a cell lists the season's sets first, "Chugim (4)" with
   the set's mark (`c-shoresh-week-editor` given `takesElectives`, ADR 0018 choice 22), and picking
   one saves it as kind `E` with the set's record (`SpecialScheduleEdits`, through `SlotEvents`,
   the save Manual Build uses: only the season's sets, read once per save). Each time block holds
   it on its own, groups side by side are one wide cell, it never swaps, Delete clears it (ADR 0018
   choices 21 to 23). The read-only replaced day on Manual Build and Generated Schedule, the
   Schedules page, Publish (which already carries the special day's own schedule, SPECIAL-6.3),
   the Excel file ("Chugim (Archery, Drama)", ELECT-6.3) and what goes out on that day (API-6.5)
   show it as they show any `E` cell, with no change of their own.

2. **An event's cell refuses one**: its columns are stations, with no campers to seat ("Color
   War's columns are stations, not groups, so it can't hold elective sets. Put them in special
   days, where the columns are groups."), nothing saved. The screen doesn't offer one there.

3. **On a replaced day, the set's times come from the special day's grid** (ELECT-4.8,
   `ElectiveDays`). The Elective seats screen's times are worked out from the run's schedule's days
   (ADR 0018 choice 30); each day a special day replaces is now read from that special day's own
   grid instead of the regular cells kept under it. So a set in the special day is one more
   elective time of the week ("Tuesday, Opening"), and one in the regular day under it no longer
   is (before, it still counted though nobody would see it). Everything else on the screen is
   unchanged: Bring in choices matches a choice by the day and the special day's own time block's
   name, number or start; Assign seats, Move to…, the padlock, Assign again, the counter and
   Finalize's double-booked check work there as on any day. A special day with no schedule yet
   holds no elective time; one that can't be read is listed as the day's problem.

4. **A seat in a special day points at its own time block** (`Assignment__c.SpecialBlock__c`, the
   plan's id, "b2"), since those time blocks are the special day's own, not setup records; Time
   Block is then blank (it is no longer required). The seat's key and every place that matches a
   seat to its time use `ElectiveSeatChecks.blockOf`, and the browser already sent the time's
   block as text. The time's name is copied onto every seat at Finalize (`TimeName__c`, as the
   activity's, place's and bunk's names are), so what goes out names it (`time_block`).

5. **A final run reads the special day as it was at Finalize** (ELECT-5.6). Finalize keeps its
   version of the schedule as before (the regular days as stored) and now also writes the special
   days it used onto that version, as Publish carries them (`PublishedPlan__c`,
   `ScheduleSpecials.carry`). The final run's times, rosters and downloads read the version with
   them, so editing the special day afterwards changes nothing already final. The version is not
   published, so the Schedules page shows it as before.

6. **Taken off a day, replaced, or edited: nothing silent** (ELECT-6.4; Greg, 2026-11-10: no extra
   question when taking off a special day that has seats). The regular day comes back as it was
   (SPECIAL-4.2) with its own times, and where the set sits has changed, so the run's fingerprint
   no longer matches: a committed run reads "Schedule changed since seats were assigned" and
   Finalize says "Assign again first."; a final run reads Out of date with Start a new version
   (ADR 0018 choice 34). No seat is removed: locked ones at a time that is gone are listed as
   locks that no longer apply, with Unlock; Assign again places the rest. Putting the special day
   back brings its times back. Replacing it with another special day already asks first
   (SPECIAL-4.1).

7. **An AI does it as the screen does** (API-1.77): `change_special_schedule_cell` takes an
   elective set's name, read as `change_schedule_cell` reads one (`AgentCellSlot`, API-1.124: a
   name that is both an activity and a set is refused); an event refuses it in the screen's words.
   Every seats tool works on the special-day time with no change of its own. Connector 1.0.140.

8. **Not included.** A linked choice can't take a special-day period: its periods are the camp's
   time blocks (`LinkedChoiceTime__c`), so the engine treats a special-day period as an ordinary
   elective time. A special day's file import still reads a cell named like a set as an activity
   (ADR 0014 choice 17); a set is typed in after.

9. **Checked by** `SpecialDayElectivesTest` (as a scheduler, records made in the same `System.runAs`:
   the set typed into Color War as its page saves it, the seats screen reading Tuesday from the
   special day and not the regular Period 1 under it, in a bounded read; an event refusing a set;
   Assign, a hand move and Finalize in the special day with the seat's own block and time name, the
   final run unchanged after the special day is edited, and the seats going out naming its time;
   taking the special day off showing the run changed with every seat kept, and putting it back),
   `AgentSpecialScheduleTest` (an AI putting the set in a special day's cell, an event refusing
   it), `shoreshSpecialSchedule.test.js` (the set offered and saved from a special day's cell and
   drawn "Chugim (2)"; none offered in an event's), `connect.test.js`, and in the test org with a
   made-up camp (the PR says what was checked there).
