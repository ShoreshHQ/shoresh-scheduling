# Real-browser accessibility check, 2026-10-23

Made by `scripts/a11y-browser-check.mjs` (how to run it: `docs/ci-setup.md`). It drives the
Shoresh tab in the test org with the keyboard only, in a real browser, and checks where focus
lands after each menu, dialog and tool closes, what the live regions say after saves, builds
and publishing, that every toolbar action is reachable with Tab, and runs axe-core on each
screen. It fixes nothing in the app and changes only its own made-up camp; failures are
listed for follow-up.

- Code checked: `6e0a1c2` (the working tree deployed to the test org was this commit's)
- Browser: Google Chrome 155.0.8059.85 (headless)
- axe-core 4.13.0, rules: WCAG 2.0, 2.1 and 2.2, levels A and AA
- Data: the made-up camp "Keyboard check camp (made up)" (the walkthrough's seed, `scripts/apex/sample-version.apex`, under its own name), on Week 30, the check's own week, made fresh for this run

**13 passed, 0 failed, 0 not run.**

## Failed

Nothing failed.

## Not run

Every step ran.

## Passed

| Screen                                       | Step                                                                     | What happened                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Electives                                    | Opened from the page's address                                           | The Electives table is on screen.                                                                                               |
| Electives                                    | Open from the menu: focus on the heading                                 | Focus on h2 "Electives".                                                                                                        |
| Electives                                    | axe                                                                      | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (14), color-contrast (1). |
| Electives                                    | An offering's chevron: focus on its details' heading                     | Focus on h2 "Art details".                                                                                                      |
| Electives, an offering's linked choices open | axe                                                                      | No violations (23 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (15), color-contrast (1). |
| Electives                                    | Closing the details: focus back on the row's chevron                     | Focus on button "Art details".                                                                                                  |
| Electives                                    | Confirm at rest: not shown                                               | Opacity 0.                                                                                                                      |
| Electives                                    | Confirm with the keyboard on it: shown                                   | Opacity 1.                                                                                                                      |
| Electives                                    | Confirm on a proposed offering: its save is said                         | Said: "Boating saved".                                                                                                          |
| Electives                                    | Confirm on a proposed offering: the cursor on the offering's first field | Focus on button "Offering".                                                                                                     |
| Electives                                    | The seats corner opened: the cursor stays on it                          | Focus on button "Seats for Gym games: seats not filled in yet".                                                                 |
| Electives, the seats corner open             | axe                                                                      | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (15), color-contrast (1). |
| Electives                                    | Escape: the cursor back on the corner                                    | Focus on button "Seats for Gym games: seats not filled in yet".                                                                 |

## Not checked here

- A screen reader itself (VoiceOver, NVDA): the check reads the live regions' text, not what
  is spoken.
- Pointer-only actions (drag and drop) and touch.
- axe-core finds about a third of WCAG problems; colour contrast it can only judge where the
  colours are plain.
