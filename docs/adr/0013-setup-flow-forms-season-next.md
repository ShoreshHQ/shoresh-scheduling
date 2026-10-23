# 0013: Setup forms save as you go, the season beside its picker, and a next-screen button

Status: proposed (2026-10-20). Design source: wiki `projects/shoresh-scheduling-sf` decision 26
(4), (5) and (6), Greg 2026-10-20 ("go with your recommendations on all six"); findings in the
UI/UX pass notes (setup screens #2, #3, #4, #7, #8). Desktop (read-only copy,
`~/Dev/Shoresh/shoresh-desktop`): `src/screens/CampScreen.jsx` (the "✓ Saved" mark),
`src/components/setup/SetupScreenShell.jsx` (the footer's "Groups →"),
`src/components/layout/navSections.js` (`SETUP_SCREEN_ORDER`, `nextSetupScreen`).

Changes ADR 0011 choice 1 (forms kept their Save buttons) and ADR 0003 choices 3 and 9 (the
season form on Weeks; Camp words' Cancel).

## Choices

1. **Every setup form saves as you go, like the tables (decision 26 (4)).** The program card
   (name and days), the season (name, first and last day), Camp words, and Activity details have
   no Save or Cancel buttons any more. A typing field (a name, a date, a number, the notes, a
   camp word) is saved when the director leaves it (`focusout` to anywhere outside the field) or
   presses Enter in it; moving inside a field (a date's calendar, the "who" list's buttons) is not
   leaving it (`c/shoreshSavedMark` `leftField`). A tick or a dropdown is saved the moment it is
   chosen, as the tables' ticks are. The "who can do it" list is saved when the director leaves
   it, not on every move. Leaving a field with nothing changed sends nothing. _Changed
   2026-10-20 (choice 18): "who can do it" is ticks now, each saved the moment it is ticked._
   _Changed 2026-10-23 (ADR 0015 choice 14): the program card is gone; each program is a row of
   the shared table, its name and days saved with the row when the director leaves it, its
   five days still sent together (choice 2)._
2. **Only the field that changed is sent** (the season, the program, an activity's rules), so a
   change someone else made to another field stays, **except fields the server checks against
   each other, which always go together, as the screen shows them**: the season's first and last
   day (`EndOnOrAfterStart`), the program's five days (`AtLeastOneDay`), and an activity's
   early-week count and day (`EarlyWeekComplete`). Sent one at a time, each could be refused
   against the other's old value: an early-week rule could never be set or cleared, a season
   moved later only worked with the last day changed first, and a refused untick could stay on
   screen unsent while the next tick saved and showed "Saved". A refusal is shown under the field
   the director left, replacing any older one under its partner; a save of the pair clears both.
   A refusal that arrives while a newer save of the same field is already on its way is not
   shown: that newer save carries what the screen shows now, and its answer decides. Activity
   details always send the whole
   "who can do it" list, since the server replaces it (`ActivityDetails.save`, unchanged). Camp
   words send every word, since `saveCampLabels` takes the list (unchanged); its saves go one at
   a time, each with the words as they are on screen then.
3. **One save at a time across the page.** A form field waits its turn in the same queue as
   the table rows (ADR 0011 choice 4), and like a row it doesn't make the page busy. The form
   hears it saved before the season is read again; a reload never puts back a field the director
   changed and has not had saved (changed and not sent, or sent and not answered).
4. **A quiet "✓ Saved"** (`c-shoresh-saved-mark`, desktop `CampScreen` "✓ Saved") beside each
   form once a field of it is saved, in small grey text with the tick in the success green.
   _Changed 2026-10-21 (ADR 0015 choice 11): the setup tables' screens show it on their rail
   too, once a row is saved (silent there: the table says each save); its words are the
   secondary text and its tick the highlight, as the mock-ups draw it._ It
   stays until the director changes something in that form again (the desktop's fades after two
   seconds; a mark that stays needs no timer, and the screen reads the same each time). Screen
   readers hear "Saved" through a polite live region, again on every save. No toast: the
   "Saved." and "Saved. Shoresh screens now use your camp words." toasts are gone, and the
   director is no longer sent back to Camp words when its words are saved (a save on leaving a
   box may be on the way to another screen, or to New season or Copy this season, which stay
   open).
5. **A refusal shows next to the field, in camp words** ("Season not saved. Your changes are
   still here." then why), with `role="alert"`, not at the top of the page. The typing stays and
   is sent again the next time the director leaves the field. A value the field itself refuses
   (a blank name, a date that isn't one, an early count under 1) is not sent; the field says why,
   as any Lightning field does. "Done, but the screen couldn't show it yet" (the save worked, the
   reload didn't) still shows at the top, as for the tables. A refusal that answers once its
   field is no longer on screen (the director left the last field by clicking the screen's next
   button, the menu, or the season pencil that closes the box) is also shown at the top, so it
   is never written only where nobody can see it. The page doesn't wait for the save before
   moving on, as a table row doesn't.
6. **Deletes keep their questions.** Delete this program and Delete season stay as buttons, with
   the questions they had. _Since 2026-10-23 (ADR 0015 choice 14) a program is deleted from its
   row's trash can, with the same question._ Switching activities in Activity details asks before dropping a change
   only when one is still unsaved, which now means it was refused. _Since choice 19, switching
   is opening another row's details; Close asks the same way._
7. **The season's Status is gone from the screen (decision 26 (5)).** Planning / Active /
   Finished changed nothing a director could see, and the desktop has no season status.
   `Season__c.Status__c` stays in the data (never dropped from a package): a new or copied season
   is still made "Planning", and nothing reads it.
8. **The season is edited beside its picker (decision 26 (5)).** _Changed 2026-10-21 (step 3b,
   ADR 0015 choice 12): the pickers are the menu's camp row (the camp's name, or its picker;
   under it the season picker and its pencil), New season and Copy this season are a small menu
   beside the pencil ("Season actions"), and the season's box opens there, under them, one
   field under another._ A pencil button beside the
   season picker (named "Edit Summer 2026" for screen readers, `aria-expanded`) opens a box under
   the header with the season's name, first and last day, "Copied from …", Delete season, and the
   Saved mark. The Weeks screen keeps only Fill in weeks and the weeks table. The Programs screen
   stays (Salesforce lets a camp add more than one program).
9. **Each setup screen ends with the next one (decision 26 (6)).** A brand button "Bunks →" at
   the bottom right of each setup screen, under a rule, as on the desktop (`SetupScreenShell`).
   _Changed 2026-10-21 (ADR 0015 choice 11): on the screens in the shared table pattern it ends
   the list, with no rule (the mock-ups' "Time blocks →")._ The
   order is the menu's (Weeks, Programs, Divisions, Groups, Time blocks, Locations, Camp words,
   Activities, Fixed activities, Recurring activities), following the desktop's rule that the
   next button and the menu take the same path (`navSections.js` `SETUP_SCREEN_ORDER`); screens
   that can't open yet are skipped (before a season, Camp words has no next). The button opens
   the screen and puts the cursor on its heading (`tabindex="-1"`), so keyboard and screen-reader
   users start at the top of it.

## Accessibility and words (added 2026-10-20)

From the rest of the UI/UX pass on the setup screens (findings 1, 9-17, 21, 23-28, 30, 32, 34-36,
39-41, 43-47, 49, 51-53), under Greg's "my calls" list (part B). Every choice is checked in Jest;
real-browser behaviour is still to be checked by hand (Known limits).

8. **The cursor follows the director.** Picking a screen from the menu, Roots, or a screen's
   own link puts the cursor on that screen's heading, like the next buttons (Roots, Camp words
   and Import last year focus their own, `focusHeading()`). New season and Copy this season move
   it to their heading; Cancel puts it back on the button that opened them (_since step 3b, the
   camp row's Season actions menu they open from, ADR 0015 choice 12_). Import a list:
   opening it goes to its heading, closing it back to "Import a list", answering a question to
   the next open question (or Save once none is left), Change to that question's first choice,
   and saving to "Saved". Import last year does the same for its questions, its steps and its
   summary. On Schedules, opening an activity moves to "← All Activities", and going back moves
   to that activity's card. The cursor moves only at the director's action, never
   later: picking the screen already open moves it at once, rather than at the next redraw.
9. **What happens is said.** Import a list and Import last year each have one status line
   (`role="status"`): "Reading …", "Saving", "Saved" / "Imported from …", and Undo's result.
   A note worked out from typing (a group moving division) is read once, in the table's single
   live region; no note cell is its own live region any more, so a reload never reads every note.
10. **Delete season asks with c-shoresh-ask**, like every other question: heading "Delete Summer
    2026?", what goes with it as counts, one line each ("4 Weeks", "12 Bunks", "3 saved
    schedules"), and "Delete season". Cancel puts the cursor back on the button.
11. **Menu entries that can't open stay reachable.** They are links marked `aria-disabled`, in the
    tab order, with why read out ("Needs a season", "Coming"); a click does nothing.
12. **A new message at the top is scrolled into view**, so a save refused far down a long table
    is seen (screen readers already heard it).
13. **Same name and overlap look different without colour.** A same-name dot stays a dot; an
    overlap (two weeks' dates) is two linked rings (`c-shoresh-dot` `shape="overlap"`).
14. **Fewer words.** Gone: the New season hint, the Activity details intro, "Nobody chosen: every
    Group can do it." (the chosen list is headed "Can do it: everyone" instead), Copy season's
    list of what is copied (the preview shows it; it now says only '"Summer 2026" stays as it
    is.'), and the three-sentence weekday warning (now "Weeks move from Mondays to Tuesdays.",
    a status, not an alert). Camp words' boxes no longer repeat the standard word as a
    placeholder. A screen that needs another first (Groups without Divisions, Fixed or Recurring
    without Time blocks) shows an empty state and a "Divisions →" button instead of a sentence;
    Activity details with no activities shows "No Activities yet". _Changed 2026-10-20 (choices
    18 and 19): the ticks' label says "Who can do it: everyone"; with no activities there is no
    row to open details from, so the table's own empty state is the only one._
15. **Camp words over working words.** The left-out column on Fixed and Recurring activities is
    headed "Needs attention" (the desktop's term for these), not "Notes" (_since step 3b it
    shows only while a row needs it, ADR 0015 choice 12_); the group-move column
    "What changes", not "Moving". "Early in the week" groups its two fields ("How many", "By").
    "remembered" is "Remembered" everywhere; Import last year's last button is "Back to Roots"
    (as at the top; _since ADR 0006 choice 22 it is **Done**, with "‹ Roots" on the rail_) and
    Import a list's is "Close" (as at the top). Import last year's
    placements not in last year's version are a small table (in the file, how many, why, for
    example).
16. **Schedules**: the strip reads "Imported · saved Oct 3, 2:00 PM · view only"; the chosen day
    and group pills say so (`aria-pressed`) and are bold and underlined, not only filled.
17. **Small visuals.** The tab icon is the leaf (`Custom5: Leaf`, an SLDS standard motif) instead
    of an airplane; the empty-state picture is a tent instead of an inbox tray. c-shoresh-ask
    falls back to "Go ahead", never "OK". One button rule for setup: leaving things as they are
    on the left, the action on the right (Cancel · Create season, Cancel · Copy season, Cancel ·
    the ask's action, Keep separate · Merge, Keep theirs · Use yours), which every setup
    question already follows.

18. **"Who can do it" is a list of ticks** (Greg, 2026-10-20: the leftover wording calls follow
    the desktop; desktop `ActivitiesScreen.jsx` "Eligible Age Divisions" and its group ticks,
    `FixedEventsScreen.jsx` "Age Divisions"). In Activity details and in the Recurring
    activities table's "Who" (under the row, after Change) the two-column picker
    (`lightning-dual-listbox`) is replaced by `lightning-checkbox-group`: one labelled group
    (a fieldset with its legend, each tick reached with Tab and toggled with Space). Divisions
    come first ("Unit: Juniors"), then groups with their division ("Bunk 1 (Juniors)"), as the
    picker listed them. Nothing ticked still means everyone; the label says so ("Who can do it:
    everyone", "Who: Lunch (Everyone in Main)"). In Activity details a tick saves at once, like
    every other tick (choice 1); in the table, Who saves with its row, as before (ADR 0004).
19. **Activity details open from the activity's row** (Greg, 2026-10-20; desktop
    `ActivitiesScreen.jsx`, the row's Edit, "Edit Archery details"). Each saved row of the
    Activities table has a **Details** button (named "Archery details" for screen readers,
    `aria-expanded`); the details show below the table, headed "Archery details", with
    **Close**. There is no activity picker any more, and nothing shows until a row is opened.
    Opening moves the cursor to the heading; Close moves it back to the row's button. An
    activity deleted meanwhile closes its details. Differences: the desktop opens a dialog with
    Save and Cancel; here the details save as you go (choice 1), so they stay on the page under
    the table, with Close. _Changed 2026-10-21 (step 3b, ADR 0015 choice 12): the row's chevron
    (still named "Archery details") opens them in a panel beside the table
    (docs/design/setup/activities.html), headed by the activity's name (read "Archery
    details") and closed with its × ("Close Archery details"); the cursor moves as before. The
    panel also holds the fields that were the table's other columns (length, groups at once,
    priority, outdoors, rain plan, no weekly maximum), saved as you go, the field that changed
    only._
20. **Import last year recedes once the camp has setup** (Greg, 2026-10-20; desktop
    `SeedScreen.jsx` and `navSections.js` `ADMIN_MENU_ITEMS` "Re-import last year"). On Roots, a
    camp with no divisions, groups or time blocks (the desktop's `campHasSetupData`: its required
    areas) sees **Import last year** as the one brand button, the first thing to do. Once it has
    any, the same entry is a quiet text button, **Re-import last year**, after the other actions:
    still there, not competing. Salesforce has no settings gear, so it stays on Roots rather than
    moving to an admin menu. The import screen itself is unchanged.
21. **Menu section titles are the desktop's** (`navSections.js` `NAV_SECTIONS`): **Camp**,
    **Activities & Events** (in the camp's word for activities, "Periods & Events"), and
    **Schedules** over Generated Schedule, Manual Build and the saved Schedules. Roots stays a
    row of its own, untitled, as on the desktop.
22. **Camp words' read-only reason is short and names no Salesforce machinery** (Greg,
    2026-10-20; the desktop's "Only an admin can …", e.g. `TiersScreen.jsx`): "Only an admin can
    change camp words." (no Shoresh Scheduler access) and "You can't edit this camp, so its words
    are view only." (an admin narrowed access to the camp record). `CampLabels.whyCannotEdit`.

### From the real-browser check (added 2026-10-20)

`docs/a11y-browser-check-2026-10-20.md`, follow-up items 4 and 5; the passing re-run is recorded
there.

23. **A deleted row is said, and the cursor moves to its neighbour.** After **OK** on a setup
    table row's delete, the table's live region says "Deleted Assembly" and the cursor goes to the
    first box of the row that took its place, else the row above, else the blank row (it used to
    fall to the page with the row's delete button). The table only moves it once the season has
    been read again and the row is gone; a cancelled or refused delete leaves the cursor on the
    delete button (ADR 0012 choice 5). Every setup table, on its own screen or in a program
    card, deletes through the same path (`shoreshCampSetup.askAndDelete` calls the table's
    `onDeleted`). The question itself is still Salesforce's confirm box.
24. **Date boxes' calendar buttons are at least 24 by 24 pixels** (WCAG 2.5.8; axe
    `target-size`) on Weeks, New season, Copy this season and the season's own dates. The button
    is inside Salesforce's date box, out of reach of a component's own CSS, so the camp setup
    page loads one small stylesheet (static resource `ShoreshDateBox`) that sizes the button only
    in date boxes Shoresh marks `shoresh-date`; Salesforce's date boxes elsewhere are untouched.
    The icon keeps its size and the box keeps its SLDS padding, which already holds the larger
    button.
25. **A deleted program card is said, and the cursor moves to its neighbour** (added
    2026-10-20, the loose end of choice 23). A program card is not a table row, so choice 23
    did not cover it: after **OK** on **Delete this program** the cursor fell to the page and
    nothing was said. Now the Programs screen's own live region says "Deleted Teens", and the
    cursor goes to the name box of the card that took its place, else the card above, else
    **Add program**, once the season has been read again and the page is no longer busy (Add
    program is disabled while it is). A cancelled or refused delete leaves the cursor on the
    card's delete button, as for rows. _Superseded 2026-10-23 (ADR 0015 choice 14): a program is
    a table row, so choice 23 covers it; the Programs screen's own live region is gone._

## Differences from the desktop

- The desktop's last setup screen leads to a neutral "Schedule →" landing that picks neither
  schedule. Salesforce has no such landing, and pointing at Generated Schedule or Manual Build
  would pick one for the director, so the last setup screen (Recurring activities, while Special
  events is coming) has no next button.
- The menu order is Salesforce's (ADR 0003 choice 2, with Weeks, Programs and Camp words), not
  the desktop's (Age Divisions, Groups, Days, Time Blocks, Locations); the next buttons follow
  the menu, as the desktop's follow its sidebar.
- The desktop's footer also holds Download Template / Import from Excel / Delete All; here the
  list import stays at the top of each screen (not part of this decision). _Since 2026-10-21
  (ADR 0015 choice 11), on Weeks, Age divisions, Groups, Time blocks and Locations it is
  Import a list and Download this list on the screen's rail (Weeks has no list import)._
- "✓ Saved" stays until the next change instead of fading after two seconds (choice 4).
- "Same location?" keeps Keep separate before Merge (choice 17's rule); the desktop puts Merge
  first, though its other questions (ExclusionConfirmDialog.jsx) put Cancel first.
- The desktop's Camp screen saves its one name with a Save button or Enter; here leaving the
  field saves it too, as Greg decided for every setup form.

## Known limits

- Whether focus and the spoken "Saved" behave in a real browser with a screen reader is checked
  by hand in the test org, not by Jest (UI/UX pass, part C). The same goes for choices 8-12.
- Choice 24 relies on Salesforce drawing its date box without a real (native) shadow root, as
  it does today: the page's stylesheet reaches the button only that way. If Salesforce changes
  that, the button goes back to its own smaller size (it still works), and the real-browser
  check's axe step reports it again.
- Two people editing the same season, program, or activity details field: the last save wins,
  as before this change (only the tables have the compare and set of ADR 0011 choice 5).
