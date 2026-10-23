# 0017: Reading a choices sheet

Status: proposed (2026-10-21), electives slice E3a; slice E6 (bringing in choices, 2026-10-22)
added choices 10 to 21. Design source: the wiki electives plan
(`projects/shoresh-sf-electives-plan.md` §2 "Choices", §3 "Privacy", §6.3, §8 slice E3a), Greg's
decision 44 (electives are one piece of work), and Shoresh desktop's choices-sheet reader
(`src/ingest/preferenceSheet.js`) with its ADR `2026-09-27-elective-preference-etl-canonical-record-and-learned-axis-binding`
(§4.1-4.4, §8, §14.1, §14.1a), adapted under Apache-2.0 (see `NOTICE`). The design guide's
import rule applies: ask about what we found, never about the file's shape.

This slice is the reader's core only: no screen, no objects, nothing saved. Slice E6 builds the
review screens and the save on it.

## Choices

1. **A pure module, `c/shoreshChoicesReader`,** beside `c/shoreshImportEngine` and using its file
   reading (`csvFile`, `workbookFile`) and text helpers. `readChoices(file, { activities })`
   takes a file of sheets and returns campers with their choices, plus what it could not read.
   Like the schedule engine (ADR 0010 §1) it runs in the browser: the file never leaves it.
2. **No file shape is refused, and the director is never asked what the shape is** (desktop
   §14.1, §14.1a). The reader finds the heading row itself (below a title, or a two-row heading
   with "Choices" or a day merged over 1, 2, 3) and reads every shape the corpus holds: ranked
   columns in any of their usual words (#1, Choice 1, First choice, 1st choice, Rank 1, Pref 1),
   one row per choice (with or without a rank, day or period column), choices per period named
   in the heading ("Tue P2 - 1st choice", "Monday Period 3"), a choice per period plus a ranked
   list for the week, every choice in one cell, first and last name in two columns, camper
   numbers, division and bunk, and a planner that is one camper's own sheet (days across, periods
   down). What it can't read it lists, by place: rows above the table, columns it doesn't use,
   rows with no name, rows with no choices (footers like "Total campers"), cells that aren't a
   choice ("8", "Yes"), sheets with no choices, and a menu of what is offered.
3. **Headings, never cell contents, decide what a column is** (as ADR 0007 §2). A column the
   reader doesn't use is named by its heading only; **what it holds is never copied** into the
   reading (an email address, a date of birth, a parent's name). **A column about a camper's
   health (Medical, Medical notes, Allergies, Medications, Health, Dietary) is never read either,
   not even as a comment:** it is named by its heading only, like a date of birth (plan §3,
   Privacy: medical notes are under "Never"). The plan's minimal-data rule starts here.
4. **Three kinds of choice** (desktop §4.2): _ranked_ (one of an ordered list, for the week or
   for one period), _cell_ (the camper's one choice for a day or period, rank 1), and
   _unordered_ (rank blank). **Unordered is never made into a rank** (desktop §4.1, owner
   2026-09-29): a list in one cell, one row per choice with no rank, and two columns both headed
   #1 are unordered. A list found inside a ranked cell is read as unordered choices and marked to
   check, never as one activity called "Swim, Drama". **A cell that names one of the camp's own
   activities is that activity, before any splitting** (desktop `makeLabelResolver`, "matched"
   before "packed"; desktop ADR 2026-10-11 D3, "a name already in the catalogue never asks"):
   "Arts, Crafts" stays one choice when the camp has an activity of that name.
5. **Who is who** (desktop §4.4, plan §2). A camper is one camper number, or with none, one name
   (capitals, spacing and punctuation aside); division is never part of who they are. A camper's
   rows are one camper when they give different choices (one row per choice, one row per
   period). **Two rows with one name and no number are two campers the reader can't tell apart
   when they give different choices for the same rank, or both name one activity with no rank
   (an unranked choice's slot is the activity it names; desktop `preferenceSheet.js`), or when the sheet has one row per camper**
   (ranked columns, choices per period in the headings, every choice in one cell), even if their
   choices don't contradict or are identical: there a repeated name is two children or a form
   sent twice (desktop §4.4 and §13.1: rows collide when they share a coordinate, or when none
   has one). Neither becomes a camper; both rows are listed with their division and bunk for the
   director (the one thing the reader will not decide). One
   name with a number on some rows and not others stays two campers and is marked to check (the
   desktop's partial-id fork). One number with two names, and one camper's rows giving two
   divisions or bunks, are marked to check; the first is kept. **Kept means only the first:** a
   row with the number's second name adds none of its choices to the camper (its comments are
   still shown, with no camper), and when one camper's rows name different activities for the
   same rank, the first row's choice is kept and the clash is marked to check, so a camper never
   holds another child's choices or two choices of one rank (desktop §4.1).
6. **Comments are read and shown, and saved with their camper; opt-outs are not read at all.**
   Parent comments come back in their own list, `notKept`, apart from the campers, so only a save
   that means to can carry them. _Amended by slice E6 (Greg's decision 48.3, "SAVED with the
   camper"):_ the review shows them under "Kept with the camper" and saves each with its camper
   (choice 15 below); a comment whose camper is not brought in is shown and not saved. Shoresh has no opt-out concept
   (Greg, 2026-10-22, amending decision 48(3)): "There can be no opt-outs. If someone opted out,
   the camp would place them separately from here." So an opt-out column ("Swim opt-out",
   "Excused") is like any other column the reader does not use: listed by its heading in
   `notRead`, its cells never read or carried, the same as a health column.
7. **Choice names the camp doesn't have are listed** (`newNames`, with how many campers chose
   each) when the camp's activities are passed in. Settling them (Add, or Same as) is E6's
   question, asked once per name (plan §2).
8. **Same file, same reading.** Campers come back in the order the sheet first names them, and
   choices in sheet order. Nothing depends on time or chance.
9. **Tested against a generated corpus of 28 synthetic sheets** (`docs/samples/choices/`, made by
   `scripts/make-choices-samples.mjs` with a fixed seed). Every sheet is read from its file bytes
   and compared in full with what the generator put in it, so "silently wrong" (a sheet read
   differently from what it holds) is a failing test, and must stay zero. **Names are made up**:
   every camper name is a first name and an invented surname from `names.json`, and a test
   checks every name in the corpus and every name the reader finds against that list (the
   desktop's §8.0 control, since no gate can spot a real child's name). Never commit a real
   camp's sheet, in any form.

## Slice E6: bringing in choices (2026-10-22)

Design source: the plan's §1 step 4, §2 "Choices", §4.4 and §6.3; Greg's approved mock-ups
`design-research/electives-r1` (`import-read.png`, `import-names.png`) and decisions 48 (3: parent
comments saved with the camper, no opt-outs; 5: the bunk from the sheet) and 53 (keep the
desktop's refusal for two children with one name and no camper number; "Leave out" for an unknown
name). Flow and words follow the desktop's choices-sheet import (`AssignmentPanel.jsx`,
`ParseSummary.jsx`): ask about what was found, never about the file's shape.

10. **A screen, `c/shoreshChoicesImport`, on the reader.** The rail: "Bring in choices", the
    elective set and the week (rail pickers), and "Assign against" only when the week has more
    than one working schedule (Manual Build, Generated, Published; never a saved version), as the
    desktop asks only then (D2.7). A week with no schedule says so and offers no file. Then a drop
    well, and three cards ("1 of 3" with ‹ › on the rail, Cancel, and one main button). The
    file is read in the browser and never sent: only what the director confirms is.
11. **1 of 3, how the sheet was read** ("That's right"). The layout found, as words ("Choices are
    One ranked list", "One per period", "Both", "One list, in no order"): stated, not a setting,
    since the director is never asked the shape (choice 2; the mock-up drew it as a segmented
    control). The first sheet with a table is drawn as the camp's own sheet, its first ten rows,
    with each column's reading on a tag over it (Camper #, Name, the camp's word for bunk and
    division, 1st, 2nd, "Tue · Period 2", Comment; "Not read" outlined) from the reader's new
    `sheetLayout(sheet)`, which uses the same column plan as the reading. **A column not read is
    drawn by its heading only, its cells blank** (choice 3: what it holds is never needed). Two
    campers are read back in words: the first with ranks, numbered in filled circles, and the
    first with choices in no order, in empty circles and never numbered (choice 4).
12. **2 of 3, only what needs a person** ("Next"), in the shared row pattern, each section headed
    with its count:
    - _Names to settle_: each choice name the camp has no activity for, once, with how many
      campers chose it. Answers: **Same as** (a proposal first, "Same as Pottery" for "Pottery
      Wheel", when one activity's words begin the name's or the other way round; then any
      activity from a list), **Add as an activity**, and **Leave out** (bring the camper in, drop
      that one choice: decision 53, the desktop's "Ignore it for this import"). A proposal is
      offered, never chosen. An unanswered name carries the needs-a-look corner and Next waits for
      it. Answers are remembered for the camp (`ImportAnswer__c`, question `choiceName|<name>`,
      by name, never an Id) and come back next time **already answered, marked Remembered, and
      changeable**: never applied unseen. "Add" is not remembered (the activity then exists).
    - _Can't tell apart_: two rows with one name and no camper number, with their rows and what
      tells them apart ("No camper number. Willow and Oak."), with the corner.
    - _To check_: what the reader marked (a list read in no order, a second choice for a rank, a
      number on some rows only, another name for a number, another bunk on a row), in words.
    - _Not read_: columns by heading, rows by number and why, campers whose bunk the sheet
      doesn't give ("No Bunk") or that the schedule's program doesn't have (`No Bunk "Cedar"`),
      and a comment whose camper is not brought in.
    - _Kept with the camper_: each comment, word for word.
13. **3 of 3, the count, and Bring in.** The server checks first (nothing saved): "212 campers: 12
    new, 200 already here", and, bringing in again, the run's name, how many hand changes are
    kept, each camper whose hand-changed choices the sheet now contradicts (marked), a camper
    number saved under another name (Shoresh's name is kept, and said), how many of the run's
    campers aren't on this sheet (their choices stay), each activity the set doesn't offer and how
    many choices name it (marked; kept, so seats can use it once offered), campers left with no
    choices, and names added. **Refused, with no Bring in:** two campers Shoresh can't tell apart
    ("This sheet can't be brought in yet", the rows, and the fix: a camper number in the sheet;
    desktop `ParseSummary.jsx`), and a final run ("Chugim · Week 3" is final, so it can't take new
    choices; Start a new version is slice E7's).
14. **The save is one transaction** (`ChoicesImport.bringIn`, user mode): names added as
    activities, each offered in the set as **proposed** (confirmed on the Electives screen before
    it gets campers, plan §2); the campers; the run; the choices; the remembered answers. A
    camper is found by its key (`ElectiveRunTriggers.camperKey`: camper number, else a hash of the
    name), never by querying a name; new ones are made. Two rows of one request with one key (a
    number written two ways) are refused by row number. No refusal names a camper: they give the
    row ("Row 7: ...").
15. **What each camper keeps.** A camper's comment is added to what was saved: a blank never
    erases, the same words are not added twice, other words go on a new line after it (ADR 0018
    §3 left this to E6). Shoresh's name for a camper number is kept. The choices go to one
    `Preference__c` per camper per run: `ImportedChoices__c` is always what this sheet says;
    `Choices__c` is the same unless it was changed by hand (`ManualChange__c`), which is kept
    (plan §2). The sheet's bunk is the camper's group that week when the schedule's program has
    a group of that name; a sheet with no bunk for a known camper keeps the saved one.
16. **The choices' format** (`Choices__c`, `ImportedChoices__c`; ADR 0018 left it to E6): JSON, a
    list in the sheet's order, each `{ n, a, r, k, d, p }` with blank keys left out: `n` the name
    as written, `a` the activity it is (an Id of the season's; the seat engine maps it to the
    set's offering when seats are assigned, so an offering confirmed later still counts), `r` the
    rank (none: unordered), `k` ranked, cell or unordered, `d` and `p` the day and period words as
    the reader gives them. Leave out drops the choice. Matching `d` and `p` to time blocks is the
    seat engine's (E7), where the set's placement on the grid is known.
17. **The run.** One Committed `ElectiveRun__c` per set, week and schedule: "Chugim · Week 3"
    (with the program's name when the set already has a run on another program's schedule that
    week). Bringing in again goes into the committed run; its `Revision__c` goes up by one, and a
    save whose check saw another revision is refused ("Someone else brought in choices for this
    run since you started. Choose the file again to see them."). The file's name and its SHA-256
    (worked out in the browser) are kept on the run.
18. **Bounded.** The start is 5 queries, a check 7, a save about 20 with its triggers, whatever
    the number of campers; `ChoicesImportTest` brings in 260 campers as a scheduler inside one
    `System.runAs` and asserts the check (≤ 8) and save (≤ 30) bounds.
19. **How it is reached until electives are finished.** The Electives menu entries stay "Coming"
    until slice E11 (decision 44), and the seats screen it hangs from in the mock-up is slice E7.
    Until then Bring in choices is a screen of the Shoresh page kept out of the menu and opened
    only from the page's address: `/lightning/n/Shoresh_Camp_Setup?c__screen=bringInChoices`
    (`ADDRESS_ONLY` in `c/shoreshCampSetup`; no other screen opens this way). It is drawn only
    while shown, so other screens make no extra server call. E7 moves its start onto the seats
    screen ("Bring in choices" on its rail); the Electives setup screen (slice E4, its own PR)
    did not exist when this was built, so nothing here follows a route of its.
20. **Reader additions for E6.** `sheetLayout(sheet)`, and two heading forms the mock-up's own
    sheet uses: a possessive keeps its s ("Child's name" is the name), and "Anything we should
    know?" is a comment. The corpus readings are unchanged.
21. **Checked by** Jest (`shoreshChoicesImport/__tests__`: the review module's every card and the
    request, and the screen: start, the cards, focus, answers, remembered answers, the refusal, a
    final run, Cancel, a refused save; axe on each card; also namespaced), `shoreshCampSetup` (the
    address route, never the menu), the reader's rules, `ChoicesImportTest` (Apex), and the
    real-browser check (`scripts/a11y-browser-check.mjs`: the screen opened from its address,
    a sheet chosen, the cards walked with the keyboard, axe on each; nothing saved).

## Not done here

- Start a new version of a final run, assigning seats, and showing a camper's choices or comments
  on the seats screen (E7).
- Linked choices' names on a sheet (a bundle named as a choice) (E8).
- Remembering how a sheet was read for next time: nothing about the shape is asked, so there is
  nothing to remember; only names' answers are.
- An undo for a choices import (`Import__c` keeps setup imports' undo; choices have none yet).
- Downloading campers and bringing them back (E10).
- A camp-platform export nobody has seen (desktop class H) is not modelled; the corpus is shapes
  we imagined, which is the limit the desktop owner accepted.
