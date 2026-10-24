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
2. On the left is the Shoresh menu. At its top is the camp row: the camp name, and under it a
   small **▾** (**Season actions**, which holds **New season**). Below it is the menu (Roots; **Camp**: Weeks, Programs, Divisions, Groups, Time blocks, Locations,
   Camp words; **Activities & Events**: Activities, Fixed activities, Recurring activities, and
   Special events marked **Coming**; **Schedules**: **Generated Schedule**, **Manual Build**,
   **Elective seats** and **Saved versions**). Until there is a season, only
   **Camp words** can be opened; the rest is greyed out (the **Schedules** title too). The middle shows **Start a new season**.

## 3. Use your camp's own words

1. In the menu, click **Camp words**. One row per word, in sections (Camp, Activities,
   Electives, Schedules): the standard word, then a box with the standard word in grey.
2. In the **Group** row's box type _Bunk_. _Bunks_ appears beside it: Shoresh guessed the
   plural. In the **Division** row type _Unit_ (it guesses _Units_). In the **Elective set** row
   type _Chug_: it guesses _Chugs_; click the guess and type _Chugim_ over it.
3. There is no Save button: each word is saved when you leave its box (click elsewhere, press
   **Tab** or **Enter**). At the top, **3 changed** and a small grey **✓ Saved**. The menu now
   says **Bunks** and **Units**, and so does everything below. If Shoresh refuses a word, why
   shows in red under that box and your typing stays. Clearing a box puts the standard word back.
4. At the bottom right, **Activities →** would take you to the next screen; every setup screen
   ends with one, in menu order, so you can walk through setup with it. (Before there is a
   season, camp words has none.)

## 4. Create a season

1. Click the small **▾** under the camp name in the menu (**Season actions**) and choose
   **New season**. In **Start a new season**, type _Summer 2026_, set
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
   - **Import last year** at the bottom, the blue button (section 14). Once the season has
     units, bunks or time blocks it becomes a quiet **Re-import last year** link instead.
   - In the menu, a small **!** beside Weeks, Programs, Units, Bunks, Time blocks, and
     Activities: each is still empty, and building a schedule needs it. As each gets its
     first rows it turns to a green **✓** (Locations, Fixed and Recurring activities get the
     ✓ too once they have rows, but never the !). A screen reader reads them as _Needed_ and
     _Done_.
4. Click the **Summer 2026 / No weeks yet** item. Shoresh opens the **Weeks** screen, where
   it is fixed. Every card and every attention item works this way.

## 5. Weeks with real dates

**How every table saves** (like the desktop): there is no Save button. The same goes for the
season's name and dates, camp words, and Activity details: a
field is saved when you leave it (a tick or a dropdown the moment you choose it), a quiet
**✓ Saved** appears, and a refusal shows in red next to the field with your typing kept. The last row of each
table is always blank, tinted, with the table's add word in it in grey (_Add Week_). Type
into it and press **Enter**, click its **+ Add** button, or just move out of the row: it is
added. Until everything it needs is filled in, **+ Add** stays grey and nothing happens.
A change to a row that is already there is saved when you press **Enter** in it or move to
another row, and a week tick is saved the moment you click it; **Escape** puts the row back
as it was. If Shoresh refuses a change, the row keeps a bronze edge on its left until you fix
it or press **Escape**.

1. The season's own name and dates are not on this screen: they are in the menu's camp row.
   Under the camp name is the season's name (_Summer 2026_), a pencil, and the **▾**. Click
   the pencil (_Edit Summer 2026_). **Season name**, **First day**, **Last day** and **Delete
   season** open under it, in the menu; change a date and click elsewhere, and **✓ Saved**
   shows. Click the pencil again to close them. The pencil, like every small icon button
   (a row's trash can, a panel's ×), is grey at rest and turns green under the pointer or
   when Tab reaches it. On **Weeks**, click **Fill in weeks from the
   season dates**. Six weeks
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

1. **Programs**: in the table's blank row (_Add Program_) type _Main_ and press **Enter**. It
   runs every day: **Runs on** shows Mon to Fri, each ticked. Click **Fri** to untick it (it runs
   Monday to Thursday) and leave the row: it is saved (**✓ Saved**). Its **Time blocks** count
   is a dark _0_ with a small black corner: point at the corner for _No time blocks yet_. It
   goes once the next step adds one.
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
   right, under **Weeks**, a new bunk runs every week.
5. Back on **Roots**, the cards count your weeks, 1 unit, 2 bunks (named on the card), and
   3 time blocks, and those attention items are gone.

## 7. Locations

1. **Locations**: first, optionally, **Location types**: type _Field_ in its blank row and
   press **Enter**. Types are only for sorting your locations.
2. Under **Locations**, add three in the blank row (each starts with groups that fit 1):
   - _Pool_, no type, **Groups that fit** 1
   - _Field A_, type _Field_, groups that fit 2
   - _Gym_, no type, groups that fit 3

   Each row is open every week (its **Weeks**; point at the row for a tick per week).

3. Use **Show** above the table to see only _Field_ locations, or only those with no type.
   With _Field_ chosen, the blank row starts as a Field. Change Field A's type to none: it
   stays in view until you leave the row (it is saved), then leaves this view. Choose _All
   location types_ to see them all again, and put Field A back to _Field_.
4. Try a mistake: set the Pool's groups that fit to 0 and press **Enter**. Shoresh says it
   must be 1 or more. Press **Escape** to put it back.

## 8. Activities

1. **Activities** (under the Activities & Events heading in the menu). The table has five
   columns: **Activity**, **Location**, **How often**, **Who** and **Weeks**. The blank row
   starts with the usual defaults: at least 1 and at most 1 time a week, every bunk, and every
   week. Everything else about an activity (length, priority, outdoors, rain plan, groups at
   once) is in its details, beside the table (step 5).
2. Add three: _Swim_ at the Pool; _Gym games_ in the Gym; _Soccer_ on Field A. For each, fill
   in the blank row and press **Enter**. **How often** shows one bar per time a week: at
   least in green, up to at most in a pale green. Point at a row (or click into it) and the
   bars become the two numbers, **at least** and **at most**, to change; they are saved with
   the row. **Who** reads a quiet _Everyone_ until only some bunks can do it.
3. Point at Soccer's row: a trash can and a **›** appear at its end. Click the **›** (_Soccer
   details_). Soccer's details open in a panel on the right of the table, with Soccer's row
   marked and the cursor on the panel's heading, _Soccer_. Tick **Outdoors**: it is saved at
   once (**✓ Saved** beside the heading). A yellow **Needs attention** box at the top of the
   screen says _Soccer: Outdoors and has no rain plan._ (Roots lists it too.) In the panel,
   set **Rain plan** to _Gym games_; it goes away. (Soccer's own name is not offered as its
   rain plan.) The **Rain plan** list offers only indoor activities: Soccer, being outdoors,
   is never offered as anyone's rain plan. Try it: open Gym games' details (its **›**), tick
   **Outdoors** (allowed), then open Soccer's again. Its **Rain plan** now reads _Gym games
   (outdoor, choose another)_, and a change to Soccer is refused until it gets an indoor rain
   plan or None: _"Soccer": The rain plan has to be indoors. Pick an indoor one, or choose
   None._ Untick **Outdoors** on Gym games again. The panel's **×** (_Close Soccer details_)
   closes it and puts the cursor back on Soccer's **›**.
4. In Gym games' details, set **Groups at once** to 5 and press **Enter**. Needs attention now
   says the Gym fits 3, so scheduling will use 3. Put it back to 1. (**Length** and
   **Priority** sit beside each other in the same panel, saved the same way.) Set Gym games'
   **Priority** to _High_: its row moves up into a new **High priority** section above **Low
   priority**, still marked, while the cursor stays on Priority. Set it back to _Low_ and the
   High section goes away again (it shows only while it holds an activity).
5. Open Swim's details. Under **Who can do it: everyone**, tick _Bunk 1_: it is saved at once
   and the label now reads **Who can do it**. Only Bunk 1 can swim now; nothing ticked means
   every bunk. Swim's **Who** in the table now reads _Bunk 1_. (Tab reaches each tick; Space
   ticks it.)
6. Still in Swim's details, under **Early in the week**: **How many** 1, **By** Tuesday (the
   swim test by Tuesday). Each is saved as you leave it or choose it.
7. **Two people at once, in the details.** Open the Shoresh tab in a second browser window,
   on **Activities**, with Swim's details open in both. In the first, set **Length** to 2 and
   press **Enter**. In the second (not reloaded), set **Length** to 3 and press **Enter**. A
   box **Changed by someone else** shows _Swim · Length_ with **Theirs** _2_ and **Yours**
   _3_, as the tables do (section 5). **Keep theirs** (or Escape) shows 2 and saves nothing;
   **Use yours** saves 3. Nothing is overwritten without you seeing it. Put Length back to 1.
8. Try deleting the **Pool** (trash can in the Locations table). Shoresh refuses: Swim happens
   there; choose another location for Swim first. Try deleting **Gym games**: refused,
   because it is Soccer's rain plan.
9. **Same location?** On **Locations**, add _pool_ (lower case), groups that fit 2. Then on
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
3. **Locations**: untick **Week 2** under **Weeks** on the **Pool** (closed for repairs).

## 10. Fixed and recurring activities

A **fixed activity** takes every bunk in the program, in one time block, every day the program
runs (flagpole, lunch). A **recurring activity** takes chosen bunks (or all of them) in one time
block on the days you tick (Bunk 1 swims Monday and Wednesday). They are separate from
activities and from each other. Clashes are refused, never just shown.

1. **Fixed activities** (under Activities & Events in the menu). There is one section,
   **Whole camp** (with several programs, one per program, under its name), with columns
   **Name**, **Time block** and **Weeks**. In the blank row type _Flagpole_, **Time block**
   Period 1, and press **Enter**. It runs every week. Its length (1) and location (none) are
   in its details: the **›** at the end of the row opens them under it, saved with the row.
   Add a second one, _Lunch break_ in Lunch.
2. A **Needs attention** column appears while a row needs it: on Lunch break it says _Bunk 2 is morning only and is left out._
   Bunk 2 is not at camp in the afternoon, so Lunch break leaves it out rather than refusing.
3. On **Roots**, the wide **Fixed activities** card now counts 2 and names them. Click it to
   come back.
4. **Try a clash.** Add _Carpool_ in Period 1. Shoresh refuses:
   _"Flagpole" and "Carpool" would both have Bunk 1 in Period 1 on Monday in Week 1. Change the
   time block, length, or weeks of one of them._ Nothing is saved, and
   your typing is still in the blank row to fix. Clear its name to drop it.
5. **Too many bunks at a location.** Open Flagpole's details (its **›**), set its
   **Location** to the Pool and click outside the row: refused, _"Pool" fits 1 Bunk at once, but "Flagpole" would have 2 there
   …_. Choose the Gym instead and click outside the row again. Now go to **Locations**, set
   the Gym's groups that fit to 1 and press **Enter**:
   refused from that side too, _… Keep it at 2 or more, or move it to another location first._
   Put it back to 3.
6. **Past the end of the day.** In Lunch break's details, set **Length** to 2 and press
   **Enter**:
   refused, it would run past the last time block of Main. Press **Escape**. (Deleting or moving a time block
   that would cause this is refused the same way.)
7. **Recurring activities.** The screen is in sections: **Whole camp** (things for everyone
   in Main), then one per unit (_Juniors_) for things only some of its bunks do, then **More
   than one Unit** once something covers several. Columns: **Name**, **Who**, **Time block**,
   **Days** and **Weeks**. Plain defaults read quietly (_Every bunk_, _Every day_); anything
   else stands out (_Bunk 1_, _Mon Wed_, _Off Thu_). In the **Juniors** section's blank row:
   _Bunk 1 swim_, Period 2. Point at the row: under **Days** a tick per day Main runs appears
   (Monday to Thursday; no Friday); tick **Monday** and **Wednesday**. Under **Who** it says
   _Every bunk_; click **Change**, move _Bunk 1 (Juniors)_ to **Covers**, click **Done**.
   With everything filled in, **Done** adds the row. Its length (1) and location (Pool) are in
   its details, from the **›**.
8. Add _Bunk 2 art_ in the Juniors section: Period 2, **Monday**, who _Bunk 2 (Juniors)_.
   Both are kept: they take different bunks.
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

1. In the menu, click the **▾** beside the season's name (**Season actions**) and choose **Copy
   this season**. A page opens: Shoresh suggests _Summer 2027_ starting Monday Jun 28, 2027.
   Every week is drawn twice: _Summer 2026_'s in a faint outline, _Summer 2027_'s raised
   under it, so you see each one move. Below, **Comes along** lists what is copied and
   **Stays in Summer 2026** (crossed out) what is not: schedules, versions, special days and
   events, elective seats and camper choices.
2. Change the first day to Jun 29, 2027 (a Tuesday). A small black corner and _Summer 2026
   started on a Monday_ appear under it; you can still copy. Change it back to Jun 28, 2027.
3. Click **Copy to Summer 2027** (top right). You land on Roots for _Summer 2027_. On **Weeks** it says
   _Copied from "Summer 2026"_; the weeks (a year later), program, time blocks, unit, bunks,
   locations, activities (Soccer's rain plan, who can swim), fixed and recurring activities
   (with who each covers), and unticked weeks (Bunk 2 in Week 3, the Pool in Week 2, Bunk 1
   swim in Week 2) all came along. Anything waiting under "time blocks changed" is not
   carried: the copy starts from what each activity covers on the day you copy.
4. Click the season's name in the menu (it is a picker) and choose _Summer 2026_: it is
   exactly as you left it.

## 12. Deleting

1. On _Summer 2027_, open **Recurring activities** and delete **Bunk 2 art**: it goes, with
   who it covered. Then open **Bunks** and delete **Bunk 2** (trash can, then confirm). It
   goes, and its unticked Week 3 goes with it. Shoresh still refuses a delete when something
   else depends on the record: try deleting **Bunk 1**, which is in Swim's **Who can do it**
   and in who Bunk 1 swim covers.
2. **A time block added inside an activity.** Still on _Summer 2027_, delete **Bunk 1 swim**
   too (Recurring activities), so Period 2 is free. On **Fixed activities**, open Flagpole's
   details (its **›**), set **Length** to 2 and press **Enter**: it covers Period 1 and Period 2. Now on **Time
   blocks** add _Snack_ 9:45–10:00 AM, Morning. Back on **Fixed activities**, Needs attention
   and Flagpole's Needs attention column say _Time blocks changed since it was saved: it covered Period 1 –
   Period 2 and now covers Period 1 – Snack._ Two fixes are offered: **Keep Period 1 – Snack**
   and **Stretch to Period 1 – Period 2**. Rename Flagpole to _Flag_ and press **Enter**: the note stays.
   Click **Stretch to Period 1 – Period 2**: the length becomes 3 and the note goes. (Deleting
   a block inside an activity offers **Keep the shorter …** or **Extend to …** instead.)
3. Click the pencil beside the season's name in the menu, then **Delete season**, and
   confirm. It and everything in it are gone;
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
   Saved versions._ The first time, it also sets up that invented camp: one week (28 June 2027),
   one program, six bunks, seven time blocks, five activities, Lunch as a fixed activity,
   and two recurring activities (Morning meeting on Mondays, Library time for Juniors on
   Wednesdays). Your own camp is not touched. Running it again adds another version (and puts
   Week 1 back if it was deleted).

2. Reload the Shoresh tab. A **Camp** picker appears at the top: choose _Sample Camp (made
   up)_. Click **Saved versions** in the menu.
3. The newest version opens by itself. The toolbar shows **Week** (_Week 1_), the **Daily View
   / Group View / Activity View** toggle (as on the desktop), and, on the right after a
   divider, **Versions**. A blue strip says _Imported from sample-week.xlsx (made up) · Imported ·
   saved (date) · view only_.
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
    _(removed)_. Try it: on **Activities**, delete _Art_. Shoresh asks first: _Art is in 1
    schedule. Delete anyway?_ The number is every schedule using Art: drafts, saved versions,
    and published ones, so it is 1 if you ran the script once, 2 after two runs, and so on. Confirm, then open the version again. Deleting a bunk asks the same way. Art
    can be brought back from Salesforce's Recycle Bin.
12. **Deleting the week takes its versions.** On **Weeks**, delete _Week 1_: the confirmation
    says _That includes 1 saved version._ Confirm, and the version goes with the week (as on
    the desktop). A week with a published schedule can't be deleted (section 26, step 6). Run
    the script again for a new Week 1 and version.

## 14. Import last year

Shoresh can read last year's schedule from Excel or CSV files and set up the season from it.
Made-up sample files are in the project folder, in `docs/samples/import` (an invented camp,
_Maple Grove_, one week, six bunks): the same week as an all-camp workbook
(`maple-grove-2026-all-camp.xlsx`), as one CSV per bunk (`Maple Grove 2026 - Bunk 1.csv` to
`Bunk 6`), and as a by-activity CSV (`maple-grove-2026-by-activity.csv`).

**Into an empty season**

1. Choose **New season** from **Season actions** (the **▾** in the menu's camp row), name it
   _Import test_ (any dates), and click
   **Create season**. You land on Roots.
2. Click **Import last year** at the bottom of Roots. The import screen is one large shaded
   well: an upload arrow, _Drop last year's files_, _.xlsx · .xls · .csv_, and a **Choose
   files** button. Along the top: **‹ Roots** (the way back) and _Import last year_.
3. Click **Choose files**, go to the project folder, then `docs`, `samples`, `import`, and
   pick `maple-grove-2026-all-camp.xlsx`. (Or drag the file onto the well. You can pick
   several files at once.)
4. One page now shows what Shoresh found. Nothing is added yet. The file's name is at the top,
   and on the right **Start again** and a green button, _2 questions left_, greyed out.
   - **Check these first 2**: one row per question, each with a small dark corner at its top
     right until it is answered. _Are “Music” and “Musik” the same activity?_ (Musik is a
     planted typo.) Click **Same: call it “Music”**: it stays, raised, and the corner goes.
     Clicking another answer in the row changes it. The other question: _Is “Library time”
     at a set time, or an activity?_ (Juniors had it at Period 4 on Wednesday, in one week
     only, so Shoresh cannot be sure.) Click **A recurring activity**. Point at an answer to
     see what it means.
   - **Comes in**: a tile per kind with how many will be added: 6 bunks, 2 units, 7 time
     blocks, 7 activities, 1 fixed activity, 2 recurring activities, 1 elective set, 1 program.
     Click a tile to see its names under the tiles (click it again to close them).
   - **Programs for these bunks**: _A new program_ (this season has none yet). **Unit for
     each new bunk**: each bunk with its unit from the file (_Juniors_ or _Seniors_). Shoresh
     chose these itself, so they are not questions, but any can be changed here. (When a file
     does not say a bunk's unit and the program already has units, nothing is chosen: the
     bunk's dropdown is then a question in **Check these first**.)
   - **Elective sets** (or your camp's word for them): _Chugim_, _Read as electives: Tuesday,
     Period 6, every bunk. No choices in the file: add them later._ **Electives** is pressed;
     **Not electives** beside it would set Chugim up as what its cells show instead. Shoresh
     read it from the word, so it is not a question. (A cell listing choices, such as _Hiking,
     Fishing, Kayaking_, would also propose those as its offerings, and a set held in two
     periods back to back links each choice across both.)
   - **Not set up yet 2**: _Field day_ (a special day) and _Zoo trip_ (a trip), each in a
     dashed outline. Shoresh notes them but does not create them.
   - **Files**: the file, _5 pages_, and how it was read: _All camp: a page per day, bunks
     across_. (If Shoresh ever reads a file the wrong way round, change it here. A file it was
     unsure about has the dark corner.)
   - **Good to know**: outdoors, rain plans, and priority are not in a schedule file; set
     them on the Activities screen.
5. With both questions answered, the green button says exactly what will happen: **Add 27**.
   (While a question is unanswered it says how many are left, and cannot be clicked.)
6. Click **Add 27**.
7. The same page now shows what was **Added 27** as tiles, **Not set up yet**, and **Good to
   know**. Along the top: **Undo this import** and **Done**. Click **Done** to go back to Roots.
8. Roots now shows the cards filled in. Open **Fixed activities** (Lunch, at Lunch) and
   **Recurring activities** (Morning meeting on Mondays for everyone; Library time on
   Wednesdays for Juniors), and **Activities** (Boating two blocks long, for Seniors only).

**Adding to a season that already has setup**

9. Back on Roots, click **Re-import last year** (the season has setup now, so it is a quiet
   link at the bottom). This time pick **all eight files** at
   once (the workbook, the six bunk CSVs, and the by-activity CSV).
10. The top says _maple-grove-2026-all-camp.xlsx + 7_. **Files** shows each file's layout:
    _All camp_, _By group_ (each bunk's file, named after the file: _Bunk 1_ …), and _By
    activity_. **Comes in** has nothing to count: Shoresh matched everything by name and time
    and adds nothing twice. The similar-name question now reads _Are “Musik” and “Music” the
    same activity?_ with **Same: use “Music”** (Music is already set up). Click it.
11. One more question: _The files disagree about Bunk 3, Tuesday, Period 2. Which is right?_
    (the Bunk 3 file says Soccer; the all-camp and by-activity files say Art). Click **Leave
    it out for now**, then the green button. The page afterwards lists it under **Left out for
    now**: not added; the next import asks again.

**Last year's week as a version, and undoing an import**

12. Start a fresh season for this: **Season actions** → **New season**, _Import test 2_, first day Jun 28, 2027,
    last day Jul 9, 2027, **Create season**. Don't add weeks: from Roots, import
    `maple-grove-2026-all-camp.xlsx` again. The answers you gave last time are filled in
    already, each row marked _Remembered_; click another answer in a row to change it.
13. The season has no weeks yet, so Shoresh adds them from its dates, as **Fill in weeks**
    would (two weeks), and asks only which one last year's schedule is: _Which week is last
    year's schedule?_ with _Week 1 (starts Jun 28)_ and _Week 2 (starts Jul 5)_. Pick
    _Week 1_. **Good to know** says the season's 2 weeks are added from its dates, and
    **Comes in** has a _2 Weeks_ tile. (Undo in step 15 removes them too.) **Last year's
    schedule** shows a small picture of the week beside _Week 1 (Main)_ and _Kept as a version,
    Imported from maple-grove-2026-all-camp.xlsx_.
14. After the green button, **Last year's schedule** shows _Imported from
    maple-grove-2026-all-camp.xlsx_, _Week 1 (Main)_ and _Open it on Saved versions_. (**Undo this
    import** at the top would take the whole import back now; step 15 does it from Roots
    instead.) Click **Done**, then **Saved versions**: the version
    opens, with Lunch and Morning meeting as fixed and recurring activities, Chugim as the
    elective set (one wide cell across the bunks), and the Zoo trip and Field day marked _not
    set up yet_.
15. Back on Roots, under **Import last year**: _Last import: maple-grove-2026-all-camp.xlsx,
    <date and time>_ and **Undo last import**. Change something the import added first (for
    example, on **Activities**, make _Swim_ two blocks long and save). Then click **Undo last
    import** and confirm. The message says what was removed, and that _Swim_ was kept because
    it was changed since. Everything else the import added, the version included, is gone.

**Try it yourself**: a CSV or Excel file of your own invented camp. Days across with one file
per bunk, bunks across with one sheet per day, or activities across with the bunks in the
cells. Anything Shoresh is not sure about becomes a question; nothing is saved until the green
**Add** button.

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
   (3 location types, 4 locations), and **Undo this import**. Click **Close**.

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
    **Add 1, change 4**). Click it. Click the **›** at the end of Archery's row: in its details
    beside the table, _Who can do it_ now shows what the file said.
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
4. On **Roots**, click **Download worksheet**. The file _Import test -
   worksheet.xlsx_ has a sheet per setup screen (Programs, Units, Bunks, Time blocks,
   Locations, Activities, Fixed activities, Recurring activities, in your camp's words), then
   _Location types_, _Camp words_, _Weeks_, and _Runs in_ (a Yes or No under each week, as the
   screens' ticks).
5. Import the worksheet on any screen: it reads that screen's sheet, and shows _Unchanged_ for
   every row.

## 18. Import the whole camp worksheet on Roots

1. On **Roots**, click **Download worksheet** (section 17), then **Import worksheet**
   and choose that file. One box shows every sheet as its own section, and _Nothing to change_.
2. Open the worksheet in Excel and make four changes:
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
   the same worksheet. The _Weeks_ section shows _Matched by order_: _Week 1 (Jun 28 2027) →
   Week 1_ of this season, and so on. This season keeps its own dates, and the _Runs in_ ticks
   follow the pairing.

## 19. Manual Build: start a week and fill it by typing

This uses the made-up camp from section 13. If you haven't run that script yet, run it first.

1. Reload the Shoresh tab and choose _Sample Camp (made up)_ in the **Camp** picker. The menu's
   last section reads **Generated Schedule**, **Manual Build**, **Elective seats** and **Saved
   versions**. On Roots,
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
   to 3 only. Nothing appears under **Versions** on the Saved versions page: the week you build is
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
    **Week 1** under **Weeks** on Bunk 1 (point at the row to see a tick per week). Because Bunk 1 already has things placed in
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
11. **Spread across the week.** On **Activities**, open Swim and under **Early in the week** set
    **How many** to 1, **By** Tuesday. Back in Manual Build (reload), the **Spread across the week**
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

1. **The menu and Roots.** Reload the Shoresh tab. The menu's last section, **Schedules**, reads
   **Generated Schedule**, **Manual Build**, **Elective seats**, **Saved versions**, with no _Coming_ (the two schedules are listed by
   name, as on the desktop: the order means nothing). On Roots, **Build or generate the
   schedule** now holds two buttons side by side, **Generated Schedule →** and **Manual
   Build →**. Click **Generated Schedule →**.
2. **A week not generated yet.** The **Week** picker shows _Week 1_. In the middle of the page:
   _Let the app propose one_ and one button, **Generate a schedule**. Nothing else yet. (In a
   camp still missing its basics, such as activities or bunks, the page says instead what is
   still needed, as Manual Build does, with links and a **Set up …** button.)
3. **Generate.** Click it. A thin bar under the toolbar shows a short stripe moving along it,
   with _Generating…_ beside it, and the buttons are greyed out until it is saved. For the
   made-up camp that takes about a second. A camp with 40 bunks can take several seconds: then
   the bar fills from left to right as the week is built, and the page keeps responding all the
   while (scroll, or open the menu, while it runs). Then the week shows in **Daily View**, Monday:
   every cell where a bunk is at camp holds an activity. Lunch, Morning meeting and Library time
   are where setup puts them, and cells where a bunk isn't at camp are hatched, as in Manual Build.
4. **The toolbar** is now one row, as on the desktop: the **Week** picker, the three views,
   **Undo** and **Redo**, then **Rebuild**, **Fill the open cells**, **Try another**, an
   **Option** picker showing 1, **Lock**, and on the right **Start over**. The activity list is on
   the left of the grid, as in Manual Build.
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
13. **Lock.** In Daily View, Monday, press Tab until a cell of the grid has the focus, then use
    the arrow keys to reach Bunk 1's Period 2. Open the **Lock** menu (lock icon) in the toolbar:
    it offers _Lock Bunk 1 · Monday · Period 2_, _Lock Monday_ and _Lock Bunk 1 · Monday_. Choose
    the first: a small lock appears in that cell's top left corner, and nothing else changes.
    Click **Try another**: every other cell may change, the locked one stays. Open the menu
    again: it now offers _Unlock Bunk 1 · Monday · Period 2_.
14. **Lock a day or a bunk.** Choose _Lock Monday_: every Monday cell holding an activity gets the
    lock (Open cells and Lunch don't). In Group View the menu offers the bunk shown (_Lock Bunk
    2_). **Rebuild** now says _Locked cells stay as they are._; **Start over** says _Clears the N
    activity cells and every lock in Week 1._ The legend under the grid shows the lock.
15. **Keep a cell empty.** Reach an Open cell (after Start over, any) and choose _Lock …_ on it:
    it no longer says _Open_ (it shows only its lock: kept empty on purpose), it stays empty
    through every build, **Open** no longer counts it, and **Filled**'s total drops by one.
16. **Change a cell by hand.** Everything from sections 19 and 20 works here too: double-click
    a cell (or Enter) and type a name, drag an activity from the list or from another cell,
    Delete to clear, Shift with the arrows for length, Undo and Redo. Each change saves at once,
    and the cell you changed gets the lock straight away (a cell you clear gets none: Rebuild
    may fill it again). **Undo** takes your change and its lock back; **Redo** makes both
    again. A Lock you set yourself stays: clear a cell with Delete, choose _Lock …_ on it from
    the **Lock** menu (it shows only its lock), then click **Undo**: the activity comes back and
    the lock stays. **Redo** empties it again, still locked. Click **Rebuild** → **Rebuild it**:
    your changed cells stay, the rest is built again. After a build, **Undo** starts over
    (greyed out).
17. **A locked cell.** Double-click a locked cell, or reach it and press Enter: nothing opens and
    nothing unlocks. The line under the toolbar says _Bunk 1 · Monday · Period 2 is locked._,
    and the **Lock** menu now offers _Unlock Bunk 1 · Monday · Period 2_. Choose it: the line
    goes away. Then type into the cell as usual.
18. **A new activity.** Double-click an Open cell, type a name the camp doesn't have (_Climbing_),
    and choose _Add "Climbing" to activities_: it goes in the cell, and it is on the
    **Activities** screen with the usual starting values.
19. **While a change saves**, Rebuild, Try another, Lock and the pickers are greyed out for a
    moment; they come back on their own.
20. **Versions.** Rebuild, Try another and Start over each keep the week as it was first, as a
    version named _Before Rebuild_, _Before Try another_ or _Before Start over_ (Saved versions page,
    **Versions**). Fill the open cells keeps none: it only adds.

## 24. Both schedules: another program at the same place

This uses the made-up camp's Week 1 from sections 19 to 23. Main's Period 2 runs 9:50 to 10:35;
the Pool fits 3 bunks.

1. **Add a second program**, as in section 6 but **leave Friday ticked** (the steps below use
   Friday): _Teens_, Monday to Friday, with one time block _Swim hour_ 10:00 to 10:30 AM
   (Morning), a unit _Teens_ and two bunks, _Teen 1_ and _Teen 2_, all day. Its times don't line
   up with Main's, and that's fine.
2. On **Fixed activities**, for Teens, add _Teen swim_: Swim hour, length 1, location Pool. Both
   Teens bunks are at the Pool from 10:00 to 10:30, every day.
3. Open **Manual Build**, Main, Week 1, Daily View, **Friday**. Place Swim for Bunk 4 in Period 2.
   No dot: two Teens bunks and Bunk 4 make 3 at the Pool, which fits 3.
4. Place Swim for Bunk 5 in Period 2 too. Both Main cells get the dot. Hover one: _More bunks at
   Pool than fit, in use by Teen swim_, naming what Teens is doing there, as the desktop does.
   **Overlapping** goes up by 2. Teens isn't shown on Main's grid, but its bunks count.
5. Clear Bunk 5's Swim: the dots go.
6. On **Fixed activities**, untick **Week 1** for Teen swim. Back in Manual Build (reload), place
   Swim for Bunk 5 again: no dot, because Teens doesn't swim that week.
7. Open **Generated Schedule**, Main, Week 1, and click **Rebuild** (with Teen swim ticked
   for Week 1 again): wherever the build puts Swim between 10:00 and 10:30, it puts at most one
   Main bunk at the Pool, and nothing there gets a dot.
8. Teens' own Manual Build week doesn't count until it is published (publishing comes later).
   Only its fixed and recurring activities count meanwhile.
9. Afterwards, delete the Teens program so the camp is as it was.

## 25. Manual Build: versions, and Start from another week

This uses the made-up camp's Week 1 from sections 19 to 22.

1. Open **Manual Build**, Week 1. After Clear week, past a thin line, is **Versions**. Click it:
   the week's versions, newest first, each with **rename**, **delete** and **Restore**, and at
   the bottom a box _Name current version…_ with **Save version**.
2. Type _First try_ and click **Save version** (or press Enter). _Saved First try._ It is at the
   top of the list.
3. Change something (place Swim somewhere). Open **Versions** and click **Restore** on _First
   try_: the week is back as it was saved. _Restored First try._ Undo is empty now. The list has
   a new version on top, _Before Restore_, marked _Auto-saved_: the week as it was just before,
   so Restore on that one takes you back. _First try_ is marked _on screen now_ until your next
   change.
4. Click **delete** on _First try_: it says _Delete?_. Click it again: it goes. Click **delete**
   once and then elsewhere: nothing is deleted.
5. **Start from another week.** Pick a week that has no Manual Build yet (Week 2, say). Next to
   **Start a blank week** is **Start from another week**: a menu of the other weeks' Manual
   Build and the versions (_Week 1 · Manual Build_, _Week 1 · First try (version) · Oct 18,
   10:04 AM_: each version you saved shows when, so two with the same name can be told apart). Pick
   _Week 1 · Manual Build_. Week 2 begins with Week 1's activities, Monday from Monday and so on;
   its fixed and recurring activities are Week 2's own. Anything that couldn't go is listed under
   the toolbar, such as _Swim · Bunk 6 · Monday: not at camp then_ (or _not running this week_ if
   Swim is closed in Week 2 on the Activities screen), and those cells are Open.

## 26. Manual Build: Publish

This uses the made-up camp's Week 1 from sections 19 to 25.

1. Open **Manual Build**, Week 1. Last on the toolbar, after **Versions**, is a blue **Publish**
   button.
2. Click **Publish**. If the week still has Open cells or dots, a box asks first: _Publish Week
   1?_ with what is still to do (_12 of 40 cells still Open._, _2 activities need a look._,
   _Still needed: 3_). **Cancel** publishes nothing; **Publish** goes ahead (nothing is ever
   blocked). A week with nothing left to do publishes at once.
3. It says _Published Week 1._ Next to the button: _Published from Manual Build Oct 18, 10:04 AM by_
   your name.
4. Change a cell. The line now ends _· changed since_: the published copy did not change.
5. Click **Publish** again. The box says _Publish Week 1 again?_ and lists each cell that changes,
   such as _Bunk 1 · Monday · Period 2: Swim → Archery_. **Publish** replaces the published
   schedule.
6. Open **Versions**: the schedule it replaced is there, named by when it was published
   (_Published Oct 18, 10:04 AM_, the time from step 3), with just _Manual Build_ under the name
   (no second date), and **Restore** and **rename** but no **delete** (it is kept as history).
   On **Weeks**, delete _Week 1_: it is refused with _"Week 1" has published schedules, which
   are kept as history, so this week can't be deleted._ Nothing is deleted.
7. Click **Publish** with nothing changed: _Week 1 is already published as it is._ Nothing else
   happens.
8. Click **Unpublish** (beside **Publish**, there only while the week is published). A box asks
   _Unpublish Week 1?_ with _Nothing will be published for this week._ **Cancel** is highlighted
   and changes nothing. Click **Unpublish**: it says _Unpublished Week 1._, the _Published …_ line
   and the **Unpublish** button go, and **Versions** lists the copy named _Published Oct 18, …_
   (when step 5 published it), with **Restore** and **rename** but no **delete**. Pick Week 3
   (not started yet; Week 2 has its own Manual Build from section 25): under **Start from another
   week** it reads _Week 1 · Published Oct 18, … (version)_, with no second time after it.
   Nothing is started until you pick one, so go back to Week 1.
9. Click **Publish** again: with nothing left to do, it publishes at once, as a first publish.
10. In **Versions**, **rename** one of the _Published Oct 18, …_ copies to _Opening week_. The
    line under it now says _Manual Build · Published ·_ and the date, since the name no longer
    says when it was published.
11. Switch to another browser tab and come back. Manual Build reads the week again (to show
    anyone else's changes): **Publish** and **Unpublish** are greyed out for that moment, then
    work again. If you had tabbed to **Publish**, it still has the focus outline afterwards.

## 27. Generated Schedule: Publish

This uses the made-up camp's Week 1 on **Generated Schedule** (section 23).

1. Open **Generated Schedule**, Week 1 (generate it first if it isn't). Last on the toolbar, after
   **Start over**, is a blue **Publish** button. If Week 1 was published from Manual Build in
   section 26, it already says _Published from Manual Build Oct 18, … by_ your name _· changed since_, with
   **Unpublish** beside it: a week has one published schedule, whichever screen published it.
2. Click **Publish**. If cells are still Open or an activity has a dot, a box asks first, as on
   Manual Build (_Publish Week 1?_ or, when replacing, _Publish Week 1 again?_ with each cell that
   changes, then what is still to do). **Cancel** publishes nothing; **Publish** goes ahead. A
   finished week published for the first time goes at once.
3. It says _Published Week 1._ and the line beside the button now reads _Published from Generated
   Schedule_, then when and by whom. Back on **Manual Build**, Week 1's line also reads
   _Published from Generated Schedule …_, ending _· changed since_: Manual Build's own Week 1
   (built by hand from section 19 on) differs from the one just published.
4. Click **Rebuild** and confirm, then **Publish** (and **Publish** in the box, if it asks).
   Click **Rebuild** again and confirm: nothing was locked or changed by hand since the last
   build, so the same setup builds the same week, and the line still has no _· changed since_.
   (A lock or a hand edit made since a build can change how Rebuild builds the rest of the week;
   the line then rightly ends _· changed since_.)
5. Lock a cell (the **Lock** menu). The line does not change: a lock alone isn't a change to the
   published schedule. Click **Publish**: _Week 1 is already published as it is._ Then change a
   cell by hand: the line ends _· changed since_ at once.
6. While **Rebuild** runs, **Publish** and **Unpublish** are greyed out; while the Publish box is
   open, **Rebuild**, **Lock**, the pickers and hand edits wait.
7. Click **Unpublish**, then **Unpublish** in the box: _Unpublished Week 1._ The copies that are
   no longer published are listed, named _Published Oct 18, …_, in **Versions** on both screens
   (section 28).

## 28. Generated Schedule: Versions

This uses the made-up camp's Week 1 on **Generated Schedule** (sections 23 and 27).

1. Open **Generated Schedule**, Week 1. After **Start over**, set off by a thin line, is
   **Versions** (then **Publish**). Click it: the week's versions, newest first, from both
   screens: _Before Rebuild_ (_Generated Schedule · Auto-saved_), anything saved on Manual Build
   (_Manual Build_), and the copies no longer published, named _Published Oct 18, …_ (the name
   says it: they have no **delete**).
2. Type _Before the trip_ in _Name current version…_ and click **Save version**. It says _Saved
   Before the trip._ and the list shows it at the top.
3. Lock a cell (the **Lock** menu), then **Try another**. Open **Versions** and click **Restore**
   beside _Before the trip_. The week goes back to how it was when you saved it, with the option it
   was built with and its locks as they were then: the lock you just made is gone, and locks made
   before you saved it (sections 23 and 27) are back.
   _Before the trip_ says _on screen now_ until you change the week, and Undo starts over.
4. The week as it was before the Restore is kept at the top as _Before Restore_ (_Auto-saved_):
   **Restore** it to get the lock and the other option back.
5. **Restore** a version saved on **Manual Build**: every cell you placed there comes in locked
   (a hand choice is a lock, Greg's decision of 2026-10-19), and the Open cells don't. Click
   **Rebuild**: it fills only the Open cells around them.
6. **rename** a version, or one named _Published Oct 18, …_: type the new name and **Save**. A copy
   that was ever published has no **delete**; the others ask _Delete?_ on the first click and go
   on the second.
7. While **Rebuild** runs, a hand edit saves, a Lock saves or a Publish is on its way, the list's
   buttons are greyed out; while a Restore runs, the build buttons, **Lock**, **Publish**, the
   pickers and hand edits wait (_One moment: the week is being saved or restored._).
8. Pick a week not generated yet whose **Manual Build** has a saved version (save one there
   first). Under _Let the app propose one_ is **Versions**, with **Restore** and **rename** only.
   **Restore** a version: the week appears built from it, its placed cells locked, and the version
   says _on screen now_.

## 28. Manual Build: setup changed since the week started

Use Week 1's Manual Build from section 26, with an activity in Bunk 1's Monday Period 2 (Swim,
say).

1. In another tab, rename Swim to _Swimming_ on **Activities**. Come back to Manual Build: the
   cell says _Swimming_, with no dot. A rename is not a problem. Place any activity in another
   cell: Swimming still says _Swimming_. If the week was published, **Publish** now lists
   _Swim → Swimming_: the published copy gets the name you see. Rename only a bunk (say Bunk 2
   to _Bunk Bet_) and **Publish** lists _Renamed: Bunk 2 → Bunk Bet_, so the new name is
   published too.
2. Add a fixed activity _Assembly_ in Period 6 for everyone (on **Fixed activities**; Period 6
   is free every day on the sample camp). Come back: every Open Period 6 cell has the bronze
   dot; hover one: _Assembly is set up here now_. Above the grid, a bronze box: the dot, _Week 1
   doesn't match setup_, and **Update to match setup**.
3. Click **Update to match setup**. A box lists each change before anything happens, one row
   per cell: _Bunk 1 · Monday · Period 6_ · _Open → Assembly_ · _Assembly is set up here now_,
   each with its own **Update**. **Cancel** is highlighted and changes nothing. While the box is
   open, the week and program pickers, **Versions** and **Publish** are greyed out.
4. Click **Update** on one row: that one cell gets Assembly; the row goes and the rest stay.
   No version is kept (nothing of yours was taken).
5. Click **Cancel** to close the box (while it is open, the week waits). Add a new activity
   _Juggling_ on **Activities** (any place; the season has no Juggling yet) and put it in
   Bunk 2's and Bunk 3's Tuesday Period 3. Then delete Juggling on **Activities** (it asks
   first). Come back: both cells have the dot _Deleted from setup_. Open **Update to match
   setup**: one row reads _Bunk 2 · Tuesday · Period 3_ · _Juggling → Open_ · _Deleted from
   setup_. Click its **Update**, then **Update** on Bunk 3's Juggling row. Then click **Update
   all**: everything left is made and the box closes. **Versions** has one _Before Update to
   match setup_ (the week as it was before the first Juggling row, both Jugglings included), not
   one per row.
6. Add _Period 7_ at 2:50 PM on **Time blocks** (after Period 6, which ends at 2:45). Come back:
   one row per day, _Monday: Period 7 added_. **Update all**: each day gets the new Period, and
   your activities stay where they were.
7. Add a fixed activity _Flag lowering_ in Period 7 for everyone. Come back: the box is there
   again. Click **Update to match setup** and leave the box open. In another tab open the same
   week's Manual Build and put any activity in an Open cell before Period 7. Back in the first tab
   (the box is still open: coming back doesn't reread the week while it is), click
   **Update all**: it says _Someone else changed this week since, so nothing was updated._ and
   shows the week as it is now, with the activity you just placed.

## 29. Special events: special days and events

1. In the menu, under **Activities & Events**, click **Special events** (no longer marked
   Coming). The screen shows two sections, **Special days** and **Events**, each with a dashed
   blank row, and the rail counts both ("0 special days", "0 events").
2. In **Special days**' blank row type _Field Day_ and press Enter. Under the section a quiet
   line says what it started from, for example: _"Field Day" starts from Main's 7 time blocks,
   with Lunch and Rest brought in._ Anything not brought in is named with why, such as _Not
   brought in, since they don't run every day: Swim._ Its row reads _Whole camp_, _7 time
   blocks_ and _Not placed_.
3. Point at the row and click the chevron at its end. Beside the list its details open: Where
   (Whole camp), Placed on, and its time blocks one under another, each with what is in it
   (_12:00–12:45 Lunch: Lunch_), and **Open schedule**. Click **×**: the details close.
4. In **Events**' blank row type _Carnival_, press Tab to **Where** and pick a place, then press
   Enter. Its row reads _None_ under Schedule and _Not placed_. Type notes in its **Notes** and
   leave the row: ✓ Saved shows on the rail.
5. Open _Field Day_'s details again and click **Open schedule**. The list makes way for the
   special day's own schedule: on the rail, **‹ Special events** and _Field Day_, then **✓
   Saved**, **Import** and **Download** at the right. Bunks run across, its own time blocks
   down, and Lunch shows its padlock in every bunk.
6. Double-click an empty cell (or press Enter on it), type _swim_ and press Enter: _Swim_ is in
   that cell and ✓ Saved shows. Type a name the camp doesn't have, such as _Opening ceremony_:
   the list offers **Add "Opening ceremony" to activities**; choose it and it is placed. (It is
   added at 0 times a week, so Generated Schedule never puts it in a regular week.) **Edit** ›
   **Undo** takes it back.
7. Under the grid click **+ Time block** (your camp's word), give it a name, a start and an end
   (say 3:40 to 4:45 PM) and click **Add**: a new row appears at the bottom, empty in every bunk.
   Click **Time blocks** to see them listed, each with **Change**, up, down and **Remove**.
8. Click **Download**: an Excel file named _Field Day.xlsx_ saves, time blocks down and bunks
   across. Click **Import**: it says _Field Day already has entries. Clear it first…_ (an import
   only fills an empty schedule). **Edit** › **Clear schedule** asks first, then empties every
   cell; now **Import** that file and the cells come back, with a line saying how many (Lunch
   comes back as an activity of that name, without its padlock).
9. Click **‹ Special events**: the list is back as it was, the details still open, the cursor on
   **Open schedule**.
10. For _Carnival_ (an event), **Open schedule** says to add a time block and a station. Click
    **+ Station** and name it _Blue_, then **+ Time block**: the grid appears with Blue across.
11. Delete _Field Day_ with its row's trash can: it asks first, then it is gone.

## 30. Both schedules: a rainy day

This uses section 8's Soccer (outdoors, with _Gym games_ as its rain plan) and a week with Soccer
in it on Monday (Generated Schedule fills one; on Manual Build, type _Soccer_ into a few bunks'
cells on Monday).

1. Open **Edit**. Under its other rows, past a thin line, is **Rainy day…**. Click it: the week's
   days open under it (a day a special day replaces is not there).
2. Click **Monday**. Every Soccer on Monday becomes _Gym games_, and those cells pulse once. The
   line under the rail says what happened, for example _Rainy Monday: 3 switched to rain plans, 1
   full · Undo_.
3. A cell still showing Soccer has the corner mark: point at it (or tab to it) and it says _Rain
   plan full: choose another_. The Gym had no room then. Put something else there by hand and the
   mark goes.
4. Open **Versions**: _Before rainy Monday_ (Auto-saved) is at the top: the week from just before.
5. Click **Undo** on the line: every Soccer is back and the marks are gone, in one step.
6. On a day with nothing outdoors, **Rainy day…** only says _Rainy Tuesday: nothing outdoors to
   switch_ and changes nothing. A bunk locked on Generated Schedule keeps its Soccer, and the line
   says _1 locked, left as is_.

## 31. Electives, start to finish

This uses the season from sections 4 to 8 (Juniors with Bunk 1 and Bunk 2) and a week of it.
The campers are made up: `docs/samples/electives/chugim-choices.csv` in the project folder.

1. **The menu.** Under **Activities & Events**, **Electives** is the last entry; under
   **Schedules**, **Elective seats** sits between Manual Build and Saved versions. Neither is marked
   Coming any more. On **Special events** the button at the bottom is now **Electives →**.
2. **Activities first.** On **Activities** add _Archery_, _Drama_ and _Pottery_ (no location is
   fine) with **at least 0** times a week, so Generated Schedule doesn't place them by
   themselves.
3. **The menu of electives.** Open **Electives**. Under the sections, in **Elective sets**, type
   _Chugim_ in the blank row (_Add Elective set_) and press **Enter**. A section _Chugim 0_
   appears with its own blank row, _Add to Chugim_. Add **Archery** with **Seats** 3,
   **Drama** with 3, and **Pottery** with **No limit** ticked. The section now reads _Chugim
   3_ and the rail _1 elective set_. Type 0 in an offering's seats and it reads _Closed_, and the
   count drops by one; put it back.
4. **On the week.** Open **Manual Build** and pick the week (**Start a blank week** if it has
   not started). In the drawer, _Chugim_ is the first tile, above the activities. Drag it onto
   Tuesday's Period 2 for Bunk 1, then for Bunk 2: the two cells join into one wide cell,
   _Chugim (3)_, with the set's mark.
5. **Bring in the campers' choices.** Open **Elective seats**, pick the same week and _Chugim_
   (if the week has more than one schedule with Chugim on it, **Assign against** asks which).
   Click **Bring in choices** (it opens on that week and set), then **Choose a file** and pick
   `docs/samples/electives/chugim-choices.csv`. Three cards follow, _1 of 3_ to _3 of 3_:
   - **How the sheet was read**: which column is the name, the number, the bunk and the
     choices, and one camper read back (_Maya Fernwood: 1 Archery, 2 Drama, 3 Pottery_). Click
     **That's right**.
   - **What needs a look**: anything Shoresh couldn't place (nothing here), and Eli's
     parent comment. Click **Next**.
   - **What comes in**: _6 campers: 6 new, 0 already here_. Click **Bring in**: _Brought
     in 6 campers to "Chugim · Week 1"_. Nothing was saved before this click; **Cancel** at any
     card brings in nothing.
6. **Seats.** Back on **Elective seats** (the menu), the main button reads **Assign seats**.
   Click it: _Seats assigned: 6 of 6 placed._ The counter on the rail says how it went, and
   **By offering** shows each offering at each time with how full it is (Archery _3 of 3_).
   Click a cell to see who is there. **By camper** shows each camper's seat; the speech bubble
   beside Eli is the parent's comment.
7. **By hand.** In a roster, **Move to…** moves a camper to another offering: the move is
   locked (the padlock). **Assign again** keeps every lock.
8. **Finalize.** The main button now reads **Finalize**. Click it: the week's seats are fixed,
   the state reads _Final ·_ with the date and your name, and the main button becomes
   **Download**. (If the
   schedule changed under the seats, or two things are booked into one place, Shoresh says so
   and doesn't finalize until it's fixed. A final run doesn't change; **Start a new version**
   in its menu starts again from its choices, locks and moves.)
9. **Downloads.** **Download** opens a menu: **Rosters** (an Excel file, a sheet per offering:
   who is in it at each time, by bunk), **Print rosters** (the same, one page per offering, for
   paper), **Camper schedules** (each camper's week: their bunk's schedule with their seat in
   it), **Full report** (schedules, rosters, exceptions and a summary) and **Campers** (to edit
   and bring back with Bring in choices). File names carry the set and the week, for example
   _Chugim Week 1 rosters.xlsx_, never a child's name, and no file has a parent's comment.
10. **End of season.** In the **Download** menu, under a line, **Clear at season end…** takes
    over the screen: _Clear Summer 2026_, **Whole season** or the week on screen, _Can't be
    undone_, **Cancel** and **Clear**. Below, the summer drawn week by week: campers, choices,
    seats and runs; what goes is dashed and struck through, and the sets, offerings and linked
    choices stay, solid with a padlock. Pick the week: only that week is struck. Click
    **Clear**: _Cleared: 1 run, 6 campers._ The menu (Chugim and its three offerings) is still
    there for next summer. **Cancel** or Escape instead goes back with nothing done. A run
    that is not final yet is named and stops Clear until it is finalized.

## 32. The Schedules title: open a week

This uses the made-up camp from section 13 (one week is enough; two show it better: add _Week 2_
on **Weeks** first).

1. **The title is a door.** In the menu, the **Schedules** title (above Generated Schedule) is
   now something you can click; **Camp** and **Activities & Events** are still plain titles.
   Under the pointer it lights up like a menu entry. Click it.
2. **Your weeks.** The screen lists the season's weeks, one row each: the week's name, then
   **Generated Schedule** and **Manual Build**. No other words. The **Schedules** title is shown
   as the screen you are on.
3. **Open a week.** On _Week 2_ click **Manual Build**. Manual Build opens with its **Week**
   picker on _Week 2_. Click the **Schedules** title again, and on _Week 1_ click **Generated
   Schedule**: Generated Schedule opens on _Week 1_.
4. **With the keyboard.** Press Tab until the **Schedules** title has the green ring, then
   Enter: the weeks open, and Tab moves through each week's two buttons. A screen reader hears
   each one with its week, for example _Manual Build, Week 2_.
5. **Before a season** (or in a camp with none yet) the title is greyed out like the entries
   under it and does nothing. In a season with no weeks yet, the screen says _No Weeks yet_
   with a **Weeks →** button.

## What is not here yet

- Moving a bunk to another unit on the Bunks screen comes later.
- Special events: putting a special day or event on a day, and Import a list / Download this
  list on the Special events list, come in later slices.
- Electives: one roster for a linked choice across its periods, and a camper's week on screen,
  come later (each camper's week is in the Camper schedules download now).
- The camp map is a later piece.
- Salesforce's own pages (reports, list views, record pages) show the standard words, not your
  camp words (accepted 2026-10-15).

The test org is shared with the automatic checks, so leave it in place when you are done.
There is only ever one test org (see [ci-setup.md](ci-setup.md)).
