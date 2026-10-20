# Real-browser accessibility check, 2026-10-20

Made by `scripts/a11y-browser-check.mjs` (how to run it: `docs/ci-setup.md`). It drives the
Shoresh tab in the test org with the keyboard only, in a real browser, and checks where focus
lands after each menu, dialog and tool closes, what the live regions say after saves, builds
and publishing, that every toolbar action is reachable with Tab, and runs axe-core on each
screen. It fixes nothing in the app and changes only its own made-up camp; failures are
listed for follow-up.

- Code checked: `1c9de78`
- Browser: Google Chrome 155.0.8059.85 (headless)
- axe-core 4.13.0, rules: WCAG 2.0, 2.1 and 2.2, levels A and AA
- Data: the made-up camp "Keyboard check camp (made up)" (the walkthrough's seed, `scripts/apex/sample-version.apex`, under its own name), on Week 13, a week added for this run

**86 passed, 13 failed, 4 not run.**

## For follow-up (written after the run, most serious first)

Every item below came back the same way on several runs (2026-10-20, Weeks 2 to 12 of the
check's camp). Nothing is fixed in this change.

1. **Versions does not open on Manual Build or Generated Schedule.** The list opens and closes
   again in the same moment, with Enter, Space or a mouse click (the click was tried by hand in
   the same browser). So in Salesforce a director can't save, restore, rename or delete a version
   on either screen. Jest passes because jsdom never shows it; the closing comes from the "click
   elsewhere closes it" listener in `c/shoreshVersions`.
2. **Update to match setup is always refused.** With nobody else editing, both screens say
   _Someone else changed this week since, so nothing was updated._ for one row's **Update** and for
   **Update all**, on a week that was never published. The week can't be brought back in line
   with setup. (Not an accessibility problem, but this check is the first to run it in the org.)
3. **Start a blank week drops the keyboard focus** to the page when the button goes away (WCAG
   2.4.3). Generate, on Generated Schedule, keeps it (on Rebuild).
4. **Deleting a row in a setup table** (tried on Fixed activities): the question is Salesforce's own
   box (_Delete "Assembly"? Anything inside it is deleted too._, **OK**), not Shoresh's question
   with camp words; after **OK** nothing is announced and focus falls to the page.
5. **The calendar buttons of date boxes are smaller than 24 by 24 pixels** (axe `target-size`,
   WCAG 2.5.8): Weeks table, New season, Copy this season, the season's own dates. They belong to
   Salesforce's date box (`lightning-input` type date), so the fix may be spacing around them, or
   accepting it as a Salesforce limit.

What worked, in short: every screen opened from the menu puts focus on its heading; every
dialog and menu tried puts focus inside and gives it back on Escape or Cancel; focus goes to the
line's Undo after Clear day, Copy day and Start over, as ADR 0008 and 0010 say; saves, builds,
locks, publishing and unpublishing are all announced; every enabled toolbar action on both
schedule screens is reachable with Tab; axe found nothing else on any screen.

## Follow-up, 2026-10-20: setup screens (items 4 and 5)

Fixed in branch `fix-setup-browser-a11y` (ADR 0013 choices 23 and 24) and checked again by the
same script, on code `49cce59` deployed to the test org, Week 30 of the check's camp, with no CI
run or other session using the org. Every setup-screen step passed; the run's other failures
were items 1 to 3 (Manual Build, Generated Schedule, Versions, Update to match setup), which
this change does not touch.

| Screen           | Step                                    | What happened now                                             |
| ---------------- | --------------------------------------- | ------------------------------------------------------------- |
| Weeks            | axe                                     | No violations (22 rules passed); target-size no longer fails. |
| New season       | axe                                     | No violations (20 rules passed).                              |
| Copy this season | axe                                     | No violations (22 rules passed).                              |
| Season details   | axe                                     | No violations (22 rules passed).                              |
| Fixed activities | Deleting Assembly: it is said           | Said: "Deleted Assembly".                                     |
| Fixed activities | After deleting Assembly: focus not lost | Focus on the next row's Name box.                             |

Still as before: the delete question is Salesforce's own confirm box, not Shoresh's question
with camp words (the first half of item 4). The script now goes back to the menu with Shift+Tab
first: with the cursor staying in the table after a delete, and the camp gaining a week each
run, going forward only ran out of Tab presses before reaching it.

## Failed

| Screen             | Step                                                    | What happened                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weeks              | axe: target-size                                        | All touch targets must be 24px large, or leave sufficient space (serious). 28 element(s), first: .slds-button_icon[title="Select a date for Start date"][part="button button-icon"]. |
| New season         | axe: target-size                                        | All touch targets must be 24px large, or leave sufficient space (serious). 2 element(s), first: button[title="Select a date for First day"].                                         |
| Copy this season   | axe: target-size                                        | All touch targets must be 24px large, or leave sufficient space (serious). 1 element(s), first: .slds-button_icon.slds-button[part="button button-icon"].                            |
| Season details     | axe: target-size                                        | All touch targets must be 24px large, or leave sufficient space (serious). 2 element(s), first: button[title="Select a date for First day"].                                         |
| Manual Build       | Start a blank week: focus not lost when the button goes | Focus fell to the page (nothing focused after 3 seconds).                                                                                                                            |
| Manual Build       | Versions: Enter opens the list                          | The list opened and closed again at once (aria-expanded: true → false).                                                                                                              |
| Generated Schedule | Versions: Enter opens the list                          | The list opened and closed again at once (aria-expanded: true → false).                                                                                                              |
| Fixed activities   | Deleting Assembly: it is said                           | No live region said Deleted\|deleted\|Saved. They said: nothing.                                                                                                                     |
| Fixed activities   | After deleting Assembly: focus not lost                 | Focus fell to the page (nothing focused after 3 seconds).                                                                                                                            |
| Manual Build       | One row's Update: the cell is updated                   | Refused with no one else editing: "Someone else changed this week since, so nothing was updated." The dialog closed; focus on button "Update to match setup".                        |
| Manual Build       | Update all: the week is updated                         | Refused too: the week still doesn't match setup, and the screen says nothing was updated.                                                                                            |
| Generated Schedule | One row's Update: the cell is updated                   | Refused with no one else editing: "Someone else changed this week since, so nothing was updated." The dialog closed; focus on button "Update to match setup".                        |
| Generated Schedule | Update all: the week is updated                         | Refused too: the week still doesn't match setup, and the screen says nothing was updated.                                                                                            |

## Not run

| Screen             | Step                                         | What happened                             |
| ------------------ | -------------------------------------------- | ----------------------------------------- |
| Manual Build       | Versions: Escape, Save version, rename       | The list does not open.                   |
| Generated Schedule | Versions: Escape, Save version, rename       | The list does not open.                   |
| Manual Build       | Update all leaves nothing: focus on the grid | Nothing was updated, so nothing to check. |
| Generated Schedule | Update all leaves nothing: focus on the grid | Nothing was updated, so nothing to check. |

## Passed

| Screen                                    | Step                                                  | What happened                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Camp setup                                | Menu reachable by Tab from the top of the page        | Reached Roots.                                                                                                                      |
| Roots                                     | Open from the menu: focus on the heading              | Focus on h2 "Roots".                                                                                                                |
| Roots                                     | axe                                                   | No violations (17 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (3), color-contrast (1).      |
| Weeks                                     | Open from the menu: focus on the heading              | Focus on h2 "Weeks".                                                                                                                |
| Camp words                                | Open from the menu: focus on the heading              | Focus on h2 "Words Keyboard check camp (made up) uses".                                                                             |
| Camp words                                | axe                                                   | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (82), color-contrast (1).     |
| Camp words                                | Leaving a changed pair of words: Saved is said        | Said: "✓ Saved".                                                                                                                    |
| Camp words                                | Putting the words back: Saved is said again           | Said: "✓ Saved".                                                                                                                    |
| New season                                | Opening it: focus on its heading                      | Focus on h2 "Start a new season".                                                                                                   |
| New season                                | Cancel: focus back on New season                      | Focus on button "New season".                                                                                                       |
| Copy this season                          | Opening it: focus on its heading                      | Focus on h2 "Copy season "Sample summer"".                                                                                          |
| Copy this season                          | Cancel: focus back on Copy this season                | Focus on button "Copy this season".                                                                                                 |
| Season details                            | Opening it: focus stays on the pencil                 | Focus on button "Edit Sample summer".                                                                                               |
| Season details                            | Closing it: focus stays on the pencil                 | Focus on button "Edit Sample summer".                                                                                               |
| Fixed activities                          | Open from the menu: focus on the heading              | Focus on h2 "Fixed activities".                                                                                                     |
| Fixed activities                          | axe                                                   | No violations (22 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (53), color-contrast (1).     |
| Manual Build                              | Open from the menu: focus on the heading              | Focus on h2 "Manual Build".                                                                                                         |
| Manual Build                              | Start a blank week: it is said                        | Said: "Started Week 13.".                                                                                                           |
| Manual Build                              | axe                                                   | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (3), color-contrast (1).      |
| Manual Build                              | Toolbar: every action reachable by Tab                | All 9 reached: Week, Daily View, Group View, Activity View, Clear day, Copy day to…Copy day to…, Clear week, Versions, Publish.     |
| Manual Build                              | Enter on a cell: focus in the typing box              | Focus on input "Bunk 1 · Monday · Period 2" in a dialog.                                                                            |
| Manual Build                              | Return places Swim: it is said                        | Said: "Placed Swim · Bunk 1 · Monday · Period 2".                                                                                   |
| Manual Build                              | After placing: focus back on the cell                 | Focus on div "Swim" in the grid.                                                                                                    |
| Manual Build                              | Escape in the typing box: focus back on the cell      | Focus on div "Swim" in the grid.                                                                                                    |
| Manual Build                              | Clear day: it is said                                 | Said: "Cleared Monday".                                                                                                             |
| Manual Build                              | Clear day: focus on the line's Undo                   | Focus on button "Undo Cleared Monday".                                                                                              |
| Manual Build                              | Its Undo: it is said                                  | Said: "Undone: Cleared Monday".                                                                                                     |
| Manual Build                              | Its Undo: focus not lost                              | Focus on button "Undo: Placed Swim · Bunk 1 · Monday · Period 2" in the toolbar.                                                    |
| Manual Build                              | Copy day to… opens: focus on its first choice         | Focus on a "Tuesday".                                                                                                               |
| Manual Build                              | Escape: focus back on Copy day to…                    | Focus on button "Copy day to… Copy day to…".                                                                                        |
| Manual Build                              | Choosing a day: it is said                            | Said: "Copied Monday to Tuesday".                                                                                                   |
| Manual Build                              | After copying: focus on the line's Undo               | Focus on button "Undo Copied Monday to Tuesday".                                                                                    |
| Generated Schedule                        | Open from the menu: focus on the heading              | Focus on h2 "Generated Schedule".                                                                                                   |
| Generated Schedule                        | Generate: it is said when it ends                     | Said: "Week 13 generated. Filled 141 of 141.".                                                                                      |
| Generated Schedule                        | Generate: focus not lost when the button goes         | Focus on button "Rebuild".                                                                                                          |
| Generated Schedule                        | axe                                                   | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (4), color-contrast (1).      |
| Generated Schedule                        | Toolbar: every action reachable by Tab                | All 11 reached: Week, Daily View, Group View, Activity View, Rebuild, Try another, Option, LockLock, Start over, Versions, Publish. |
| Generated Schedule                        | Rebuild asks: focus on Cancel                         | Focus on button "Cancel" in a dialog.                                                                                               |
| Generated Schedule: Rebuild question      | axe                                                   | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (5), color-contrast (1).      |
| Generated Schedule                        | Escape: focus back on Rebuild                         | Focus on button "Rebuild".                                                                                                          |
| Generated Schedule                        | Rebuild it: it is said when it ends                   | Said: "Week 13 rebuilt. Filled 141 of 141.".                                                                                        |
| Generated Schedule                        | After Rebuild: focus not lost                         | Focus on button "Rebuild".                                                                                                          |
| Generated Schedule                        | Lock opens: focus on its first choice                 | Focus on a "Lock Bunk 1 · Monday · Period 2".                                                                                       |
| Generated Schedule                        | Escape: focus back on Lock                            | Focus on button "Lock Lock".                                                                                                        |
| Generated Schedule                        | Choosing Lock/Unlock: it is said                      | Said: "Locked Bunk 1, Monday, Period 2.".                                                                                           |
| Generated Schedule                        | After locking: focus not lost                         | Focus on button "Lock Lock".                                                                                                        |
| Generated Schedule                        | Start over: it is said when it ends                   | Said: "Started Week 13 over. Filled 0 of 141.".                                                                                     |
| Generated Schedule                        | After Start over: focus on its line's Undo            | Focus on button "Undo Started Week 13 over".                                                                                        |
| Generated Schedule                        | Its Undo: focus back on Start over                    | Focus on button "Start over".                                                                                                       |
| Manual Build                              | Open from the menu: focus on the heading              | Focus on h2 "Manual Build".                                                                                                         |
| Generated Schedule                        | Open from the menu: focus on the heading              | Focus on h2 "Generated Schedule".                                                                                                   |
| Fixed activities                          | Open from the menu: focus on the heading              | Focus on h2 "Fixed activities".                                                                                                     |
| Fixed activities                          | Delete Assembly asks: focus in the question           | Focus on h1 "Delete" in a dialog, in Salesforce's own confirm box (lightning-confirm), not c-shoresh-ask.                           |
| Fixed activities                          | Open from the menu: focus on the heading              | Focus on h2 "Fixed activities".                                                                                                     |
| Fixed activities                          | Adding Assembly with Enter: it is said                | Said: "Assembly added".                                                                                                             |
| Fixed activities                          | After adding: focus back in the blank row's first box | Focus on input "Add Fixed activity: Name".                                                                                          |
| Manual Build                              | Open from the menu: focus on the heading              | Focus on h2 "Manual Build".                                                                                                         |
| Manual Build                              | It opens: focus on Cancel                             | Focus on button "Cancel" in a dialog.                                                                                               |
| Manual Build: Update to match setup       | axe                                                   | No violations (22 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (5), color-contrast (1).      |
| Manual Build                              | Escape: focus back on Update to match setup           | Focus on button "Update to match setup".                                                                                            |
| Manual Build                              | One row's Update: it is said                          | Said: "Someone else changed this week since, so nothing was updated.".                                                              |
| Generated Schedule                        | Open from the menu: focus on the heading              | Focus on h2 "Generated Schedule".                                                                                                   |
| Generated Schedule                        | It opens: focus on Cancel                             | Focus on button "Cancel" in a dialog.                                                                                               |
| Generated Schedule: Update to match setup | axe                                                   | No violations (22 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (6), color-contrast (1).      |
| Generated Schedule                        | Escape: focus back on Update to match setup           | Focus on button "Update to match setup".                                                                                            |
| Generated Schedule                        | One row's Update: it is said                          | Said: "Someone else changed this week since, so nothing was updated.".                                                              |
| Manual Build                              | Open from the menu: focus on the heading              | Focus on h2 "Manual Build".                                                                                                         |
| Manual Build                              | Publish asks first: focus in the question             | Focus on button "Cancel" in a dialog.                                                                                               |
| Manual Build: Publish question            | axe                                                   | No violations (22 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (5), color-contrast (1).      |
| Manual Build                              | Escape: focus back on Publish                         | Focus on button "Publish".                                                                                                          |
| Manual Build                              | Publish: it is said                                   | Said: "Published Week 13.".                                                                                                         |
| Manual Build                              | After Publish: focus not lost                         | Focus on button "Publish".                                                                                                          |
| Manual Build                              | Unpublish asks: focus on Cancel                       | Focus on button "Cancel" in a dialog.                                                                                               |
| Manual Build                              | Escape: focus back on Unpublish                       | Focus on button "Unpublish".                                                                                                        |
| Manual Build                              | Unpublish: it is said                                 | Said: "Unpublished Week 13.".                                                                                                       |
| Manual Build                              | After Unpublish (its button goes): focus not lost     | Focus on button "Publish".                                                                                                          |
| Generated Schedule                        | Open from the menu: focus on the heading              | Focus on h2 "Generated Schedule".                                                                                                   |
| Generated Schedule                        | Publish asks first: focus in the question             | Focus on button "Cancel" in a dialog.                                                                                               |
| Generated Schedule: Publish question      | axe                                                   | No violations (22 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (6), color-contrast (1).      |
| Generated Schedule                        | Escape: focus back on Publish                         | Focus on button "Publish".                                                                                                          |
| Generated Schedule                        | Publish: it is said                                   | Said: "Published Week 13.".                                                                                                         |
| Generated Schedule                        | After Publish: focus not lost                         | Focus on button "Publish".                                                                                                          |
| Generated Schedule                        | Unpublish asks: focus on Cancel                       | Focus on button "Cancel" in a dialog.                                                                                               |
| Generated Schedule                        | Escape: focus back on Unpublish                       | Focus on button "Unpublish".                                                                                                        |
| Generated Schedule                        | Unpublish: it is said                                 | Said: "Unpublished Week 13.".                                                                                                       |
| Generated Schedule                        | After Unpublish (its button goes): focus not lost     | Focus on button "Publish".                                                                                                          |

## Not checked here

- A screen reader itself (VoiceOver, NVDA): the check reads the live regions' text, not what
  is spoken.
- Pointer-only actions (drag and drop) and touch.
- axe-core finds about a third of WCAG problems; colour contrast it can only judge where the
  colours are plain.

## Follow-up, 2026-10-20: items 1 to 3 fixed

Branch `fix-versions-setupmatch-browser`, code `7eb747f`, deployed to the test org and checked
with the same script and browser (Week 29 of the check's camp; nobody else deployed during the
run). **105 passed, 5 failed, 2 not run.** Everything listed below under items 1 to 3 now passes.

1. **Versions opens** on both screens. The "click elsewhere closes it" listener asked whether
   the click's path held the list's own element; in Salesforce the page sees the component
   through a wrapper, so the answer was always no. The list now notes clicks inside itself.
   Opening it also showed that **rename** left focus on the page (its button goes when the name
   box comes); focus now goes into the box, as the desktop's `autoFocus` does.
2. **Update to match setup is made.** The screen sent the right revisions, but what it sends
   (`SetupMatch.Ask`) had plain fields, which Salesforce leaves empty, so the server compared
   the week with nothing and refused. They are properties now; `npm run check:aura-inputs`
   (also run in CI by Jest) fails on any class a screen sends with a plain field.
3. **Start a blank week** puts focus on the new week's first cell.

| Screen             | Step                                                    | What happened                                                    |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Manual Build       | Start a blank week: focus not lost when the button goes | Focus on div "Morning meeting: Recurring activity" in the grid.  |
| Manual Build       | Versions: Enter opens the list                          | aria-expanded is true.                                           |
| Manual Build       | Versions: Escape closes it, focus on Versions           | Focus on button "Versions".                                      |
| Manual Build       | Save version: it is said                                | Said: "Saved Keyboard check 17:54:08.".                          |
| Manual Build       | rename: focus in the name box                           | Focus on input "New name".                                       |
| Manual Build       | Escape in the name box: focus back on its rename        | Focus on button "Rename Keyboard check 17:54:08".                |
| Generated Schedule | Versions: Enter opens the list                          | aria-expanded is true.                                           |
| Generated Schedule | Versions: Escape closes it, focus on Versions           | Focus on button "Versions".                                      |
| Generated Schedule | Save version: it is said                                | Said: "Saved Keyboard check 17:54:23.".                          |
| Generated Schedule | rename: focus in the name box                           | Focus on input "New name".                                       |
| Generated Schedule | Escape in the name box: focus back on its rename        | Focus on button "Rename Keyboard check 17:54:23".                |
| Manual Build       | One row's Update: it is said                            | Said: "Updated to match setup.".                                 |
| Manual Build       | One row's Update: focus stays in the dialog             | Focus on button "Update Bunk 2 · Monday · Period 6" in a dialog. |
| Manual Build       | Update all: it is said                                  | Said: "Updated to match setup." (the one change left).           |
| Manual Build       | Update all leaves nothing: focus on the grid            | Focus on div "Swim" in the grid.                                 |
| Generated Schedule | One row's Update: it is said                            | Said: "Updated to match setup.".                                 |
| Generated Schedule | One row's Update: focus stays in the dialog             | Focus on button "Update Bunk 2 · Monday · Period 6" in a dialog. |
| Generated Schedule | Update all: it is said                                  | Said: "Updated to match setup." (the one change left).           |
| Generated Schedule | Update all leaves nothing: focus on the grid            | Focus on div "Art" in the grid.                                  |

Still failing, not part of this change: items 4 (deleting a row in a setup table) and 5 (date
box calendar buttons) above. Not run: Camp words and the season's pencil were not reached
with Tab, most likely because the check's own camp now has 29 weeks and the Weeks table's
controls use up the script's 140 Tab presses before them (a limit of the check; not looked
into here).

## Follow-up, 2026-10-20: the loose ends of the two follow-ups above

Branch `a11y-loose-ends`, code `454e979` (the check script's last fix came after it; the app is
the same), deployed to the test org and checked with the same script and browser, on Week 30 of
the check's camp, with no CI run using the org. **116 passed, 0 failed, 0 not run**, twice in a
row.

1. **Deleting a whole program card** (not a table row, so ADR 0013 choice 23 didn't cover it)
   let the cursor fall to the page and said nothing. Now the Programs screen says "Deleted
   Program 2" and the cursor goes to the next card's name, else the card above, else **Add
   program** (ADR 0013 choice 25). The check now adds a card and deletes it again each run.
2. **The check's camp no longer gains a week each run.** Published schedules are kept history,
   so a week the check has published can't be deleted; instead the check reuses its week (the
   latest), deleting that week's drafts and saved versions first, so Start a blank week,
   Generate and Save version happen again. The two runs made Week 30 fresh (deleting 0, then 7
   draft or saved schedules), and the camp still has 30 weeks afterwards. The 28 weeks that
   earlier runs added stay, since each has published history; only deleting the made-up camp
   itself would clear them.
3. **Camp words and the season's pencil not reached: a limit of the check, not a keyboard
   trap.** Nothing in the app holds the cursor: Shift+Tab leaves the Weeks table at once. The
   check only ever went forward to them: Camp words from the Weeks heading (fixed in the
   follow-up above by trying Shift+Tab first) and the pencil from **Copy this season**, though
   the pencil comes just before **New season**, so going forward crossed the menu and the whole
   open screen, and with 29 weeks ran out of its 140 presses. The pencil step now tries
   Shift+Tab first too. Both passed with the camp at 30 weeks:

| Screen         | Step                                                         | What happened now                              |
| -------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Programs       | Deleting the card Program 2: it is said                      | Said: "Deleted Program 2".                     |
| Programs       | After deleting the last card: focus on the card above's name | Focus on input "\*Program name".               |
| Camp words     | Leaving a changed pair of words: Saved is said               | Said: "✓ Saved".                               |
| Season details | Opening it: focus stays on the pencil                        | Focus on button "Edit Sample summer".          |
| Season details | Closing it: focus stays on the pencil                        | Focus on button "Edit Sample summer".          |
| Manual Build   | Start a blank week: it is said                               | Said: "Started Week 30.".                      |
| Generated      | Generate: it is said when it ends                            | Said: "Week 30 generated. Filled 141 of 141.". |

Not changed: a long Weeks table is still many Tab presses to cross going forward (each week's
row has its own boxes and buttons), as any long table in Salesforce is. A real season has
around 8 to 10 weeks, and the menu and the season's controls come before it, so no skip link
was added.
