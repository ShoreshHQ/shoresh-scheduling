# 0018: Electives, the data

Status: proposed (2026-10-22), electives slice E1; slice E6 (ADR 0017 choices 10 to 21) writes
campers, committed runs and their choices, and is reached from the page's address until the
Electives menu opens (ADR 0017 choice 19) (plan: wiki `projects/shoresh-sf-electives-plan`,
§3 and §8). Design source: the plan's §3 data model, which replaces the Electives section of the
wiki data model (draft 4) and amends wiki decision `0007-scheduling-data-model-shape`; Greg's
decision 48 (wiki `projects/shoresh-scheduling-sf`, 2026-10-21, point 3 amended 2026-10-22); the
desktop's ADRs `2026-09-17-individual-elective-scheduling`,
`2026-09-23-elective-run-lifecycle-and-remaining-slices`, `2026-09-27-elective-preference-etl-canonical-record-and-learned-axis-binding`
(§4.3, §4.4) and `2026-09-29-linked-elective-bundles`, and its `electron/ops/deleteWeek.js` and
`DeleteWeekDialog.jsx` (a week with elective runs is refused). Names follow ADR 0009. The Electives menu
entries stay "Coming" until slice E11 passes.

_Amended 2026-10-22, slice E4 (the Electives setup screen): choices 8 and 11, and choices 12 to 18;
2026-10-23, choice 19 (Import a list and Download this list, Greg: built in this slice). Design source: Greg's approved mock-up (design-research `electives-r1`, `setup-a`: linked
choices beside the table) and decision 53 (wiki `projects/shoresh-scheduling-sf`); the plan's §1,
§2 and §4.1; the desktop's `ElectivesScreen.jsx`, `elective/ElectiveSetDetail.jsx` and
`elective/BundleEditor.jsx`._

_Amended 2026-10-23, slice E7 (Elective seats): choices 28 to 37, and choice 1 (the run's
`Dropped__c`, the schedule's version reason "Electives finalized"). Design source: Greg's approved
mock-ups (design-research `electives-r1`: `seats-offering-a`, counts with the roster opening
beside; `seats-camper`, `seats-problems`, `seats-final`, `seats-out-of-date`) and decisions 48
(2: seats stay apart from Publish; 6: Start a new version carries choices, locks and hand moves)
and 53 (Assign again in the top bar next to the main button; a parent's comment as a speech
bubble); the plan's §1 steps 5 to 7, §2 "Seat assignment" and "The run", §3 "Finalize", §4.3 and
§5; the desktop's `ScheduleElectivesScreen.jsx`, `elective/run/` (`DraftRunView.jsx`,
`FinalRunView.jsx`, `runStateCopy.js`), `assignment/notRequestedReasons.js`,
`assignment/resolvePreferenceCoordinates.js`, `assignment/deriveOccurrences.js`,
`assignment/buildAttendance.js`, `electron/ops/finalizeElectiveRun.js`,
`electron/ops/setElectiveAssignment.js` and `engine/routeConflicts.js`, and its ADRs
`2026-09-17-individual-elective-scheduling` (D2.7, D3), `2026-09-23-elective-run-lifecycle-and-remaining-slices`
(a, b; Q1/Q2, Q5; amendment 2026-09-24) and `2026-10-11-locked-elective-seat-survives-unmerged-regeneration`._

_Amended 2026-10-23, slice E8 (linked choices): choices 38 to 44, and choice 16 (the editor's
place is now the editor). Design source: Greg's approved mock-up (design-research `electives-r1`,
`setup-a`: "Pottery double" with a small week strip and All / Only these / All except) and
decision 53.1 (beside the table); the plan's §1 step 3, §2 "Where electives happen" (linked
choices), §4.1 and §5; the desktop's `elective/BundleEditor.jsx`, `ElectiveSetDetail.jsx`
(`proposeBundleName`, the bundle writes), `bundleOverlap.js`, `assignment/deriveBundlePickerCells.js`,
`assignment/deriveChoices.js`, `assignment/solvableBundles.js` and its ADR
`2026-09-29-linked-elective-bundles` (D2 to D8)._

_Amended 2026-10-23, slice E10 (rosters and downloads, the campers round trip, end-of-season
Clear): choices 51 to 58, and choice 29 (the main button of a final run is Download). Design
source: Greg's approved mock-ups (design-research `electives-r1`: `downloads`, `rosters` option A,
`clear-b` and `clear-b-week`) and decisions 48 (2: Finalize, then downloads; 4: Clear removes the
runs and the campers no longer used, sets stay), 53 (4: printed rosters one page per offering) and
59 (Clear drawn as the season itself, no explaining sentences); the plan's §1 steps 8 and 9, §2
"Rosters and downloads" and §7; the desktop's `elective/export/` (`exportActivityRoster.js`,
`exportChildSchedule.js`, `exportRunExceptions.js`, `exportRunSummary.js`,
`exportElectiveRunWorkbook.js`), `utils/exportCamperWorkbook.js`, `ops/purgeElectiveSeason.js`,
`ElectivesScreen.jsx` (Clear's scope and words) and the Director Guide §11._

_Amended 2026-10-23, slice E9 (electives in last year's file): choices 45 to 50, and choice 42
(two offerings' linked choices may share a period). Design source: the plan's §6.1 and slice E9;
the desktop's ADR `2026-10-11-import-electives-keep-their-shape`, Director Guide §6
"Double-period electives" and `electron/ops/materializeImportedVersion.js` (`writeSpanBundles`,
T219, T375); ADR 0006 choice 23 for how the file is read._

_Amended 2026-10-23, slice E5 (electives on the week grid): choices 20 to 27. Design source:
Greg's approved mock-up (design-research `electives-r1`, `grid-a`: one wide cell across the
bunks, decision 53.2; elective sets first in the drawer; padlock bottom-right and the look mark
top-right, decision 51); the plan's §1 step 2, §2 "Where electives happen" and §4.2; the
desktop's `SlotCell.jsx`, `ActivityPalette.jsx`, `CellInlineEditor.jsx`, `useSlotMutations.js`
(placing, the swap refusal), `engine/electiveOccupancy.js`, `buildSchedule.js` and
`computeOverlaps.js` (an elective set takes up its offerings' places), and its ADRs
`2026-08-20-electives-authoring` (D1) and `2026-08-22-nested-schedules-electives-and-events`
(§2, §4)._

## Choices

1. **Eight objects**, in two master-detail chains under the season, so they share like everything
   else (controlled by the season, platform check (b)):
   - `ElectiveSet__c` (detail of Season): the menu. Name, `CopiedFrom__c`.
   - `Offering__c` (detail of ElectiveSet): `Activity__c` (required), `Seats__c`,
     `NoSeatLimit__c`, `MinimumToRun__c`, `Proposed__c`, `CopiedFrom__c`. Who can take it and where
     it happens come from the activity; the data model's `Location__c` is not added.
     A set's count ("Chugim (4)") means confirmed, open offerings only (decision 53): not
     `Proposed__c` and not closed (0 seats). It is worked out when shown, so no count field
     is stored and no field changes for it.
   - `LinkedChoice__c` (detail of ElectiveSet): Name, `Offering__c` (required, same set),
     `AppliesTo__c` (All, Only these, All except; All by default), `SortOrder__c`, `CopiedFrom__c`.
   - `LinkedChoiceTime__c` (detail of LinkedChoice): `Weekday__c` (Monday to Friday) and
     `TimeBlock__c` (required). Set once, it applies every week the set is placed there.
   - `Camper__c` (detail of Season): Name as imported, `CamperNumber__c`, `ParentComments__c`.
   - `ElectiveRun__c` (detail of Season): Name ("Chugim · Week 3"), `ElectiveSet__c`, `Week__c`,
     `Schedule__c` (all required), `Status__c` (Committed by default, Final), `SourceFile__c`,
     `SourceFingerprint__c`, `TimesFingerprint__c`, `EngineVersion__c`, `FinalizedAt__c`,
     `FinalizedBy__c`, `FinalSchedule__c`, `NewVersionOf__c`, `Revision__c`.
   - `Preference__c` (detail of ElectiveRun): `Camper__c` (required), `Group__c`, `Choices__c`,
     `ImportedChoices__c` (long text, compact; their format is slice E6's: ADR 0017 choice 16),
     `ManualChange__c`.
   - `Assignment__c` (detail of ElectiveRun): `Camper__c`, `TimeBlock__c`, `Offering__c` (all
     required), `Group__c`, `LinkedChoice__c`, `Date__c` (required by a validation rule),
     `Locked__c`, `ByHand__c`, and `ActivityName__c`, `LocationName__c`, `GroupName__c` (copied at
     finalize, slice E7).

   Not added, as the plan says: `ElectiveTime__c` (elective times are worked out from where the set
   sits on the grid), `ElectiveSet__c.Reusable__c`, `Camper__c.Contact__c` and `Active__c` (adding
   a field later is safe; removing a released one is not). _Slice E7_ adds the schedule's version
   reason "Electives finalized" (`ElectivesFinalized`), which Finalize writes, and
   `ElectiveRun__c.Dropped__c` (long text, no names: choice 31).

2. **Permissions live in the Shoresh Scheduler permission set** (Greg, decision 48.1: only admins
   use Shoresh and they already see campers' names, so this is not a privacy issue). It reads,
   creates, edits and deletes all eight objects and every field that can be granted. The plan's
   second _Shoresh Electives_ permission set is not made. A Jest test
   (`scripts/__tests__/electives-metadata.test.js`) fails if a field is left out or a second
   permission set appears.
3. **Parent comments are saved with the camper** (decision 48.3, Greg chose (a)):
   `Camper__c.ParentComments__c`, long text, word for word, so they are there when seats are
   placed. Never read as choices (desktop ETL §4.3) and, as on the desktop, never put in a
   download (a rule for slice E10). How a second sheet's different comment is kept is slice E6's:
   added after what was saved, on a line of its own, never erasing it (ADR 0017 choice 15).
   **No opt-outs** (decision 48.3, amended 2026-10-22): a camper who opted out is placed by the
   camp outside Shoresh, so nothing stores one; the Jest test fails on any field named for one.
4. **Only what is needed about a child, and classified.** A camper holds a display name, an
   optional camper number and the parent's comments, nothing else. Salesforce's data
   classification is set: name and number Confidential, comments Restricted, choices
   Confidential. Field history is off on every elective object. No message names a camper: the
   refusals below say "this number" and "this name".
5. **Keys** (hidden, unique, filled by triggers; plan §3):
   - a set's name once per season, spaces and capitals aside ("Another elective set in this
     season is called "chu gim".");
   - an activity once per set ("This activity is already offered in this elective set.");
   - a camper once per season: by camper number (spacing and capitals aside), else by a SHA-256 of
     the name, so the key holds no second copy of it. Two campers with one name and no number
     are refused, the desktop's one refusal ("Another camper in this season has this name and no
     number. Give each a number to tell them apart.");
   - one set of choices per camper per run; one seat per camper per date and time block per run.
     These two triggers only fill keys and read nothing, because Shoresh's own saves write them
     hundreds at a time and check what they save (plan §5); a duplicate is refused by the key.
6. **Kept inside the season** (as every setup record is): an offering's activity, a linked
   choice's time blocks and divisions, a run's set and week, all in the same season; a linked
   choice's offering in the same set; a run's schedule (and final schedule) of the run's week.
   Seats are 0 or more (0 is closed) or No limit; blank seats are allowed (seats are not assigned
   until they are filled, plan §2); a minimum is blank or 1 or more.
7. **Who a linked choice is for** uses `Coverage__c`, which gains the owner `LinkedChoice__c`
   (exactly one owner: a recurring activity or a linked choice). A linked choice's rows name
   divisions only ("Choose a division: a linked choice is for whole divisions."), read only when
   it applies to Only these or All except. They take no part in the fixed and recurring
   activities' clash check.
8. **Delete protection.** Every lookup on the elective objects that points at something real is
   restrict-delete (copy links, a new version's link back and the user who finalized are not).
   The setup screens' delete says what is in the way and the fix, in the camp's words, beside any
   other reason (`ElectivesInUse`, joined into `InUse`):
   - an activity offered in a set: "it is offered in "Chugim". First take it off that elective
     set";
   - a week, program, division, group or time block a run uses: "it has elective runs: "Chugim ·
     Week 1". First delete that run" (the desktop's "Delete its elective runs first");
   - a division a linked choice names, a time block that is one of its periods.
     Deleting an elective set a run uses is refused, naming the runs; otherwise its offerings and
     linked choices go with it (its linked choices are cleared first, since they point at its
     offerings). Deleting a linked choice takes its Coverage rows. Deleting a run takes its choices
     and seats.
   - _Slice E4:_ deleting an offering takes its linked choices and their Coverage rows (an
     offering trigger, as the desktop's `deleteBundleRows` does when an offering is removed);
     seats that name it still refuse it ("it has elective runs: "Chugim · Week 1". First delete
     that run"). The screens say an elective set's or an offering's runs first (`ElectivesInUse`),
     in the same words as every other refusal; the set's trigger stays the backstop.
9. **Deleting a season** clears its elective runs first (they point at its sets, weeks,
   schedules, campers, groups and time blocks), then its linked choices and elective sets, before
   the rows it already clears; campers go with the season.
10. **Copy last season carries the menu, not the summer**: elective sets, offerings (seats, no
    limit, minimum, proposed), linked choices with their periods and divisions, each linked to its
    original by `CopiedFrom__c` and pointed at the copied activities, time blocks and divisions.
    Campers and elective runs (choices and seats) are not copied.
11. **Reads are bounded.** Copying a season's electives is five queries whatever its size; a
    refused delete is at most a few more. Tests (`ElectivesDataTest`) run as a scheduler with
    their records made inside the same `System.runAs`, and assert the query counts for a refused
    delete, a season delete and a season copy. _Slice E4 (the bulk check PR #120's review asked
    for):_ a week of 251 campers, their choices and their seats, saved in user mode past one
    trigger batch of 200, takes exactly 2 queries for the campers (the key check, once per batch)
    and none for the choices or the seats.

## Slice E4: the Electives setup screen

12. **Reached from the page's address until slice E11** (decision 44: no camp sees half of
    electives). The menu lists Electives under Activities & Events as coming. The Shoresh tab
    opened with `?c__preview=electives` (`/lightning/n/Shoresh_Camp_Setup?c__preview=electives`)
    opens the screen once the season is read, and lists it in the menu as built on that page only
    (`c/shoreshScreens` `previewScreen`, `canOpen(screen, hasSeason, preview)`). No other screen
    or value opens that way. Its Needs attention items (choice 17) show only on that page too, so
    a camp never sees an item it can't open. The browser check and the Jest tests reach it this
    way; E11 takes Electives out of the coming list and the route then changes nothing. An address
    was chosen over a hidden key press or a setting because it changes nothing a camp sees and
    stores nothing.
13. **Its layout is the approved mock-up's (setup-a).** The rail counts the season's elective
    sets ("2 elective sets", in the camp's word) with the quiet Saved. One section per set, in name
    order, headed with its name and its count of **confirmed, open offerings** (decision 53: not
    proposed, not closed; blank seats still count, they are only not filled in yet), so "Chugim 4"
    is the number the grid will show. A row per offering, in the activity's name order (the
    desktop's): the activity (a choice of the season's activities, less those already offered in
    that set: an activity is offered once in a set), its seats, its minimum, who can take it and
    where it happens (the activity's own, read only, never typed twice: plan §2), and its linked
    choices by name. The blank row reads "Add to Chugim". The sets themselves are named, added and
    deleted in a list under the sections ("Elective sets", "Add Elective set"), as location types
    are under the Locations sections. The desktop's set table ("Open", "Rename", "Delete") and its
    separate set page become this one screen, as the mock-up draws it.
14. **Seats say what they are** (desktop D3: "No limit" and closed must be unmistakable). At rest
    a number, "No limit" (ticked), "Closed" (0), or nothing while blank; under the pointer or while
    the row is edited, the number and a No limit tick in their place. The number waits while No
    limit is ticked; its value is kept, and ignored, as the validation rule already says. The
    minimum is a number, "No minimum" quiet while blank; 0 is refused by the rule ("Must be 1 or
    more, or blank for no minimum.").
15. **A proposed offering is marked by its outline**: its row has a dashed edge and **Confirm** at
    its end, shown as the approved mock-up draws it ("under the pointer it offers Confirm"; plan
    §4.1, "hover shows Confirm") and also while the keyboard is anywhere in the row, as the row's
    tools and the seats fields are. At rest it only fades out, so Tab still reaches it and a
    keyboard user can confirm without a mouse (WCAG 2.1.1). Confirm saves `Proposed__c` false at once, as the row's change (compared and set like
    any field). Confirm is gone once saved, so the cursor stays in the row, on its offering
    (WCAG 2.4.3; the same for a note's fix button). A limited offering with blank seats carries the needs-a-look corner on its seats,
    its words only ("Seats not filled in yet"): the fix is typing in the cell, so there is no
    Looks right (`c/shoreshGuessMark` `wordsOnly`).
16. **Linked choices show beside the table, read only** (setup-a; decision 53.1). An offering's
    chevron opens them in the details zone (`c/shoreshElectiveDetails`): each one's name on the
    sheet, its periods ticked on a small week (Monday to Friday, its time blocks by start time),
    and who it applies to (All, Only these, All except, the chosen one raised, with its divisions).
    The editor is slice E8: its place is held at the foot by a disabled "Linked choice · Coming".
    Only offerings and sets are saved from this screen; a linked choice sent here is refused
    ("These screens can't save that."). _Slice E8:_ the details are now the editor (choices 38 to
    44); a linked choice is still never saved through the setup tables' save, only through its
    own (`LinkedChoicesController`).
17. **Saved as every setup row is** (ADR 0011): row by row, compared and set, in user mode.
    `ScreenSaves` allows a set's name, and an offering's activity, seats, No limit, minimum and
    Proposed; the parent (the season, the set) only on a new row, so an offering never moves to
    another set. Offerings have no order of their own, so the table sends none. Deleting asks
    first: an offering, 'Take "Archery" off "Chugim"? The activity is kept.' (the desktop's
    "Remove …? The activity is kept."); a set, as every setup delete asks. A row is named by its
    activity in its buttons and in what is said (an offering's own name is a number). **Roots'
    Needs attention** lists a proposed offering ('In "Chugim": proposed, not confirmed yet.') and
    one with blank seats ('In "Bechirot": seats not filled in yet.'), plan §4.6; the screen marks
    both in their rows (choice 15), so its own list above the table leaves them out.
18. **The season read carries the electives** (`ElectiveMenus`, in `SeasonSetupReader`): the sets,
    their offerings, and the linked choices with their periods and divisions. Three queries for any
    number of sets, one when the season has none, in user mode; someone who may not read elective
    sets gets none rather than a refusal of the whole season. `ElectivesScreenTest` checks the
    read, the row saves (and someone else's change asked about) and the deletes, as a scheduler
    with its records made inside the same `System.runAs`, with query bounds.

19. **Import a list and Download this list for the offerings** (plan §6.2; on the Electives rail
    as setup-a draws them; Greg, 2026-10-23: built in this slice, not a separate E4b). They are the
    generic list import and download (ADR 0007, `c/shoreshLists`, `ImportListSaves`,
    `c/shoreshDownload`) with the screen's own layout, which is not a sheet of the camp workbook
    (the workbook doesn't carry sets): **Elective set, Activity, Seats, Minimum, Proposed**.
    - **Scoped by set**, as a program's lists are by program: a camp with one set can leave the
      column out. A set the season doesn't have is added with the list (shown, ticked, before
      Save); a name like one it has is asked, never guessed.
    - **Named by the activity**: each row's activity is settled first, as Import last year asks
      (a similar name is the same question, answered once for both), then matched to the
      offering of that activity in its set. An activity the season doesn't have is added as one
      added by hand starts. A set never changes name and an offering never moves to another set
      or activity on a list (`ImportListRows`: new-only links).
    - **Proposed**: an offering a list adds is proposed unless the file says No (the desktop's
      import only ever proposes, `electiveSetPopulate.js`); a file with only names offers each
      with no seat limit, as the desktop's import does. Seats are a number (0 is closed), "No
      limit", or blank (not filled in yet, on a new offering too). On an offering set up, every
      difference, Proposed included, is a Keep or Change: a file never confirms or un-confirms
      one silently.
    - **A choices file says so** (the desktop's "That file is camper preferences, not
      offerings."): a file in which the choices reader finds campers with choices is not read
      as offerings, nothing is saved, and the panel says "<file>: that file is camper choices,
      not offerings. Nothing was saved." with **Bring in choices**, which opens that screen (it
      asks for the set, week and schedule before the file, so the file is chosen there again).
    - **Things you delete stay deleted** (#101, decision 45): deleting an offering on the screen
      is remembered as `deleted|Offering|<set>|<activity>`, a set as `deleted|ElectiveSet||<name>`;
      the list leaves those rows out (a deleted set's rows, and an activity deleted on
      Activities) and lists them with Bring back.
    - **Undo last import** removes the sets, activities and offerings the list added and puts
      changed offerings back; a set someone has since offered something else in, an offering with
      linked choices or seats, and an activity offered by hand are kept and named (an offering by
      its activity).
    - **Download this list** writes every offering in the same layout, so it reads back with no
      changes, and into an empty season as the same sets and offerings. A set with no offerings
      has no row, so it is not in the file.

Also not in this slice: adding a new activity from the offering choice (the
desktop's picker can; here an activity is added on Activities first), the linked choices editor
(E8, choices 38 to 44), electives on the grid and the "not set up yet" Roots item (E5, E9).

## Slice E5: electives on the week grid

20. **An elective set on the grid is kind `E` with the set's record** (grid format version 1
    already has `E`; plan §3: "an elective cell set up in Salesforce carries the set's Id"). An
    `E` without an Id is still an import's "not set up yet". `E` joins `S` and `D` as a kind that
    points at a record once set up (`ScheduleGridRules.SET_UP_LATER_KINDS`, `isSetUp`; the
    browser's `identity` in `slotEdits.js` and `c/shoreshEngine` `grid.js`; `SlotIds.electiveIn`),
    so a deleted set shows as removed (`ScheduleRecordsThere`) and a saved name stays as saved.
    It is still an item the generator keeps, never places (`NOT_SET_UP_KINDS`, ADR 0010 §3).
21. **Each time block holds the set on its own** (desktop: a director-placed elective never
    spans, `useSlotMutations.js` refField; plan §2: an elective time is one per day, time block and
    division). Bunks side by side holding it in the same block are **one wide cell** across them
    (decision 53.2; the merge ADR 0014 choice 19 made for events, `mergeKey`), so two periods of
    Chugim are two wide cells, as `grid-a` draws them. The cell reads **"Chugim (4)"**: the set's
    name as setup has it now and its confirmed, open offerings (decision 53, the setup screen's
    count, `openCount`), with the set's mark before the name (the mock-up's); the padlock
    bottom-right and the look mark top-right show with it (decision 51). On the Schedules page
    (not changed here) it is one wide cell with the set's saved name and mark, no count.
22. **Placed as an event is** (ADR 0014 choice 19): from the drawer, where the season's sets come
    **first, before the activities** (the mock-up; only when the camp has any; "4 offerings" at the
    tile's foot), picked and put down, dragged, or picked while cells are chosen together; or by
    **typing** its name into a cell or the cells chosen (the typing box lists the sets first, as
    "Chugim (4)", as the desktop's `CellInlineEditor` offers them). Whatever was in those cells goes
    in full; a fixed or recurring activity, a bunk not at camp or a locked cell refuses it, saying
    which. Delete clears it from every bunk it is drawn across, as one Undo step; Clear day and
    Clear week clear it with the activities; Copy day to and Paste carry it. Saved as Manual
    Build's edits are (`SlotRules` with `SlotEvents`: only the season's sets, read once per save, one
    query only when an edit places one; another season's or a deleted one is refused: "That
    elective set was not found. It may have been deleted.").
23. **It never swaps** (desktop `useSlotMutations.js`: "Can't swap with an elective or an event.
    Move it to an empty cell instead."): an activity put down on a placed set or event is refused
    in those words (`moves.js` `NO_SWAP`; a placed event said "… stays where it is." before). It is
    not dragged or stretched itself.
24. **It takes up its offerings' places** (desktop `electiveOccupancy.js`, used by
    `buildSchedule.js` and `computeOverlaps.js`; "electives are not special"): each bunk holding the
    set is at the place of each of its confirmed, open offerings' activities (a place once per set,
    `readElectivePlaces`). Like a fixed or recurring activity it counts toward "more groups than
    fit" and never carries the dot itself, so an activity put at one of those places beside it is
    dotted (`checks.js placeCapacity`), and the generator sends a bunk there only by bending that
    rule (`week.js keepRun`). As on the desktop, each bunk in the set counts at every one of its
    places, though its campers spread across them; a camp whose places are set up to fit one bunk
    will see that. Other programs' published electives are not counted yet.
25. **It is not counted as placed** (desktop: elective cells don't count toward "placed"; the
    mock-up's counter): a placed set is no cell to fill (`checks.js filledCount`), so the counter,
    Filled and Still to place leave it out. A set noted from a file by name counts as before.
26. **The generator keeps it** (ADR 0010 §3, as it keeps imported ones): a full build, Try another
    and Start over never clear, move or fill over it, and the server refuses a build that changes
    one, naming it ("Chugim stays where it is."; the name was a record Id for a placed event
    before, `GeneratedChecks.savedName`). Hand edits on Generated Schedule place it as on Manual
    Build, locked like any hand edit.
27. **"Set it up" binds a noted elective by name** (plan §6.1 "bound by name"; ADR 0014 choice 23):
    with focus on a cell a file noted as an elective ("Chugim isn't set up yet · Set it up"), one
    click points every cell of the draft that named it at the season's set of that name (spaces and
    capitals aside), or at a new set named as the file had it, with no offerings yet (desktop:
    "created set name = the header text verbatim"): '"Chugim" is set up as an elective set.'
    (`SpecialSetUp` with `SpecialNamed.electiveSet`, from `SpecialPlacingController.setUpItem`, under
    the draft's own lock). **Start from another week** carries a placed set where it was while the
    season still has it (a deleted one is listed, "deleted from setup"), as the week's pattern;
    events are still left out, placed day by day.

Checked by `ElectivesOnGridTest` (as a scheduler, records made in the same `System.runAs`: placed
by its record one block at a time, still there, in a bounded save; another season's refused; Set
it up binding to the set of that name and making one; Start from another week carrying it; a
Generated build never placing one and refused when it changes one), `shoreshWeekEditor`
`electives.test.js` (the drawer first and only with sets, putting down, chosen cells, each block on
its own, one wide cell, typing, no swap, clearing across bunks, places and the counter, Set it up,
axe), `moves.test.js` and `tools.test.js`, `c/shoreshEngine` `electives.test.js` (the places read,
kept, the bend, the dot and the counter), `shoreshScheduleViews` `electives.test.js` and
`shoreshScheduleGrid` `merged.test.js`, and in the test org by `scripts/a11y-browser-check.mjs`.

Not in this slice: typing "Chugim: Archery, Drama" to make a set with its offerings in the cell
(plan §4.2, desktop D1: here a set is made on the Electives screen, or from a noted cell), a set
noted in an imported version being set up from Roots (E9), and other programs' electives counted
at a place.

## Slice E7: Elective seats

28. **A screen, `c/shoreshElectiveSeats`, under Schedules** (plan §4.3; the mock-ups put "Elective
    seats" between Manual Build and Schedules). The menu lists it there as **coming** until slice
    E11 (decision 44); the page's address opens it (`?c__preview=electiveSeats`, the one route of
    choice 12, `c/shoreshScreens` `previewScreen`). It is drawn only while shown. Its Bring in
    choices opens that screen (ADR 0017 choice 19). Seats are separate from Publish (decision
    48.2): Finalize, then the downloads (slice E10).
29. **The rail** (seats-offering-a): the week (with its arrows) and the elective set on the left,
    and **"Assign against"** only when the week has more than one working schedule (desktop D2.7,
    as Bring in choices asks); **By offering** and **By camper** in the middle; on the right the
    counter, **Bring in choices**, **Assign again** (in the top bar next to the main button,
    decision 53, once seats exist), the run's state, and the one main button: **Assign seats**,
    then **Finalize**, then **Download** (a menu, slice E10: choice 51). The run shown is the set's committed run for that week and schedule, else its latest
    final one; the state's menu lists every run of them ("Final 14 Oct · Greg", "Committed 12
    Oct") and offers **Start a new version** from a final run. The screen opens on the latest run.
30. **Where electives happen, worked out each time** (`ElectiveTimes`; plan §2; desktop
    `deriveOccurrences.js`): from the run's schedule's days, one elective time per day, time block
    and division where the set sits, with the bunks there. A time offers the set's **confirmed**
    offerings whose activity is open to it (no eligibility rows, or one for its division or one of
    its bunks; `c/shoreshEngine` `readEligibility`'s rule, per division); a closed one (0 seats)
    is offered and takes nobody. Each division's time has the offering's seats, as the desktop
    gives each occurrence its capacity. A camper takes their bunk's time; a camper whose sheet gave
    no bunk takes, at each day and block, the first division's time there (division order), and
    is listed under "No Bunk" with the needs-a-look corner (decision 48.5; the desktop's
    "tier-wide admission" would seat them twice at one time, which the seat key forbids). A
    camper whose bunk has no set that week takes no time and is counted in the problems. A
    choice for a day and period is matched to that time by the day's name and the block's name,
    number or start ("Period 2", "2", "12:30"; desktop `resolvePreferenceCoordinates.js`); one this
    schedule doesn't have counts for the whole week and is listed in the desktop's words ("No
    session at Friday Period 9 on this schedule.").
31. **Assign seats runs the engine in the browser** (ADR 0016) on the run's choices and locks, with
    no linked choices yet (slice E8; the input keeps their shape). Choices in no order are a tie,
    rank 1 each, never an order. A confirmed limited offering with blank seats stops it before
    anything is sent ("Fill blank capacities first." and the names). The browser sends the seats;
    the server (`ElectiveSeatSaves.assign`) **checks what it saves** (plan §5): the run is
    committed and at the revision the screen read; every seat's camper is in the run, at a time
    their bunk holds the set now, once per day and block, in an offering confirmed and open then;
    no locked seat changes; nothing beyond its seats except what locks alone hold. Then it
    replaces the unlocked seats, writing only the difference (a seat already at a camper's day and
    time is kept or its offering changed in place; the rest are inserted or deleted), so Assign
    again at 500 campers × 10 times stays well under Salesforce's 10,000 rows per save; a save that
    would still pass 9,500 rows is refused before anything is written ("Too many seats change to
    save at once (…). Nothing was changed."). It keeps every lock (assigning again fills only what is left), sets
    the run's `TimesFingerprint__c` (a SHA-256 of every cell holding the set), `EngineVersion__c`
    and `Dropped__c` (what did not run below its minimum, as time, activity, how many it had and
    needed: the engine's finding, kept so "Dropped had 4 of 6" stays after a reload). The engine
    takes under a second for a camp of 500 (ADR 0016's size check), so there is no progress
    state; the main button waits while it works.
32. **By hand** (desktop `setElectiveAssignment.js`, `DraftRunView.jsx`). In By offering a cell
    ("13 of 15", its dots; "Dropped had 4 of 6" with the corner; "Not offered" where its activity
    isn't open) opens its **roster beside**, with the cursor on its heading: each camper and their
    bunk, the **padlock** (pressed when locked) and **Move to…** (the other offerings then); a
    name can also be dragged onto another offering at the same time. A move is a hand move and
    **locked**, as the desktop makes it; it may put an offering over its seats, which is then
    shown as a problem, never refused. The padlock locks or unlocks a seat as it is. Each change is
    one save (`ElectiveSeatSaves.change`), checked as Assign's are, with the run's revision. A refused
    change puts the cursor back on what asked (the padlock, Move to…, the notice's Unlock), or the
    roster heading when that is gone or the change was a drag, never on the page (WCAG 2.4.3).
33. **Finalize** (`ElectiveFinalize`; desktop `finalizeElectiveRun.js`), in one transaction, is
    refused with the reason when: there are no seats ("Assign seats first."); where the set sits
    changed since seats were assigned ("Schedule changed. Assign again first.", with **Assign
    again** beside it); a seat no longer fits its offering; or a place is **double-booked** at one
    of the set's times ("Double-booked on the schedule (Range, Tuesday, Period 3). Fix it, then
    finalize."): `ElectivePlaceClashes` counts, at those times only, each activity, fixed and
    recurring activity at its place and each elective set at the places of its confirmed, open
    offerings, for every bunk (as choice 24 and the desktop's `routeConflicts.js`), against the
    place's groups that fit. Otherwise it keeps a version of the run's schedule (reason Electives
    finalized, `ManualVersions.keepWithReason`) and points `FinalSchedule__c` at it, copies the
    activity's, place's and bunk's names onto the seats, and makes the run **Final** with when and
    by whom. A final run never changes: every save to it is refused ('"Chugim · Week 3" is final,
    so its seats can't change. Start a new version first.'). It reads "Final · 14 Oct · Greg".
34. **Out of date** (desktop ADR 09-23 amendment 2026-09-24: on the run's own screen, never a
    banner): a final run is shown as it was finalized, its times from the version kept; when where
    the set sits on the live schedule differs from the fingerprint, its state reads **Out of
    date** with the corner, its menu says "Schedule changed since it was finalized" and offers
    Start a new version. A committed run in the same case keeps reading Committed with the corner
    ("Schedule changed since seats were assigned"), and Finalize says so.
35. **Start a new version** (decision 48.6; desktop wording Q5): a Committed copy of a final run,
    linked by `NewVersionOf__c`, with every camper's choices (as imported and as changed by hand),
    and only the seats a person set (locked, or moved by hand); Assign seats fills the rest. The
    final run stays as it was. One working version at a time: a second is refused, pointing at the
    first. Bringing in choices goes into the new committed run (`ChoicesImportPlace`).
36. **By camper and the counter** (seats-camper, seats-problems). By camper lists each bunk's
    campers (bunk order, then name), then "No Bunk"; a seat shows its offering alone for a first
    choice and otherwise "· 2nd", "· One of their choices" (unordered: never a rank) or "· Not
    chosen"; a lock shows the padlock bottom-right; no seat is an empty slot with the corner
    top-right. A parent's comment (decision 48.3) is a speech bubble beside the name that opens
    "From the sheet" and the words, on pointing or pressing, Escape closing it. The counter "212 of
    214 placed" counts campers with a seat at every time they take, and opens to the problems, in
    the mock-up's order: who couldn't be placed (each opens their row), what was dropped below its
    minimum, kept below its minimum, over its seats, locks that no longer apply (with Unlock, also
    listed above the board: desktop R6/R7, never dropped), times with nothing offered, how many
    didn't get their first choice and how ("Second choice", "One of their choices", "Not one they
    chose"), and the rest (No Bunk, a bunk with no set this week, choices whose day and period
    didn't match).
37. **Bounded, and checked as a scheduler.** A run's read is 8 queries whatever its size (9 for a
    final run); Assign, a change, Finalize and Start a new version add a fixed few. `ElectiveSeatsTest`
    (records made inside the same `System.runAs`, as a scheduler) assigns 520 seats for 260 campers
    and finalizes them within their query bounds, and checks every refusal above, locks kept,
    a hand move over seats, the padlock, a final run refusing changes, Start a new version and a
    camper with no bunk. Jest: `shoreshElectiveSeats` `seats.test.js` (the engine's input, choices
    matched to times, what is sent, the same seats in any input order, 260 campers, the board and
    the problems) and `shoreshElectiveSeats.test.js` (the screen, with axe), also namespaced; the
    page (`shoreshCampSetup`: the address route, the menu's coming entry); and the real-browser
    check (`scripts/a11y-browser-check.mjs`).

Not in this slice: linked choices (E8, choices 38 to 44), downloads and rosters (E10, choices 51 to 58), a
progress state for very large camps, and a camper's own week view. Who can take an offering is
counted per division at a time: an activity set up for one bunk of a division is offered to that
division's time, and the server allows its other bunks' campers in it.

## Slice E8: linked choices

38. **The details beside the Electives list are the linked choices editor** (`c/shoreshElectiveDetails`;
    setup-a; desktop `BundleEditor.jsx`). For the offering whose chevron opened them, each linked
    choice shows **Name on the sheet** (a field), **Periods** (the small week) and **Applies to**
    (All, Only these, All except, the chosen one raised), with its divisions to tick under Only
    these or All except, and **Delete**. "+ Linked choice" at the foot adds one. The Electives
    menu entries stay "Coming" (decision 44); the screen is still reached from the page's
    address (choice 12).
39. **The small week is where the set sits** (desktop `deriveBundlePickerCells.js`: the cells the
    set is placed in, never a grid of every period). A linked choice's periods are a weekday and a
    time block, the same every week (`LinkedChoiceTime__c`), so the week shown is every week's at
    once: every weekday and time block where some working schedule of the season (Manual Build,
    Generated, Published; never a saved version, as Bring in choices offers them) holds the set,
    with the divisions there (`LinkedChoicePlaces`, read when the details open). Rows are the time
    blocks by start time, columns Monday to Friday; a cell where the set sits is a button, pressed
    when it is one of the linked choice's periods. Reading the days follows `ScheduleUses`: the
    day parts are listed first, their text read 25 at a time, and only a day that names the set
    is read as a grid; past 40 such reads the week says "Not every schedule could be read, so some
    places Chugim sits may be missing." A set placed nowhere says "Place Chugim on a schedule
    first" (the desktop's words) and offers no "+ Linked choice".
40. **Each gesture is one save, as the desktop writes each click** (`LinkedChoiceSaves`, through
    `LinkedChoicesController.saveLinkedChoice`, in user mode, all or none): a name (saved when the
    field is left or Enter pressed, as every setup field), Applies to, a period ticked or
    unticked, a division ticked or unticked. A change says only what it changes (`periodsOn`,
    `periodsOff`, `divisionsOn`, `divisionsOff`), so ticking twice is the same as once and two
    people ticking different periods never undo each other; what one person last named or chose
    for Applies to is what is kept, as the activity details are (ADR 0011's compare and set is for
    a row's fields; a linked choice is edited a click at a time). The change shows at once and
    stays until the season is read again; a refused one is taken back and said in the panel
    (`role="alert"`). Saves wait their turn with the setup tables' rows (`saveForm`).
41. **A linked choice is made by picking its first period** (desktop: the first period click mints
    the bundle). "+ Linked choice" opens one with a dashed outline, the cursor in its name; Applies
    to and divisions chosen before a period go with it; the first period saves it. Its name is
    what was typed, or the desktop's proposal (D7): **the activity's name** for an offering's
    first linked choice, and for a later one **the activity and that period** ("Pottery · Thu
    12:30"), never the bare name twice. Once saved, the cursor stays on the period picked. Cancel
    drops one not yet saved. A new linked choice goes after the set's others (`SortOrder__c`). A
    blank name is refused ("Give the linked choice a name: it is what a sheet says to choose it.").
    Two linked choices may share a name (desktop D7: no uniqueness), and the name field then
    carries the needs-a-look corner ("Another linked choice in Chugim is called this, so a sheet
    can't tell them apart.").
42. **What would keep it from being placed as a set is marked where it is** (plan §2: "Two bundles
    that share a period are refused, a known limit"; desktop D8 recommends warning while
    authoring): a period also held by another linked choice of the same offering for a division
    both apply to carries the corner ('Also in "Drama double", so neither is placed as a set; their periods
    are filled one at a time'), and a period where the set no longer sits on any schedule stays
    shown, pressed, with the corner ("Chugim isn't here on any schedule now"). Unticked, it keeps
    its button (and the cursor) while the details stay open, so it can be ticked back; the next
    time they open it is gone, as the set isn't there. The desktop warns
    only for two bundles of one activity; the seat engine refused any two linked choices sharing a
    time, whatever their activity, so the mark did too. _Slice E9:_ only two of one offering
    (activity) are refused now (ADR 0016 choice 2): two offerings' linked choices take their own
    seats at a shared time, and a double period read from last year's file links every choice
    across it. The mark and the seats screen's problems (`linked.js`) follow. Nothing is resolved
    for the director.
43. **Deleting** is the setup screens' delete (`SeasonSetupController.deleteRecord`, now allowing
    `LinkedChoice__c`): asked first ('Delete "Pottery double"? A sheet that names it then counts as
    Pottery.'), its periods (master-detail) and divisions (its trigger) go with it, and it is
    refused while a run's seats are part of it ("it has elective runs: …", `ElectivesInUse`).
44. **Seats and sheets** (ADR 0016 "Slice E8"; ADR 0017 choice 22): Elective seats reads the set's
    linked choices with the run (one more query; a run's read is 9 queries); Assign seats places
    them as sets and saves each such seat's `LinkedChoice__c`, which the server checks
    (`ElectiveLinkedSeats`: a linked choice of the set, in its own offering, at one of its periods,
    for a division it applies to, and a camper placed in it has a seat at every one of its
    periods); a seat moved by hand is no longer part of it (`LinkedChoice__c` cleared; a lock alone
    keeps it); Assign again changes it in place. The counter lists what keeps a linked choice from
    being placed as a set ("1 linked choice filled one period at a time": a period this schedule
    doesn't have for a division it applies to, an activity not offered at a period, two sharing a
    time; the count is of linked choices, not of the rows under it), worked out from the run each
    time, as the other problems are (choice 31). It also names each camper the engine fills one
    period at a time although the set is placed (the engine's `UNSUPPORTED_LINKED_CHOICE` for
    campers, by its own rule: "2 given their linked choice one period at a time", 'Asked for
    "Pottery double" but doesn't attend every period it covers' or '... but has a locked seat in
    one of its periods'), and each camper who asked for a linked choice that doesn't cover them
    (their division left out by Only these or All except, or holding none of its periods): their
    choice is never dropped but counts as its activity, as it was saved, and is said ("1 asked for
    a linked choice not for their division", '"Pottery" doesn't cover Seniors, so it counts as
    Pottery'; desktop D6 amendment 2026-09-30, `BUNDLE_TIER_NOT_COVERED`: "treated as
    ordinary"). This matters most for an offering's first linked choice, which is named as its
    activity (choice 41), so a sheet's plain "Pottery" is its choice.

Checked by `LinkedChoicesTest` (as a scheduler, records made inside the same `System.runAs`: the
week read from working schedules only, bounded, and incomplete past its budget; a linked choice
made by its first period and changed gesture by gesture, bounded; untick, a second one's order;
every refusal with nothing written; delete with its rows), `ElectiveSeatsTest` (a linked choice
read with the run within 9 queries, its seats saved as a set, Assign again, every refusal, a hand
move, the refused delete), `ChoicesImportTest` (a sheet's choice of a linked choice), Jest
(`shoreshElectiveDetails`: the editor's every gesture, the draft, the marks, the notes, axe;
`shoreshCampSetup` `electives.test.js`: a save in turn and the delete question;
`shoreshElectiveSeats` `linked.test.js`, including the campers named against the engine's own
findings, an uncovered camper's choice kept, and the count of linked choices; `shoreshChoicesImport` `review.test.js`; also
namespaced), and in the test org by `scripts/a11y-browser-check.mjs` (the name and a period by
keyboard, each saved, axe).

Not in this slice: a linked choice shown as one cell across its periods on the seats screen's By
offering (the mock-up's "Pottery double is a single cell"; today each period is counted in its
offering), "Same as" on Bring in choices offering a linked choice (a name that is not exactly a
linked choice's is settled as an activity), and double periods in last year's file becoming
linked choices (E9).

## Slice E9: electives in last year's file

45. **Import last year saves what it read** (ADR 0006 choice 23; `ImportElectiveWrites`, after the
    activities and before the versions, in the import's one all-or-none save, user mode): new
    elective sets (Name, season); the offerings it adds, **proposed** and with seats not filled
    in (the desktop's import writes its choices `potential` with no capacity: only confirmed
    offerings get campers, and blank seats stop Assign seats until filled, choice 15); and the
    linked choices a double period makes (Name, set, offering, Applies to All, after the set's
    others in `SortOrder__c`), with their periods (`LinkedChoiceTime__c`). Everything is only
    added: an entry naming a record is refused ("The import could not be read."), a set the camp
    has keeps its offerings, and only the offerings this import adds are linked.
46. **The version's elective cells point at the set** (choice 20): the screen sends the set's key,
    the server puts in its Id with the rest (`ImportVersionWrites`), so the imported version
    shows the set it is, and Start from another week carries it as choice 27 says.
47. **Undo last import** removes the linked choices it made (their periods go with them), then the
    offerings, then the sets, before the activities (`ImportUndoDeletes`). A linked choice with a
    period, a division or a seat someone added since is kept and named, and keeps its offering
    and set. `ImportFields` lists the two new kinds and the fields the import writes.
48. **A linked choice's periods read from the file are marked as guessed** (ADR 0006 choice 21):
    `guessed|<season Id>|LinkedChoice|<set>|<name>|periods`, answered with its periods
    ("tuesday/period 1|tuesday/period 2"). The linked choices editor shows the needs-a-look corner
    beside **Periods** ("Periods for Fishing: guessed from your file") with **Looks right**, which
    forgets it, puts the cursor on its first period and says "Fishing: looks right"
    (`SetupGuessConfirm` now takes a linked choice). Any change to its periods or its name clears
    the mark (`SetupGuesses` reads them from the season's electives; `ElectiveMenus` now reads
    `CreatedDate`; the save takes one more query, `SetupGuessRecords`).
49. **A linked choice the director deletes stays deleted** (decision 45): it is remembered by what
    it links, not by its name (which can change, and need not be unique, choice 41):
    `deleted|LinkedChoice|<set>|<activity>|<weekdays>|<time blocks>`, weekdays Monday to Friday
    and time blocks by start, joined with "+" (`SetupDeletionElectives`, one query). The next
    import leaves that linked choice out and lists it with Bring back.
50. **Two offerings' linked choices may share a period** (choice 42 as amended; ADR 0016 choice
    2): a double period links every choice across it, so they always do.

Checked by `ImportElectivesTest` (as a scheduler, records made inside the same `System.runAs`:
the sets, proposed offerings and linked choices saved within a query bound, the version's cell
pointing at the set; the guessed periods shown, Looks right and a changed period clearing them;
Undo removing everything, and keeping a linked choice given a period by hand; a deleted linked
choice remembered by what it links; an entry naming a record refused), Jest
(`shoreshImportEngine` `electives.test.js`, `shoreshImport.test.js`, `shoreshElectiveDetails`
(the guessed mark, two offerings sharing a period), `shoreshElectiveEngine` `assignSeats.test.js`
and the amended ported case, `shoreshElectiveSeats` `linked.test.js`; also namespaced), and the
real-browser check `scripts/a11y-browser-check.mjs` (added, not run in this slice).

## Slice E10: rosters, downloads and end-of-season Clear

51. **Download, once seats are final** (decision 48.2; the desktop offers its exports only on a
    final run, `FinalRunView.jsx`). A final run's main button is **Download**, a menu (the
    mock-up's): **Rosters**, **Print rosters**, **Camper schedules**, **Full report**, **Campers**
    ("to edit and bring back"), and under a line **Clear at season end…**. Before Finalize the
    run's own menu says why there is none ("Download · after Finalize", not a button) and offers
    Clear. The server refuses a download's read of a committed run too
    (`ElectiveDownloads.forRun`: "Downloads come once seats are final. Finalize first."). After
    Finalize the cursor goes to Download. The files are made in the browser with SheetJS
    (`c/shoreshDownload`) from what the director can already read, so no file is stored in the
    org; each read of a run is used for every download until it changes. File names carry the set
    and the week ("Chugim Week 3 rosters.xlsx"), never a child's name, and every text cell goes
    through the spreadsheet-formula guard. **A parent's comment is never in a download** (choice 3).
52. **What a final run's files read** (plan §3, "a final run's downloads never change"): the seats
    with the activity, place and bunk names copied at Finalize (sent with each seat now), the
    elective times and each bunk's week from the version of the schedule kept at Finalize
    (`ElectiveDownloads` reads that version's days and sends each bunk's cells from them,
    once per thing however many blocks it takes, and marks the cells holding this set), and the
    same reading as the seats screen (`readRun`, `buildBoard`), so the files and the screen can't
    disagree. The read is the run's own queries and one more for those days, whatever the size.
    - **Rosters** (decision 53.4, option A, the counsellor's page): one page per offering that runs
      this week, its elective times side by side, each "12 of 12" (the count alone with no limit;
      "Dropped, had 4 of 6") and who is there, sorted by bunk then name with the bunk beside each.
      **Print rosters** puts those pages on paper (`c-shoresh-roster-print`, the ShoreshPrint
      style, as the Schedules page prints); **Rosters** is the same as a workbook, a sheet per
      offering laid out as its page.
    - **Camper schedules** (desktop `exportChildSchedule.js`): each camper's week, bunk order then
      name: their bunk's schedule with their seat where the set sits ("Couldn't be placed" where
      they have none), something that takes several blocks once with how many. A camper with no
      bunk has only their electives.
    - **Full report** (desktop `exportElectiveRunWorkbook.js`): Camper schedules; Rosters (a row
      per camper, the count once per time, the desktop's organizer ruling); Exceptions in the
      counter's words (couldn't be placed, dropped or kept below minimum, over seats, a lock that
      no longer applies, nothing offered, not one they chose, no bunk on the sheet, a bunk with no
      set this week, no choices, a choice not matched, out of date); and Summary (the run, Final
      with when and by whom, set, week, source file, campers, placed, seats by first, second …
      choice, "One of their choices" for a choice in no order, never a rank, desktop T318; not one
      they chose; couldn't be placed; and how many campers were in one offering more than once,
      the repeat count the plan asks for).
53. **Not in a file**: parent comments, linked choices as one unit (slice E8 counts a linked choice in its offering at
    each period, as the seats screen does; one roster across its periods is for later), and other programs' runs.
54. **Campers, to edit and bring back** (desktop `exportCamperWorkbook.js`, Director Guide §11:
    "no camper is added twice and none is removed"): the run's campers, a row per choice, laid out
    as Bring in choices reads a sheet: Camper number, Camper name, Division, Bunk (the camp's own
    words when the reader knows them, else these), Day, Period, Rank, Activity. A choice for the
    whole week leaves Day and Period blank; one in no order leaves Rank blank, so it comes back in
    no order; a camper's one choice for a period comes back as rank 1 for that period, which seats
    the same; a linked choice is written by its name on the sheet, which reads back as that
    linked choice (slice E8). A camper with no choices is left out (bringing in writes nothing for them). Brought
    back into a new version of the run (a final run doesn't change: Start a new version), campers
    are found by number, else by name. The reader gained one rule for it (`findTable`): a sheet
    with one row per choice (an Activity column beside a Rank, Day or Period column) has its
    headings on one row, so its first camper with no camper number is never read as a second
    heading row ("Rank" over "1"); a lone "Choice" or "Elective" heading over 1, 2, 3 (merged, or
    a label with blanks to its right) is still a two-row heading of ranked choices. Jest tests
    read the file back and find the same campers and choices, and read both two-row forms.
55. **End-of-season Clear** (decisions 48.4 and 59; desktop `purgeElectiveSeason.js`): the runs
    go with their choices and seats, and so does every camper no remaining run uses; elective
    sets, offerings and linked choices stay. The whole season, or the week on screen. Deleted for
    good, out of the Recycle Bin too (plan §3, "Real deletion"). The desktop kept campers (a limit
    of its sync); decision 48.4 removes them.
56. **It looks like clear-b** (decision 59): Clear takes over the screen. The rail: "Clear Summer
    2027", **Whole season · 7 weeks** or the week on screen (the one raised), a crossed-out undo
    arrow with "Can't be undone", Cancel and Clear. Below, the summer: weeks across, rows for
    Campers, Choices, Seats and Runs, each week's count with the mock-up's marks (a camper's short
    name, the 1-2-3 marks, the seat dots, Final · 14 Oct with its padlock). What goes is dashed,
    its marks faded and its number struck through; under a line, Sets, Offerings and Linked are
    solid bars with a padlock. Picking one week dashes only that week. No explaining sentences;
    what each cell means is said to screen readers only ("Week 3, campers: 6, goes; 42 stay").
    Escape or Cancel goes back with nothing done, the cursor on the menu Clear came from.
57. **Exact: only what the picture shows goes** (`ElectiveClear`; the season read by
    `ElectiveClearReading`). The picture is the season read once (nine queries, any size): each week's campers (and of them, those in no other week's
    run), choices (counted from the saved choices), seats and runs, and what stays. Where one
    week's Clear leaves some of its campers (they are in other weeks), its Campers cell shows the
    struck number that goes and, solid with a padlock, the number that stays; each row's head
    carries the struck total that goes (the whole season's campers include any in no run). The
    picture carries a stamp (a SHA-256 of every run's revision and status and the season's camper
    count). Clear holds the season's runs (`FOR UPDATE`), reads the picture again, and refuses if
    the stamp moved ("Something changed since this was drawn. Look again, then clear."), then
    draws the season again; nothing is removed. **It refuses while anything in it is in
    progress**: a run still Committed in what it would clear is named ('"Chugim · Week 2" is still
    being worked on. Finalize first, then clear.'), and its Runs cell is drawn Committed with the
    needs-a-look corner. A week with nothing has nothing to clear (Clear is off; the server says
    "Nothing to clear.", the desktop's words). Done, the screen says what went ("Cleared: 2 runs,
    48 campers.") and reads the season again.
58. **Bounded, and checked as a scheduler.** A run's choices and seats go with it (master-detail),
    so the rows written are the runs and the campers (deleted, then emptied from the Recycle
    Bin). `ElectiveClearTest` (records made inside the same `System.runAs`, as a scheduler, 270
    campers over two weeks with 400 choices and seats) checks the picture's counts and query
    bound, the whole season and one week (runs, choices, seats and the campers only it had gone;
    the other week's run, choices, seats and campers, and the set, its offerings, its linked
    choice and its periods, and the activities, all still there), each within a query bound and a
    row bound (that the Recycle Bin is emptied can't be seen inside a test, where emptied rows
    still read as deleted, so it is not checked there), a stale picture and a run being worked on refused with nothing removed, nothing to
    clear, the download read refusing a committed run, and a final run's bunk week (a two-block
    activity once, the set's cell marked). Jest: `downloads.test.js`, `clear.test.js` and
    `downloadsAndClear.test.js` in `shoreshElectiveSeats` (also namespaced, with axe), and
    `shoreshRosterPrint`. The real-browser check opens the Download menu and Clear by keyboard
    and cancels it (`scripts/a11y-browser-check.mjs`); it never clears.

Not in this slice: a linked choice as one roster across its periods, a camper's week on
screen, and other programs' electives.
