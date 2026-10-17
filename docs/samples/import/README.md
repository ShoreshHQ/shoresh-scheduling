# Sample files for Import last year

Everything here is invented: _Maple Grove Day Camp (made up)_, one week, six bunks in two
divisions (Juniors: Bunks 1-3; Seniors: Bunks 4-6). Made by `scripts/make-import-samples.mjs`
(`node scripts/make-import-samples.mjs`); edit the script, not the files.

The same week in the three layouts Shoresh reads:

| File                                           | Layout                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `maple-grove-2026-all-camp.xlsx`               | All camp: a sheet per day, bunks across, the divisions above them, two-block activities as merged cells |
| `Maple Grove 2026 - Bunk 1.csv` … `Bunk 6.csv` | By group: one file per bunk, days across                                                                |
| `maple-grove-2026-by-activity.csv`             | By activity: activities across, the bunks doing each listed in its cell, one day under another          |

Planted on purpose: _Musik_ (a one-letter typo of Music, once), an elective (_Chugim_,
Tuesday), a trip (_Zoo trip_, Seniors, Thursday afternoon), a special day (_Field day_, Friday),
and one disagreement (Bunk 3's file says Soccer on Tuesday, Period 2; the others say Art).
Walkthrough: `docs/try-camp-setup.md`, section 14. The import tests read these files.
