# The visual spec

These files are the approved design for Shoresh Scheduling (Greg, 2026-10-21, wiki
`projects/shoresh-scheduling-sf.md` decisions 28 to 39: "round 13 with rail layout B"). Every
screen is built to look like them. They are copied unchanged from the design research
(`~/Dev/Shoresh/design-research`, rounds 11 and 13); change them only with a new decision from
Greg.

| File                         | What it is                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual-build.html`          | The round 13 mock-up of Manual Build, open it in a browser. `#b` is the approved rail (three zones); `#a`, `#hover-swim`, `#hold-archery` and `#open` show the other states. It names its rules as CSS variables at the top.                                              |
| `spacing-spec.md`            | Round 13's rules: "under" everywhere, the full-width rail centred on the grid's cells, the same-activity outline.                                                                                                                                                         |
| `spacing-spec-continuous.md` | Round 11's rules, which round 13 keeps: one unit and six steps, the one-frame container, every zone's inset, the grid, and the rail's grammar (one item, two text styles, one selected state, one group line). The mock-up calls it `round11/spacing-spec-continuous.md`. |
| `rail-b.png`                 | The approved layout, rendered at 1440 by 900 in Chrome.                                                                                                                                                                                                                   |
| `rail-a.png`                 | The alternative rail (even gaps), not chosen.                                                                                                                                                                                                                             |
| `hover-swim.png`             | Hovering a cell: every other Swim outlined.                                                                                                                                                                                                                               |
| `hold-archery.png`           | Holding a drawer tile: Archery outlined, dashed "fits here" on the empty slots.                                                                                                                                                                                           |
| `setup/`                     | The setup screens' mock-ups (Greg, 2026-10-21, decision 42; `design-research/setup-r1`): `groups`, `locations`, `activities` and `fixed`, each as `.html` and its 1440 by 900 `.png`. The shared table pattern they share is ADR 0015 choice 11.                          |
| `screens/`                   | Screenshots of the built screens in the test org, next to the mock-up, from each design PR.                                                                                                                                                                               |

How the spec becomes code: `docs/adr/0015-design-system.md`. The values live in
`force-app/main/default/lwc/shoreshTokens/shoreshTokens.css`.
