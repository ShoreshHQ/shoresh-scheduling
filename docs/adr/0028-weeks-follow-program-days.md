# 0028. The weeks follow a program's days

Date: 2026-11-10. Status: accepted (coordinator, UX pass: "adding Saturday is the director doing
what they mean. Show it").

## Context

A rotating Day 1 to Day 6 camp whose weeks were laid out Monday to Friday added Saturday to its
program. Nothing changed: the weeks still ended on Friday, Rebuild still built Day 1 to Day 5, and
nothing said why. The desktop has no dated weeks to compare with.

## Choices

1. **After a program's days are saved** (Programs), the season's weeks are laid out again on the
   days its programs run, exactly as Fill in weeks lays them out (`WeekCalendar.weeksOf`), and each
   week takes the new dates of the one in its place; names and what each holds are kept. It is the
   same save as changing a week's dates on Weeks (WEEK-2.7).
2. **Said, with Undo:** Programs shows "Week 1 and Week 2 now run Monday to Saturday." and Undo
   puts every week back on the dates it had. Nothing is said when no week moved.
3. **Never past the season:** a week stops at the season's last day, and the line says so, for the season's last week even when it didn't move ("Week 2 stops at the season's last day.").
4. **No week made or dropped by itself:** when the new days would give the season a different
   number of weeks, nothing changes and the line says why ("would have 3, not 2: change them on
   Weeks").
5. **Schedules:** a week's drafts keep their cells; their next build, or Update to match setup,
   uses the new days (the draft shows the setup-changed mark when opened). A week whose schedules
   hold a day it would lose stays as it is, and the line says which week: those days would leave
   its schedule unable to be published or restored. A published copy is never republished by
   this; its "changed since" corner compares the draft with it, so moving dates alone does not
   mark it.
6. **An AI** changing a program's days (change_setup_record) gets the same: the weeks follow, and
   its answer says what moved.
