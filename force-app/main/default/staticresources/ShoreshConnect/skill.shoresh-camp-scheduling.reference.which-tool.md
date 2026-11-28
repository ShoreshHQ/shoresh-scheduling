# Which tool

One line per request, with the right tool. The lines marked **(often missed)** are ones AI
assistants have got wrong in tests of Shoresh.

## Reading

- "What is Bunk 4 doing Thursday?" → `read_group_schedule` (published). Name a special day if
  Thursday is one (API-1.149).
- "Who's at Archery Monday?" → `read_activity_schedule`.
- "Is Week 2 ready?" / "any problems?" → `read_week_checks`. Never a schedule read: it holds no
  checks (API-1.27).
- Before changing a cell → `read_week_draft`, not `read_group_schedule` **(often missed)**: the
  published week can differ from the draft, and changes need the draft's `seen`.
- "What seasons do we have?" → `list_seasons`.
- "Who can do Swim, who leads it, when can't it run?" → `read_activity_details`. "How long is
  Swim, how often a week?" → `read_from_setup` (an activity), as are other setup records.
- "What would a copy of this season look like?" → `read_season_copy`, never `copy_season`
  **(often missed)** (API-1.61).

## Setup

- "Rename Gym games to Gaga" → `rename_in_setup`.
- "Swim is always two periods long" / "Swim three times a week" → `change_in_setup` on Swim, not
  `change_activity_details`.
- "Seniors don't swim on Fridays" → no setting says exactly that. Say so and ask which they
  mean: take Seniors off "who can do it" (no Swim for Seniors any day), or add Friday's periods to
  "when it runs" (no Swim on Friday for any group). Then `change_activity_details` on Swim for the
  one they chose. Never pick either broader change yourself; not cell edits.
- "Add a Week 3" when the season has weeks → `fill_in_weeks` is refused; tell the person and add
  nothing yourself **(often missed)** (API-1.151).
- "Are these two art rooms the same?" → `read_same_locations`; `merge_locations` only on the
  person's word **(often missed)** (API-1.58).
- "Delete the Library" → `read_delete_question`, then `delete_from_setup`. If it's refused because
  something is there, tell the person; don't move that thing yourself **(often missed)**.
- "Call them Cabins, not Bunks" → `change_camp_words`, and confirm it saved **(often missed)**.

## Building and changing a week

- "I changed setup; fix the week" → `read_setup_changes`, then `update_to_match_setup`. Not
  `build_week` **(often missed)** (API-1.64).
- "Build Week 2" → `build_week` (or `start_manual_week` if they build by hand; ask if unclear).
- "Give me a different version" → `try_another_option`.
- "Swap Archery and Swim for the Owls on Monday" → `move_cell` **(often missed)**.
- "Lock Bunk 4's Monday" → `lock_cells` with that group and that day only **(often missed)**
  (API-1.107).
- "It's raining Tuesday" → `rainy_day`.
- "Undo that" → `undo_last_change`, this conversation only. From earlier → `restore_version`
  (API-1.14). Undo only what the person meant **(often missed)**.

## Electives

- "A new camper, Maya (made up), wants Archery then Swim" → `import_choices` with a sheet of that one camper
  **(often missed)** (API-1.151).
- "Assign chug seats" → `read_elective_seats_now`, then `assign_elective_seats`, once, after any
  new camper is in **(often missed)**.
- "Finalize Week 1 chugim" → `finalize_electives`. If refused, tell the person why and stop
  **(often missed)**.

## Imports

- "Here's last year's schedule" → `import_last_year`; show every question to the person and answer
  none yourself **(often missed)** (API-1.98).
- "Here's our activities list" → `import_list`, not `import_worksheet` (that's the whole-camp
  workbook) **(often missed)**.
- "Undo that import" → `read_last_imports`, then `undo_import` (asks first).
- "Forget what Shoresh learned about Boating" → `read_learned_answers`, then
  `forget_learned_answer`, only for the line the person named.

## Publishing

- "Publish Week 2" → `read_week_checks` first, tell the person what's Open, then `publish_week`.
- "Print Bunk 4's week" → `download_schedule`.
