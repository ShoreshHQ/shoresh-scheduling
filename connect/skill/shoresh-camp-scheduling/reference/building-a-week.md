# Building a week

## Two equal ways

- **Generated Schedule:** Shoresh builds the week. `build_week` is Generate the first time and
  Rebuild after that. `try_another_option` builds the next option, `bring_back_option` an earlier
  one, `fill_open_cells` fills what is Open, `start_over_week` clears the week.
- **Manual Build:** the person builds it cell by cell. `start_manual_week` starts blank or from
  another week, then cell edits.

Neither is better. Never pick for the person; if the week has neither and they didn't say, ask.

What a build keeps: locked cells and hand edits (a hand edit on Generated Schedule becomes a lock).
Nothing else carries over (LOCK-4.3, API-1.19). `start_over_week` clears every lock, after keeping
a version that has them (LOCK-5.1). The same week and setup always give the same schedule
(CORE-5.8), so building again without a change gives nothing new: use `try_another_option`.

## Setup changed: update, don't rebuild

When the person changed setup (renamed an activity, moved a block, closed a location) and wants the
week to follow, use **Update to match setup**, not a rebuild:

1. `read_setup_changes`: each change it can make, cell by cell, with its `seen`.
2. Tell the person what would change.
3. `update_to_match_setup` for the changes they want. If one replaces a placement made by hand,
   Shoresh asks the person first (API-1.106).

It has no Undo; a version is kept when it replaces hand work (API-1.64). A rebuild instead would
throw away every unlocked choice. Rebuild only when the person asks for a new schedule.

## Everyday requests as cell edits

Read the draft first (`read_week_draft`) and send its `seen`.

| The person says                                     | Tool                                              |
| --------------------------------------------------- | ------------------------------------------------- |
| "Put Archery for Bunk 4 Monday Period 2"            | `change_schedule_cell`                            |
| "Swap Archery and Swim for Bunk 4 on Monday"        | `move_cell`                                       |
| "Swim should be a double period"                    | `change_cell_length`                              |
| "Take Archery out Monday morning"                   | `take_out_cell`                                   |
| "Tuesday same as Monday for Bunks 1 to 3"           | `copy_cells`                                      |
| "Clear Thursday" / "clear the whole week" (by hand) | `clear_day`, `clear_week` (asks first, API-1.143) |
| "Make every Day 3 look like this" (numbered days)   | `apply_to_other_weeks` (asks first, API-1.125)    |

A cell change that would break a limit is still the person's call: Shoresh allows it and shows it
(CORE-4.8). Read the checks afterwards and tell the person what it caused.

## Locks

`lock_cells` and `unlock_cells` always name the group and the day. "All" means every one, on
purpose; never leave one out to mean everyone (API-1.107). Lock exactly what was asked: one bunk's
day is one bunk's day.
