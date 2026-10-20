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
   it, not on every move. Leaving a field with nothing changed sends nothing.
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
   form once a field of it is saved, in small grey text with the tick in the success green. It
   stays until the director changes something in that form again (the desktop's fades after two
   seconds; a mark that stays needs no timer, and the screen reads the same each time). Screen
   readers hear "Saved" through a polite live region, again on every save. No toast: the
   "Saved." and "Saved. Shoresh screens now use your camp words." toasts are gone, and the
   director is no longer sent back to Camp words when its words are saved (a save on leaving a
   box may be on the way to another screen).
5. **A refusal shows next to the field, in camp words** ("Season not saved. Your changes are
   still here." then why), with `role="alert"`, not at the top of the page. The typing stays and
   is sent again the next time the director leaves the field. A value the field itself refuses
   (a blank name, a date that isn't one, an early count under 1) is not sent; the field says why,
   as any Lightning field does. "Done, but the screen couldn't show it yet" (the save worked, the
   reload didn't) still shows at the top, as for the tables.
6. **Deletes keep their questions.** Delete this program and Delete season stay as buttons, with
   the questions they had. Switching activities in Activity details asks before dropping a change
   only when one is still unsaved, which now means it was refused.
7. **The season's Status is gone from the screen (decision 26 (5)).** Planning / Active /
   Finished changed nothing a director could see, and the desktop has no season status.
   `Season__c.Status__c` stays in the data (never dropped from a package): a new or copied season
   is still made "Planning", and nothing reads it.
8. **The season is edited beside its picker (decision 26 (5)).** A pencil button beside the
   season picker (named "Edit Summer 2026" for screen readers, `aria-expanded`) opens a box under
   the header with the season's name, first and last day, "Copied from …", Delete season, and the
   Saved mark. The Weeks screen keeps only Fill in weeks and the weeks table. The Programs screen
   stays (Salesforce lets a camp add more than one program).
9. **Each setup screen ends with the next one (decision 26 (6)).** A brand button "Bunks →" at
   the bottom right of each setup screen, under a rule, as on the desktop (`SetupScreenShell`). The
   order is the menu's (Weeks, Programs, Divisions, Groups, Time blocks, Locations, Camp words,
   Activities, Fixed activities, Recurring activities), following the desktop's rule that the
   next button and the menu take the same path (`navSections.js` `SETUP_SCREEN_ORDER`); screens
   that can't open yet are skipped (before a season, Camp words has no next). The button opens
   the screen and puts the cursor on its heading (`tabindex="-1"`), so keyboard and screen-reader
   users start at the top of it.

## Differences from the desktop

- The desktop's last setup screen leads to a neutral "Schedule →" landing that picks neither
  schedule. Salesforce has no such landing, and pointing at Generated Schedule or Manual Build
  would pick one for the director, so the last setup screen (Recurring activities, while Special
  events is coming) has no next button.
- The menu order is Salesforce's (ADR 0003 choice 2, with Weeks, Programs and Camp words), not
  the desktop's (Age Divisions, Groups, Days, Time Blocks, Locations); the next buttons follow
  the menu, as the desktop's follow its sidebar.
- The desktop's footer also holds Download Template / Import from Excel / Delete All; here the
  list import stays at the top of each screen (not part of this decision).
- "✓ Saved" stays until the next change instead of fading after two seconds (choice 4).
- The desktop's Camp screen saves its one name with a Save button or Enter; here leaving the
  field saves it too, as Greg decided for every setup form.

## Known limits

- Whether focus and the spoken "Saved" behave in a real browser with a screen reader is checked
  by hand in the test org, not by Jest (UI/UX pass, part C).
- Two people editing the same season, program, or activity details field: the last save wins,
  as before this change (only the tables have the compare and set of ADR 0011 choice 5).
