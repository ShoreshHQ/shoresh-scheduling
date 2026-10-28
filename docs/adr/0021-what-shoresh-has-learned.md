# 0021: What Shoresh has learned

Status: proposed (2026-10-26). PR 1 #160 the screen (answers only); PR 2 #161 the who-and-when words in the import cards and an import's different answer replacing the record (choice 9); PR 3 the pattern layer (choices 10-15). Spec: the desktop's
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
   field of its own; see choice 6 for why Created and not Last Modified): "Answered by you on 3 Jul", "Answered by Dana on 3 Jul" (first name; "a former user" when that user is inactive; the date in the camp's time zone, as on the import cards, choice 9);
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
   - An import that answers a remembered question again with another answer replaces the
     record the same way (choice 9); the same answer again leaves it as it is.

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

9. **The import cards say whose answer it was and when** (PR 2; desktop `memoryStripText`): an
   answer filled in from memory is marked "Remembered from your answer on 3 Jul", "Remembered
   from Dana's answer on 3 Jul" (first name), or "Remembered from a former user's answer on 3
   Jul" when that person's user is inactive, in place of the plain "Remembered" tag, on every
   import that fills answers in (setup, list and choices imports: cards, column headings, ticked
   places). Still never applied unseen, still changeable on the card; no link to this screen.
   Who and when are the record's Created By and date, read in the import's one user-mode query
   (`ImportAnswers.forCamp`), the date in the camp's time zone (`Camp__c.TimeZone__c`; else the
   reader's). So they stay true, every write of a remembered answer (`ImportAnswers.save`,
   `remember`, `rememberEach`) leaves an answer that is the same (exact, capitals count) as it
   is, and replaces one that differs: the old record deleted, a new one saved, in one savepoint
   and user mode, still one query.

10. **Patterns are worked out, never stored** (PR 3; desktop `src/ingest/answerPatterns.js`,
    its ADR §3.4). `c/shoreshPatterns` reads the camp's remembered answers each time, so the
    same answers always give the same patterns (MEMO-3.4). A fixed menu of templates, for the
    questions Salesforce can still ask (MEMO-3.1):

    | Template | Questions                               | Same pattern when                                         |
    | -------- | --------------------------------------- | --------------------------------------------------------- |
    | numbered | `kind\|` (fixed, recurring or activity) | the name without its trailing number ("Lunch 1" -> lunch) |
    | meal     | `kind\|`                                | a meal's whole name (the desktop's list)                  |
    | spelling | `similar\|` (similar names)             | the same kind of name and kind of difference (rules 2, 3) |
    | list     | `list\|` (one activity or a choice)     | the same mark between the names (`/`, `,`, `;`)           |
    | together | `split\|` (a group of bunks, rule 8)    | any group read as one                                     |

    Each counts within its program (a `kind|` key's program part). Since #165-#178 the import
    decides fixed, recurring or activity by its rules and asks only two cases (classification.md
    A and B), so the classification templates have little to learn; similar names and lists are
    where answers recur. **"All camp except..." has nothing to learn from:** Salesforce asks no
    such question (choice 3), so it has no template. Values, names, deletions and guesses have
    none either, as on the desktop.

11. **The desktop's bands and bar** (MEMO-3.2, MEMO-4.1): one row per question, newest first;
    Suggested when the 2 newest agree; Established when the 3 newest agree, from 2 imports, at
    least one picked without a suggestion; a newest answer that disagrees drops it to asking at
    once. Salesforce forces three differences, each kept on the answer record: **an import** is
    the moment its answers were saved (one import's answers are saved together, `CreatedDate`),
    as there is no import id on the answer; the desktop's **explicit answer** (edited or
    declined) is here an answer **picked without a suggestion** (`FromSuggestion__c`, set when
    the answer agreed with the suggestion its card showed; Salesforce's questions have no
    proposed default to accept); and the desktop's **baselines** are the question's **shape**
    (`Shape__c`: a kind question's why-asked, everyone-or-some and one-or-more blocks; a similar
    pair's file-or-camp name; a list's or a split's two-or-more). A question of another shape,
    or answers of mixed or unknown shape (all saved before this PR), is held at Suggested
    (MEMO-3.3). Answers saved together have no order among them: if the newest import's answers
    disagree, the pattern asks, and a run stops before an import whose answers disagree. A
    Change on this screen keeps the shape and is marked (`FromLearned__c`): it agrees or
    disagrees like any answer, but adds no import and no answer picked yourself. Guessed rules
    (`guessed|`) are no pattern's answers. Both reads (`ImportAnswers.forCamp`,
    `LearnedAnswers.forCamp`) are newest first, so past 5000 only the oldest are left out. A workbook import's sheets show no suggestions (its save does not say which
    were followed).

12. **Suggested in the import cards** (MEMO-6.5, MEMO-6.6; desktop `suggestedReason`): setup
    and list imports mark the pattern's answer on a question that has no remembered answer of
    its own. Marked, not chosen: the question stays open with its needs-a-look corner until
    someone presses an answer, and Established only pre-selects too until PR 4. The line says
    whose answers and when, as PR 2 words one answer: "Suggested from your answers for Lunch
    1, Lunch 2 and Lunch 3 on 3 Jul and 10 Jul"; when people differ, "Suggested from answers
    for ... (Dana's 10 Jul, yours 3 Jul)". Up to three names, then "and N more".

13. **Forget pattern** (MEMO-4.5; desktop "Forget this pattern" writes a veto that covers the
    answers it saw): a marker record, `pattern|<template>|<antecedent>` answered "forgotten",
    after which answers saved until then do not count toward that pattern. The answers stay
    (each still fills its own question); answers saved later build it again only by clearing
    the bar again. Each part is escaped ("\\" and "|" after a "\\", `keyPart` / `partOf`, the same both ways). A second Forget replaces the marker. Undo deletes the new marker (and brings
    an earlier one back, as Undo of a Change). The server takes only a template from the fixed
    list (`LearnedAnswers.forgetPattern`). Markers are no answers: the screen lists none.

14. **A pattern row** (MEMO-6.7; desktop `patternRow`, `progressLine`, `patternFlag`): "A
    recurring activity: Lunch 1, Lunch 2 and Lunch 3", a flag for what it does next import
    ("Suggested", "Steady: suggested every time", "Still asks"; until PR 4 an Established pattern is only suggested, and the row says so), three dots and the progress line in
    counts ("2 of 3 answers - needs one more import", "needs one answer you picked yourself",
    "Your latest answer disagrees - 2 more agreeing answers to suggest again"; never a
    percentage), who answered and the latest date, and Forget pattern. A pattern needs two
    questions; patterns are listed before the answers and counted with them.

15. **What Shoresh already knew, and what it learned from you** (MEMO-6.8; Greg, wiki
    ingestion plan: "what Shoresh knew before you came, and what it is learning from you"):
    Classification and Splits and merges first list the import's own rules, clue and meaning
    in camp words ("Every group, the same time block, every day: a fixed activity"; INGEST-3.1,
    3.2, 3.3, 3.7, 3.6; INGEST-2.2, 2.3, 3.8, 2.1), under "Shoresh already knew", then
    "Learned from you": patterns, then answers. Read-only, no count; shown even before any
    answer, under the empty state. No new screen or group.

## Known breadth, for Greg to review

As on the desktop: the meal template matches any meal name (Lunch, Menucha, Breakfast, Dinner,
Snack, numbered or not) across the program, and the similar-names template pools every pair of
one kind (activity, group, division) with the same kind of difference (spelling, ending, one
letter). So answers about "Arts & Crafts" can suggest for "Lunch2" / "Lunch 2". The bar,
demotion and the shape check limit it; narrower templates are a product call.

## Not in this PR

Automatic use (PR 4, MEMO-5.1). The
desktop's "Remembered on this computer only" and its import-permission line do not apply
(plan). The desktop's per-viewer memory of which groups were open is not ported.
