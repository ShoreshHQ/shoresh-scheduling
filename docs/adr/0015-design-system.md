# 0015: The design system

Status: proposed (2026-10-21), design build step 1 of several (the foundation). Design source:
Greg's decisions 28 to 40 in wiki `projects/shoresh-scheduling-sf.md` (approved 2026-10-21, "let's
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
2. **Three colours, including the text** (decisions 35 and 40). One primary family, sage-greige,
   in tonal steps `--shoresh-color-primary-50` (`#F6F8F5`, the lightest) to
   `--shoresh-color-primary-500` (`#AEB6A7`, the primary as chosen by eye), with one deeper step,
   `-700` (`#808D74`), that every shadow is made of. One highlight, forest `#1F6651`
   (`--shoresh-color-highlight`), with a deeper tint for hover and pressed (`-press`, `#18503F`).
   And the text, `#26231B` (`--shoresh-color-text`). **The rule:** nothing else is a colour. The
   old "accent" `#F6F8F5` is not a fourth colour but the primary's lightest step, so there is no
   accent token; a new shade is a new step of the primary (gradients between its steps are
   allowed), a state of the highlight is a tint of it, and secondary words are a tint of the
   text. Surfaces and other roles name a step rather than a value: page `-100` (`#F3F5F2`), hover
   `-150` (`#F1F3EF`), shelf `-200` (`#EFF1EE`), grid `-250` (`#EBEDE9`), drawer `-300`
   (`#E6E9E4`), edge and hairline `-400` (`#D8DCD4`), shade `-700`; secondary words are `#504F47`
   (78% text on the drawer step). The steps are written out, not computed with `color-mix()`, so
   every browser shows the same colour (same inputs, same output). Every pair of words and
   surface the system allows reads at 4.5:1 or better (the lowest is the highlight on the drawer
   step); a test checks each pair, that only these three colours are defined and that the
   primary's steps darken in order.
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
5. **The one raised treatment is a class, `.shoresh-raised`** (decision 34): the primary's lightest step,
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
   module: brand buttons are the highlight with words in the primary's lightest step, neutral buttons
   that step with the edge, buttons and inputs get the 8 px corner, inputs a highlight focus edge, checkboxes and the
   spinner the highlight. SLDS 2's accent and link hooks are set to the highlight too, not the
   deprecated `--lwc-*` tokens (Code Analyzer refuses them), and the checkbox's mark colour is left
   to Salesforce (SLDS 2 has no hook for it). Field errors keep Salesforce's red, but at its SLDS 2
   value (#b60554) in both themes' error hooks: on the shelf, SLDS 1's #ea001e reads only 4.09:1,
   below WCAG's 4.5:1, while #b60554 reads 5.89:1. It is Salesforce's colour for a refusal, not a
   fourth Shoresh colour. Only Shoresh's own page changes;
   the rest of Salesforce keeps its look.
8. **The frame and the menu, as the mock-up draws them.** The page is the page surface with a
   12 margin. The menu is its own piece, 208 wide, 12 from the frame. Its top row is the camp's
   name (14 px, 600) and the season shown (secondary), then a full-width hairline, Roots with its
   sprout, and the sections with their titles in small mono capitals. Every row is one item tall
   (32); words at rest are secondary, the screen shown is raised and in the value style, and
   entries under a section title sit in from it with a highlight dot beside the one shown.
   Entries not built yet or needing a season stay, quieter, with their words for screen readers
   (unchanged). The desktop's marks stay (`!` Needed in the text colour, `✓` Done in the
   highlight): bronze is not one of the three colours. The frame is one piece: the season row on
   top (the season picker, its pencil, New season, Copy season), one hairline, then the screen.
   The pickers' visible labels are gone (their names are still read out): the picker shows the
   season, so the word "Season" over it explained nothing. The row is one item tall plus its
   inset, so its hairline meets the menu's under the camp name.
9. **"Setup changed" at the foot of the menu** (rounds 11 to 13). While the schedule shown can be
   updated to match setup, the menu's foot shows _Setup changed_ and a raised **Update to match
   setup**, the same action as the button above that screen's grid (ADR 0008 part 6 §10). Only
   Manual Build and Generated Schedule have it, and each says so only for itself.
10. **Checked by** `shoreshTokens.test.js` (only the three colours, exact, the primary's steps in order, the surfaces, the steps, every
    allowed pair of words and surface at 4.5:1, the error hooks on every surface at 4.5:1, the button hooks), `shoreshLock.test.js` (one
    padlock, hidden unless it has words, accessible), `shoreshMenu.test.js` (the camp row, one
    raised entry, Roots' sprout, the foot and its Update, held while busy, accessible),
    `shoreshCampSetup.test.js` (the fonts load once, the font files and licences are there and
    named only from inside the resource, the camp row's words, the foot follows the screen shown)
    and both screens' `setupMatch.test.js` (they tell the page, once per change, and the menu's
    Update opens the same list). In the test org, a real-browser check: screenshots next to the
    mock-up (`docs/design/screens/`), contrast and focus, and the full keyboard and axe check
    (`scripts/a11y-browser-check.mjs`), which also blanks the season's name and measures the
    field error it shows against the shelf behind it.

## Not done here

- Manual Build's and Generated Schedule's grid and drawer (design step 2b), then the setup
  screens. Their rail, Edit and counter are built (step 2a, ADR 0008 part 7), with the rail's
  grammar as classes here (`.shoresh-item`, `.shoresh-pop` and its rows, `.shoresh-rail-line`,
  `.shoresh-chevron`).
- ~~The line above each schedule's grid still has its own Update to match setup.~~ Gone in step
  2a: Update to match setup is only at the menu's foot, and focus returns there when the list
  closes (ADR 0008 part 7 §9).
- The earlier colour tokens are removed once no screen uses them.
