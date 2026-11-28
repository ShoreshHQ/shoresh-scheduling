# Setting up a season

## The fastest start is usually not typing

1. **Copy last season.** Show first what the copy would be with `read_season_copy`; copy with
   `copy_season` only when the person asks for the copy. A "what would happen if" question is a
   read, never the copy (API-1.61, API-1.62).
2. **Import last year's schedule**, a list, or the whole-camp worksheet: see imports.md.
3. Otherwise, type it in, in Camp Setup's order below.

## Camp Setup's order

1. The camp (`create_camp`, only when there is none yet) and the season (`create_season`).
2. Weeks: `fill_in_weeks` makes them from the season's dates and the days programs run
   (WEEK-2.1). A season that already has weeks is refused: tell the person, and never add a week
   they didn't ask for (API-1.151).
3. Programs, divisions, groups, time blocks, locations, staff: `add_to_setup`, `read_from_setup`,
   `change_in_setup`, `rename_in_setup`.
4. Activities, then fixed and recurring activities, special events, electives. An activity's
   length, how often, who can do it and who leads it: `read_activity_details`,
   `change_activity_details` (API-1.159). Blank "who can do it" means every group (CORE-3.5); blank
   groups fit means 1 (CORE-3.6).

Season details (name, dates, short weeks): `change_season`.

## What needs the person

- **Guesses.** What Shoresh guessed from a file is marked until a person says it looks right
  (`read_setup_guesses`). Show the guesses; call `mark_looks_right` only for the ones the person
  confirmed (API-1.60).
- **"Same location?"** `read_same_locations` shows look-alike places. Merge (`merge_locations`)
  only when the person says they are the same (API-1.58).
- **Deleting.** `read_delete_question` says what a delete would take with it; `delete_from_setup`
  asks the person first. If Shoresh refuses because something still uses it, tell the person what
  uses it; don't move or change that thing yourself.
- **Seasons.** `archive_season` and `bring_back_season` undo each other. `delete_season` is for good
  and asks first (API-1.141). Prefer archive when the person just wants it out of the way.
