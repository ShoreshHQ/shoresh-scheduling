# 0012: Deleting what schedules use, and "Same location?"

Status: proposed (2026-10-17). Design source: wiki `projects/shoresh-scheduling-sf` decision 15
(1) and (4), Greg 2026-10-17, all A. Desktop (read-only copy, `~/Dev/Shoresh/shoresh-desktop`
at 69dbd34): `docs/adr/2026-07-30-deleting-a-record-a-schedule-uses.md` §1,
`src/components/DeleteRecordDialog.jsx`, `docs/adr/2026-08-15-locations-merge-and-delete-rehome.md`
(D1, D4), `src/screens/LocationsScreen.jsx` (`NearDuplicateGate`, lines 71-140),
`src/screens/locationMigrationReview.js` (`defaultWinner`), `src/screens/locationDuplicates.js`.

## Deleting a bunk or activity that schedules use

1. **The count comes first** (desktop ADR 2026-07-30 §1, "count first"). Before the question,
   `SetupTablesController.scheduleUses` counts the schedules whose days name the bunk or
   activity: Manual Build and generated drafts, saved versions, and published schedules, each
   schedule once however many days name it. Only bunks and activities are counted; deleting
   anything else asks as before.
2. **The words are Greg's:** title _Delete "Bunk 3"?_, then _Bunk 3 is in 2 schedules. Delete
   anyway?_ ("1 schedule" for one). Nothing used by a schedule: the question is as before.
   _Difference from the desktop:_ the desktop counts cells ("is used in N places in your
   schedules") in live schedules only, saves each schedule as a version first, and empties
   the cells. Here a schedule's days keep the names they were saved with, so nothing is
   emptied and nothing needs saving first; the schedule page marks the bunk or activity as
   gone. Greg chose the schedule count (decision 15).
3. **No Shoresh Trash.** Salesforce's Recycle Bin can bring a deleted record back.
4. **Refusals stay.** Something else depending on it (who can do it, a rain plan, who a
   recurring activity covers) still refuses the delete with the existing messages.
5. **Read in user mode:** a schedule the director can't see is not counted. Days are read a
   few at a time, and a schedule already found is not read again, so a big camp's long day
   text stays within memory. If the count still can't be made, the delete is asked about as
   before, without the count, rather than blocked.

## "Same location?"

6. **Which places:** saved places in one season whose saved names differ only in capitals and
   spacing ("Pool", "pool", " POOL"), as the Locations table's "Same name as another" already
   compares them (desktop `locationDuplicates.js`: trimmed, spaces collapsed, capitals
   ignored). A non-breaking space pasted from a spreadsheet counts as a space on the server
   too. Typing a matching name is a heads-up only until it is saved.
7. **Where:** a **Same location?** button beside the tag on each such row opens the question.
   _Difference from the desktop:_ the desktop has two ways in, a review after its upgrade and a
   dot on the row whose "Merge into X" merges at once into the first match. Greg's brief asks
   that the director pick which to keep, so the question is the only way in here.
8. **The question** (desktop `NearDuplicateGate`): title _Same location?_; one choice per place,
   _Pool · 2 Bunks at once · 3 activities here_, in the camp's words; the place with the most
   activities is chosen first, then the one that fits the most (desktop `defaultWinner`); the
   camp's "groups that fit" starts at the most any of them fits; **Merge** and **Keep
   separate**. Escape is Keep separate (not while a merge is being made). A refused merge says
   why inside the question, with the error icon. Afterwards the cursor is back on the row's
   button, or on the kept place once merged.
   Left out: the desktop's "You can undo this…" line (design guide: no explanatory text).
9. **What moves** (`LocationMerge`, desktop D1: "merge is a delete that re-points"): every
   activity, fixed activity, and recurring activity at the other places; the next season's
   copies of them (their "copied from"); and the weeks they are closed (one mark per week; a
   week both were closed stays closed once). The kept place gets the chosen groups that fit.
   Then the others are deleted. All of it is one transaction, in user mode, with each place
   locked; places changed or deleted meanwhile refuse it in the desktop's words: _That merge
   could not be completed — someone may have changed these locations. Try again._
10. **Clashes are checked once everything has moved.** Two recurring activities that fitted
    at two places may not fit at one; the merge is then refused with the usual clash message,
    and nothing changes.
11. **Undo:** Salesforce's Recycle Bin can bring a merged-away place back, empty (desktop D4:
    restoring brings it back without what moved).
12. **Plain delete is unchanged:** a place something uses is still refused.
