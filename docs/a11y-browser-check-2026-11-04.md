# Real-browser accessibility check, 2026-11-04

Made by `scripts/a11y-browser-check.mjs` (how to run it: `docs/ci-setup.md`). It drives the
Shoresh tab in the test org with the keyboard only, in a real browser, and checks where focus
lands after each menu, dialog and tool closes, what the live regions say after saves, builds
and publishing, that every toolbar action is reachable with Tab, and runs axe-core on each
screen. It fixes nothing in the app and changes only its own made-up camp; failures are
listed for follow-up.

- Code checked: `27b4ce3f`
- Browser: Google Chrome 156.0.8078.80 (headless)
- axe-core 4.13.0, rules: WCAG 2.0, 2.1 and 2.2, levels A and AA
- Data: the made-up camp "Keyboard check camp (made up)" (the walkthrough's seed, `scripts/apex/sample-version.apex`, under its own name), on Week 2, the check's own week, made fresh for this run

**8 passed, 0 failed, 0 not run.**

## Failed

Nothing failed.

## Not run

Every step ran.

## Passed

| Screen | Step | What happened |
| ------ | ---- | ------------- |
| Settings | Open from the menu: focus on the heading | Focus on h2 "Settings". |
| Settings | axe | No violations (20 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (6), color-contrast (1). |
| Settings | One running list, each line saying how | 25 lines, no groups; the last: "Guessed in an import by you". |
| Settings | About: five footnotes, each linked | 5 and 5. |
| Settings | Enter on Note 1: focus on the note | On note 1. |
| Settings | The way back: focus on Note 1 in the text | Focus on a "Note 1". |
| Settings | Legal: copyright, the licence's full text, the code | All three shown. |
| Settings, About and Legal | axe | No violations (20 rules passed). axe could not decide, for a person to look at: aria-valid-attr-value (6), color-contrast (1). |

## Not checked here

- A screen reader itself (VoiceOver, NVDA): the check reads the live regions' text, not what
  is spoken.
- Pointer-only actions (drag and drop) and touch.
- axe-core finds about a third of WCAG problems; colour contrast it can only judge where the
  colours are plain.
