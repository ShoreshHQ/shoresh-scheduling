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
   Special events marked **Coming**; and Schedules, **Coming**). Until there is a season, only
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
   - a **Build or generate the schedule** bar, marked **Coming**;
   - **What has taken root**: a card each for Activities, Bunks, Units, Locations,
     Time blocks, and Weeks, with how many there are (all 0 for now), and a wide
     **Fixed activities** card;
   - **Needs your attention** on the right: _Summer 2026_ has no weeks, no programs, and no
     activities yet;
   - **Import last year** at the bottom, marked **Coming**.
4. Click the **Summer 2026 / No weeks yet** item. Shoresh opens the **Weeks** screen, where
   it is fixed. Every card and every attention item works this way.

## 5. Weeks with real dates

1. On **Weeks**, the season's own name, dates, and status are at the top (**Save season**,
   **Delete season**). Below, click **Fill in weeks from the season dates**. Six weeks
   appear, Week 1 = Jun 29 – Jul 3, each Monday to Friday.
2. Try editing: change Week 6's end date, then **Save changes**. Or **Add Week** for an extra
   one, fill in its dates, **Save changes**.
3. Try a mistake: give a week a start date another week already has and save. Shoresh
   refuses and says which week already starts that day.
4. Unsaved typing stays put: change a week's name, click **Roots** in the menu, then
   **Weeks** again. Your typing is still there, waiting for **Save changes** (or
   **Cancel changes**).

## 6. A program, its time blocks, units, and bunks

1. **Programs**: click **Add Program**. A program called _Main_ appears. Untick **Friday**
   (it runs Monday to Thursday) and click **Save**.
2. **Time blocks**: the table is called _Time blocks in Main_. Click **Add Time block**, type
   _Period 1_, start 9:00 AM, end 9:45 AM, part of day Morning, then **Save changes**. Add
   _Period 2_ 10:00 AM – 10:45 AM, Morning, and _Lunch_ 12:00 PM – 12:45 PM, Afternoon,
   **Save changes**.
3. **Units**: click **Add Unit**, type _Juniors_, **Save changes**.
4. **Bunks**: a table **Bunks in Juniors** is there. Click **Add Bunk** twice. Name them
   _Bunk 1_ and _Bunk 2_; set Bunk 2's **Availability** to _Morning only_. To the right,
   under **Runs in**, every week is ticked: a new bunk runs every week. **Save changes**.
5. Back on **Roots**, the cards count your weeks, 1 unit, 2 bunks (named on the card), and
   3 time blocks, and those attention items are gone.

## 7. Locations

1. **Locations**: first, optionally, **Location types**: click **Add Location type**,
   type _Field_, **Save changes**. Types are only for sorting your locations.
2. Under **Locations**, click **Add Location** three times and fill them in:
   - _Pool_, no type, **Groups that fit** 1
   - _Field A_, type _Field_, groups that fit 2
   - _Gym_, no type, groups that fit 3

   Each row has an **Open in** tick for every week, all ticked. Then **Save changes**.

3. Use **Show** above the table to see only _Field_ locations, or only those with no type.
   Choose _All location types_ to see them all again.
4. Try a mistake: set the Pool's groups that fit to 0 and save. Shoresh says it must be 1 or
   more. Put it back to 1.

## 8. Activities

1. **Activities** (under the Activities heading in the menu). Click **Add Activity**. The new
   row starts with the usual defaults: length 1, at least 1 and at most 1 time a week, Low
   priority, indoors, one bunk at a time, and every week ticked under **Runs in**.
2. Make three: _Swim_ at the Pool; _Gym games_ in the Gym; _Soccer_ on Field A with
   **Outdoors** ticked. **Save changes**.
3. A yellow **Needs attention** box at the top of the screen says
   _Soccer: Outdoors and has no rain plan._ (Roots lists it too.) Set Soccer's **Rain plan**
   to _Gym games_ and save; it goes away. (Soccer's own name is not offered as its rain plan.)
4. Set Gym games' **Groups at once** to 5 and save. Needs attention now says the Gym fits 3, so
   scheduling will use 3. Put it back to 1.
5. Below the table, **Activity details**: pick _Swim_. Under **Who can do it**, move _Bunk 1_
   to **Can do it**, then **Save changes**. Only Bunk 1 can swim now; nobody chosen means
   every bunk.
6. Still on Swim, under **More rules**: "Get this many done early in the week" 1, **By**
   Tuesday (the swim test by Tuesday). **Save changes**.
7. Try deleting the **Pool** (trash can in the Locations table). Shoresh refuses: Swim happens
   there; choose another location for Swim first. Try deleting **Gym games**: refused,
   because it is Soccer's rain plan.

## 9. Weeks something doesn't run

There is no separate grid any more: each row says which weeks it runs in.

1. **Bunks**: untick **Week 3** on **Bunk 2** (say it is away on a trip that week) and click
   **Save changes**.
2. Leave it unticked; the copy below carries it over. (Deleting a bunk, activity, or location
   simply takes its unticked weeks with it; you try that in step 11.)
3. **Locations**: untick **Week 2** under **Open in** on the **Pool** (closed for repairs)
   and save.

## 10. Fixed and recurring activities

A **fixed activity** takes every bunk in the program, in one time block, every day the program
runs (flagpole, lunch). A **recurring activity** takes chosen bunks (or all of them) in one time
block on the days you tick (Bunk 1 swims Monday and Wednesday). They are separate from
activities and from each other. Clashes are refused, never just shown.

1. **Fixed activities** (under Activities in the menu). The table is _Fixed activities in
   Main_. Click **Add Fixed activity**: type _Flagpole_, **Time block** Period 1, length 1, no
   location. Every week is ticked under **Runs in**. Add a second one, _Lunch break_ in Lunch.
   **Save changes**.
2. The **Left out** column on Lunch break says _Bunk 2 is morning only and is left out._
   Bunk 2 is not at camp in the afternoon, so Lunch break leaves it out rather than refusing.
3. On **Roots**, the wide **Fixed activities** card now counts 2 and names them. Click it to
   come back.
4. **Try a clash.** Add _Carpool_ in Period 1 and save. Shoresh refuses:
   _"Flagpole" and "Carpool" would both have Bunk 1 in Period 1 on Monday in Week 1. Change the
   time block, length, days, who it covers, or weeks of one of them._ Nothing is saved, and
   your row is still there to fix. Remove it with its trash can.
5. **Too many bunks at a location.** Set Flagpole's **Location** to the Pool and save:
   refused, _"Pool" fits 1 Bunk at once, but "Flagpole" would have 2 there …_. Choose the Gym
   instead and save. Now go to **Locations**, set the Gym's groups that fit to 1 and save:
   refused from that side too, _… Keep it at 2 or more, or move it to another location first._
   Put it back to 3.
6. **Past the end of the day.** Set Lunch break's **Length** to 2 and save: refused, it would
   run past the last time block of Main. Put it back to 1. (Deleting or moving a time block
   that would cause this is refused the same way.)
7. **Recurring activities.** The table is _Recurring activities in Main_, with a tick for
   each day Main runs (Monday to Thursday; no Friday) and a **Who** column. Click
   **Add Recurring activity**: _Bunk 1 swim_, Period 2, length 1, location Pool, tick
   **Monday** and **Wednesday**. Under **Who** it says _Everyone in Main_; click **Change**,
   move _Bunk 1 (Juniors)_ to **Covers**, click **Done**. **Save changes**.
8. Add _Bunk 2 art_: Period 2, **Monday**, who _Bunk 2 (Juniors)_. Save. Both are kept: they
   take different bunks.
9. **Try a clash from the who side.** On Bunk 2 art, click **Change** and move Bunk 2 back
   out, so it covers everyone. Save: refused, _"Bunk 1 swim" and "Bunk 2 art" would both have
   Bunk 1 in Period 2 on Monday in Week 1 …_. Click **Cancel changes**.
10. **Needs attention:** the Pool is closed in Week 2 (step 3 of the last section), so the box
    at the top says _Bunk 1 swim: "Pool" is not open in Week 2, but this runs then._ Untick
    **Week 2** on Bunk 1 swim and save; it goes away.
11. Try deleting **Period 2** on **Time blocks**: refused, Bunk 1 swim and Bunk 2 art start in
    it. Try deleting **Bunk 1**: refused, it is in who Bunk 1 swim covers (and in Swim's who
    can do it).

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
   swim in Week 2) all came along.
4. Use the **Season** picker at the top to go back to _Summer 2026_: it is exactly as you left
   it.

## 12. Deleting

1. On _Summer 2027_, open **Recurring activities** and delete **Bunk 2 art**: it goes, with
   who it covered. Then open **Bunks** and delete **Bunk 2** (trash can, then confirm). It
   goes, and its unticked Week 3 goes with it. Shoresh still refuses a delete when something
   else depends on the record: try deleting **Bunk 1**, which is in Swim's **Who can do it**
   and in who Bunk 1 swim covers.
2. Open **Weeks**, click **Delete season** and confirm. It and everything in it are gone;
   _Summer 2026_ is untouched.
3. Deleting a unit, program, week, time block, location, activity, fixed activity, or
   recurring activity works the same way (trash can icon, then confirm), unless something else
   still uses it; Shoresh then says what, and where to change it. Deleting a unit or program
   also clears its bunks' unticked weeks. A program with fixed or recurring activities is
   refused until they are deleted.

## What is not here yet

- Bringing in last year's schedule from a spreadsheet is coming next (the next piece after
  fixed and recurring activities). On Roots, **Import last year** is marked Coming.
- Special events and schedules are in the menu, marked Coming.
- The camp map is a later piece.
- Salesforce's own pages (reports, list views, record pages) show the standard words, not your
  camp words (accepted 2026-10-15).

The test org is shared with the automatic checks, so leave it in place when you are done.
There is only ever one test org (see [ci-setup.md](ci-setup.md)).
