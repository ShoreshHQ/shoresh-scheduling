# 0020: Roots, the canasta table

Status: proposed (2026-10-24), slice R1 of the Roots redesign (the table); R1.1 polish
(2026-10-24): the journey's first frame, long seasons, long names, sparse and huge camps; slice
R2 (2026-10-24): the "needs a look" hand (choice 10); R2.1 (2026-10-25): the hand always
whole, at the mock-up's size. Design source: Greg's
approval, wiki `projects/shoresh-scheduling-sf.md` decisions 60 to 68 (68: "this is it"), and the
approved working mock-up `~/Dev/Shoresh/design-research/roots-approved/` (`needs-a-look.html`,
`table.css`, `table.js`), which is the spec for look, layout and motion. Replaces ADR 0003 choice 4
(the desktop's Roots home), its "Needs your attention" list included: slice R2 turns it into the
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
     name. A season of more than 12 weeks would squeeze them into slivers, so it shows 8 bars,
     numbered, from two weeks before this week (else before the first week not built yet), with
     their first and last day, over a line of the whole season (its first and last week number at
     the ends) on which those 8 weeks and this week are marked. Shrunk aside, the same 8 over the
     line.
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
   - **Recurring activities**: up to three, on their days; a name too long for a day's tile
     ("Morning meeting") heads its row instead, the days below it.
   - **Special events**: the weeks as a line, a flag on each week with a special day or event,
     filled once planned, dashed until then. On a long season a flag keeps a size that reads
     (16 or more); weeks too close for a flag each share one, dashed while any is unplanned.
   - **Electives**: each set and its offerings (proposed ones left out), a linked choice with the
     link mark.
   - **Generated Schedule** and **Manual Build**: one day of the shown week's draft (this week,
     else the first week with a draft, else the first): placed cells raised, empty ones wells, a
     fixed activity's block one locked bar, the director's locks; Manual Build with the groups'
     and the things' names. The week beside the name. Manual Build shows fewer groups across
     (down to one group's day) before it cuts a name, and its padlocks sit in the cell's corner,
     clear of the name; one or two groups on Generated Schedule are columns of a cell's size.
   - **Elective seats**: the offerings of the run Elective seats opens on for the shown week (the
     latest run's set and schedule, and on them the committed run, else the latest; none when
     that week has no run, so another week's seats never pass as its own), seats as boxes, taken filled, a
     minimum's missing seats dashed, campers past the limit as more boxes in the caution colour;
     no limit is the taken boxes and an open end (∞), and past ten campers eight boxes, how many,
     then ∞, so the row never looks like a limit. However the boxes are scaled (twenty at most),
     campers past the limit always show, a row not yet full never looks full, and a few seats
     are boxes of a seat's size. Taken is the most it holds at any one time.
   - **Saved versions**: the latest version, its week, name and day, a check when it is the
     published one.
     An empty area draws its outline (what is missing shows by its shape, decision 29); nothing is
     made up. A name too long for its room is cut after its last whole word ("Morning…", never
     "Morni…"; never after "and" or "&"), and only a single word too long is cut inside it; the
     words stay 11 px, never smaller. Locations' place column widens to its names (up to half the
     card). A picture shrunk aside shows a fixed activity on a schedule whole or only its padlock,
     and a fixed activity always looks fixed: on Fixed activities' picture its bar keeps the
     padlock and the name is shortened instead (R2; before, R1.1 dropped the padlock when the
     name fit only without it). A card shrunk aside cannot carry 11 px words, so it shows a simpler picture of the
     same data with one or two key words at 11.5 px or more on screen (`pictureSize`); it changes
     over once, as its size passes that point. Faces are `c/shoreshRootsFaces` (pure, the same camp
     gives the same faces) drawn by `c-shoresh-roots-glimpse` (SVG elements in its template, never
     markup set as text; every fill and stroke a token class).

3. **One request for the whole table.** Twelve cards are drawn from the season's setup the page
   has already read (`SeasonSetupController`), so they cost nothing. The rest (which weeks have a
   schedule, the two drafts' day, seats, versions) is one call, `RootsController.getTable`
   (`RootsTable`, with `RootsGlimpses` and `RootsSeats`; `with sharing`, every query `WITH USER_MODE`): eight queries whatever the size of
   the camp (R2 adds, from the same queries, the weeks close at hand and the offerings kept below
   their minimum, for the hand: still eight), asserted by `RootsTableTest` inside `System.runAs` a scheduler, on a camp with six
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
   ms later, unless the cursor is on one of its cards: a meld with the cursor stays open wherever
   the pointer is, so the card with the cursor is never hidden (the mock-up does the same; checked
   in it, 2026-10-25), until the cursor leaves or the pointer rests on another meld, which wins
   over a cursor left in an open one (the cursor lets go). However short the window, every meld's name stays on the table, and when two
   melds stack aside the lower one's name lies below the upper one's cards (the 25 px strips
   make stacks taller: they are moved apart, then up as far as the top name allows). A card lifts under the pointer and the cursor. On a touch screen nothing opens
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
   (its place, size, tilt, corner and face) on the very frame the card is pressed and grows from
   the next one to fill the frame, the card's face giving
   way while the screen's own content fades in at its true size; Roots recedes in the same breath.
   Back to Roots runs it the other way: **‹ Roots** first on the screen's rail (the mock-up's
   back, named "Back to Roots", drawn as Import last year's; `c-shoresh-roots-back`), or the
   menu's Roots, which does the same, to the card of the screen being left (or, for a screen
   with no card, the one the journey came from), whose meld opens to receive it, and the cursor lands on that card. Turned round mid-way, it bends back
   from wherever it is; a card chosen while one goes home turns it round toward that card's
   screen; another screen chosen from the menu ends the journey where it is. The screens are never
   moved out of the page (ADR 0003 choice 1: unsaved typing stays), and the screen keeps focus on
   its heading on the way out. A hand card (choice 10) travels the same way, its own face on the
   sheet; going back from the screen it opened lands on that hand card while the hand still
   holds it (the hand holds still until the journey is over), else on the screen's own card. ‹ Roots is on the rail of every screen with a card on Roots (the
   eleven setup lists, Camp words, Generated Schedule, Manual Build, Elective seats, Saved
   versions), right after the screen's unseen name, so Tab from the heading reaches it first.
   Screens with no card keep what they had: Import last year its own Roots, the Schedules
   doorway and Bring in choices the menu's Roots; Elective seats' end-of-season Clear, which takes
   over its rail, keeps its own Cancel. Nothing may hold the journey's frames: the page hands
   every screen, shown or not, the same camp words, columns, row defaults and lists for as long
   as what they are made from is the same (`memo`), so a change of screen redraws only what
   changes. Before (R1), each change redrew every hidden screen, Manual Build and Generated
   Schedule included: in shoresh-test the card sat still about half a second (a 470 ms frame)
   when pressed, again on arriving, and on the way home. Now the card grows from the frame after
   the press (about 80 ms to a visible change, the soft start of choice 5) and no frame is held
   over about 50 ms, out or home, on any card measured (Weeks, Activities, Manual Build,
   Generated Schedule, Elective seats, Saved versions, Camp words). A screen still reading its
   data shows it as it arrives, fading in with the sheet.

7. **Keyboard and screen readers.** Each meld is a group named by its section; each card a button
   named as its screen. Tab into a meld fans it, the arrows move between its cards (round at the
   ends), Enter opens, Escape closes it with the cursor kept on its front card (it rests closed
   until the cursor moves: an arrow, or Tab to another of its cards, opens it again, so the
   cursor never lands on a card out of sight). The glimpses and the sheet are hidden from screen
   readers; the card's name says what it is. The hand is a group named "Needs a look"; each of
   its cards a button named by the whole sentence (the attention list's own words, "Soccer:
   Outdoors and has no rain plan."); the arrows move between them (round at the ends). A card
   with the cursor that is played away hands the cursor to the next card, or, the last one, to
   its meld's front card, the meld resting closed (as after Escape) so the card in flight lands where it was aimed. Roots' heading is still there for the page to focus when Roots opens
   from the menu. axe passes in Jest and in the browser check.

8. **Reduced motion means no animation**: every placement is drawn at once, no frames are asked
   for, a card opens its screen at once and back puts the cursor on the card; the lift is
   instant. Hand cards are dealt and leave at once, and do not breathe. The dot field is still, as ADR 0015 choice 13 has it.

9. **The table lies on the living dot field** (decision 49, ADR 0015 choice 13), made _solid_
   (`c-shoresh-dot-field solid`): its content covers it with surfaces of its own (cards, and the
   meld names on the table's own colour), so the field fills its whole box, fainter in the
   middle, and measures nothing; the empty table between the cards reacts to the pointer. No dot
   is ever under words.

10. **The hand: what needs a look** (slice R2; decisions 64g, 64h, 65, 65a; the mock-up's hand).
    Fanned along the bottom of the table (`c-shoresh-roots-hand`), each card is something that
    genuinely needs a look in this camp (`c/shoreshRootsLooks`, pure: the same camp gives the
    same hand). Nothing is a rule of its own; every card comes from what the app already knew:
    - **Every signal the old "Needs your attention" list had** (`setupProblems`: the desktop's
      Roots attention list, `docs/adr/2026-08-28-roots-home-is-a-distinct-screen.md` §3, and
      Greg's 2026-10-16 nudges), each problem now naming its kind, and each kind gathered onto
      one card (per elective set for offerings; one card per special day or event for the
      special-day checks): a week outside the season, weeks sharing dates, no weeks, no
      programs, a program with no time blocks or divisions, a division with no groups, no
      activities, groups no activity is open to, outdoor activities with no rain plan, more
      groups at once than the place fits, a fixed or recurring activity whose time block
      changed, that runs in no week, whose groups are all away, or whose place is closed, a
      special day on a weekday its week lost or whose time blocks moved, and offerings proposed
      or with seats not filled in.
    - **What the table already draws as missing** (choice 2; decision 29, a dashed outline is
      what is missing): a week close at hand (under way today, or starting in the next seven
      days) with no schedule (the Weeks card's outline bars); activities with no place, in a
      camp that has places (a camp with none doesn't use them: desktop `readiness.js`
      `OPTIONAL_AREAS`); a special day or event put on a day with nothing planned in it (its
      dashed flag).
    - **The Elective seats counter's "kept below minimum"** (ADR 0018 choice 36) for the run the
      table shows, read in the same one request.
      Each card says exactly what is off at a glance: its name (the one thing it is about, or the
      screen's name in the camp's words when several are gathered), a few words ("no rain plan",
      "not built", "one seat short", in the camp's words), and a picture drawn with the table's
      own marks (the thing and where it should lead, dashed; outline cells; a dashed flag; seat
      boxes with the minimum's missing seats dashed), with the needs-a-look corner. Names are cut
      after a whole word, never smaller than 13 px. Cards lie in the menu's order of the screens
      that fix them, so each sits below its meld; weeks not built lie in season order. A click opens the exact thing, grown out of the
      card (choice 6): the setup screen that fixes it; a week not built opens the Schedules
      doorway (`scheduleWeeks`, decision 61) with the cursor on that week, offering both ways to build it, since
      picking Manual Build or Generated Schedule for the director would break the desktop's rule
      (`docs/adr/2026-07-28-plural-candidate-schedules-per-camp.md`; the mock-up opened Manual
      Build); a special day or event opens its details and its schedule; offerings short open
      Elective seats on the exact run counted: its set, week, schedule and the run itself
      (`openWeek`; since that screen is drawn only while shown, the page hands it the card's run
      as `opening`, and it starts there ahead of the season's latest run). Should that run be
      gone by then, it opens on the set and week as before. Elective seats' own first pick on a
      week is the same as the hand's (the latest run's schedule, then its committed run), so the
      card's face and the run that opens never disagree.
      **Leaving and arriving**: the hand changes only while Roots is shown and still (never behind
      a screen or mid-journey), once this showing's table request is back, so what was dealt with
      on another screen leaves on the next visit: the card is played onto its meld (it lifts off
      the hand, travels and shrinks onto that meld's front card, which settles as it lands), and
      anything new is dealt in from the right, one after another. The hand keeps its room until a card in flight has landed, so its stack does not move under it; however narrow the hand, each card keeps a 24 px strip (WCAG 2.5.8). **The hand always shows its cards whole, at the mock-up's size** (R2.1, 2026-10-25): a card a fifth of the frame wide, never under 196 px (the narrowest whose picture keeps its 11 px words) nor over 232, 0.68 as tall, the hand its height and 46 px more (232 by 158 at 1440 wide, as the mock-up). It never lowers or eases aside: R2 lowered it while a meld was open to give the table its room, and in shoresh-test that left the hand cut off under the worksheet bar whenever a meld stayed open, as it does while a card in it has the cursor (the mock-up's rule, choice 4: focus holds a meld open, whatever the pointer does). Instead the table and the hand size to fit: the table never gets shorter than two rows of cards at full face with the meld names above them (about 435 px), so an open meld still shows full faces at 1440 by 900 with cards in hand; the worksheet bar lies below the hand, never over it. **Table, hand and bar share one screen at 1440 by 900** (decision 68), a last import in the bar included: the hand takes what the window leaves between the table's least height and the bar, its cards the mock-up's size when that is room enough and smaller when it is not, never under 196 wide (with a last import shown at 1440 by 900, 213 by 145 in shoresh-test, the bar ending 12 px above the window's bottom). Only once the cards are at 196 does Roots grow past the window (the page scrolls), on a short window, rather than the table or the hand giving way; a window too short even for the table's least height leaves the hand no room, so its cards are 196 there too (the first build took no room for no limit and kept them at 232 in a 560 px tall window; the full browser check on PR #142 found it). (The first R2.1 build kept the cards at 232 and pushed Undo last import half off a 1440 by 900 window; review of PR #142.) However many cards the hand holds, they stay whole: the fan keeps the mock-up's curve (each card 9 / n px lower per step from the middle, squared, and tilted 6.6 / n degrees) until its end cards would sink past the 24 px below them, from about ten cards on, and then flattens just enough that they do not (review of PR #142: at 12 cards the end card lost about 5 px, at 20 about 22). Should a later read fail, the
      cards the table fed stay as they were (nothing is played away on a failed read). However
      many cards there are, the hand keeps a clear margin at both ends: past what fits side by
      side they close up and overlap, a lifted card coming to the front; the cards breathe very
      slowly, out of step (the mock-up). **Calm**: an empty hand, a calm space with nothing drawn;
      to a screen reader, a live "Nothing needs a look" (the app's own words, choices import).
      The camp's workbook tools (Import last year, first for an empty camp; Download worksheet; a
      workbook's Import a list; Re-import last year; the last import with Undo) stay in their bar
      under a hairline below the hand, the secondary actions' place (decision 28C; the mock-up has
      no workbook bar). The last import is laid out as the desktop's (`LastImportUndo.jsx`): its
      line and the sentence on what Undo does on the left, Undo last import on their right; it
      sits beside the buttons, its words wrapping, when it has 26rem there (a laptop), so the bar
      keeps to one row, and takes a row of its own on a narrower window.

11. **Tokens** (ADR 0015): the mock-up's card shadows (`--shoresh-card-rest`, `--shoresh-card-lift`,
    made of the shade and the primary's steps), its easing and lift time (`--shoresh-flow`,
    `--shoresh-t-lift`), and its header column, never under 92 px (`--shoresh-head-w`, so
    "10:40–11:25" fits at 1024 wide). A menu entry longer than the menu wraps to a second line
    instead of being cut off (the mock-up's menu). No new colour.

## Checked by

R2.1: `shoreshRootsHand.test.js` (every card whole at 3 to 30 cards and two card sizes, the mock-up's curve kept up to nine; the mock-up's card size at three widths, the hand its height
and 46 more; giving way to the height it is left, never under 196, and growing back),
`shoreshRoots.test.js` (an open meld leaves the hand as it is; the table keeps two rows of full
faces; at 1440 by 900 with a two-row bar the hand takes what is left, with a one-row bar the
mock-up's 232), and the browser check's hand step: every hand card whole, at the mock-up's size
(smaller, never under 196, only while the window has no room) and overlapped by nothing, the
worksheet bar below, at rest and with a meld open, at 1440, 1280 and 1024 wide and in a 560 px
tall window (it fails on any card clipped or covered, and on Roots running past the bottom of a
1440 by 900 window); the steps before it leave the table at rest (no card holding the cursor)
before the hand is measured.

R2: `shoreshRootsLooks.test.js` (every attention signal kept, each kind on one card, the table's
missing things, weeks not built in season order whatever order they were made in, camp words, the menu's order, the same hand every time, names that fit, pictures
in the design system's classes), `shoreshRootsHand.test.js` (dealt in, fanned, any number,
arrows, played onto its meld, the cursor kept, taken back mid-play, reduced motion, travel
hooks, axe), `shoreshRoots.test.js` (the hand after the table read, opening the exact thing,
calm, holding still while away, a failed read, the sheet wearing a hand card, home to it, the
meld settling), `shoreshCampSetup.test.js` (a hand card out and home again; the seats card opening Elective
seats on its run's week and set, not the latest run's), `shoreshRootsFaces`
(a fixed activity keeps its padlock), `shoreshSetupRules` (kinds), `shoreshElectiveSeats`
(`openWeek`, and `opening` on a fresh start; the exact run, committed run A against a later run
B (Final) and a second schedule, and a run gone), `RootsTableTest` (weeks close at hand, offerings below their minimum, still eight
queries; the run counted is the one Elective seats opens on: committed over a later Final run, then a
newer run on the other schedule), and the browser check's hand step (dealt, opened, played away, axe) and R1.1 steps
tightened (a name dropped from a face fails too; no overlap at all in the short window).

`shoreshRoots.test.js` (melds, names in camp words, the doorway, cards opening their screens, one
request per showing, faces from the camp's data, outlines for an empty camp, rest and open
layouts, arrows and Escape, Tab after Escape, hover intent, interruptible motion, reduced motion,
the travel hooks, axe), `shoreshRootsFaces.test.js`, `shoreshRootsGlimpse.test.js`, `shoreshMotion.test.js`,
`shoreshRootsTravel.test.js`, `shoreshRootsBack.test.js`, `shoreshCampSetup.test.js` (out and
home by the rail's ‹ Roots and by the menu's, ‹ Roots on every setup rail, reduced motion, a
journey ended by the menu, the cursor on the card), `shoreshDotField.test.js` (solid), `RootsTableTest`
(query bound, glimpses, seats, versions, this week, an outsider refused), and steps in
`scripts/a11y-browser-check.mjs` (Tab, arrows, Escape, Tab after Escape, travel out and home by
the rail's Back to Roots, the menu's Roots, hover, reduced motion, axe; R1.1: the card growing within 250 ms of Enter and
going home likewise, no frame over 120 ms, the Weeks card's bars on a long season, no name cut
on Manual Build's and Recurring activities' faces, the meld names in a 560 px tall window).
R1.1 in Jest: long seasons, flags, fewer columns before a cut, whole-word cuts, seats at any size,
every face with one of everything and with a hundred (`shoreshRootsFaces.test.js`), the meld
names on a short table (`shoreshRoots.test.js`), and a change of screen handing the hidden
screens what they had (`shoreshCampSetup.test.js`).
