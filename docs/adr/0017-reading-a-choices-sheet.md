# 0017: Reading a choices sheet

Status: proposed (2026-10-21), electives slice E3a. Design source: the wiki electives plan
(`projects/shoresh-sf-electives-plan.md` §2 "Choices", §3 "Privacy", §6.3, §8 slice E3a), Greg's
decision 44 (electives are one piece of work), and Shoresh desktop's choices-sheet reader
(`src/ingest/preferenceSheet.js`) with its ADR `2026-09-27-elective-preference-etl-canonical-record-and-learned-axis-binding`
(§4.1-4.4, §8, §14.1, §14.1a), adapted under Apache-2.0 (see `NOTICE`). The design guide's
import rule applies: ask about what we found, never about the file's shape.

This slice is the reader's core only: no screen, no objects, nothing saved. Slice E6 builds the
review screens and the save on it.

## Choices

1. **A pure module, `c/shoreshChoicesReader`,** beside `c/shoreshImportEngine` and using its file
   reading (`csvFile`, `workbookFile`) and text helpers. `readChoices(file, { activities })`
   takes a file of sheets and returns campers with their choices, plus what it could not read.
   Like the schedule engine (ADR 0010 §1) it runs in the browser: the file never leaves it.
2. **No file shape is refused, and the director is never asked what the shape is** (desktop
   §14.1, §14.1a). The reader finds the heading row itself (below a title, or a two-row heading
   with "Choices" or a day merged over 1, 2, 3) and reads every shape the corpus holds: ranked
   columns in any of their usual words (#1, Choice 1, First choice, 1st choice, Rank 1, Pref 1),
   one row per choice (with or without a rank, day or period column), choices per period named
   in the heading ("Tue P2 - 1st choice", "Monday Period 3"), a choice per period plus a ranked
   list for the week, every choice in one cell, first and last name in two columns, camper
   numbers, division and bunk, and a planner that is one camper's own sheet (days across, periods
   down). What it can't read it lists, by place: rows above the table, columns it doesn't use,
   rows with no name, rows with no choices (footers like "Total campers"), cells that aren't a
   choice ("8", "Yes"), sheets with no choices, and a menu of what is offered.
3. **Headings, never cell contents, decide what a column is** (as ADR 0007 §2). A column the
   reader doesn't use is named by its heading only; **what it holds is never copied** into the
   reading (an email address, a date of birth, a parent's name). **A column about a camper's
   health (Medical, Medical notes, Allergies, Medications, Health, Dietary) is never read either,
   not even as a comment:** it is named by its heading only, like a date of birth (plan §3,
   Privacy: medical notes are under "Never"). The plan's minimal-data rule starts here.
4. **Three kinds of choice** (desktop §4.2): _ranked_ (one of an ordered list, for the week or
   for one period), _cell_ (the camper's one choice for a day or period, rank 1), and
   _unordered_ (rank blank). **Unordered is never made into a rank** (desktop §4.1, owner
   2026-09-29): a list in one cell, one row per choice with no rank, and two columns both headed
   #1 are unordered. A list found inside a ranked cell is read as unordered choices and marked to
   check, never as one activity called "Swim, Drama". **A cell that names one of the camp's own
   activities is that activity, before any splitting** (desktop `makeLabelResolver`, "matched"
   before "packed"; desktop ADR 2026-10-11 D3, "a name already in the catalogue never asks"):
   "Arts, Crafts" stays one choice when the camp has an activity of that name.
5. **Who is who** (desktop §4.4, plan §2). A camper is one camper number, or with none, one name
   (capitals, spacing and punctuation aside); division is never part of who they are. A camper's
   rows are one camper when they give different choices (one row per choice, one row per
   period). **Two rows with one name and no number are two campers the reader can't tell apart
   when they give different choices for the same rank, or both name one activity with no rank
   (an unranked choice's slot is the activity it names; desktop `preferenceSheet.js`), or when the sheet has one row per camper**
   (ranked columns, choices per period in the headings, every choice in one cell), even if their
   choices don't contradict or are identical: there a repeated name is two children or a form
   sent twice (desktop §4.4 and §13.1: rows collide when they share a coordinate, or when none
   has one). Neither becomes a camper; both rows are listed with their division and bunk for the
   director (the one thing the reader will not decide). One
   name with a number on some rows and not others stays two campers and is marked to check (the
   desktop's partial-id fork). One number with two names, and one camper's rows giving two
   divisions or bunks, are marked to check; the first is kept. **Kept means only the first:** a
   row with the number's second name adds none of its choices to the camper (its comments are
   still shown, with no camper), and when one camper's rows name different activities for the
   same rank, the first row's choice is kept and the clash is marked to check, so a camper never
   holds another child's choices or two choices of one rank (desktop §4.1).
6. **Comments are read, shown, and never kept; opt-outs are not read at all.** Parent comments
   come back in their own list, `notKept`, apart from the campers, so a save of the campers can't
   carry them by accident. E6 shows them during the review and must not save them (saving them
   with the camper is planned later; if so, only E6 changes). Shoresh has no opt-out concept
   (Greg, 2026-10-22, amending decision 48(3)): "There can be no opt-outs. If someone opted out,
   the camp would place them separately from here." So an opt-out column ("Swim opt-out",
   "Excused") is like any other column the reader does not use: listed by its heading in
   `notRead`, its cells never read or carried, the same as a health column.
7. **Choice names the camp doesn't have are listed** (`newNames`, with how many campers chose
   each) when the camp's activities are passed in. Settling them (Add, or Same as) is E6's
   question, asked once per name (plan §2).
8. **Same file, same reading.** Campers come back in the order the sheet first names them, and
   choices in sheet order. Nothing depends on time or chance.
9. **Tested against a generated corpus of 28 synthetic sheets** (`docs/samples/choices/`, made by
   `scripts/make-choices-samples.mjs` with a fixed seed). Every sheet is read from its file bytes
   and compared in full with what the generator put in it, so "silently wrong" (a sheet read
   differently from what it holds) is a failing test, and must stay zero. **Names are made up**:
   every camper name is a first name and an invented surname from `names.json`, and a test
   checks every name in the corpus and every name the reader finds against that list (the
   desktop's §8.0 control, since no gate can spot a real child's name). Never commit a real
   camp's sheet, in any form.

## Not done here

- The review screens, camper records, the run and the save (E6); reading one camper back in words
  ("Maya: 1 Archery, 2 Drama") is the review screen's.
- Matching a sheet's day and period words to the camp's time blocks and the elective times on
  the grid (E6, against the set's placement). Periods come back as "Period 3" or "Block 2";
  days as weekday names.
- Remembering a camp's confirmed reading for next time (`ImportAnswer__c`, E6).
- A camp-platform export nobody has seen (desktop class H) is not modelled; the corpus is shapes
  we imagined, which is the limit the desktop owner accepted.
