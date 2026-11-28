# Special days, special events, trips and rainy days

- **Special day:** its own day with its own schedule, put on a date in place of the regular day
  (SPECIAL-1.1). A trip is set up as a special day (SPECIAL-1.5).
  - Read: `read_special_days` (which days each is on), `read_special_schedule` (its cells).
  - Place: `put_special_day_on_day`, `take_special_day_off_day`. A day holds one special day; when
    another is there, Shoresh asks and changes nothing. Ask the person (API-1.74).
  - Its own schedule: `change_special_schedule_cell`, `change_special_schedule_frame`, or from a
    file with `import_special_schedule`.
- **Special event:** takes over some cells of a regular day: `place_special_event` (API-1.75).
- **"Not set up yet"** on a cell after an import: `set_it_up` makes the special day, event or set
  the import noted (API-1.79).
- **Rainy day:** `rainy_day` switches one day's outdoor activities to their rain plans, keeping a
  version first (CLOSE-4.5, CLOSE-5.2). Locked cells, longer activities and ones with no rain plan
  stay. "Rain plan full" lines are for the person to decide; tell them, don't move things yourself.
  `undo_last_change` switches the day back while this conversation lasts.

A schedule read names the days a special day took over (API-1.149). Say "Tuesday is the Zoo trip",
not just the trip's few rows.
