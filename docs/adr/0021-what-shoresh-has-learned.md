# 0021: What Shoresh has learned

Status: proposed (2026-10-26), PR 1 of the port (the screen; answers only: the desktop's patterns, with their progress and Forget this pattern, come in PR 3). Spec: the desktop's
`src/screens/LearnedScreen.jsx`, `src/screens/learned/LearnedRow.jsx`, `src/ingest/learnedView.js`
and `docs/work/specs/2026-10-11-what-shoresh-has-learned-view.md`. Plan and decisions: wiki
`projects/shoresh-sf-learned-plan.md` (binding). Builds on ADR 0006 §19-21 (remembered answers,
things you delete stay deleted, rules Shoresh guessed) and ADR 0015 (design system).

## Choices

1. **A menu entry at the foot of the menu** ("What Shoresh has learned"), where the desktop has
   its sidebar footer link: its own section with no title, under a hairline, pushed to the
   bottom (`shoreshScreens` section `learned`, `foot`). The answers are the camp's, so it opens
   before there is a season, as Camp words does. Roots does not show it (Roots lays out the
   titled sections only).

2. **The screen is the setup screens' grammar** (Camp words): a rail with the count ("12
   answers") and, past 15 answers, a search ("Search answers": title and who answered) and a
   kind filter ("All kinds", then each group that has answers); the hairline; then the groups.
   No explainer paragraph (the design guide; the plan). Empty: the shared empty state,
   "Nothing learned yet", one line. A failed read: "Couldn't load what Shoresh has learned."
   with the reason and **Try again**.

3. **Groups, in the desktop's order, from the key's family** (`shoreshLearned/kinds.js`): each
   collapsible (a button with `aria-expanded`), with the count still remembered; 25 rows, then
   "Show 25 more"; rows newest first. Empty groups are not shown.

   | Group                  | Families (ADR 0006 keys)                                                                                                                                                                                            |
   | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Classification         | `kind\|`                                                                                                                                                                                                            |
   | All camp except...     | none yet (Salesforce asks no such question)                                                                                                                                                                         |
   | Values                 | `change\|` (Import last year's set times, lengths, time blocks, days; Import a list's differences, runs-in), `ampm\|`, `cross\|`, `tueThu\|`, `dash\|`, `programDay\|`                                              |
   | Splits and merges      | `similar\|`, `list\|` (one activity or a choice of several)                                                                                                                                                         |
   | Elective sheet labels  | `choiceName\|` (Bring in choices)                                                                                                                                                                                   |
   | Elective sheet columns | `columns\|electives\|`                                                                                                                                                                                              |
   | Things you deleted     | `deleted\|` (Salesforce only)                                                                                                                                                                                       |
   | Rules Shoresh guessed  | `guessed\|` (Salesforce only)                                                                                                                                                                                       |
   | Other                  | everything else: `program\|`, `division\|`, `whichGroup\|`, `move\|`, `place\|`, `elective\|`, `week\|`, `whoAdd\|`, `blockAdd\|`, `programAdd\|`, other list `columns\|`, and any family this version doesn't know |

4. **A row in camp words**: "<name>: <answer>" ("Lunch: A fixed activity", "Riflery: Activity
   deleted"), then who answered it and when, from the record's own Created By and date (no
   field of its own; see choice 6 for why Created and not Last Modified): "Answered by you on 3 Jul", "Answered by Dana on 3 Jul";
   "Deleted by ..." for a deletion and "Guessed in an import by ..." for a guess. A name a key
   keeps in lower case ("swim") shows as the camp writes it now (except a similar-names pair,
   whose two spellings are the question), matched ignoring capitals and
   spacing against the open season's setup the page already has (programs, time blocks,
   divisions, groups, set-time items, places, activities, weeks; no query of its own), else as
   stored. No row shows a record Id or an internal name: a runs-in change names its item and
   weeks ("Archery, off in Week 1, Week 2"; else "An item, weeks it runs in"), and a deleted
   kind is the camp's word ("Location type deleted", a program's group "Bunk deleted").

5. **Change** opens the row's choices (toggle buttons, the current one pressed, Escape or Cancel
   closes it); **Save** shows once another is picked; the row then says "Updated". Choices exist
   only where the answers are fixed words; the server (`LearnedChoices`) checks the same list:

   | Family                             | Choices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
   | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `kind\|`                           | A fixed activity / A recurring activity / An activity (camp words)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
   | `similar\|`                        | Same: keep “<first name>” / Same: keep “<second name>” / Different: keep both. The two names in the import's own order (localeCompare, `similarPairs`), so each saves the value the import reads for that spelling (`mergesFrom`: "a" keeps the first, "b" the second); when one of the two is a name the camp has now (the open season's setup), the import keeps the camp's spelling either way, so the row offers one "Same: keep “<camp's name>”" and "Different: keep both". The names are shown as the file wrote them, never respelled |
   | `list\|`                           | Kept as one activity / Split into choices                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `change\|` (not `change\|block\|`) | Kept the current value / Used the file's value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
   | `ampm\|`                           | In the morning / In the evening                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | `tueThu\|`                         | Tuesday / Thursday                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
   | `dash\|`                           | Every day between / Just those two days                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
   | `programDay\|`                     | Added <day> / Without <day>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

   Every other family (a name, a value, a deletion, a guess, a time block's change, which was a
   choice only for some files) has no Change: only Forget.

6. **Who and when stay true; Undo for Forget and Change.** Salesforce changes a record's Last
   Modified date when it is undeleted (checked in the org, 2026-10-26), so who and when come
   from Created By and date, and every write here keeps them true:
   - **Forget** is one click, as on the desktop: the record goes to the recycle bin. The row
     stays, flagged "Forgotten", saying what happens next ("Shoresh will ask this question
     again."; a deleted item: "It can come back next import."; a guess: "It's no longer marked
     for a look."), with **Undo** in place of the actions and the cursor on it. Undo undeletes
     that same record, so it keeps who answered it and when; flagged "Remembered again", the
     cursor on its Forget.
   - **Change** replaces the record: the old one is deleted (first, as the question's key is
     unique) and a new one saved with the new answer, so the row shows who changed it and
     today ("Answered by you on 26 Oct"), flagged "Updated", with **Undo** beside Change and the
     cursor on it. Undo deletes the new record and undeletes the old one, which shows its
     original who and when again, flagged "Changed back".
   - **Never over a newer answer.** When an import has answered the question since (the old
     record can't come back beside it, or the new one has been changed or forgotten), Undo
     changes nothing: "Someone else changed this just now. Showing the latest."
   - Unlike the desktop's 8 seconds, Undo stays until the screen is next opened: these screens
     use no timers, and an Undo that vanishes on its own is a timing barrier (WCAG 2.2.1). The
     group count leaves a forgotten answer out.
   - Not covered: an import that answers a remembered question again with another answer
     updates the record in place (`ImportAnswers`), so the row keeps its first author and date
     until the import does the same.

7. **Every result is read out** (a polite live region): "Updated.", "Forgotten. <what happens
   next>", "Remembered again.", "Changed back.". A refused write stays on its row ("Couldn't save that." and the
   reason) with **Try again**. An answer already forgotten or changed elsewhere: "Someone else
   changed this just now. Showing the latest." (the desktop's words), and the list is read
   again.

8. **Server** (`LearnedController`, `LearnedAnswers`, `LearnedChoices`, `LearnedUndo`): one user-mode query
   reads the camp's answers (at most 5000, as the import's own read), newest first. Change and
   Forget take the camp and the answer's Id and find it only inside that camp (user mode), so
   another camp's answer is never reached; Change accepts only the family's choices. Change
   deletes and inserts in one savepoint, so a refused insert puts the old answer back. Undo
   takes the camp and the Ids, finds the old record in that camp's recycle bin (user mode, `ALL
ROWS`) and undeletes it in user mode; Undo of a Change first checks the new record is still
   there and unchanged (Last Modified equals Created), and rolls back its delete if the
   undelete fails. Nothing the screen sends is written as an answer.

## Not in this PR

Patterns (PR 3), the who-and-when words in the import cards (PR 2), automatic use (PR 4). The
desktop's "Remembered on this computer only" and its import-permission line do not apply
(plan). The desktop's per-viewer memory of which groups were open is not ported.
