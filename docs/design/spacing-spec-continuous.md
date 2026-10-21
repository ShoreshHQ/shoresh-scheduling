# Spacing rules: Manual Build, "continuous" mock-up (round 11)

The mock-up is `continuous.html` (render: `continuous.png`, 1440 x 900, Chrome). It starts from round 10 "system" and keeps its palette, its unit and its six steps. The rules sit as named values at the top of the HTML, so the screen and this page agree.

## One unit, six steps (unchanged)

The unit is the page width divided by 360: 4 px at 1440 wide, never below 3 or above 5.

| Step | Units | At 1440 wide |
|------|-------|--------------|
| s1 | 1 | 4 px |
| s2 | 2 | 8 px |
| s3 | 3 | 12 px |
| s4 | 4 | 16 px |
| s5 | 6 | 24 px |
| s6 | 8 | 32 px |

## The container: one piece

The rail, the grid and the drawer are three zones of one frame. They share one outer edge and one rounded corner (s3, 12 px). Between zones there is one thin line that runs the full width of the frame. The menu stays its own piece to the left, 12 px away, and its two thin lines (under the camp name, above "Setup changed") line up exactly with the frame's two dividers (measured: both at y = 108 and y = 807).

## Every zone has the same inset

Inside every zone, on every side: s3, 12 px. Measured in the render:

| Zone | Top | Bottom | Left | Right |
|------|-----|--------|------|-------|
| Rail | 12 | 12 | 12 | 12 |
| Grid | 12 | 12 | 12 | 12 |
| Drawer | 12 | 12 | 12 | 12 |

The rail is one item tall plus its inset: 12 + 32 + 12 = 56. The drawer is one tile plus its inset: 12 + 56 + 12 = 80.

## The grid

- Between every cell, across and down: s2, 8 px (measured: 8 everywhere, all six column gaps and all row gaps).
- Bunk-name row to the first row of cells: 8 px. Time column to the first column of cells: 8 px. The headers are one more row and one more column of the same grid, with the same gap.
- Rows: the bunk-name row is one item tall (32). Activity rows share the rest equally (106 each). Lunch and Assembly are short rows, 28 px (7 units): same cell style, less height, so the activities stay the focus.
- The drawer uses the same columns, so each tile sits exactly under its bunk (measured: 0 px offset).

### Headers (note 2)

**Choice: the headers sit on the grid's own surface with no lines at all, aligned exactly to the cell columns and rows, and set exactly like a resting rail item (13 px, regular, secondary colour).** Alignment does the job a line used to do, and the only lines left on the screen are the ones that separate zones and rail groups.

- Bunk names are centred over their column; the left and right edges of each header match its column to 0 px.
- Times sit 8 px in from the zone edge, the same 8 px every rail item uses inside itself, so a time, "To place" and the rail's first arrow all start on one vertical line (20 px from the frame edge).
- "To place / 7 left" in the drawer follows the same rule, with the number set like a rail total.

## The top rail (note 3)

### Why round 10's rail did not feel coherent

1. **Four kinds of thing, four looks.** Arrows were bare icons in narrower 24 px boxes; "Week 3" was plain bold text; Daily and Mon were raised pills; totals were plain text with numbers in a code font; Versions was a text dropdown; Publish was filled.
2. **"Selected" meant two things.** Edit was shown raised, the same look as the chosen view and day, so a menu looked like a choice that was switched on.
3. **Two typefaces on one line.** Numbers in the code font sat on a different x-height from the words beside them ("29/35 Placed"), and "/35" was a third style.
4. **Marks that did not match.** The "under" mark was a thin outline in grey; the "over" mark a solid black corner. Different weight, different colour.
5. **Grouping by space alone, with a spacer in the middle.** The 16 px between groups and the large free gap before the totals read as two different kinds of gap, so the eye could not tell where a group ended.
6. **Capitals were inconsistent**: "Placed", "Still needed", but "under", "over".

### The grammar

- **One item.** Every item is 32 px tall, 8 px side padding, 13 px Inter. Measured: one height (32), one size (13 px), one typeface (Inter), two weights (400, 500).
- **Two text styles.** At rest: regular, secondary colour. A value (Week 3, a number in a total): medium, primary colour. Nothing else.
- **One selected state.** Raised (light surface, fine edge, soft shadow). Used only for the current choice in a set: the view and the day. Menus (Edit, Versions) are never raised while closed.
- **One group separator.** A thin vertical line, 16 px tall, with 8 px on each side (measured 8 | 8 at all four). Items inside a group are 4 px apart. The only other break is the one free space that splits the rail into "what you look at and do" (left) and "where it stands and publishing" (right).
- **Menus** (Edit, Versions): word, then a 12 px chevron 4 px after it. Identical treatment.
- **Totals**: [mark] number word, each part 4 px apart: "29/35 placed", "6 still needed", "7 under", "1 over". The under and over marks are both 8 px, both in the text colour, the same 1.5 px weight; "over" is the same corner mark used on an over-booked cell.
- **Publish** is the single exception: filled green, 16 px side padding. Same height and type as everything else.

## How they relate

- Zone inset = gap between pieces = page margin = 12.
- Cell gap = header-to-cell gap = 8.
- Item gap inside a group : space each side of a group line = 4 : 8.
- The bunk-name row, every rail item and the menu rows are all 32 tall.
- Inner corners (8) are one step smaller than outer corners (12).

## Contrast

Measured on the render, every text element against its actual background: lowest is 6.39 : 1 (white text on the green Publish and "Update to match setup", and the green "1 left" on the picked-up tile). All secondary text, including the headers and times, is 7.28 : 1 or higher. Target was 4.5 : 1.

## Not changed

- The menu's section labels (CAMP, ACTIVITIES, SCHEDULES) are still in the small capital code font; it is the one type style left outside the grammar. Worth a look in the next round.
- The Edit menu is closed in this shot; its open state is unchanged from round 10.
