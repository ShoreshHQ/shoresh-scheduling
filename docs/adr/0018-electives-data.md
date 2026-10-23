# 0018: Electives, the data

Status: proposed (2026-10-22), electives slice E1 (plan: wiki `projects/shoresh-sf-electives-plan`,
§3 and §8). Design source: the plan's §3 data model, which replaces the Electives section of the
wiki data model (draft 4) and amends wiki decision `0007-scheduling-data-model-shape`; Greg's
decision 48 (wiki `projects/shoresh-scheduling-sf`, 2026-10-21, point 3 amended 2026-10-22); the
desktop's ADRs `2026-09-17-individual-elective-scheduling`,
`2026-09-23-elective-run-lifecycle-and-remaining-slices`, `2026-09-27-elective-preference-etl-canonical-record-and-learned-axis-binding`
(§4.3, §4.4) and `2026-09-29-linked-elective-bundles`, and its `electron/ops/deleteWeek.js` and
`DeleteWeekDialog.jsx` (a week with elective runs is refused). Names follow ADR 0009. No screens:
the Electives menu entries stay "Coming" until slice E11 passes.

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
    delete, a season delete and a season copy.
