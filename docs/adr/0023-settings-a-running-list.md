# 0023: Settings, and what Shoresh has learned as a running list

Status: proposed (2026-10-28). Product decision: Greg, 2026-10-28 (wiki
`projects/shoresh-sf-learned-plan.md`, "Settings: a running list"). Changes ADR 0021's screen
(choices 4, 6, 14 and 15: the grouped view); everything it decided about remembering, patterns,
suggestions and auto-apply stands.

## Choices

1. **Settings at the foot of the menu.** The foot entry where the desktop has its footer link is
   now "Settings". It holds only What Shoresh has learned for now, and opening it shows the list
   straight away: no page of settings in between. The screen keeps its key (`learned`), so the
   page's screens, checks and tests that open it are unchanged; only its menu word and heading
   ("Settings", with the list named "What Shoresh has learned" above it) change.

2. **One running list, newest first.** The grouped-by-kind view and its kind filter go. Each line
   is what was learned in the camp's words (the same words ADR 0021 used for a row: "Carpool: A
   fixed activity"), when (a date in the camp's time zone), and how:
   - "From your / Dana's / a former user's answer in an import"; "Deleted by ..." and "Guessed in
     an import by ..." for the answers setup screens and guesses remember;
   - "Changed by ...", "Forgotten by ...", "Undone by ...";
   - "Auto-applied in the 17 Jul import";
   - for a pattern: "Became Suggested (after 2 answers)", "Became Steady (after 3 answers)",
     "Demoted (an answer disagreed)";
   - last, the import's own rules: "Shoresh already knew this".

   Search stays past 15 lines (it matches what, how, when and a line's mark); 25 lines show, then
   "Show 25 more". The rail counts the answers remembered now. Past 25 lines, what Shoresh already knew comes after the last page (and is not searched).

3. **A true history: a stored event per change.** Until now a Change replaced the
   `ImportAnswer__c` record and Forget deleted it, so an older answer could only be told from the
   recycle bin, for 15 days. A new detail object of the camp, `LearnedEvent__c`, keeps one record
   for each thing that happens to what the camp remembers, written in the same save as the change
   itself (so both are kept or neither is), and never edited:
   - `answered`: every new answer an import or a setup screen saves (`ImportAnswers.commitAll`);
     the same answer given again is no new event (MEMO-2.1 keeps the record too);
   - `forgotten`: an answer an import leaves out, a guess that looks right
     (`ImportAnswers.forget`), Forget on the screen, and Forget pattern (its marker);
   - `changed`: Change on the screen;
   - `undone`: Undo of a Forget or a Change (the answer back), and Undo of Forget pattern;
   - `auto`: each answer the setup import auto-applied (MEMO-5.1). It is still never saved as an
     answer; the import now sends them apart, as `autoApplied`.

   Fields: what, the question, the answer, its shape and whether it followed a suggestion (so the
   patterns can be replayed), and the answer record it made or acted on (never shown: it tells the
   screen which line is the one remembered now). Who and when are the record's own Created By and
   date, as for answers. Schedulers may create and read events, not edit or delete them; deleting a
   camp deletes its events with it. One query reads them (newest 5000), beside the answers' one.

4. **Pattern steps are worked out, not stored.** Patterns are computed from answers (ADR 0021
   choice 10), so their history is too: the screen replays the events in order and reads the
   patterns after each save, as the import would have read them then. A pattern rising a band is
   "Became Suggested" or "Became Steady"; falling with an answer that disagrees is "Demoted";
   falling because it was forgotten is only the "Forgotten" line. Same events, same steps
   (MEMO-7.6). A pattern that never suggested has no line: it does nothing at the next import. A
   pattern that drops below two questions (an answer forgotten) has no step of its own: the
   Forgotten line says what happened, and its earlier steps stay as they were. "Demoted" needs an
   answer of that save that disagrees; a pattern falling only because an agreeing answer went is
   no step. Events of one save share its second: what came before the history sorts first, then
   the stored events in the order Salesforce numbered them.

5. **A change adds a line; the line before stays, marked.** A later line about the same question
   marks the earlier one "Replaced" (an import answered again), "Updated" (changed here),
   "Forgotten" or "Undone", in the quieter colour. Only the line of the answer remembered now has
   Change and Forget; only the newest line of a pattern there is now has its progress dots and
   words (MEMO-6.7) and Forget pattern (MEMO-4.5). Forget, Change and Forget pattern each add their
   line with Undo, which stays on that line until the screen is next opened (MEMO-6.4); Undo adds
   an "Undone by you" line. Undo never writes over a newer answer (MEMO-4.3): the server is
   unchanged there.

6. **Answers older than the history.** An answer saved before this change has no event: it is read
   as answered in an import when it was saved, so nothing remembered goes missing. Once such an
   answer is changed or forgotten, its first line is gone with it (there was nothing stored to keep
   it). Nothing is released and no camp uses it, so no back-fill is written. The history reads the newest 5000 events, as the answers'
   read does; past that the oldest lines are left out (a camp would need years of imports).

## What was considered

- **Keeping old answers as records** (a history flag on `ImportAnswer__c` instead of deleting):
  every read of remembered answers, the unique key and the patterns would have to skip them. A
  separate object leaves all of that as it is.
- **Storing pattern steps**: they would have to be written wherever answers change and could drift
  from the patterns the import reads; replaying the stored answers gives the same steps every time.
