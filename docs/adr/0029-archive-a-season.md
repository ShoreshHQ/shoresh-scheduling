# 0029. A published season is archived, never deleted

Date: 2026-11-12. Status: accepted (Greg, 2026-11-12, wiki `projects/shoresh-design-guide.md` §3:
"A season that was ever published is archived, never deleted. Archive keeps everything, read-only,
out of the season picker; an archived season can still be opened and brought back. The refusal that
said 'Mark it Finished' offers Archive instead.")

## Context

Delete season is refused while a season has any schedule that was ever published, kept as history
(ADR 0012; API-1.141). The refusal told the director to "Mark it Finished", but the season's status
left the screen in ADR 0013 (choice 7): nothing could be marked Finished, and a finished summer
stayed in the season picker for good.

The desktop has no seasons. Its nearest is the week switcher's Archive and Unarchive
(`src/components/schedule/WeekSwitcher.jsx`): an archived week leaves the list of weeks, sits under
an "Archived" heading in the same dropdown with its own Unarchive, keeps everything, and is never
the week opened on by itself (`src/ingest/defaultWeek.js`). Archive there asks nothing.

## Choices

1. **Data: a checkbox, `Season__c.Archived__c`** (default off), editable and readable in the Shoresh
   Scheduler permission set. Not a fourth `Status__c` value: Status is off the screen and read by
   nothing (ADR 0013 choice 7), and a status would need a value to come back to. Status stays as
   it is, never dropped.
2. **Where Archive is offered (WEEK-1.9).** Delete season keeps its question for a season never
   published. For one with published history the refusal becomes the question: its words end
   "Archive it instead." and its button is "Archive Summer 2026" (Cancel archives nothing), in the
   place the refusal was shown (`SetupDelete.Preview.archivable`). Archived, the camp opens on its
   other season, as after a delete. Archive asks nothing more, as on the desktop: it is undone by
   Bring back.
3. **Read-only means every save path refuses (WEEK-1.10).** Every before trigger of a season's
   records (setup, weeks, schedules and their days, campers, electives, special days and events,
   and the season itself) calls `ArchivedSeasons.refuseChanges()` first, so a screen, an AI, an
   import, a record page, a Flow or the API is refused alike, with nothing changed:
   "\"Summer 2025\" is archived, so it can't be changed. Bring it back first." An AI hears only
   the first sentence (AgentRefusal, API-1.105). The season itself takes no change but Bring back,
   and is not deleted. Imports and sends (logs of what came and went) are not the season's
   contents and are left out. Which seasons are archived is read once per request; with none
   archived nothing more is read, and with one archived a save in another season reads one
   record kind's seasons once (kept for the request). The setup screens' delete question
   (SetupDelete) refuses an archived season's records before asking.
4. **Out of the picker, opened from Season actions (WEEK-1.11).** The season picker lists the
   seasons not archived, and the one shown. Season actions (New season, Copy this season) lists
   archived seasons under an "Archived" heading, as the desktop's switcher does; choosing one opens
   it. Shown, an archived season has a closed-box mark where its pencil was (no season form, so no
   Delete season either) and no explainer text. Shoresh never opens on an archived season by
   itself: the screens' first season and the AI's `opens_on` (SeasonToOpen) skip archived ones; a
   camp with only archived seasons opens on New season. A season a tab or link already shows stays
   shown.
5. **Bring back (WEEK-1.12).** Season actions on an archived season offers "Bring back Summer 2025"
   (Greg's words, "brought back", rather than the desktop's "unarchive"). It stays open, is in the
   picker again and can be changed again.
6. **Copy season copies from an archived season (WEEK-1.13).** A copy only reads its source
   (SeasonCopier), so last summer's archived season is still the way to start next summer. The copy
   is not archived.
7. **Through an AI (API-1.145).** `list_seasons` marks an archived season `"archived": true` and
   names it "(archived)" where seasons are listed in a refusal; `archive_season` and
   `bring_back_season` do what Archive and Bring back do, the season always named, without asking
   first (nothing is taken away; the other undoes it). `delete_season`'s refusal for published
   history adds "It can be archived instead (archive_season)." That names a choice for the person,
   not a way around the refusal, and the connector still ends it with "This is for the person to
   decide".
8. **An AI may do what the screen offers, no more (AI parity).** The screen offers Archive only
   in Delete season's place, for a season that was ever published; so `archive_season` refuses a
   season never published, with nothing changed, naming the person's other choice as
   `delete_season`'s refusal names Archive (API-1.105: a choice, never an order): "\"Summer 2027\"
   was never published, so it can't be archived. It can be deleted instead (delete_season)." `bring_back_season` brings back any archived season, as
   the screen's Bring back does. (Revised 2026-11-12: this choice first let an AI archive any
   season.)
9. **Read-only looks read-only (WEEK-1.10).** While an archived season is open, its screens show
   no edit controls, only views and downloads, plus Bring back in Season actions: never controls
   that are refused on save. Camp Setup tells every screen of the season it is read-only
   (`read-only`, from `Season__c.Archived__c`), and each draws its read-only form: the setup tables
   show every value as words with no blank row, boxes, ticks, Delete, fixes or guesses to confirm;
   the details panels show their values with nothing to add, put on, take off or delete; Generated
   Schedule and Manual Build show the week and its views and counter with no Generate or Start,
   Build or Edit menu, tiles, typing or dragging in the grid, Versions or Publish; Saved versions
   opens and downloads versions but renames none; Elective seats shows and downloads seats with
   nothing imported, assigned, moved, locked, finalized or cleared; a special day's schedule shows
   and downloads with nothing imported or added. Import a list, Import last year, Bring in
   choices, Fill in weeks, a needs-a-look item's fix and Update to match setup are not offered.
   The closed-box mark by the season's name is the only sign; no explainer text. The saves' own
   refusal (choice 3) stays the safety net.

## Consequences

- A screen of a season that gains an edit control must hide it while the season is archived
  (its `read-only`), or the director sees a control that is refused on save.

- The handlers of triggers that gained a before event for this (a delete, or a program's or
  group's before insert and update) ignore it, so nothing they did before changes.
