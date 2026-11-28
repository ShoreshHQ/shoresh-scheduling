# Electives

Use the camp's word ("Chug", "Club"), never "offering" (CORE-1.36).

## A set's season, in order

1. **What's offered:** the Electives list (`read_electives_list`, `change_elective`,
   `delete_elective`): seats, the minimum to run, or No limit. Electives guessed from an import
   need the person's "Looks right" before anyone gets a seat (`read_guessed_electives`,
   `elective_looks_right`, only on their word).
2. **Linked choices** (all or nothing): `read_linked_choices`, `make_linked_choice`,
   `change_linked_choice`, `delete_linked_choice`.
3. **Campers' choices:** `import_choices`. Choices count against the week's schedule as it is now,
   never a saved version (ELECT-2.5).
4. **Seats:** `read_elective_seats_now`, then `assign_elective_seats`. Move or lock one camper's seat
   with `move_elective_seat`, `lock_elective_seat`. The same choices give the same seats
   (ELECT-5.1); locked seats are kept (ELECT-5.5).
5. **Finalize:** `finalize_electives`. Then `read_final_elective_seats`; `change_seats` opens a new
   draft. Offered lists and rosters: `read_electives_offered`, `download_elective_files`.
6. **End of season:** `read_electives_to_clear`, then `clear_electives` (for good; Shoresh asks the
   person first, API-1.72).

## A new camper or a changed pick

Goes in as a choices sheet of that **one camper**, through `import_choices`: their name as Shoresh
has it (and camper number if the camp uses them), their bunk, their choices in order. Everyone
else keeps theirs (API-1.151). If the review counts that camper as new when they are already
there, stop and ask: saving would add a second camper. Never make up a choice the person didn't
give, and never read a parent's comment as a choice (ELECT-2.1).

## When Finalize is refused

Say which elective and when, in Shoresh's words, and let the person decide what moves. Don't
clear cells, rebuild or move seats to get past it. An elective below its minimum doesn't run;
say which and what it had (ELECT-6.1).
