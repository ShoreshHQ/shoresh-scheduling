# 0015: The design system

Status: proposed (2026-10-21), design build step 1 of several (the foundation). Design source:
Greg's decisions 28 to 40 in wiki `projects/shoresh-scheduling-sf.md` (approved 2026-10-21, "let's
do it"), and the visual spec in `docs/design/` (round 13 mock-up `manual-build.html` with
`spacing-spec.md`, and round 11's `spacing-spec-continuous.md` for the rail's grammar). The
desktop is the floor for meaning and words (decision 28); the look is the mock-up's.

This step puts the system in place and restyles only the app frame and the left menu. Manual
Build's and Generated Schedule's grids, rails and drawers, and the setup screens, keep their look
until the next PRs; nothing a director does works differently. _Step 3a (2026-10-21, choice 11)
restyles the setup tables and five setup screens; step 3b (2026-10-21, choice 12) Activities,
Fixed and Recurring activities, and the camp and season in the menu's camp row. Choice 13
(2026-10-22) adds the living dot field behind Roots and around empty states. Choice 14
(2026-10-23) restyles Copy season, Camp words and Programs._

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
   lock when they are restyled. _On every schedule grid (Greg, 2026-10-22):_ a locked cell's lock
   is this padlock in the cell's **bottom-right corner** (6 px in), in the colour of the cell's
   words, and the lock draws no border or outline of its own. The top-right corner is the
   needs-a-look mark's, and the special event flag (decision 47.3) sits before the event's name
   on the left, so all three show at once without touching: the words keep 18 px clear above and
   below on a locked cell. A placement locked over several blocks shows it once, on its last
   block (the one cell spanning them); a cell locked empty shows only the padlock. Screen readers
   still hear "Locked" (or "Locked empty") before the name. In high contrast (forced colours) the
   padlock and the mark are drawn in the system's text colour. A fixed or recurring activity
   keeps its lock before its name (the round 13 mock-up). Checked by `shoreshScheduleGrid.test.js`
   (the padlock once on a two-block cell, before the name for screen readers, the corners, no
   edge) and the real-browser check (the padlock inside the bottom-right corner, no edge, clear of
   the name and the mark).
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
   inset, so its hairline meets the menu's under the camp name. _Changed in step 3b (choice
   12): the season row is gone; the pickers are the menu's camp row, and the frame is the screen
   alone._
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
      A row whose save moves it to another section (a place given another type, Enter in its
      notes; a group given another division; a recurring activity covering other divisions)
      takes the cursor with it: the same box in its new section, its details open again,
      and the move is said ("Pool moved to Fields"), so focus never drops to the top of the page
      (WCAG 2.4.3). When the rail shows only the old type, the cursor goes to that section's
      blank row instead, with the same words. Until it is saved the row stays where it is.
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
    is edited, its details opened from the chevron with focus kept, a place moved to another
    type with the cursor following it, axe on each screen) with
    screenshots next to the mock-ups in `docs/design/screens/` (`setup-*.png`).

12. **The setup screens' second part (step 3b, 2026-10-21).** Design source: the same approved
    mock-ups (`docs/design/setup/activities.html`, `fixed.html`) and decision 42. Every
    behaviour, refusal, question and keyboard path stays; what moves is said here.
    - **Activities** is the shared table with the mock-up's five columns: **Activity**,
      **Location**, **How often**, **Who** and **Weeks**, with the rail of the other setup
      screens (the count, a silent Saved, Import a list and Download this list).
      **How often** shows one thing at a time (decision 42): at rest, one bar per time a week,
      on one scale for the whole camp, its highest weekly count (never capped at five; a count
      past it stretches it), at least filled in the highlight, up to at most in its tint, "no
      weekly maximum" tinted to the end; read out as "How often: 2–3". Under the pointer or
      while the row is edited the two numbers (at least, at most) take the bars' place, the
      row's own fields, saved with the row as before. **Who** is worked out from who can do it:
      a quiet "Everyone", or the divisions and groups as a value. The other fields (length,
      groups at once and No limit, priority, outdoors, rain plan, no weekly maximum) left the
      table: they are in the activity's **details**, which now open **beside the table**, in a
      zone of the frame one hairline from the list (the mock-up's, 288 wide at 1440 rather than
      its 384, so the five columns keep their room; the weeks' strip wraps sooner there),
      sliding in from the row's
      side (no motion with reduced motion). The row's end has a chevron (named "Archery
      details", `aria-expanded`), as every setup row; the open row carries the 2 px selection
      line. Opening puts the cursor on the panel's heading (the activity's name, read "Archery
      details"); its × ("Close Archery details") puts it back on the chevron. The panel holds
      rain plan, bunks together (Any bunks / Same division, one choice of two: the "same
      division only" tick it was), early in the week, who can do it, length and priority,
      groups at once and No limit, outdoors and no weekly maximum, then notes. They save as
      the details always have (ADR 0013 choice 1): a choice at once, a number on leaving it or
      Enter. The fields that were columns keep the table's compare and set (ADR 0011 choice
      5): each is sent alone through `SetupTablesController.saveRow` with what it held when
      the director saw it, and if someone else changed it since, nothing is saved and the
      panel asks the tables' question (**Changed by someone else**, Theirs and Yours, **Keep
      theirs** or **Use yours**). They never fall back to a form's last save wins (ADR 0013
      Known limits). The rules and who can do it still go through `ActivityDetails`.
    - **Activities are grouped by priority** (wiki decision 45, 2026-10-22; the desktop's
      `ActivitiesScreen.jsx`, "High Priority" then "Low Priority"): two sections, **High
      priority** then **Low priority**, each headed with its count, the column names above the
      first. A blank priority is Low (ADR 0002 choice 10). As Recurring activities' sections,
      each is a table over every activity showing its own (`rowFilter`), so same-name dots
      compare across both, and its blank row starts in its priority. As on the desktop, High
      shows only while it holds an activity. Low always shows, even when every activity is
      High: new activities start Low (Greg, 2026-10-16), so its blank row is where they are
      added; the desktop's Add opens a form instead, so it needs no empty section. With no
      activities at all there is no heading, only "No activities yet". Priority stays in the
      details (it is not a column): changing it there moves the row to the other section once
      it is saved and the season read again, its row still carrying the selection line and the
      cursor kept on Priority in the panel; Close puts the cursor on the row's chevron in the
      section it is in now.
    - **Fixed activities and Recurring activities stay separate screens** (decision 42), each
      with the rail and in the shared table language. Fixed activities are one section headed
      **Whole camp** (with several programs, the program's name), columns Name, the time block
      and Weeks. Recurring activities are in sections: **Whole camp** (covering everyone in the
      program), then one per division (an item covering that division or some of its groups),
      then **More than one division** while an item covers several. Each section is a table
      over every row, showing its own (`rowFilter`), so same-name dots and the order are the
      program's; its blank row starts covering that division (`newRowWho`). Columns: Name,
      **Who**, the time block, **Days** and Weeks. Defaults read quietly, exceptions stand out:
      covering the whole section is "Every bunk" (`whoRule`), fewer is the names; every day the
      program runs is "Every day", otherwise the days it runs ("Mon Wed Fri") or the one it
      skips ("Off Fri"). Under the pointer or while the row is edited, a tick per day takes the
      words' place (each still named "Monday"), saved with the row as the day columns were;
      Change for who fades in with the row's tools. Length and location are the row's
      **details**, from its chevron, saved with the row. **Needs attention** shows only while a
      row needs it. An item whose who moves it to another section takes the cursor along to
      the same control there, the move said ("Swim moved to Seniors"), as a place whose type
      changes (choice 11). A table now takes who a reload brings unless the director changed it
      there and it is not saved yet, so a section that never touched the row shows another
      section's change.
    - **"Turn off … for Week 1?" gives focus back to the tick itself** (found by the real-browser
      check in this step): the page could not reach the tick inside the table (in Salesforce a
      component can't look into another's), so after Cancel focus fell to the page; and a
      redraw while the question was open (the page is busy while it looks for placements)
      dropped the row's mark that keeps its strip shown. The table now keeps that mark across
      redraws and puts focus back on the tick when the question is answered.
    - **Bare icon buttons are the design system's tools**: the season's pencil, the details'
      × and a row's trash can were Salesforce's bare icon buttons, drawn in its blue. They are
      now the rail's square item (`shoresh-item shoresh-item_icon`) with a 16 px stroked
      glyph: the secondary words' colour at rest, the highlight under the pointer and with
      keyboard focus (`shoresh-item_tool`), and the focus ring. No new hue. The details
      panel writes the item out (`.panel-close`) rather than importing `c/shoreshTokens`
      again. Jest's jsdom keeps 1000 compiled selectors and the setup page now holds about
      that many, so `jest/selector-cache.js` gives it room for 10000 (matching unchanged);
      without it an axe check over a setup screen took over 5 s.
    - **The camp and season are the menu's camp row.** The old season row above the rail is
      gone; the frame is the screen alone. The camp row holds the camp's name (a picker that
      reads as the name while the director has several camps); under it the season picker,
      reading as the season's name, its pencil, and a small menu, **Season actions**
      (`c-shoresh-rail-pop`, a menu button: Enter or Down opens it on its first row, the arrows
      move, Escape closes it), with **New season** and **Copy this season**. The season's
      details open under them in the menu, next in tab order.
      New season and Copy this season keep their forms, refusals and questions; Cancel puts the
      cursor back on Season actions (the rows show only while the menu is open). Both rows wait
      while the page is busy.
      Checked by `shoreshEditableTable.test.js` ("step 3b's columns": the bars and their scale, the
      numbers saved with the row and named in the question, days in words and ticks, worked-out
      words quiet unless an exception, sections by rowFilter, whoRule and newRowWho, another
      section's who taken on reload), `shoreshActivityDetails.test.js` ("the panel beside the
      table"; "someone else changed the field since it was shown"), `shoreshProgram.test.js` (Whole camp, the division sections, the cursor following
      a moved item), `shoreshCampSetup.test.js` ("setup screens, step 3b": the rails, how often's
      scale, the panel's saves, the camp row, activities grouped by priority and a row moved by
      its priority) and in the test org by
      `scripts/a11y-browser-check.mjs` (how often's numbers and a recurring row's day ticks
      reached by Tab while the row is edited, the details opened from the chevron with focus on
      their heading and back on Close, an activity moved to the other priority's section and back
      with the cursor kept on Priority and Close finding its chevron there, New season and Copy this season from Season actions, axe
      on each screen), with screenshots next to the mock-ups in `docs/design/screens/`.

13. **The living dot field (wiki decision 49, 2026-10-22).** Design source: Greg's decision 49
    and the approved proof of concept (`design-research/antimetal/poc.html`). One component,
    `c-shoresh-dot-field`, wraps what it decorates: a faint field of dots in the primary
    (`-500`, sage) every 18 px, showing at the field's edges and fading out a fifth of the way
    in, drawn on one canvas behind its content. Dots within 90 px of a moving mouse glow: they
    grow and take on up to 60% of the highlight (forest), then settle back to rest (their glow
    falls by e every half second). Both colours are read from `c/shoreshTokens` on the page.
    - **Where:** behind Roots, and around every empty state (`c-shoresh-empty-state`, so every
      screen that has nothing to show yet). Never behind a schedule grid: an empty state takes
      the grid's place, it is never shown with it. Salesforce's sign-in page is its own and a
      package cannot change it, so the field is not there (decision 49).
    - **Decoration only.** The canvas is `aria-hidden`, takes no focus and no clicks, and says
      nothing. **No dot is drawn under words or a control:** the field measures the words (each
      run of text), pictures, form controls and inner components put inside it and keeps 6 px
      clear of each, measured again when its size changes, its content changes or the page
      scrolls (a sticky list moves over it). So it never changes how anything reads; a glowing
      dot under grey words would fail WCAG AA, which is why measuring, not a fainter dot, is
      the rule.
    - **Motion only when wanted.** With reduced motion asked for, or on a touch screen (no
      mouse that hovers), the field is drawn once, still, and never follows a pointer; touch
      and pen pointers are ignored everywhere. Turning reduced motion on stops it at once.
      Where a browser can't say whether motion is wanted, nothing is drawn.
    - **Cheap.** No frames while the mouse is still; a frame is asked for only while a dot
      glows, one at a time however fast the mouse moves. It stops while off screen
      (IntersectionObserver) and while the browser tab is hidden. Rest dots are filled in eight
      steps of fade, one fill each; the canvas is at most twice the screen's pixel density.
      Everything is let go when the component is removed (Lightning keeps tabs alive).
    - **Lightning Web Security:** a 2D canvas, `requestAnimationFrame`, observers and media
      queries, all on the component's own elements or the window; no library, no `innerHTML`,
      nothing loaded. `requestAnimationFrame` is the browser's clock for drawing, not a timer:
      the LWC rule against timers is turned off for this one file in `eslint.config.js` and
      suppressed for it alone (one use) in `code-analyzer.yml`, since inline disables are
      refused.
    - Checked by `shoreshDotField.test.js` (decoration only and accessible; drawn once and no
      frames at rest; glows toward forest near a mouse and settles; one frame at a time; still
      for reduced motion, also when turned on while glowing; still on touch and deaf to touch
      and pen; paused off screen and in a hidden tab; lets go when removed; nothing without
      media queries; no dot under the words or the picture of an empty state; the same field
      for the same box; colours equal to the tokens), `shoreshRoots.test.js` and
      `shoreshEmptyState.test.js` (each sits on the field), and in the test org by
      `scripts/a11y-browser-check.mjs` (on Roots: drawn and hidden from screen readers, glows
      under a moving mouse and is the same picture again four seconds later, still under the
      mouse with reduced motion emulated, no Shoresh errors in the console).

14. **Copy season, Camp words and Programs (wiki decision 56, 2026-10-23).** Design source:
    the approved mock-ups in `design-research/screens-r1` (`copy-season-a.png`,
    `camp-words-b.png`, `programs.png`). Each is a setup screen in the frame: a rail, the
    hairline, then the screen (the frame's body is flush for all three, as for the other setup
    screens). No new colour, no new token.
    - **Copy season is a page** (A, not a pop-up): the rail holds "Copy season" with the season's
      name, then Cancel and the one main button, which names the result ("Copy to Summer 2027";
      "Copy season" while the name is blank, and then it can't be pressed). Under it the new
      season's name and first day; when the first day is another weekday, the needs-a-look mark
      and one line, "Summer 2026 started on a Monday", shown and never refused (it was the
      sentence "Weeks move from Mondays to Tuesdays"). The weeks are drawn twice, one column
      each: the season's own in a faint outline above, the new ones raised below, each row
      named by its season (a table, read row by row). A season with no weeks shows its new
      dates in words instead. Then two rows of chips: **Comes along** (weeks, programs,
      divisions, groups, time blocks, locations, Camp words, activities, fixed and recurring
      activities, elective sets: what `SeasonCopier` and `ElectiveCopier` copy, in the camp's
      words) and **Stays in Summer 2026**, crossed out (schedules, versions, special days,
      special events, elective seats, camper choices: ADR 0014 choice 2, ADR 0018 choice 10,
      decision 56). The heading takes focus when the page opens and reads as one phrase ("Copy
      season Summer 2026"). Nothing the copy does changed (no Apex change); the old line
      "Summer 2026 stays as it is" is gone, the Stays row says it.
    - **Camp words is one box per word** (B): the standard word, then the camp's word in a box
      where the standard word sits quietly until one is typed, then, for a word of the camp's
      own, its plural, guessed and shown as words (`guessPlural` in `c/shoreshTerms`: the
      standard word's own plural for the standard word, else +s, +es after s, x, z, ch and sh,
      y to ies after a consonant; the desktop has no camp words and no rule of its own). The
      plural becomes a box under the pointer or the cursor and is typed over where the guess is
      wrong (Chug, Chugim); a plural typed stays when the word changes after, and clearing the
      word puts the standard word back with its plural. A plural the guess would give is shown
      as the guess, so it follows the word. Words sit in sections as the menu groups the
      screens (Camp, Activities, Electives, Schedules). The rail says how many words are the
      camp's own ("4 changed") and "Saved"; it saves as you go (ADR 0013 choice 1), with no
      Save button, and a guessed plural is sent as guessed, so the server still gets both
      words (`CampLabels.TermLabel`). Its boxes are plain inputs, each named for screen readers
      ("Group"; "Group, more than one").
    - **Programs is the shared setup table** (ADR 0011, choice 11): one row per program, its name,
      **Runs on** as a strip of day ticks always shown (a `days` column with `strip: true`; the
      other days columns keep their words at rest), then how many divisions, groups and time
      blocks it has (worked out, never edited). A program with no time blocks can't be
      scheduled: its zero is a value and the cell carries the needs-a-look corner
      (`c-shoresh-dot` shape `corner`, its words "No time blocks yet" on hover or focus; a
      readonly column's `problemFor`). A program is added from the blank row ("Add Program",
      running every day, last in order) instead of the Add program button, saved as any row
      (its days with the row, when the director leaves it), and deleted from its trash can with
      the same question; the rail counts programs and holds Import a list. The program card,
      its own live region and focus handling (ADR 0013 choice 25) are gone with it.
    - **Programs stays in the menu** for every camp, under Camp beside Camp words (ADR 0003
      choice 2), though the desktop hides it for one program.
    - Checked by `shoreshCopySeason.test.js` (the weeks twice, comes along and stays behind in
      camp words, the weekday line and mark, the button's name, dates in words without weeks,
      axe), `shoreshCampLabels.test.js` (one box, the guess as typed and as sent, a typed plural
      kept, clearing, sections, the rail's count, axe), `shoreshTerms.test.js` (`guessPlural`),
      `shoreshEditableTable.test.js` (the strip, the problem corner on saved rows only),
      `shoreshCampSetup.test.js` ("Programs on the shared setup table": columns, counts, the
      corner, the blank row's defaults, a row save, the delete, Programs in the menu with one
      program) and in the test org by `scripts/a11y-browser-check.mjs` (Programs: a program
      added from the blank row by keyboard and deleted from its trash can, said, axe; Camp
      words: a word typed, its plural guessed, saved and said, then put back, axe; Copy this
      season: focus on its heading, the weeks drawn twice, Cancel back to Season actions, axe).

## Not done here

- The setup screens. Manual Build's and Generated Schedule's rail, Edit and counter are built
  (step 2a, ADR 0008 part 7), with the rail's grammar as classes here (`.shoresh-item`,
  `.shoresh-pop` and its rows, `.shoresh-rail-line`, `.shoresh-chevron`), and their grid and
  drawer (step 2b, ADR 0008 part 8), with the needs-a-look corner on cells (`c-shoresh-dot`
  shape `corner`).
- ~~The line above each schedule's grid still has its own Update to match setup.~~ Gone in step
  2a: Update to match setup is only at the menu's foot, and focus returns there when the list
  closes (ADR 0008 part 7 §9).
- ~~Step 3b (the setup screens' second part).~~ Done in choice 12.
- The section headings of the mock-up's Recurring activities list a division's groups beside its
  name ("Juniors Cedar · Birch · Maple"); here they show the count, as every other section.
- The mock-up's "First time" (Any day / By Tue / By Wed) stays the two fields "Early in the
  week" (how many, by which day), since a camp can ask for more than one early session (ADR 0013
  choice 15).
- The earlier colour tokens are removed once no screen uses them.
- Programs' week strip shows Monday to Friday only: a program has no Saturday or Sunday field
  (`Program__c`), so the mock-up's weekend days need a data change first.
- The mock-up's chevron on a program's row (its details, as on Activities) is not built: every
  field a program has is already in its row.
