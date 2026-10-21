# 0015: The design system

Status: proposed (2026-10-21), design build step 1 of several (the foundation). Design source:
Greg's decisions 28 to 39 in wiki `projects/shoresh-scheduling-sf.md` (approved 2026-10-21, "let's
do it"), and the visual spec in `docs/design/` (round 13 mock-up `manual-build.html` with
`spacing-spec.md`, and round 11's `spacing-spec-continuous.md` for the rail's grammar). The
desktop is the floor for meaning and words (decision 28); the look is the mock-up's.

This step puts the system in place and restyles only the app frame and the left menu. Manual
Build's and Generated Schedule's grids, rails and drawers, and the setup screens, keep their look
until the next PRs; nothing a director does works differently.

## Choices

1. **One shared module, `c/shoreshTokens`.** Every Shoresh component already imports it
   (`@import "c/shoreshTokens";`), so the system reaches every screen without a new import. It
   holds the values as CSS custom properties on `:host`, and four classes (below). The earlier
   colours (navy, forest, bronze, slate) stay in it, marked as earlier, until the last screen
   moves off them; nothing new uses them.
2. **Four colours, exactly as chosen by eye** (decision 35): primary `#AEB6A7`, accent
   `#F6F8F5`, text `#26231B`, highlight `#1F6651`. Surfaces are 0.5x tonal steps of the primary:
   page `#F3F5F2`, shelf `#EFF1EE`, grid `#EBEDE9`, drawer `#E6E9E4`. The mock-up's derived steps
   are named too: hover `#F1F3EF` (accent half-way to grid), edge and hairline `#D8DCD4`, shade
   `#808D74` (every shadow is made of it), and secondary words `#504F47` (78% text on the drawer
   step). The derived values are written out, not computed with `color-mix()`, so every browser
   shows the same colour (same inputs, same output). Every pair of words and surface the system
   allows reads at 4.5:1 or better (the lowest is the highlight on the drawer step); a test checks
   each pair.
3. **One unit, six steps, named roles** (spacing-spec-continuous.md). The unit is the page width
   divided by 360, between 3 and 5 px (4 px at 1440 wide); steps are 1, 2, 3, 4, 6 and 8 units.
   Components use the roles, not the steps, where a role exists: word gap, in-group gap, group
   side, control padding, control height (32 at 1440), page margin, gutter, zone inset, cell gap,
   short row, tile height, header column, menu width (208), and the two corners (12 for a piece,
   8 for an item).
4. **Type: Inter, then the system font.** Inter 400, 500 and 600 (Latin and Latin Extended) and
   JetBrains Mono 400 and 500 (Latin) ship as woff2 files in the `ShoreshFonts` static resource,
   from Fontsource 5.2.8, unchanged, with their SIL Open Font License 1.1 texts beside them (and
   in `docs/licenses/`, named in `NOTICE`). No font CDN: Lightning's Content Security Policy
   allows fonts from the org itself, and a static resource is served from the org. The camp setup
   page loads `fonts.css` once with `loadStyle` (as it loads the date box style); `@font-face` is
   document-wide, so every component can name the families. `font-display: swap`: words show at
   once in the system font, and a page that can't load the fonts still works. 13 px body,
   14 px for the camp name, 11 px for the menu's section titles. Numbers that must line up use
   tabular numerals (`.shoresh-num`). One mono, JetBrains Mono, for times and section titles.
5. **The one raised treatment is a class, `.shoresh-raised`** (decision 34): the accent surface,
   a fine edge and a soft shadow, all made of the shade. It marks the current choice only: the
   menu's screen shown now, later the chosen view and day, a held tile and a grid cell. A menu
   that is closed, a form or a panel is never raised. Keyboard focus is a separate 2 px highlight
   ring outside the item, so it can never be mistaken for the raised one.
6. **Shared marks.** The hairline (`.shoresh-hairline`, 1 px of the edge colour) is the one line
   that divides zones and pieces. The needs-a-look mark (`.shoresh-look-mark`) is the mock-up's
   8 px solid corner in the text colour, for a cell's corner and beside a count. The lock is a
   component, `c-shoresh-lock`: the mock-up's 12 px padlock in the colour of the words around it,
   with optional words for screen readers ("Locked empty"). The grids start using the mark and the
   lock when they are restyled.
7. **Salesforce's base components take the palette through SLDS styling hooks**, set in the same
   module: brand buttons are the highlight with accent words, neutral buttons the accent with the
   edge, buttons and inputs get the 8 px corner, inputs a highlight focus edge, checkboxes and the
   spinner the highlight. The older `--lwc-brand*` and link tokens are set to the highlight too,
   for the parts of the base components that still read them. Only Shoresh's own page changes;
   the rest of Salesforce keeps its look.
8. **The frame and the menu, as the mock-up draws them.** The page is the page surface with a
   12 margin. The menu is its own piece, 208 wide, 12 from the frame. Its top row is the camp's
   name (14 px, 600) and the season shown (secondary), then a full-width hairline, Roots with its
   sprout, and the sections with their titles in small mono capitals. Every row is one item tall
   (32); words at rest are secondary, the screen shown is raised and in the value style, and
   entries under a section title sit in from it with a highlight dot beside the one shown.
   Entries not built yet or needing a season stay, quieter, with their words for screen readers
   (unchanged). The desktop's marks stay (`!` Needed in the text colour, `✓` Done in the
   highlight): bronze is not one of the four colours. The frame is one piece: the season row on
   top (the season picker, its pencil, New season, Copy season), one hairline, then the screen.
   The pickers' visible labels are gone (their names are still read out): the picker shows the
   season, so the word "Season" over it explained nothing. The row is one item tall plus its
   inset, so its hairline meets the menu's under the camp name.
9. **"Setup changed" at the foot of the menu** (rounds 11 to 13). While the schedule shown can be
   updated to match setup, the menu's foot shows _Setup changed_ and a raised **Update to match
   setup**, the same action as the button above that screen's grid (ADR 0008 part 6 §10). Only
   Manual Build and Generated Schedule have it, and each says so only for itself.
10. **Checked by** `shoreshTokens.test.js` (the four colours exact, the surfaces, the steps, every
    allowed pair of words and surface at 4.5:1, the button hooks), `shoreshLock.test.js` (one
    padlock, hidden unless it has words, accessible), `shoreshMenu.test.js` (the camp row, one
    raised entry, Roots' sprout, the foot and its Update, held while busy, accessible),
    `shoreshCampSetup.test.js` (the fonts load once, the font files and licences are there and
    named only from inside the resource, the camp row's words, the foot follows the screen shown)
    and both screens' `setupMatch.test.js` (they tell the page, once per change, and the menu's
    Update opens the same list). In the test org, a real-browser check: screenshots next to the
    mock-up (`docs/design/screens/`), contrast and focus, and the full keyboard and axe check
    (`scripts/a11y-browser-check.mjs`).

## Not done here

- Manual Build's and Generated Schedule's rail, grid and drawer (the next PR), then the setup
  screens. Until then they sit inside the new frame in their old look, with the new button
  colours.
- The line above each schedule's grid still has its own Update to match setup, and focus returns
  there when the list closes. It goes when the rail is rebuilt, and focus then returns to the
  menu's.
- The earlier colour tokens are removed once no screen uses them.
