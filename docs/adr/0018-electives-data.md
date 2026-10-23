# 0018: Electives, the data

Status: proposed (2026-10-22), electives slice E1 (plan: wiki `projects/shoresh-sf-electives-plan`,
§3 and §8). Design source: the plan's §3 data model, which replaces the Electives section of the
wiki data model (draft 4) and amends wiki decision `0007-scheduling-data-model-shape`; Greg's
decision 48 (wiki `projects/shoresh-scheduling-sf`, 2026-10-21, point 3 amended 2026-10-22); the
desktop's ADRs `2026-09-17-individual-elective-scheduling`,
`2026-09-23-elective-run-lifecycle-and-remaining-slices`, `2026-09-27-elective-preference-etl-canonical-record-and-learned-axis-binding`
(§4.3, §4.4) and `2026-09-29-linked-elective-bundles`, and its `electron/ops/deleteWeek.js` and
`DeleteWeekDialog.jsx` (a week with elective runs is refused). Names follow ADR 0009. The Electives menu
entries stay "Coming" until slice E11 passes.

_Amended 2026-10-22, slice E4 (the Electives setup screen): choices 8 and 11, and choices 12 to 18. Design source: Greg's approved mock-up (design-research `electives-r1`, `setup-a`: linked
choices beside the table) and decision 53 (wiki `projects/shoresh-scheduling-sf`); the plan's §1,
§2 and §4.1; the desktop's `ElectivesScreen.jsx`, `elective/ElectiveSetDetail.jsx` and
`elective/BundleEditor.jsx`._

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
     `ImportedChoices__c` (long text, compact; their format is slice E6's), `ManualChange__c`.
   - `Assignment__c` (detail of ElectiveRun): `Camper__c`, `TimeBlock__c`, `Offering__c` (all
     required), `Group__c`, `LinkedChoice__c`, `Date__c` (required by a validation rule),
     `Locked__c`, `ByHand__c`, and `ActivityName__c`, `LocationName__c`, `GroupName__c` (copied at
     finalize, slice E7).

   Not added, as the plan says: `ElectiveTime__c` (elective times are worked out from where the set
   sits on the grid), `ElectiveSet__c.Reusable__c`, `Camper__c.Contact__c` and `Active__c` (adding
   a field later is safe; removing a released one is not). Also not added yet: the schedule's
   version reason "Electives finalized", which comes with Finalize (slice E7), the first thing to
   write it.

2. **Permissions live in the Shoresh Scheduler permission set** (Greg, decision 48.1: only admins
   use Shoresh and they already see campers' names, so this is not a privacy issue). It reads,
   creates, edits and deletes all eight objects and every field that can be granted. The plan's
   second _Shoresh Electives_ permission set is not made. A Jest test
   (`scripts/__tests__/electives-metadata.test.js`) fails if a field is left out or a second
   permission set appears.
3. **Parent comments are saved with the camper** (decision 48.3, Greg chose (a)):
   `Camper__c.ParentComments__c`, long text, word for word, so they are there when seats are
   placed. Never read as choices (desktop ETL §4.3) and, as on the desktop, never put in a
   download (a rule for slice E10). How a second sheet's different comment is kept is slice E6's.
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
    ("These screens can't save that.").
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

**Not in this slice, waiting on Greg's decision:** Import a list and Download this list for
offerings. The plan's slice table puts Import a list in E4 and the approved mock-up shows both on
the Electives rail, so leaving them out is a scope change that needs Greg's sign-off before this
slice merges; until then it is proposed, not decided. The reason is size: the list import (ADR 0007) names each item by its own name and is scoped to the season or a program, while an offering
is named by its activity, belongs to one set, starts as proposed, and a file that turns out to be
camper choices must say so (plan §6.2), so offerings need their own layout, set scope and save.
Proposed follow-up: **slice E4b, Offerings: Import a list and Download this list**, before E6.
Until it lands nothing a camp can do creates a proposed offering, so the dashed outline and
Confirm are reached only through records made by Apex (the tests and the browser check). If Greg
approves, the plan's slice table and the build log record E4b; if not, this slice builds it.
Also not in this slice: adding a new activity from the offering choice (the
desktop's picker can; here an activity is added on Activities first), the linked choices editor
(E8), electives on the grid and the "not set up yet" Roots item (E5, E9).
