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
3. **No Shoresh Trash.** Salesforce's Recycle Bin can bring a deleted record back. The other
   delete questions (and Delete season) no longer say "This cannot be undone.", which wasn't
   true; they name what goes with the record and stop there. A restore from the Recycle Bin is
   partial (a record's unticked weeks are deleted on their own), so they don't promise a
   restore either (Greg confirmed, 2026-10-18).
4. **Refusals stay.** Something else depending on it (who can do it, a rain plan, who a
   recurring activity covers) still refuses the delete with the existing messages.
5. **Read in user mode:** a schedule the director can't see is not counted. The days are
   listed first (their Ids only, one query), then their text is read 25 at a time, so even
   days at the longest a part can be stay well inside memory, and a schedule already found is
   not read again. The text reads are capped at 90 queries (with 40,000 days and 60 million
   characters): past any of these the count stops and says it isn't complete, and the
   question says _Bunk 3 is in 2 or more schedules. Delete anyway?_; if nothing was found by
   then, or the count can't be made at all, _Shoresh couldn't count the schedules Bunk 3 is
   in. Delete anyway?_. It is never left out quietly. Tests make the limits small to check
   this. The question opens without making the page busy, so Cancel gives the focus back to
   the row's delete button; a second click while it is open does nothing. After a delete the
   table says so and moves the cursor to the next row (ADR 0013 choice 23).

## "Same location?"

6. **Which places:** saved places in one season whose saved names differ only in capitals and
   spacing ("Pool", "pool", " POOL"), as the Locations table's "Same name as another" already
   compares them (desktop `locationDuplicates.js`: trimmed, spaces collapsed, capitals
   ignored). The server folds names exactly as the screen does: every kind of space
   JavaScript counts (pasted non-breaking spaces and byte-order marks included) and capitals
   the same in every locale (`toLowerCase('en')`). Typing a matching name is a heads-up only
   until it is saved.
7. **Where:** a **Same location?** button beside the dot on each such row opens the question,
   in the camp's word for location ("Same area?"), named for its row for screen readers
   ("Same location? Pool").
   _Difference from the desktop:_ the desktop has two ways in, a review after its upgrade and a
   dot on the row whose "Merge into X" merges at once into the first match. Greg's brief asks
   that the director pick which to keep, so the question is the only way in here.
8. **The question** (desktop `NearDuplicateGate`): title _Same location?_ in the camp's word;
   one choice per place, _Pool · Bunks that fit: 2 · 3 activities here_, in the camp's words
   (one word for the idea: the number box below is labelled the same; the desktop says "at
   once" in both; a place with no number shows "—"); the place with the most
   activities is chosen first, then the one that fits the most (desktop `defaultWinner`); the
   camp's "groups that fit" starts at the most any of them fits; **Merge** and **Keep
   separate**. Escape is Keep separate. While a merge is being made the buttons wait (they stay
   focusable, so the focus never leaves the question). A refused merge reads the season again
   (as the desktop reloads after a failed merge) and the question shows the places as they are
   now, keeping the director's choice and number, with why it was refused, focused, inside the
   question only. If fewer than two places are left, the question closes and the page says
   why. Afterwards the cursor is back on the row's button, or on the kept place once merged. A merge that went through but couldn't be read back says the page's usual _Done, but the screen couldn't show it yet. Reload the page._, never a refusal.
   Left out: the desktop's "You can undo this…" line (design guide: no explanatory text).
   _Confirmed by Greg, 2026-10-20: no undo promise (a Salesforce merge can't be undone the way
   the desktop's can, choice 11), and each place shows what fits and how many activities are
   there, as the desktop's candidates do (`NearDuplicateGate`)._
9. **What moves** (`LocationMerge`, desktop D1: "merge is a delete that re-points"): every
   activity, fixed activity, and recurring activity at the other places; the next season's
   copies of them (their "copied from"); and the weeks they are closed (one mark per week; a
   week both were closed stays closed once). The kept place gets the chosen groups that fit.
   Then the others are deleted. All of it is one transaction, in user mode, with each place
   locked; places changed or deleted meanwhile refuse it in the desktop's words, with the
   camp's word for locations: _That merge could not be completed — someone may have changed
   these locations. Try again._
10. **Clashes are checked once everything has moved.** Two recurring activities that fitted
    at two places may not fit at one; the merge is then refused with the usual clash message,
    and nothing changes.
11. **Undo:** Salesforce's Recycle Bin can bring a merged-away place back, empty (desktop D4:
    restoring brings it back without what moved).
12. **Plain delete is unchanged:** a place something uses is still refused.

## Known limits

- A season with more than about 2,250 day parts that a bunk or activity is in few of reaches
  the 90-query cap; the question then says "or more" (or that it couldn't count), never a
  number that might be short.
