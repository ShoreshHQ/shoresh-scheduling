# Spacing rules: Manual Build, round 13 (full-width rail)

Mock-up: `manual-build.html` (`#a`, `#b`, `#hover-swim`, `#hold-archery`). Renders: `rail-a.png`, `rail-b.png`, `hover-swim.png`, `hold-archery.png` (1440 x 900, Chrome, via `_tools/render.js`). Everything in `round11/spacing-spec-continuous.md` still holds (unit, six steps, item grammar, palette). This page only adds what changed.

## 1. "Under" means one thing

The drawer's label is now "7 under", set like a rail total (number medium, word regular), the same words as the counter's dropdown ("7 under"). Each tile says "1 under" / "1 over" instead of "1 left". The 7 is computed from the same goals as the counter, so the two can never disagree.

## 2. The rail uses the full width

### The anchor: the grid's cells, not the page

The day group (Mon to Fri) is centred on the seven bunk columns. The times column (96) plus its gap (8) sits to the left of the cells, so the cells' centre is 52 px right of the rail's centre.

How it's built, with no measuring script: the rail is three parts, Left | Centre | Right. Left and Right share the leftover width equally, but Left starts with a head start equal to the times column plus its gap (`--offset = head-w + cell-gap`, 104 at 1440). That puts the centre exactly over the cells at every width. Measured: cells' centre 882.0, day group's centre 882.0, in all four renders.

### Who goes where

| Part | Holds |
|------|-------|
| Left | Week (at the left edge, 12 in) · Edit · Views (Daily / Group / Activity), sitting against the days with the normal 8 \| 8 group line |
| Centre | Days, centred on the cells |
| Right | Counter · Versions · Publish (Publish at the right edge, 12 in) |

Views sit beside the days, not inside the centred group. Measured reason: with Views + Days centred on the cells (about 500 wide), the right part is only about 296 wide, which cannot hold the counter, Versions and Publish (about 345). Centring the days alone gives the right part about 416 and nothing collides. Views still read as one unit with the days because only the normal 8 | 8 group line separates them.

### Arrangement A: even gaps

Inside each side, every gap is equal (`space-between`), and the group lines are items too, so each line sits exactly halfway across its gap. The gap grows with the width; nothing is a fixed number except the 12 margin at each end.

- At 1440: left gaps 38, right gaps 19.3. They differ because the left side has more free room; each side is even within itself.

### Arrangement B: three zones

Each zone keeps the round 11 grammar inside it (4 between items, 8 | 8 around a group line). Zones are pinned: Left zone (Week | Edit) to the left edge, Views + Days with days on the cells' centre, Right zone (counter | Versions Publish) to the right edge. All free space falls into the two gaps between zones, and those grow with the width.

- At 1440: free gaps about 137 (left) and 93 (right).

## 3. Same-activity outline

- **When:** hovering a grid cell outlines every other cell with the same activity. Hovering (holding) a drawer tile outlines every cell with that activity and shows the dashed "fits here" on empty slots in periods where it is not already running.
- **Look:** 1.5 px solid line in the highlight green at 45 % strength, 1 px outside the cell, no fill.
- **Why it doesn't compete:** selection is 2 px, full-strength green, same position; the outline is thinner and paler. "Fits here" is dashed, inside the slot, and only on empty slots; the outline is solid, outside, and only on filled cells. The two never land on the same cell.
- The hovered cell itself only shifts a half step darker (normal hover).

## Contrast

Lowest text contrast measured in every render: 6.39 : 1 (white on green Publish / "Update to match setup", and the green "1 under" on the held tile). Target 4.5 : 1.
