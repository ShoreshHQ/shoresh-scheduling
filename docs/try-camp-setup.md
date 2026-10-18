# Trying Shoresh as a camp director

A walkthrough of the Shoresh page in the test org (a scratch org). Takes about
15 minutes. Nothing here touches a real org.

## 1. Put Shoresh into the test org (one command)

1. In the Claude app, open a terminal tab (or open the Terminal app).
2. Paste this and press Return:

   ```bash
   ~/Dev/Shoresh/shoresh-scheduling/scripts/try-in-test-org.sh
   ```

3. Wait about a minute. It prints "Putting Shoresh into the test org", then
   your browser opens Salesforce on the **Shoresh** tab of the **Shoresh** app.
   If it stops with an error instead, copy the message to Claude.

## 2. Name your camp

The screen says **Welcome to Shoresh — Start by naming your camp.**

1. Type a camp name (for example _Camp Willow_) and click **Create camp**.
2. The camp name now shows at the top left, with a **New season** button. On the left is the
   Shoresh menu (Roots; **Camp**: Weeks, Programs, Divisions, Groups, Time blocks, Locations,
   Camp words; **Activities**: Activities, Fixed activities, Recurring activities, and
   Special events marked **Coming**; then **Generated Schedule**, **Manual Build** and
   **Schedules**). Until there is a season, only
   **Camp words** can be opened; the rest is greyed out. The middle shows **Start a new season**.

## 3. Use your camp's own words

1. In the menu, click **Camp words**. A table lists every glossary term ("Standard word") with
   two empty boxes.
2. On the **Group / Groups** row type _Bunk_ and _Bunks_. On **Division / Divisions** type
   _Unit_ and _Units_.
3. Scroll to the bottom and click **Save words**. You see "Saved. Shoresh screens now use your
   camp words." The menu now says **Bunks** and **Units**, and so does everything below.
   (**Cancel changes** puts back the words as saved.)

## 4. Create a season

1. Click **New season** at the top. In **Start a new season**, type _Summer 2026_, set
   **First day** to Jun 29, 2026 and **Last day** to Aug 7, 2026 (type the dates or pick them
   from the calendar).
2. Click **Create season**. (If a calendar was still open, the first click only closes it;
   click again.)
3. You land on **Roots**, the home screen. It has:
   - **Build or generate the schedule**, with two buttons side by side, **Generated
     Schedule →** and **Manual Build →** (sections 19 to 23);
   - **What has taken root**: a card each for Activities, Bunks, Units, Locations,
     Time blocks, and Weeks, with how many there are (all 0 for now), and a wide
     **Fixed activities** card;
   - **Needs your attention** on the right: _Summer 2026_ has no weeks, no programs, and no
     activities yet;
   - **Import last year** at the bottom (section 14).
   - In the menu, a small **!** beside Weeks, Programs, Units, Bunks, Time blocks, and
     Activities: each is still empty, and building a schedule needs it. As each gets its
     first rows it turns to a green **✓** (Locations, Fixed and Recurring activities get the
     ✓ too once they have rows, but never the !). A screen reader reads them as _Needed_ and
     _Done_.
4. Click the **Summer 2026 / No weeks yet** item. Shoresh opens the **Weeks** screen, where
   it is fixed. Every card and every attention item works this way.

## 5. Weeks with real dates

**How every table saves** (like the desktop): there is no Save button. The last row of each
table is always blank, tinted, with the table's add word in it in grey (_Add Week_). Type
into it and press **Enter**, click its **+ Add** button, or just move out of the row: it is
added. Until everything it needs is filled in, **+ Add** stays grey and nothing happens.
A change to a row that is already there is saved when you press **Enter** in it or move to
another row, and a week tick is saved the moment you click it; **Escape** puts the row back
as it was. If Shoresh refuses a change, the row keeps a bronze edge on its left until you fix
it or press **Escape**.

1. On **Weeks**, the season's own name, dates, and status are at the top (**Save season**,
   **Delete season**). Below, click **Fill in weeks from the season dates**. Six weeks
   appear, Week 1 = Jun 29 – Jul 3, each Monday to Friday. The **!** beside Weeks in the menu
   is now a **✓**.
2. Try editing: change Week 6's end date and press **Enter**. It is saved. In the blank row,
   type _Week 7_, its dates, and press **Enter**: it is added, and the blank row is ready for
   the next one.
3. Try a mistake: give a week a start date another week already has and press **Enter**.
   Shoresh refuses: _Weeks not saved. Your changes are still here._ and then which week already
   starts that day. Every refusal reads this way: what didn't happen, whether anything was
   lost, then why. Your typing stays; fix it or press **Escape**.
4. Change a week's name and, without pressing anything, click another week's row: the change
   is saved as you leave the row.
5. **Two people at once.** Open the Shoresh tab in a second browser window. In the first,
   rename Week 1 to _First week_ and press **Enter**. In the second (not reloaded), rename
   Week 1 to _Week one_ and press **Enter**. A box **Changed by someone else** shows
   _Week one · Name_ with **Theirs** _First week_ and **Yours** _Week one_. **Keep theirs**
   keeps _First week_; **Use yours** saves _Week one_. Nothing is overwritten without you
   seeing it. Changing a different column of the same week in each window just saves both.

## 6. A program, its time blocks, units, and bunks

1. **Programs**: click **Add Program**. A program called _Main_ appears. Untick **Friday**
   (it runs Monday to Thursday) and click **Save**.
2. **Time blocks**: the table is called _Time blocks in Main_. In its blank row type
   _Period 1_, start 9:00 AM, end 9:45 AM, leave **Part of day** as **From start time**, and
   press **Enter**. It saves as Morning. Add _Period 2_ 10:00 AM – 10:45 AM and _Lunch_
   12:00 PM – 12:45 PM the same way: Lunch comes up as Afternoon, because it starts at noon.
   (Choosing Morning or Afternoon yourself always wins.)
   Try leaving a name blank: add a block 1:00 PM – 1:45 PM with no name and press **Enter**. It
   is saved and shown as _1:00 PM – 1:45 PM_, Afternoon. Change its end to 1:50 PM and press
   **Enter**: the name follows (_1:00 PM – 1:50 PM_). A name you typed never changes. Delete
   that block (trash can) before going on.
3. **Units**: type _Juniors_ in the blank row and press **Enter**.
4. **Bunks**: a table **Bunks in Juniors** is there. Add _Bunk 1_ and _Bunk 2_ in its blank
   row, then set Bunk 2's **Availability** to _Morning only_ and click elsewhere. To the
   right, under **Runs in**, every week is ticked: a new bunk runs every week.
5. Back on **Roots**, the cards count your weeks, 1 unit, 2 bunks (named on the card), and
   3 time blocks, and those attention items are gone.

## 7. Locations

1. **Locations**: first, optionally, **Location types**: type _Field_ in its blank row and
   press **Enter**. Types are only for sorting your locations.
2. Under **Locations**, add three in the blank row (each starts with groups that fit 1):
   - _Pool_, no type, **Groups that fit** 1
   - _Field A_, type _Field_, groups that fit 2
   - _Gym_, no type, groups that fit 3

   Each row has an **Open in** tick for every week, all ticked.

3. Use **Show** above the table to see only _Field_ locations, or only those with no type.
   With _Field_ chosen, the blank row starts as a Field. Change Field A's type to none: it
   stays in view until you leave the row (it is saved), then leaves this view. Choose _All
   location types_ to see them all again, and put Field A back to _Field_.
4. Try a mistake: set the Pool's groups that fit to 0 and press **Enter**. Shoresh says it
   must be 1 or more. Press **Escape** to put it back.

## 8. Activities

1. **Activities** (under the Activities heading in the menu). The blank row starts with the
   usual defaults: length 1, at least 1 and at most 1 time a week, Low priority, indoors, one
   bunk at a time, and every week ticked under **Runs in**.
2. Add three: _Swim_ at the Pool; _Gym games_ in the Gym; _Soccer_ on Field A with
   **Outdoors** ticked. For each, fill in the blank row and press **Enter**.
3. A yellow **Needs attention** box at the top of the screen says
   _Soccer: Outdoors and has no rain plan._ (Roots lists it too.) Set Soccer's **Rain plan**
   to _Gym games_ and click elsewhere; it goes away. (Soccer's own name is not offered as its rain plan.)
   The **Rain plan** list offers only indoor activities: Soccer, being outdoors, is never
   offered as anyone's rain plan. Try it: tick **Outdoors** on Gym games and click elsewhere
   (allowed). Soccer's **Rain plan** now reads _Gym games (outdoor, choose another)_, shown on
   Soccer's row only, and Soccer can't be saved until it gets an indoor rain plan or None:
   _"Soccer": The rain plan has to be indoors. Pick an indoor one, or choose None._ Untick
   **Outdoors** on Gym games again.
4. Set Gym games' **Groups at once** to 5 and press **Enter**. Needs attention now says the Gym fits 3, so
   scheduling will use 3. Put it back to 1.
5. Below the table, **Activity details**: pick _Swim_. Under **Who can do it**, move _Bunk 1_
   to **Can do it**, then **Save changes**. Only Bunk 1 can swim now; nobody chosen means
   every bunk.
6. Still on Swim, under **More rules**: "Get this many done early in the week" 1, **By**
   Tuesday (the swim test by Tuesday). **Save changes**.
7. Try deleting the **Pool** (trash can in the Locations table). Shoresh refuses: Swim happens
   there; choose another location for Swim first. Try deleting **Gym games**: refused,
   because it is Soccer's rain plan.
8. **Same location?** On **Locations**, add _pool_ (lower case), groups that fit 2. Then on
   **Activities** set Gym games' **Location** to _pool_. Back on **Locations**, both pools
   have a bronze dot (point at it: _Same name as another_) and a **Same location?** button. Click it. The question
   lists _Pool · Bunks that fit: 1 · 1 activity here_ and _pool · Bunks that fit: 2 · 1
   activity here_, with **Bunks that fit** at 2. (If you renamed Location on Camp words, the
   button and question use your word.) Choose _Pool_ and click **Merge**. One Pool is left,
   fitting 2, and on **Activities** Gym games is now at the Pool. (**Keep separate** or
   Escape leaves both as they are.) Put Gym games back in the Gym, and the Pool back to 1.

## 9. Weeks something doesn't run

There is no separate grid any more: each row says which weeks it runs in.

1. **Bunks**: untick **Week 3** on **Bunk 2** (say it is away on a trip that week). It is
   saved as you click. Nothing is placed in Week 3 yet, so it just switches off (section 19
   shows what happens when something is).
2. Leave it unticked; the copy below carries it over. (Deleting a bunk, activity, or location
   simply takes its unticked weeks with it; you try that in step 11.)
3. **Locations**: untick **Week 2** under **Open in** on the **Pool** (closed for repairs).

## 10. Fixed and recurring activities

A **fixed activity** takes every bunk in the program, in one time block, every day the program
runs (flagpole, lunch). A **recurring activity** takes chosen bunks (or all of them) in one time
block on the days you tick (Bunk 1 swims Monday and Wednesday). They are separate from
activities and from each other. Clashes are refused, never just shown.

1. **Fixed activities** (under Activities in the menu). The table is _Fixed activities in
   Main_. In the blank row type _Flagpole_, **Time block** Period 1, length 1, no location,
   and press **Enter**. Every week is ticked under **Runs in**. Add a second one, _Lunch
   break_ in Lunch.
2. The **Notes** column on Lunch break says _Bunk 2 is morning only and is left out._
   Bunk 2 is not at camp in the afternoon, so Lunch break leaves it out rather than refusing.
3. On **Roots**, the wide **Fixed activities** card now counts 2 and names them. Click it to
   come back.
4. **Try a clash.** Add _Carpool_ in Period 1. Shoresh refuses:
   _"Flagpole" and "Carpool" would both have Bunk 1 in Period 1 on Monday in Week 1. Change the
   time block, length, or weeks of one of them._ Nothing is saved, and
   your typing is still in the blank row to fix. Clear its name to drop it.
5. **Too many bunks at a location.** Set Flagpole's **Location** to the Pool and click
   outside the row: refused, _"Pool" fits 1 Bunk at once, but "Flagpole" would have 2 there
   …_. Choose the Gym instead and click outside the row again. Now go to **Locations**, set
   the Gym's groups that fit to 1 and press **Enter**:
   refused from that side too, _… Keep it at 2 or more, or move it to another location first._
   Put it back to 3.
6. **Past the end of the day.** Set Lunch break's **Length** to 2 and press **Enter**:
   refused, it would run past the last time block of Main. Press **Escape**. (Deleting or moving a time block
   that would cause this is refused the same way.)
7. **Recurring activities.** The table is _Recurring activities in Main_, with a tick for
   each day Main runs (Monday to Thursday; no Friday) and a **Who** column. In the blank
   row: _Bunk 1 swim_, Period 2, length 1, location Pool, tick **Monday** and **Wednesday**.
   Under **Who** it says _Everyone in Main_; click **Change**, move _Bunk 1 (Juniors)_ to
   **Covers**, click **Done**. With everything filled in, **Done** adds the row.
8. Add _Bunk 2 art_: Period 2, **Monday**, who _Bunk 2 (Juniors)_. Both are kept: they
   take different bunks.
9. **Try a clash from the who side.** On Bunk 2 art, click **Change** and move Bunk 2 back
   out, so it covers everyone, and click **Done**: refused, _"Bunk 1 swim" and "Bunk 2 art"
   would both have Bunk 1 in Period 2 on Monday in Week 1 …_. Click in its name and press
   **Escape** to put it back.
10. **Needs attention:** the Pool is closed in Week 2 (step 3 of the last section), so the box
    at the top says _Bunk 1 swim: "Pool" is not open in Week 2, but this runs then._ Untick
    **Week 2** on Bunk 1 swim; it goes away.
11. Try deleting **Period 2** on **Time blocks**: refused, Bunk 1 swim and Bunk 2 art start in
    it. Try deleting **Bunk 1**: refused, and the message names both things in the way: Swim's
    **Who can do it** and who Bunk 1 swim covers.

Two more things to know:

- A bunk away for a week, or a location closed for a week, is not there that week, so it never
  counts as a clash. Ticking that week back on is checked like any other change.
- If you add, move, or delete a time block in the middle of an activity that takes more than
  one block, it then covers different blocks. Shoresh doesn't refuse that, but it tells you
  under Needs attention and on the row, with two fixes that say exactly what you'll get. You
  try this on next summer's copy in section 12.

Does this work the way you think in practice? Note anything that feels awkward.

## 11. Copy the season to next summer

1. Click **Copy this season** at the top. Shoresh suggests _Summer 2027_ starting Monday
   Jun 28, 2027, and lists every week with where it was and where it will be.
2. Change the start date to Jun 29, 2027 (a Tuesday). A yellow warning explains that every
   week would move to different weekdays. Change it back to Jun 28, 2027.
3. Click **Copy season**. You land on Roots for _Summer 2027_. On **Weeks** it says
   _Copied from "Summer 2026"_; the weeks (a year later), program, time blocks, unit, bunks,
   locations, activities (Soccer's rain plan, who can swim), fixed and recurring activities
   (with who each covers), and unticked weeks (Bunk 2 in Week 3, the Pool in Week 2, Bunk 1
   swim in Week 2) all came along. Anything waiting under "time blocks changed" is not
   carried: the copy starts from what each activity covers on the day you copy.
4. Use the **Season** picker at the top to go back to _Summer 2026_: it is exactly as you left
   it.

## 12. Deleting

1. On _Summer 2027_, open **Recurring activities** and delete **Bunk 2 art**: it goes, with
   who it covered. Then open **Bunks** and delete **Bunk 2** (trash can, then confirm). It
   goes, and its unticked Week 3 goes with it. Shoresh still refuses a delete when something
   else depends on the record: try deleting **Bunk 1**, which is in Swim's **Who can do it**
   and in who Bunk 1 swim covers.
2. **A time block added inside an activity.** Still on _Summer 2027_, delete **Bunk 1 swim**
   too (Recurring activities), so Period 2 is free. On **Fixed activities**, set Flagpole's
   **Length** to 2 and press **Enter**: it covers Period 1 and Period 2. Now on **Time
   blocks** add _Snack_ 9:45–10:00 AM, Morning. Back on **Fixed activities**, Needs attention
   and Flagpole's Notes say _Time blocks changed since it was saved: it covered Period 1 –
   Period 2 and now covers Period 1 – Snack._ Two fixes are offered: **Keep Period 1 – Snack**
   and **Stretch to Period 1 – Period 2**. Rename Flagpole to _Flag_ and press **Enter**: the note stays.
   Click **Stretch to Period 1 – Period 2**: the length becomes 3 and the note goes. (Deleting
   a block inside an activity offers **Keep the shorter …** or **Extend to …** instead.)
3. Open **Weeks**, click **Delete season** and confirm. It and everything in it are gone;
   _Summer 2026_ is untouched.
4. Deleting a unit, program, week, time block, location, activity, fixed activity, or
   recurring activity works the same way (trash can icon, then confirm), unless something else
   still uses it; Shoresh then says what, and where to change it. Deleting a unit or program
   also clears its bunks' unticked weeks. A program with fixed or recurring activities is
   refused until they are deleted.

## 13. The schedule page and versions

Nothing in Shoresh saves a schedule yet (bringing in last year's spreadsheet comes next and will
save one), so first add a made-up one.

1. In the terminal tab, paste this and press Return:

   ```bash
   ~/Dev/Shoresh/shoresh-scheduling/scripts/make-sample-version.sh
   ```

   It prints _Done. In the Shoresh tab, pick the camp "Sample Camp (made up)", then open
   Schedules._ The first time, it also sets up that invented camp: one week (28 June 2027),
   one program, six bunks, seven time blocks, five activities, Lunch as a fixed activity,
   and two recurring activities (Morning meeting on Mondays, Library time for Juniors on
   Wednesdays). Your own camp is not touched. Running it again adds another version (and puts
   Week 1 back if it was deleted).

2. Reload the Shoresh tab. A **Camp** picker appears at the top: choose _Sample Camp (made
   up)_. Click **Schedules** in the menu.
3. The newest version opens by itself. The toolbar shows **Week** (_Week 1_), the **Daily View
   / Group View / Activity View** toggle (as on the desktop), and, on the right after a
   divider, **Versions**. A blue strip says _Looking at a version: Imported from
   sample-week.xlsx (made up) · Imported · (date) · read-only_.
4. Click **Versions**. The list (titled **Versions**) shows each version, newest first, with
   _Imported_ and when it was saved, **rename** and **Open**; the one showing says _on screen
   now_. **Open** on another version switches to it. (If you ran the script twice, there are
   two with the same name.)
5. Changing **Week** opens that week's newest version, or says _Nothing saved for … yet_ if it
   has none.
6. **Daily View** (all bunks for one day): day pills Monday to Friday. Monday shows a column
   per bunk and a row per time block, each with its times. Boating runs two blocks and fills
   both rows. Morning meeting (Monday Period 1) and Lunch have a grey bar down the left: they
   are a recurring and a fixed activity. Bunk 6's last block says **Open** (nothing placed).
   Click **Tuesday**: Period 6 is _Chugim_ in a dashed orange box marked _not set up yet_.
   Thursday has a _Zoo trip_ for Bunks 4 to 6, Friday a _Field day_ and a _Color war_, all
   marked _not set up yet_ (the import notes these; Shoresh cannot set them up yet). A legend
   under the grid explains the four looks.
7. **Group View** (one bunk's week): bunk pills. Pick _Bunk 1_: a column per day.
   Wednesday's Period 4 is _Library time_ (Juniors only). Pick _Bunk 4_: Wednesday Period 4 is
   an activity instead.
8. **Activity View** (where one activity runs): a card per activity with its location, how
   many groups do it, and how many times this week (for example _6 groups · 7 times this
   week_). Click **Swim**: a grid of the week with the bunks swimming in each block. **← All Activities** goes back.
9. **Rename it.** Open **Versions**, click **rename**, type _Last summer_, press Return (or
   **Save**). The list and the blue strip both say _Last summer_. A blank name is refused:
   _Give the version a name._
10. **Cells cannot be changed here**, on purpose: placing and moving things comes with Manual
    Build.
11. **Something deleted since the version was saved** still shows under its saved name, marked
    _deleted since_. Try it: on **Activities**, delete _Art_. Shoresh asks first: _Art is in 1
    schedule. Delete anyway?_ The number is every schedule using Art: drafts, saved versions,
    and published ones, so it is 1 if you ran the script once, 2 after two runs, and so on. Confirm, then open the version again. Deleting a bunk asks the same way. Art
    can be brought back from Salesforce's Recycle Bin.
12. **Deleting the week takes its versions.** On **Weeks**, delete _Week 1_: the confirmation
    says _That includes 1 saved version._ Confirm, and the version goes with the week (as on
    the desktop). Once publishing exists, a week with a published schedule will not be
    deletable. Run the script again for a new Week 1 and version.

## 14. Import last year

Shoresh can read last year's schedule from Excel or CSV files and set up the season from it.
Made-up sample files are in the project folder, in `docs/samples/import` (an invented camp,
_Maple Grove_, one week, six bunks): the same week as an all-camp workbook
(`maple-grove-2026-all-camp.xlsx`), as one CSV per bunk (`Maple Grove 2026 - Bunk 1.csv` to
`Bunk 6`), and as a by-activity CSV (`maple-grove-2026-by-activity.csv`).

**Into an empty season**

1. Click **New season** at the top, name it _Import test_ (any dates), and click
   **Create season**. You land on Roots.
2. Click **Import last year** at the bottom of Roots. The import screen shows a dashed box:
   _Drop schedule here_, a **Choose files** button, and _.xlsx · .xls · .csv — several at
   once_.
3. Click **Choose files**, go to the project folder, then `docs`, `samples`, `import`, and
   pick `maple-grove-2026-all-camp.xlsx`. (Or drag the file onto the box.)
4. The screen now says _Found in the file. Nothing added yet._ and shows:
   - **Files**: the file, _5 pages_, and its **Layout**: _All camp: a page per day, groups
     across_. (If Shoresh ever reads a file the wrong way round, change it here.)
   - **Check these first**: _Are “Music” and “Musik” the same activity?_ (Musik is a planted
     typo.) Click **Same: call it “Music”**. The card folds to _✓ Same: call it “Music”_;
     **Change** takes it back.
   - **Programs for these bunks**: _Program for Bunk 1, Bunk 2, …_ with _A new program_
     chosen (this season has none yet). **Unit for each new bunk**: each bunk with its unit
     from the file (_Juniors_ or _Seniors_) already chosen; any can be changed. (When a file
     does not say a bunk's unit and the program already has units, nothing is chosen and
     **Review** waits until you choose.)
   - What was found, kind by kind, each marked _new_: the new program, named _Main_ (Monday to Friday),
     seven **Time blocks** with their times, the six bunks with their units (_Juniors_,
     _Seniors_, from the row above the bunk names in the file), **Fixed activities**: _Lunch_,
     **Recurring activities**: _Morning meeting_ (Period 1 on Monday, everyone), and the
     **Activities** with how often each bunk had it (for example _Boating: 1 a week · 2 time
     blocks long · Seniors only_).
   - **Not set up yet**: _Chugim_ (an elective), _Field day_ (a special day), and _Zoo trip_
     (a trip). Shoresh notes them but does not create them.
   - **Good to know**: outdoors, rain plans, and priority are not in a schedule file; set
     them on the Activities screen.
5. Click **Review** (it is greyed out until every choice above is made). The next screen says _Reconciling maple-grove-2026-all-camp.xlsx_ and
   _0 of 1 questions answered_. The one question: _Is “Library time” at a set time, or an
   activity?_ (Juniors had it at Period 4 on Wednesday, in one week only, so Shoresh cannot be
   sure.) The answers: **A recurring activity**, **An activity**, or **Leave it out for now**.
   Click **A recurring activity**.
6. The button at the bottom now says **Use this setup**. (While a question is unanswered it
   says how many are left, and cannot be clicked.) Click it.
7. The summary: _Imported from maple-grove-2026-all-camp.xlsx._, what was **Added** (1
   program, 7 time blocks, 2 units, 6 bunks, 7 activities, 1 fixed activity, 2 recurring
   activities), **Not set up yet**, and **Good to know**. Click **Continue**.
8. Roots now shows the cards filled in. Open **Fixed activities** (Lunch, at Lunch) and
   **Recurring activities** (Morning meeting on Mondays for everyone; Library time on
   Wednesdays for Juniors), and **Activities** (Boating two blocks long, for Seniors only).

**Adding to a season that already has setup**

9. Back on Roots, click **Import last year** again. This time pick **all eight files** at
   once (the workbook, the six bunk CSVs, and the by-activity CSV).
10. Each file shows its layout: _All camp_, _By group_ (each bunk's file, named after the file:
    _Bunk 1_ …), and _By activity_. Everything is marked _already set up_: Shoresh matched it
    by name and time and adds nothing twice. The similar-name card now reads _Are “Musik” and
    “Music” the same activity?_ with **Same: use “Music”** (Music is already set up). Click it.
11. Click **Review**. One question: _The files disagree about Bunk 3, Tuesday, Period 2.
    Which is right?_ (the Bunk 3 file says Soccer; the all-camp and by-activity files say Art).
    Click **Leave it out for now**, then **Use this setup**. The summary lists it under **Left
    out for now**: not added; the next import asks again.

**Last year's week as a version, and undoing an import**

12. Start a fresh season for this: **New season**, _Import test 2_, first day Jun 28, 2027,
    last day Jul 9, 2027, **Create season**. Don't add weeks: from Roots, import
    `maple-grove-2026-all-camp.xlsx` again. The answers you gave last time are filled in
    already and marked _remembered_ (the review says how many); any can be changed.
13. The season has no weeks yet, so Shoresh adds them from its dates, as **Fill in weeks**
    would (two weeks), and asks only which one last year's schedule is: _Which week is last
    year's schedule?_ with _Week 1 (starts Jun 28)_ and _Week 2 (starts Jul 5)_. Pick
    _Week 1_. **Good to know** says the season's 2 weeks are added from its dates, and the
    summary's **Added** includes 2 weeks. (Undo in step 15 removes them too.)
14. The summary now has **Last year's schedule**: _Imported from maple-grove-2026-all-camp.xlsx,
    for Week 1 (Main): open it on Schedules._ Click **Continue**, then **Schedules**: the version
    opens, with Lunch and Morning meeting as fixed and recurring activities, Chugim, the Zoo
    trip, and Field day marked _not set up yet_.
15. Back on Roots, under **Import last year**: _Last import: maple-grove-2026-all-camp.xlsx,
    <date and time>_ and **Undo last import**. Change something the import added first (for
    example, on **Activities**, make _Swim_ two blocks long and save). Then click **Undo last
    import** and confirm. The message says what was removed, and that _Swim_ was kept because
    it was changed since. Everything else the import added, the version included, is gone.

**Try it yourself**: a CSV or Excel file of your own invented camp. Days across with one file
per bunk, bunks across with one sheet per day, or activities across with the bunks in the
cells. Anything Shoresh is not sure about becomes a question; nothing is saved until **Use this
setup**.

## 15. Import a list on a screen

The Locations and Activities screens can each read a list from Excel or CSV: one row per
location or activity, headings in the first row. Made-up lists for the _Maple Grove_ camp of
section 14 are in `docs/samples/lists` (do section 14 first, in the _Import test_ season).

**Locations**

1. Open **Locations**. Under the heading, click **Import a list**. A box opens: _Import
   Locations_, a **Choose a file** button, and _.xlsx · .xls · .csv_.
2. Choose `docs/samples/lists/maple-grove-locations.csv`.
3. The box shows the file's name, then:
   - **Columns**: each heading in the file with the column it fills (_Location_, _Location
     type_, _Groups that fit_, _Notes_). A heading Shoresh doesn't know is tagged **Not used**;
     its dropdown can point it at a column, and the choice is tagged **Remembered** next time.
   - **Also adding**: _Indoors · location type_, _Outdoors · location type_, _Waterfront ·
     location type_, ticked and greyed out.
   - **New (4)**: Pool, Lake, Art room, Field.
   - **Can't read**: _Row 6 · Gym · Groups that fit: "two" is not a whole number_.
4. The button at the bottom says **Add 4**. Click it. The box says _Saved_, with what was added
   (3 location types, 4 locations), and **Undo this import**. Click **Done**.

**Activities**

5. Open **Activities**, click **Import a list**, and choose
   `docs/samples/lists/maple-grove-activities.csv`.
6. **Columns**: _Colour_ is tagged **Not used**. Leave it.
7. **Questions** (Save waits for them):
   - _Are “Musik” and “Music” the same activity?_ Click **Same: “Music”**. The card folds to
     _✓ Same: “Music”_; **Change** reopens it.
   - _“Middlers” is new. What is it?_ Click **Division in Main** (your camp's word for division,
     such as Unit).
8. **Also adding** lists what saving would add: _Gaga pit · location_ and _Middlers · unit_ for
   the new Gaga row. A rain plan that isn't set up (_Movies_, Boating's) joins it once you choose
   **Change** for Boating's rain plan. It is added as an activity added by hand would be, and
   its tick can be taken off: the row is then saved without that rain plan, and the summary
   says _Boating · no rain plan_.
9. **New**: _Gaga_. **Can't read**: _Row 7 · Hiking · Outdoors: "maybe" isn't Yes or No_.
10. **Changes**: Swim, Boating, Music, and Archery, one line per difference, such as _Times per
    week: at least: 1 → 2_, each with **Keep** and **Change**. Only the columns the file has
    are compared. A blank cell clears a value, and that line is tagged **clears**. Click
    **Keep** on one line. The button above now says **Change the other …**; click it. The Keep
    you chose stays.
11. When nothing is waiting, the button at the bottom says what it will do (for example
    **Add 1, change 4**). Click it. Open Archery's details below the table: _Who can do it_
    now shows what the file said.
12. Click **Undo this import** and confirm. What the list added is removed, and the activities
    it changed go back to how they were, including who can do them. Anything you edited in the
    meantime stays, and the message names it.

## 16. Import a list on a program's screens

Program days, Units, Bunks, Time blocks, Fixed activities, and Recurring activities each have
**Import a list** too. Each row says its program in a **Program** column; a camp with one
program can leave the column out. Made-up lists are in `docs/samples/lists` (after section 14,
in the _Import test_ season, in this order).

1. **Program days** (`maple-grove-program-days.csv`): _Main_ is unchanged; _Teens_ is **New**
   (Monday, Wednesday, Friday); _Review here_ shows _Weekend · Runs on: Saturday isn't a camp
   day_. Click **Add 1**.
2. **Units** (`maple-grove-units.csv`): _Middlers_ is new. _“Explorers” is a new program.
   Which days?_ Monday to Friday start ticked; untick Tuesday and Thursday and click **Use
   these days**; _Explorers_ then shows under **Also adding**,
   with its days. Click **Add 3**.
3. **Bunks** (`maple-grove-bunks.csv`): _Bunk 3 · Unit: Juniors → Seniors_ (Keep or Change;
   Change moves it, within its program). _Bunk 7_ is new. _Bunk 8_ is under **Review here**
   ("sometimes" isn't an availability).
4. **Time blocks** (`maple-grove-time-blocks.csv`): _Period 2 · Start: 9:50 AM → 9:55 AM_.
   _“Late pickup” at 6:00–6:30: morning or evening?_ (answer **Evening**). _Swim time_ is
   under **Review here** (_End is before Start_).
5. **Fixed activities** (`maple-grove-fixed.csv`): _Lunch_ gets a location, _Dining hall_,
   under **Also adding**. _“Snack break” is a new time block in Main. When is it?_ Fill in
   Start and End and click **Use these times**.
6. **Recurring activities** (`maple-grove-recurring.csv`): _Morning meeting · Runs on:
   Monday → Monday, Wednesday_. _Rest hour_ is for Juniors and Middlers. _Campfire_ is under
   **Review here** (Saturday). A day a program doesn't run is asked, not refused: _Main doesn't
   run on Friday: …_ with **Add Friday to Main**, **Without Friday**, or **Leave it out for
   now**.
7. Each screen's import is undone on its own by **Undo this import**, or Roots' **Undo last
   import**, including a bunk moved and who a recurring activity covers.

## 17. Download a list, or the whole camp

1. Open **Activities**. Next to **Import a list** is **Download this list**. Click it: an Excel
   file _Activities - Import test.xlsx_ is saved. It has the screen's columns, one row per
   activity, in the same layout **Import a list** reads.
2. Open it, change one activity's _Times a week: at least_, save it, and import it with
   **Import a list**. The box shows that one difference and nothing else.
3. On a screen with nothing set up yet, **Download this list** gives the headings only: a
   template to fill in.
4. On **Roots**, click **Download camp workbook**. The file _Import test - camp
   workbook.xlsx_ has a sheet per setup screen (Programs, Units, Bunks, Time blocks,
   Locations, Activities, Fixed activities, Recurring activities, in your camp's words), then
   _Location types_, _Camp words_, _Weeks_, and _Runs in_ (a Yes or No under each week, as the
   screens' ticks).
5. Import the workbook on any screen: it reads that screen's sheet, and shows _Unchanged_ for
   every row.

## 18. Import the whole camp workbook on Roots

1. On **Roots**, click **Download camp workbook** (section 17), then **Import camp workbook**
   and choose that file. One box shows every sheet as its own section, and _Nothing to change_.
2. Open the workbook in Excel and make four changes:
   - _Weeks_: rename _Week 1_ to _Opening week_, and on _Runs in_ rename that column too.
   - _Runs in_: change one activity's _Yes_ to _No_ under a week.
   - _Activities_: add a row _Kayak_ (Length 1, at least 1 a week).
   - _Camp words_: change _Bunk / Bunks_ to _Cabin / Cabins_ (or add the row if your camp
     still uses Shoresh's words).
3. Import it on Roots. The _Weeks_, _Runs in_ and _Camp words_ sections each show a Keep or
   Change; _Activities_ shows _Kayak_ under New. Click **Change** on each (or **Change all
   from this file**). The save button says what it will do, for example _Add 1, change 3_.
4. Save. The week is renamed, the activity is off that week, Kayak is added, and the menu
   says Cabins.
5. Click **Undo this import** (or Roots' **Undo last import**). All four changes are put back
   together, including the camp words.
6. Rename a sheet (for example _Weeks_ to _Dates_) and import again: it is still read, by
   what it holds. A sheet of your own that Shoresh can't read shows under _Sheets not read_.
7. In a season with other dates (for example after **Copy season** to next summer), import
   the same workbook. The _Weeks_ section shows _Matched by order_: _Week 1 (Jun 28 2027) →
   Week 1_ of this season, and so on. This season keeps its own dates, and the _Runs in_ ticks
   follow the pairing.

## 19. Manual Build: start a week and fill it by typing

This uses the made-up camp from section 13. If you haven't run that script yet, run it first.

1. Reload the Shoresh tab and choose _Sample Camp (made up)_ in the **Camp** picker. The menu's
   last section reads **Generated Schedule**, **Manual Build** and **Schedules**. On Roots,
   **Build or generate the schedule** holds two buttons, one for each schedule.
2. Click **Manual Build →** on Roots (or **Manual Build** in the menu). The **Week** picker
   shows _Week 1_, and there is one button: **Start a blank week**. Click it.
   (Building waits for the basics, as on the desktop. In a season still missing some, there is
   no Start button; one sentence lists everything missing, each a link to its screen, for
   example _3 things still needed before you can build the schedule: Units, Time blocks and
   Activities._ Try it with the _Import test_ season from section 14 before its import, or any
   new season.)
3. The week opens in **Daily View** on Monday, as on the desktop. Lunch is in every bunk's Lunch
   row, and Morning meeting is in every bunk's Period 1. Both have the grey bar down the left.
   Every other cell says **Open**. Click **Wednesday**: Library time is in Period 4 for Bunks 1
   to 3 only. Nothing appears under **Versions** on the Schedules page: the week you build is
   not a saved version.
4. **Type a name into a cell.** Double-click Bunk 1's Period 2. A small box opens under it,
   headed _Bunk 1 · Monday · Period 2_. Type `sw`: the list shows _Swim_. Press Return. Swim
   is in the cell at once, and it is saved. Reload the page and it is still there.
5. **Multi-block activities fill their length.** Double-click Bunk 2's Period 2, type `boat`, and
   press Return. Boating fills Period 2 and Period 3 (it runs two blocks). Now place Boating in
   Bunk 3's Period 3: it takes only Period 3, because Lunch is next.
6. **Clear a cell.** Click Bunk 1's Swim, then press Delete (or Backspace). It says **Open**
   again. Typing into a filled cell also offers **Open** first in the list.
7. **Fixed and recurring activities stay put.** Double-click Lunch: nothing opens. They change
   only on the Fixed and Recurring activities screens.
8. **A new name.** Double-click any Open cell and type `Archery`. The list offers
   _Add "Archery" to activities_. Press Return: Archery is placed, and it now appears on the
   **Activities** screen with the usual starting values. Typing `swim ` (any spacing or
   capitals) finds the existing Swim instead of adding a second one.
9. **An activity not set up for a bunk.** On the **Activities** screen, set Swim's _who can
   do it_ to _Juniors_ only. Back in Manual Build, double-click Bunk 5's Open cell (a Senior
   bunk) and type `sw`. Swim is still offered, at the end of the list, with a bronze dot. Hold
   the pointer over the dot (or arrow down to Swim) and _Not set up for Bunk 5_ appears. It can
   still be placed.
10. **Keyboard only.** Click any cell once, then use the arrow keys to move around the grid. Enter
    (or F2) opens the box, the up and down arrows choose, Return places, and Escape closes it
    without changing anything. Delete clears the cell.
11. **Group View.** Click **Group View** and pick _Bunk 2_. The columns are the days, and
    everything above works the same way here.
12. **Two people at once.** Open the Shoresh tab in a second browser window (or have someone
    else open it), both on Manual Build, Week 1. In window A, place Soccer in Bunk 4's Period 5.
    In window B, which still shows that cell as Open, place Art in the same cell. Window B asks
    **Changed by someone else** and shows _Bunk 4 · Monday · Period 5_, _Theirs: Soccer_,
    _Yours: Art_.
    - **Keep theirs** leaves Soccer.
    - **Use yours** puts Art there.

    Nothing is overwritten without asking. Two people working on different bunks of the same
    day never see this. The other window shows your changes when it saves its next edit, or
    when you click back into it.

13. **A morning-only bunk.** On the **Bunks** screen, set Bunk 6 to come in the morning only.
    Back in Manual Build, Bunk 6's afternoon cells are hatched and say _Not at camp_, and
    nothing can be placed there.
14. **Turning a bunk off for a week it is placed in.** On the **Bunks** screen, untick
    **Week 1** under **Runs in** on Bunk 1. Because Bunk 1 already has things placed in
    Week 1, Shoresh asks before saving: _Turn off "Bunk 1" for Week 1?_,
    _Placed in N cells in Week 1._ and _They stay until you change them._, with **Cancel**
    (where the keyboard starts) and **Turn off anyway**. Cancel saves nothing and puts the
    tick back, with the keyboard back on it. The same question comes for an
    activity or a location placed that week. A bunk, activity, or location with nothing placed
    that week switches off without asking.

## 20. Manual Build: drag, move, and undo

Same made-up camp, Manual Build, Week 1.

1. **The list of activities** is on the left of the grid in Daily and Group View (not in Activity
   View). Each one shows how often it is placed, against how often it should be:
   _2 placed (needs 3–5)_.
   - Daily View counts the whole camp. The weekly numbers are multiplied by the bunks the
     activity is set up for.
   - Group View counts the bunk shown.
   - Activities still under their minimum are on top, then a line, then the rest, each part in
     name order.
   - **Filter…** narrows the list as you type.
2. **Drag an activity onto a cell.** Drag _Swim_ onto an Open cell: it is placed and saved.
   Drag _Boating_ (two blocks) onto Period 2: it takes Period 2 and Period 3. Drag it onto the
   last block of the day: it takes the one block there is.
3. **Over the weekly limit is allowed.** Keep placing Swim in one bunk's Group View past its
   most. Nothing stops you; the count gets a bronze dot. Hold the pointer over the dot, tap it,
   or Tab to Swim in the list: _Over its weekly limit_ appears. Every bronze dot works this way.
4. **Move and swap.** Drag a placed Swim onto an Open cell (any bunk, any day): it moves there.
   - Drag it onto a cell with Soccer: the two swap.
   - Drag it onto Boating: _Only activities one time block long swap._ (in your camp's words) appears under the toolbar, and
     nothing changes.
   - Drag Boating to a spot with only one block free: _Boating doesn't fit there._
   - Drag anything onto Lunch: _Lunch stays where it is set up._
5. **Clear by dragging.** Drag a placement back onto the list on the left: that cell is Open again.
6. **Longer or shorter.** A placed activity has a small bar at its bottom. Drag the bar down
   onto the next Open cell to make it run longer, or onto its own top to make it one block.
   Without dragging: click the bar once, then click the cell where it should end. From the
   keyboard, Shift with the down arrow adds a block and Shift with the up arrow takes one off.
7. **Undo and Redo.** In the toolbar:
   - **Undo** reverses the last change. Hold the pointer over it to see which one
     (_Undo: Placed Swim · Bunk 1 · Monday · Period 2_).
   - **Redo** puts it back.
   - Ctrl+Z (Cmd+Z on a Mac) and Ctrl+Shift+Z or Ctrl+Y do the same.
   - Undo keeps the last 50 changes of this visit. Choosing another week starts afresh.
8. **Everything from the keyboard.** Click a placed cell once, then:
   - press Space to pick it up;
   - move with the arrow keys and press Space to place it there (a move, or a swap);
   - Escape puts it back where it was.

   For a list activity, press Enter or Space on it in the list, then move to a cell and press
   Space or Enter to place it.

9. **Two people.** With two windows (section 19, step 12):
   - an Undo in window A, after window B changed the same cell, asks _Changed by someone else_
     too, even after window A has caught up and shows B's change (place _Swim_ in A, change it
     to _Soccer_ in B, make any other change in A so it shows _Soccer_, then click **Undo**
     twice in A: the second asks before clearing B's _Soccer_). Redo does the same;
   - a swap or move in window A, after B changed both cells, asks once, listing each cell that
     differs (_Theirs_ and _Yours_ for each);
   - if B's activity is longer than the cell you changed, the part of it **Use yours** would clear
     is listed too (_Bunk 1 · Monday · Lunch · Theirs: Boating · Yours: Open_). Every cell B
     changed is shown before anything of B's is replaced;
   - **Keep theirs** leaves all of B's changes, and that step drops out of Undo;
   - **Use yours** makes your change; every cell of B's it replaces is listed. Undo then brings
     B's back.
10. **Deleting a week with a Manual Build.** On the **Weeks** screen, click delete on Week 1.
    The confirmation now says _That includes its Manual Build and 1 saved version._ (or
    however many there are). Click **Cancel**.

Not in these parts yet: Clear day or week, Copy day, Versions on this screen, and Publish. Each
comes in the next pieces of Manual Build.

## 21. Manual Build: counters and the bronze dots

This uses the made-up camp's Week 1 from sections 19 and 20. Every activity runs one to three
times a week and takes 3 bunks at once; each place fits 3 bunks (the Dining hall and Library 6).
Juniors are Bunks 1 to 3, Seniors Bunks 4 to 6.

1. **First, put back what sections 19 and 20 changed in setup.** On **Activities**, open Swim and
   set **Who can do it** back to everyone. On **Bunks**, set Bunk 6 back to all day. Dots left on
   the grid from section 20 (a Swim over its weekly limit, say) are expected: hold the pointer on
   one to see why.
2. Open **Manual Build**, Week 1. Under the toolbar is a row of tiles, each a number with its
   words under it. **Filled** shows how many cells hold something, out of the cells to fill
   (Lunch, Morning meeting, Library time, and cells where a bunk isn't at camp aren't counted).
   Place something and the number goes up at once.
3. **Still needed** counts the activity-and-bunk pairs short of their weekly minimum. Its tile has
   a bronze border while the number is above 0. Click it: a **Still to place** list opens under
   the tiles, with every overlap first, then each pair still needed (_Bunk 1_'s lines first, then
   _Bunk 2_'s, such as _Swim · Bunk 1: 1 still needed_), then the spread lines. It sits over the
   grid and scrolls if it is long. Click any tile again, or **Close** at its bottom, to close it.
   Nothing on the grid is highlighted. When everything in it has been dealt with, it stays open
   and says how many cells are still open (or _All placed_).
4. **Overlapping** shows 0, grey, and does nothing when clicked. In Daily View, Thursday, place
   Soccer in Period 3 for Bunks 1, 2, 3 and 4 (pick Open cells). Each of the four gets a small
   bronze dot in its top corner, with no words beside it. Hold the pointer on a dot: _Over its
   limit of 3 bunks at once · More bunks at Field than fit_. **Overlapping** now shows 4, one for
   each cell. Click it: the list starts with _Bunk 1 · Thursday · Period 3: Over its limit of 3
   bunks at once · More bunks at Field than fit_, then the same for Bunks 2, 3 and 4.
5. Click _Bunk 2 · Thursday · Period 3: …_ in the list: the list closes, the grid shows Bunk 2's
   week (Group View), and Thursday's Period 3 has the focus, with its dot's words showing. Back in
   Daily View, Thursday, drag Bunk 4's Soccer to Period 5. The dots go at once and
   **Overlapping** is back to a grey 0.
6. **Accept.** Open the list again. Each still needed line has an **Accept** button. Click it on
   one line: the line goes and **Still needed** drops by one. Now place or clear one of that
   bunk's sessions of that activity: if the bunk is still short, the line is back with its new
   number. Overlap lines have no Accept: they go
   when the clash is moved. Reloading the page brings every line back.
7. **Twice in a day.** Place Art in Bunk 1's Thursday Period 5 and Period 6. Both get the dot:
   _Twice in a day_. Undo one.
8. **Over its weekly limit.** Give Bunk 5 Gym games on Monday, Tuesday, Wednesday and Thursday
   (its limit is 3). Only Thursday's gets the dot, _Over its weekly limit_: the one past the
   limit, the latest in the week. Nothing stops you. Clear Monday's: Thursday's dot goes.
9. **From the keyboard.** Click a cell, then use the arrow keys to reach a cell with a dot: its
   words show above the dot while the cell has focus. Escape hides them (and, if you picked
   something up with Space, puts it back where it was). A screen reader reads them as part of
   the cell, and when you place or move something, says the first dot it brought or took away.
10. **Not set up for a bunk.** On **Activities**, open Boating and set **Who can do it** to
    Seniors. Back in Manual Build (reload the page), place Boating for Bunk 1: _Not set up for
    Bunk 1_. Set Boating back to everyone afterwards.
11. **Spread across the week.** On **Activities**, open Swim and set **Get this many done early in
    the week** to 1, **By** Tuesday. Back in Manual Build (reload), the **Spread across the week**
    tile appears (it isn't shown while no activity has an early-week goal), and the list has each
    bunk without a Swim on Monday or Tuesday (_Swim · Bunk 6: 1 still needed by Tuesday_). Clear
    those two settings afterwards: the tile goes again.

## 22. Manual Build: Clear day, Clear week, Copy day to…

This uses the made-up camp's Week 1 from sections 19 to 21.

1. Open **Manual Build**, Week 1, Daily View, Monday. Next to **Undo** and **Redo** are **Clear
   day**, **Copy day to…** and **Clear week**.
2. **Copy day to…** → **Tuesday**. Tuesday now has Monday's activities, bunk by bunk, and Lunch is
   where it was (Tuesday's own fixed and recurring activities always stay). The line under the
   toolbar says _Copied Monday to Tuesday · Undo_. Anything that couldn't go would be listed
   there with why. Nothing asks you to confirm. With three or more days, the menu also has **All
   other days**.
3. Click **Undo** on that line: Tuesday is back as it was, in one step.
4. **Clear day** (on Monday): every bunk's activities on Monday go; fixed and recurring ones stay.
   _Cleared Monday · Undo_. Undo puts them back. Click **Clear day** on an empty day: _Nothing to
   clear on Monday._ Anything else that stays is named on that line with why (_… (deleted
   since)_, _… (not set up yet)_).
5. **Group View**, Bunk 3: **Clear day** is a menu of the week's days. Pick **Wednesday**: only
   Bunk 3's Wednesday is cleared. _Cleared Bunk 3 · Wednesday · Undo_.
6. **Clear week**: every activity of every bunk, every day, goes. _Cleared Week 1 · Undo_. Undo
   brings the whole week back. (Ctrl+Z works too.)
7. **Activity View** has none of these (it is read-only).

## 23. Generated Schedule: generate, rebuild, try another

This uses the made-up camp's Week 1 from sections 19 to 22. Generated Schedule is a second,
separate schedule for the same week: nothing here changes Manual Build, and Manual Build's week
doesn't change this one.

1. **The menu and Roots.** Reload the Shoresh tab. The menu's last section reads **Generated
   Schedule**, **Manual Build**, **Schedules**, with no _Coming_ (the two schedules are listed by
   name, as on the desktop: the order means nothing). On Roots, **Build or generate the
   schedule** now holds two buttons side by side, **Generated Schedule →** and **Manual
   Build →**. Click **Generated Schedule →**.
2. **A week not generated yet.** The **Week** picker shows _Week 1_. In the middle of the page:
   _Let the app propose one_ and one button, **Generate a schedule**. Nothing else yet.
3. **Generate.** Click it. A thin bar under the toolbar shows a short stripe moving along it,
   with _Generating…_ beside it, and the buttons are greyed out until it is saved. For the
   made-up camp that takes about a second. A camp with 40 bunks can take several seconds: then
   the bar fills from left to right as the week is built, and the page keeps responding all the
   while (scroll, or open the menu, while it runs). Then the week shows in **Daily View**, Monday:
   every cell where a bunk is at camp holds an activity. Lunch, Morning meeting and Library time
   are where setup puts them, and cells where a bunk isn't at camp are hatched, as in Manual Build.
4. **The toolbar** now has **Rebuild**, **Fill the open cells**, **Try another**, an **Option**
   picker showing 1, and on the right **Start over**.
5. **The dots.** A cell that had to bend a rule (Shoresh never leaves a cell empty when something
   can go there) has the small bronze dot. Hold the pointer on it, or tap it, to see which rule,
   for example _Over its weekly limit_ or _Twice in a day_. If no cell has a dot, every rule was
   met.
6. **Under the grid** (on this schedule the counts sit below the grid) are the tiles: **Filled**
   (_N of N_ when every cell is filled), **Open**, **Still needed**, and **Spread across the
   week** if an activity has an early-week goal. **Open** counts cells nothing could go in
   (expected to be 0 here); one that no activity is short enough for has the dot, _No activity
   fits this gap_. A tile above 0 has a bronze border: click it to see only its lines
   in **Still to place**, and the cells they are about get a bronze outline on the grid. Click
   the tile again to turn that off. **Review all** shows every line. Click a line: the grid
   shows that bunk's week (Group View) and the outlines go.
7. **Try another.** Click it: a new week is built and saved straight away, with no question,
   and **Option** shows 2. Click **Try another** again: option 3. Now open **Option** and pick
   1: the very first week comes back, exactly as it was (the same week, option and setup always
   give the same schedule).
8. **Rebuild.** Click it. A box asks _Rebuild this schedule?_, _Builds Week 1 again from your
   setup._ and _Saved to Versions first._ **Cancel** has the focus; press Escape or click it and
   nothing changes. Click **Rebuild** again, then **Rebuild it**: the week is built again with
   the same option. With no setup change since, it is the same week. (Locks come in the next
   part, and with them a line saying locked cells stay.)
9. **A setup change.** On **Activities**, open Swim and lower its most times a week by one. Back on
   Generated Schedule, **Rebuild** → **Rebuild it**: Swim now runs fewer times. Put Swim back
   afterwards.
10. **Start over.** Click it. The box says _Clears the N activity cells in Week 1. Fixed
    activities and recurring activities stay._ and _Saved to Versions first._ Click **Start
    over** (_Starting over…_ shows while it saves): every activity cell says **Open** again; Lunch, Morning meeting and Library time stay.
    **Open** now counts those cells.
11. **Fill the open cells.** It is greyed out while nothing is Open. After step 10, click it: only
    the Open cells are filled; anything already in a cell stays where it is.
12. **Someone else saved first.** Open the Shoresh tab in a second browser window, on Generated
    Schedule, Week 1, and put the two windows side by side.
    1. In the **first** window, click **Rebuild**. Leave its box (_Rebuild this schedule?_)
       open.
    2. In the **second** window, click **Try another**. It saves.
    3. Back in the first window, click **Rebuild it**. A bronze-bordered box says _Someone else
       changed this schedule since you opened it._ with a **Reload** button, and nothing of
       yours was saved. (While its box is open the first window doesn't read the week again,
       which is why this shows the clash; without a box open, coming back to a window reads the
       week first, so the buttons work on what the other window saved.)
    4. Click **Reload**: the week shows as the second window saved it, with **Option** on its
       option.
13. **Not here yet:** changing cells by hand on this schedule (drag, type, Delete). Cells can be
    reached with the arrow keys so a dot's words show, but they can't be changed: a hand edit
    will lock the cell, and locks come in the next part. Use Manual Build for a week built by hand.
14. **Versions.** Rebuild, Try another and Start over each keep the week as it was first, as a
    version named _Before Rebuild_, _Before Try another_ or _Before Start over_ (Schedules page,
    **Versions**). Fill the open cells keeps none: it only adds.

## What is not here yet

- Moving a bunk to another unit on the Bunks screen comes later.
- Special events are in the menu, marked Coming.
- Generated Schedule: locks and changing cells by hand (next part), other programs sharing a
  place, Versions on that screen, and publishing. In Manual Build: Versions on that screen,
  restoring a version into it, Start from another week, and publishing.
- The camp map is a later piece.
- Salesforce's own pages (reports, list views, record pages) show the standard words, not your
  camp words (accepted 2026-10-15).

The test org is shared with the automatic checks, so leave it in place when you are done.
There is only ever one test org (see [ci-setup.md](ci-setup.md)).
