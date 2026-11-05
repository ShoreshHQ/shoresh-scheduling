# Real-browser accessibility check, 2026-11-05

Made by `scripts/a11y-browser-check.mjs` (how to run it: `docs/ci-setup.md`). It drives the
Shoresh tab in the test org with the keyboard only, in a real browser, and checks where focus
lands after each menu, dialog and tool closes, what the live regions say after saves, builds
and publishing, that every toolbar action is reachable with Tab, and runs axe-core on each
screen. It fixes nothing in the app and changes only its own made-up camp; failures are
listed for follow-up.

- Code checked: `2778488c`
- Browser: Google Chrome 156.0.8078.80 (headless)
- axe-core 4.13.0, rules: WCAG 2.0, 2.1 and 2.2, levels A and AA
- Data: the made-up camp "Keyboard check camp (made up)" (the walkthrough's seed, `scripts/apex/sample-version.apex`, under its own name), on Week 2, the check's own week, made fresh for this run

**30 passed, 0 failed, 0 not run.**

## Failed

Nothing failed.

## Not run

Every step ran.

## Passed

| Screen | Step | What happened |
| ------ | ---- | ------------- |
| Groups | Open from the menu: focus on the heading | Focus on h2 "Groups". |
| Groups | Import a list: focus on its heading | Focus on h3 "Import a list". |
| Groups | Import a list: the file laid into the table in its place | Check new bunk new and dashed under Juniors; Bunk 5's All day crossed out under Seniors; the screen's table put away. |
| Groups, Import a list with a file laid into the table | axe | No violations (18 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (3), color-contrast (1). |
| Groups | Leave out: the cursor kept on it | Focus on button "Leave out Check new bunk". |
| Groups | Leave out: pressed, the row left out | Check new bunk: left out. |
| Groups | Cancel: focus back on Import a list | Focus on button "Import a list". |
| Groups | Cancel: the screen's table back, nothing saved | Bunk 5 still All day; no new bunk. |
| Groups | Open from the menu: focus on the heading | Focus on h2 "Groups". |
| Groups | Paste: ⌘V or Ctrl+V on its heading, laid into the table | Check pasted bunk new, from "Pasted cells". |
| Groups, Import a list with pasted cells laid into the table | axe | No violations (18 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (3), color-contrast (1). |
| Groups | Paste: Paste cells by keyboard, laid into the table | Check pasted bunk new, from "Pasted cells". |
| Groups | Paste: Cancel saves nothing | No pasted bunk in the org. |
| Programs | Open from the menu: focus on the heading | Focus on h2 "Programs". |
| Programs | Import a list: focus on its heading | Focus on h3 "Import a list". |
| Programs | Import a list: the file laid into the table in its place | Check import program new; the screen's own table put away. |
| Programs, Import a list with a file laid into the table | axe | No violations (18 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (3), color-contrast (1). |
| Programs | Cancel: focus back on Import a list | Focus on button "Import a list". |
| Programs | Cancel: the screen's table back, nothing saved | No new program. |
| Electives | Open from the menu: focus on the heading | Focus on h2 "Electives". |
| Electives | Download this list: the offerings in the list's layout | Electives - Sample summer.xlsx: 3 offerings; Art with 12 seats. |
| Electives | Import a list: focus on its heading | Focus on h3 "Import a list". |
| Electives, Import a list open | axe | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (14), color-contrast (1). |
| Electives | Import a list: Change 1 saved and said | Said: "Saved". |
| Electives | Import a list: the change is in the org | Art: 14 seats. |
| Electives | Close: focus back on Import a list | Focus on button "Import a list". |
| Electives | A choices file: focus on Bring in choices | Focus on button "Bring in choices". |
| Electives | A choices file: said, nothing saved | check-choices.csv: that file is camper choices, not offerings. Nothing was saved.Bring in choices |
| Electives, a choices file given to Import a list | axe | No violations (21 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (14), color-contrast (1). |
| Electives | Bring in choices: that screen, focus on its heading | Focus on h2 "Bring in choices". |

## Not checked here

- A screen reader itself (VoiceOver, NVDA): the check reads the live regions' text, not what
  is spoken.
- Pointer-only actions (drag and drop) and touch.
- axe-core finds about a third of WCAG problems; colour contrast it can only judge where the
  colours are plain.
