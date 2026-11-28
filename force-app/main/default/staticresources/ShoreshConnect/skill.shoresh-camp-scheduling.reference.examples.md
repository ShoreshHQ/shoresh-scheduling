# Four conversations, done right

All on a made-up camp, Camp Willow Bend (made up), which calls groups "Bunks", electives "Chugim"
and blocks "Periods".

## 1. A new season from last year's file

> **Director:** Here's last year's schedule, willow-bend-2026.xlsx. Set up this summer from it.

1. `read_camp_words`, `list_seasons`: the season is Summer 2027 (made up), with weeks.
2. `import_last_year` with the file, not saved. The review has three questions.
3. The AI says: "Using Summer 2027. Last year's file has 14 activities and 8 bunks. Shoresh has
   three questions: Is 'Arts & Crafts' the same as 'Arts and Crafts'? Is Bunk 7 in Juniors or
   Seniors? Is 'Color war' a special day? You can also leave any for later on Roots."
4. The director answers two and leaves one. The AI sends those answers only, then saves with the
   review's `seen`, and says what came in and that one question waits on Roots.

Not done: answering the questions itself, or retyping the file.

## 2. A week from Generate to Publish

> **Director:** Build Week 2 and publish it.

1. `build_week` for Week 2.
2. `read_week_checks`: "33 of 35 placed", Archery: Bunk 4 still needed 1, one Open cell.
3. The AI says: "Built Week 2 (Summer 2027): 33 of 35 placed. Bunk 4 is one Archery short, and
   Bunk 6 has Thursday Period 5 Open because no activity fits then. Publish as it is, or fix those
   first?"
4. The director says "publish". `publish_week`. "Published Week 2."

Not done: publishing without telling the director what the checks said, or lowering Archery's
minimum to clear the line.

## 3. A new camper's chug picks

> **Director:** Noa Birch joined Bunk 4. She wants Archery, then Swim, then Drama.

1. `import_choices` with a sheet of one camper: Noa Birch (made up), Bunk 4, Archery, Swim, Drama. Not saved.
2. The review counts one new camper and leaves everyone else's choices as they were.
3. The AI saves it with the review's `seen`, then offers: "Noa's in, with her three picks. Assign
   seats again for Week 2?"

Not done: adding her choices by hand to someone else's seats, guessing a fourth pick, or
assigning seats before she was in. Had the review counted an existing Noa Birch as new, the AI
would have stopped and asked.

## 4. A rainy Tuesday

> **Director:** It's pouring. Switch Tuesday to rain plans.

1. `rainy_day` for Tuesday of Week 2.
2. The answer: 9 switched, 2 with no rain plan, 1 "Rain plan full: choose another" (Swim, Bunk 3,
   Period 2).
3. The AI says: "Tuesday is on rain plans: 9 activities moved indoors. Canoeing and Hiking stayed:
   no indoor rain plan, and nothing indoors fit. Bunk 3's Swim at Period 2 couldn't move: its rain
   plan and every other indoor activity are full then. What should Bunk 3 do instead?"

Not done: choosing Bunk 3's activity itself. If the director wants the day back, `undo_last_change`
does it in this conversation; later, `restore_version` with "Before rainy Tuesday".
