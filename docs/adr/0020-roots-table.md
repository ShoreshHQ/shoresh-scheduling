# 0020: Roots, the canasta table

Status: proposed (2026-10-24), slice R1 of the Roots redesign (the table). Design source: Greg's
approval, wiki `projects/shoresh-scheduling-sf.md` decisions 60 to 68 (68: "this is it"), and the
approved working mock-up `~/Dev/Shoresh/design-research/roots-approved/` (`needs-a-look.html`,
`table.css`, `table.js`), which is the spec for look, layout and motion. Replaces ADR 0003 choice 4
(the desktop's Roots home) for everything but "Needs your attention", which slice R2 turns into the
hand. Builds on ADR 0015 (tokens, the dot field of choice 13, the raised treatment) and ADR 0003
choice 10 (the Schedules title as a doorway).

Roots is a portal (decision 60): the place the app opens on, and the quickest way to anywhere in
it. Its building blocks are the menu's own sections, laid on a calm table as canasta melds.

## Choices

1. **Three melds, the menu's three sections, in its order** (decisions 64f to 64h): **Camp**;
   **Activities & Events**; **Schedules**, left to right, never rearranged. A meld's cards are its
   section's entries, in the menu's order, each named as the menu names it (`shoreshScreens`
   `menuSections`, so every name is in the camp's words: "Bunks", "Chugim", "Chug seats"). The
   section titles are the meld's names, in the menu's small mono capitals; **Schedules** is a
   doorway to the season's weeks there too (a real button, as in the menu), the other two are
   plain. The table itself is the hero (decision 64h): no separate picture. The left menu stays
   (decision 65a).

2. **Each card's face is the camp's own data** (decision 64i): its name, and one drawn glimpse
   using the app's own marks (raised tiles, wells, dashed outlines for what is missing, the
   padlock, the special-event flag, the link mark, the highlight for this week). No sentences, no
   counts the director already knows. As built from the real data model:
   - **Weeks**: one bar per week, built weeks (a draft or a published schedule) filled, this week
     in the highlight, the rest an outline; the season's first and last day; the year beside the
     name.
   - **Programs**: each program across Monday to Friday, its days raised, the others an outline.
     (The mock-up drew the ages each program takes; Shoresh keeps no ages, so the days a program
     runs are its real shape.)
   - **Divisions**: each program's divisions as tiles (the mock-up's ages, again not kept).
   - **Groups**: each division's groups, one tile a group.
   - **Time blocks**: the day of the program with the most blocks, to scale; a block holding a
     fixed activity is a well with the padlock; the first, middle and last times.
   - **Locations**: each place with what is held there (busiest first), then what still waits for
     a place, dashed.
   - **Camp words**: the standard word and the camp's own (its own first), a standard word kept
     as it is shown dashed.
   - **Activities**: every activity as a tile; one with no place, dashed.
   - **Fixed activities**: up to three, each a locked bar across the grid.
   - **Recurring activities**: up to three, on their days.
   - **Special events**: the weeks as a line, a flag on each week with a special day or event,
     filled once planned, dashed until then.
   - **Electives**: each set and its offerings (proposed ones left out), a linked choice with the
     link mark.
   - **Generated Schedule** and **Manual Build**: one day of the shown week's draft (this week,
     else the first week with a draft, else the first): placed cells raised, empty ones wells, a
     fixed activity's block one locked bar, the director's locks; Manual Build with the groups'
     and the things' names. The week beside the name.
   - **Elective seats**: the offerings of the shown week's latest run (none when that week has no
     run, so another week's seats never pass as its own), seats as boxes, taken filled, a
     minimum's missing seats dashed, campers past the limit as more boxes in the caution colour;
     no limit is the taken boxes and an open end (∞). Taken is the most it holds at any one time.
   - **Saved versions**: the latest version, its week, name and day, a check when it is the
     published one.
     An empty area draws its outline (what is missing shows by its shape, decision 29); nothing is
     made up. A card shrunk aside cannot carry 11 px words, so it shows a simpler picture of the
     same data with one or two key words at 11.5 px or more on screen (`pictureSize`); it changes
     over once, as its size passes that point. Faces are `c/shoreshRootsFaces` (pure, the same camp
     gives the same faces) drawn by `c-shoresh-roots-glimpse` (SVG elements in its template, never
     markup set as text; every fill and stroke a token class).

3. **One request for the whole table.** Twelve cards are drawn from the season's setup the page
   has already read (`SeasonSetupController`), so they cost nothing. The rest (which weeks have a
   schedule, the two drafts' day, seats, versions) is one call, `RootsController.getTable`
   (`RootsTable`, with `RootsGlimpses` and `RootsSeats`; `with sharing`, every query `WITH USER_MODE`): eight queries whatever the size of
   the camp, asserted by `RootsTableTest` inside `System.runAs` a scheduler, on a camp with six
   weeks, 28 bunks, eight time blocks, 25 activities, two drafts of five days, twenty versions
   and 40 seated campers. The names on a glimpse are those the schedule saved, so the request
   reads no camp words (the page read them once). Roots reads it each time it is shown, so coming
   back after building a week shows the week built. Should it fail, the cards it feeds draw their
   outlines and a message says Roots could not read the schedules, and why.

4. **Stacks rest slightly fanned; hover intent or focus opens one; the others ease aside**
   (decisions 65a, 67): at rest each meld shows its front card and the tops of the two behind it
   (Camp: Weeks, Divisions, Time blocks; Activities & Events: Activities, Special events,
   Electives; Schedules: Manual Build, Generated Schedule, Saved versions). The pointer resting on
   a meld for 170 ms, or the cursor entering it, opens it: all its cards in gently arced rows,
   unfolding card after card, while the other melds shrink aside into a column (stacked when the
   open meld is at an end), never so small their names fall under 11.5 px. Leaving closes it 300
   ms later. The pointer resting on another meld wins over a cursor left in an open one (the
   cursor lets go). A card lifts under the pointer and the cursor. On a touch screen nothing opens
   on hover; a tap opens the card's screen.

5. **One continuous, interruptible motion** (decision 67): every moving thing (cards, meld names,
   the sheet a screen grows from) follows its target through two gentle, critically damped stages
   (`c/shoreshMotion`, the mock-up's model): soft in and out, no overshoot, and a new target is
   taken up from where it is and how fast it is moving, so nothing restarts, snaps or pauses.
   Frames come from `requestAnimationFrame` and only while something moves or waits; hover
   intent's waits are counted on the same frames. That file is the one place allowed the clock
   (`eslint.config.js`, `code-analyzer.yml`, two calls).

6. **A card opens its real screen, growing out of the card; going back shrinks it home**
   (decisions 65, 68). The page (`c-shoresh-camp-setup`) runs the journey (`c/shoreshRootsTravel`):
   the screen is shown at once, drawn over Roots and clipped to a sheet that starts as the card
   (its place, size, tilt, corner and face) and grows to fill the frame, the card's face giving
   way while the screen's own content fades in at its true size; Roots recedes in the same breath.
   Back to Roots runs it the other way: **‹ Roots** first on the screen's rail (the mock-up's
   back, named "Back to Roots", drawn as Import last year's; `c-shoresh-roots-back`), or the
   menu's Roots, which does the same, to the card of the screen being left (or, for a screen
   with no card, the one the journey came from), whose meld opens to receive it, and the cursor lands on that card. Turned round mid-way, it bends back
   from wherever it is; a card chosen while one goes home turns it round toward that card's
   screen; another screen chosen from the menu ends the journey where it is. The screens are never
   moved out of the page (ADR 0003 choice 1: unsaved typing stays), and the screen keeps focus on
   its heading on the way out. ‹ Roots is on the rail of every screen with a card on Roots (the
   eleven setup lists, Camp words, Generated Schedule, Manual Build, Elective seats, Saved
   versions), right after the screen's unseen name, so Tab from the heading reaches it first.
   Screens with no card keep what they had: Import last year its own Roots, the Schedules
   doorway and Bring in choices the menu's Roots; Elective seats' end-of-season Clear, which takes
   over its rail, keeps its own Cancel.

7. **Keyboard and screen readers.** Each meld is a group named by its section; each card a button
   named as its screen. Tab into a meld fans it, the arrows move between its cards (round at the
   ends), Enter opens, Escape closes it with the cursor kept on its front card (it rests closed
   until the cursor moves: an arrow, or Tab to another of its cards, opens it again, so the
   cursor never lands on a card out of sight). The glimpses and the sheet are hidden from screen
   readers; the card's name says what it is. Roots' heading is still there for the page to focus when Roots opens
   from the menu. axe passes in Jest and in the browser check.

8. **Reduced motion means no animation**: every placement is drawn at once, no frames are asked
   for, a card opens its screen at once and back puts the cursor on the card; the lift is
   instant. The dot field is still, as ADR 0015 choice 13 has it.

9. **The table lies on the living dot field** (decision 49, ADR 0015 choice 13), made _solid_
   (`c-shoresh-dot-field solid`): its content covers it with surfaces of its own (cards, and the
   meld names on the table's own colour), so the field fills its whole box, fainter in the
   middle, and measures nothing; the empty table between the cards reacts to the pointer. No dot
   is ever under words.

10. **Until the hand (slice R2)**: what needs attention (`setupProblems`, alphabetical, each
    opening the screen that fixes it) lies along the bottom where the hand will go, as small raised
    cards with the needs-a-look corner; nothing shows while all is calm (screen readers hear "All
    clear"). The camp's workbook tools (Import last year, first for an empty camp; Download
    worksheet; a workbook's Import a list; Re-import last year; the last import with Undo) sit in a
    bar under a hairline, the secondary actions' place (decision 28C). Slice R2 moves what needs a
    look into the hand.

11. **Tokens** (ADR 0015): the mock-up's card shadows (`--shoresh-card-rest`, `--shoresh-card-lift`,
    made of the shade and the primary's steps), its easing and lift time (`--shoresh-flow`,
    `--shoresh-t-lift`), and its header column, never under 92 px (`--shoresh-head-w`, so
    "10:40–11:25" fits at 1024 wide). A menu entry longer than the menu wraps to a second line
    instead of being cut off (the mock-up's menu). No new colour.

## Checked by

`shoreshRoots.test.js` (melds, names in camp words, the doorway, cards opening their screens, one
request per showing, faces from the camp's data, outlines for an empty camp, rest and open
layouts, arrows and Escape, Tab after Escape, hover intent, interruptible motion, reduced motion,
the travel hooks, axe), `shoreshRootsFaces.test.js`, `shoreshRootsGlimpse.test.js`, `shoreshMotion.test.js`,
`shoreshRootsTravel.test.js`, `shoreshRootsBack.test.js`, `shoreshCampSetup.test.js` (out and
home by the rail's ‹ Roots and by the menu's, ‹ Roots on every setup rail, reduced motion, a
journey ended by the menu, the cursor on the card), `shoreshDotField.test.js` (solid), `RootsTableTest`
(query bound, glimpses, seats, versions, this week, an outsider refused), and steps in
`scripts/a11y-browser-check.mjs` (Tab, arrows, Escape, Tab after Escape, travel out and home by
the rail's Back to Roots, the menu's Roots, hover, reduced motion, axe).
