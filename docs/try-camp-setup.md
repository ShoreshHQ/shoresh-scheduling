# Trying Camp Setup as a camp director

A walkthrough of the first Shoresh screen in the test org (a scratch org). Takes about
15 minutes. Nothing here touches a real org.

## 1. Put Shoresh into the test org (one command)

1. In the Claude app, open a terminal tab (or open the Terminal app).
2. Paste this and press Return:

   ```bash
   ~/Dev/Shoresh/shoresh-scheduling/scripts/try-in-test-org.sh
   ```

3. Wait about a minute. It prints "Putting Shoresh into the test org", then
   your browser opens Salesforce on the **Camp Setup** tab of the **Shoresh** app.
   If it stops with an error instead, copy the message to Claude.

## 2. Name your camp

The screen says **Welcome to Shoresh — Start by naming your camp.**

1. Type a camp name (for example _Camp Willow_) and click **Create camp**.
2. The camp name now shows at the top left, with buttons **New season** and **Camp words**,
   and a form **Start a new season**.

## 3. Use your camp's own words

1. Click **Camp words**. A table lists every glossary term ("Standard word") with two empty
   boxes.
2. On the **Group / Groups** row type _Bunk_ and _Bunks_. On **Division / Divisions** type
   _Unit_ and _Units_.
3. Scroll to the bottom and click **Save words**. You see "Saved. Shoresh screens now use your
   camp words." Everywhere below, the screen now says Bunk and Unit.

## 4. Create a season

1. In **Start a new season**, type _Summer 2026_, set **First day** to Jun 29, 2026 and
   **Last day** to Aug 7, 2026 (type the dates or pick them from the calendar).
2. Click **Create season**. (If a calendar was still open, the first click only closes it;
   click again.)
3. The season appears, with a yellow **Needs attention** box: no weeks, no programs yet.

## 5. Weeks with real dates

1. Click **Fill in weeks from the season dates**. Six weeks appear, Week 1 = Jun 29 – Jul 3,
   each Monday to Friday.
2. Try editing: change Week 6's end date, then **Save changes**. Or **Add Week** for an extra
   one, fill in its dates, **Save changes**.
3. Try a mistake: give a week a start date another week already has and save. Shoresh
   refuses and says which week already starts that day.

## 6. A program, its time blocks, units, and bunks

1. Under **Programs**, click **Add Program**. A program called _Main_ appears.
2. Untick **Friday** (it runs Monday to Thursday) and click **Save**.
3. **Time blocks**: click **Add Time block**, type _Period 1_, start 9:00 AM, end 9:45 AM,
   part of day Morning, then **Save changes**. Add _Lunch_ 12:00 PM – 12:45 PM, Afternoon,
   tick **Events only**, **Save changes**.
4. **Units**: click **Add Unit**, type _Juniors_, **Save changes**. A new table
   **Bunks in Juniors** appears.
5. Click **Add Bunk** twice. Name them _Bunk 1_ and _Bunk 2_; set Bunk 2's **Availability** to
   _Morning only_. **Save changes**.
6. The **Needs attention** box disappears once nothing is missing.

## 7. Weeks a bunk doesn't run

1. Scroll to **Week exceptions** at the bottom. There is a row for each bunk and a column for
   each week.
2. Tick **Bunk 2** under **Week 3** (say it is away on a trip that week) and click
   **Save changes**.
3. Now try deleting Bunk 2 (trash can next to it, then confirm). Shoresh refuses: it says
   Bunk 2 is marked as not running in Week 3 and to clear that under Week exceptions first.
   Nothing is deleted. Leave the tick in place; the copy below carries it over.

## 8. Copy the season to next summer

1. Click **Copy this season**. Shoresh suggests _Summer 2027_ starting Monday Jun 28, 2027, and
   lists every week with where it was and where it will be.
2. Change the start date to Jun 29, 2027 (a Tuesday). A yellow warning explains that every
   week would move to different weekdays. Change it back to Jun 28, 2027.
3. Click **Copy season**. You land on _Summer 2027_, which says _Copied from "Summer 2026"_,
   with the same weeks (a year later), program, time blocks, unit, bunks, and week exceptions.
4. Use the **Season** picker at the top to go back to _Summer 2026_: it is exactly as you left
   it.

## 9. Deleting

1. On _Summer 2027_, click **Delete season** and confirm. It and everything in it are gone;
   _Summer 2026_ is untouched.
2. Deleting a bunk, unit, program, week, or time block works the same way (trash can icon,
   then confirm).

## What is not here yet

- Week exceptions cover bunks only; activities and locations ("the pool is closed in Week 3")
  come with those pieces.
- Activities, locations, events, and schedules come in later pieces.
- Salesforce's own pages (reports, list views, record pages) show the standard words, not your
  camp words (accepted 2026-10-15).

The test org is shared with the automatic checks, so leave it in place when you are done.
There is only ever one test org (see [ci-setup.md](ci-setup.md)).
