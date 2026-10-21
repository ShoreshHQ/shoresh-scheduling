# 0015: The design system

Status: proposed (2026-10-21), design build step 1 of several (the foundation). Design source:
Greg's decisions 28 to 40 in wiki `projects/shoresh-scheduling-sf.md` (approved 2026-10-21, "let's
do it"), and the visual spec in `docs/design/` (round 13 mock-up `manual-build.html` with
`spacing-spec.md`, and round 11's `spacing-spec-continuous.md` for the rail's grammar). The
desktop is the floor for meaning and words (decision 28); the look is the mock-up's.

This step puts the system in place and restyles only the app frame and the left menu. Manual
Build's and Generated Schedule's grids, rails and drawers, and the setup screens, keep their look
until the next PRs; nothing a director does works differently. _Step 3a (2026-10-21, choice 11)
restyles the setup tables and five setup screens; step 3b the rest (see Not done here)._

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

11. **The setup screens' shared table pattern (step 3a, 2026-10-21).** Design source: Greg's
    approved mock-ups `docs/design/setup/` (groups, locations, activities, fixed; copied unchanged
    from `design-research/setup-r1`) and decisions 26, 28-42 (42: one shared table language).
    One pattern, in `c/shoreshEditableTable`, so every setup table takes it at once (Weeks, Age
    divisions, Groups, Time blocks, Locations and their types, Activities, Fixed and Recurring
    activities):
    - **Rows sit raised**, one under another a fine gap apart, in the one raised treatment
      (lightest step, fine edge, soft shade), a half step darker under the pointer or while
      edited, as a grid cell. Their fields read as words at rest: a field's edge, its chevron,
      clock or calendar show only while the row is pointed at or edited. Salesforce's fields
      keep their insides out of a component's reach, so the page loads one small stylesheet,
      static resource `ShoreshTable` (as `ShoreshDateBox`, ADR 0013 choice 24), that reaches
      only fields in cells Shoresh marks `shoresh-cell`, keeps the highlight edge on the field
      with the cursor and Salesforce's error edge on a refused one. Without it the fields show
      as boxes and everything still works.
    - **A section's heading, never a repeated column.** Each division's groups, each location
      type's places, and (with more than one program) each program's tables are a section
      headed by its name and its count ("Juniors 3"; read "Juniors, 3"). The column names show
      once, above the first section, and are read out with every cell of the others. Moving a
      group to another division, and a place's type and notes, are the row's **details**, not
      columns: the chevron at the row's end opens them under the row (`aria-expanded`, named
      "Cedar details"), saved with the row as before (leaving the row and its details saves).
    - **Names with room.** The table is laid out at fixed widths per kind of column; the name
      (and words such as "Activities held here") share what is left. Nothing scrolls sideways
      at 1280 to 1440 on these screens; a table with more columns than fit (Activities,
      Recurring activities, until step 3b) scrolls inside itself, never the page.
    - **The weeks as the exception.** One Weeks column replaces the column of ticks per week:
      at rest it says "Every week" (quiet) or the exception as a value ("Off Wk 3", "Off Wks
      1-2, 4", "No weeks"; a place "Closed Wk 5"; a camp with its own word for weeks uses it,
      "Off Session 3"), numbered by the week's place in the season. While the row is pointed at
      or edited, a fine strip of the weeks takes its place, one numbered tick each (a real
      checkbox, still named "Cedar runs in Week 3"; on is a highlight tint, off an empty slot,
      the grid's own two states). Tab reaches them while the row has the cursor; they save the
      moment they are clicked, and still ask first when the week has placements. While that
      question is open the row keeps its strip shown (the question covers the row and holds
      focus), so answering it puts focus back on the tick (WCAG 2.4.3), as before.
    - **A clearly dashed blank row** at the end of each section, no fill and no raise, with a
      - before its name box ("Add Bunk"); Enter, + Add or leaving it filled in adds it, as
        before (ADR 0011 choice 2).
    - **The row's end**: its delete and its details chevron, faded in only under the pointer or
      while the row is edited (faded, never hidden, so Tab still reaches them).
    - **Words that are worked out**, never typed (a place's "Activities held here", from the
      activities held there), are a read-only column (`type: "readonly"`), never sent.

    Each of Weeks, Age divisions, Groups, Time blocks and Locations is then a screen in the
    rail grammar of steps 2a/2b: a **rail** (the count in the camp's words, "10 groups"; on
    the right a quiet **✓ Saved**, a rail line, and **Import a list** and **Download this
    list** as rail items), one hairline, then the list, centred at 880 (Locations full width),
    ending with the **next screen's button**. The screen's name is read out, not shown (the
    menu shows it), as on Manual Build. Saved shows once a row of that screen is saved and goes
    while the next is on its way; the table already says each save ("Cedar saved"), so the
    rail's mark is silent (`c-shoresh-saved-mark` `silent`), and it is never shown for a save
    someone else's change stopped. Import a list, opened, takes the rail's width under its
    items. Locations' old **Show** list is the rail's type choices (All, each type, and "No
    location type" while a place has none), centred, the chosen one raised and pressed; the
    types themselves are a section of their own under the places.
    Checked by `shoreshEditableTable.test.js` ("the shared table pattern"), `shoreshProgram`,
    `shoreshCampSetup` ("setup screens in the shared table pattern", the `ShoreshTable` style
    reaching only marked cells), `shoreshSavedMark` and `shoreshListImport` tests, and in the
    test org by `scripts/a11y-browser-check.mjs` (a group's week ticks reached by Tab while it
    is edited, its details opened from the chevron with focus kept, axe on each screen) with
    screenshots next to the mock-ups in `docs/design/screens/` (`setup-*.png`).

## Not done here

- The setup screens. Manual Build's and Generated Schedule's rail, Edit and counter are built
  (step 2a, ADR 0008 part 7), with the rail's grammar as classes here (`.shoresh-item`,
  `.shoresh-pop` and its rows, `.shoresh-rail-line`, `.shoresh-chevron`), and their grid and
  drawer (step 2b, ADR 0008 part 8), with the needs-a-look corner on cells (`c-shoresh-dot`
  shape `corner`).
- ~~The line above each schedule's grid still has its own Update to match setup.~~ Gone in step
  2a: Update to match setup is only at the menu's foot, and focus returns there when the list
  closes (ADR 0008 part 7 §9).
- Step 3b (the setup screens' second part): Activities' "how often" bars at rest (decision 42) and its details panel on the right, Fixed activities and Recurring activities laid out
  as their mock-ups (each in the shared table language, still separate screens), and the camp
  and season pickers, with New season and Copy this season, moved into the menu's camp row.
  Until then those three screens take the shared rows (raised, weeks in words, dashed blank
  row) inside their earlier layout, and the season row stays above the rail.
- The earlier colour tokens are removed once no screen uses them.
