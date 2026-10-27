# MEMO protocol: Remembered answers

What Shoresh remembers from a person's answers to import questions, how it uses them in the
next import, and the "What Shoresh has learned" screen where they are seen, changed and
forgotten. MEMO uses CORE's terms (layer 1) and explanation (layer 6), and serves INGEST: an
answer only ever fills a question INGEST would ask. It never redefines a CORE term. The
numbering, statuses and tests are in [README.md](README.md). Sources: wiki
`projects/shoresh-protocol.md` (D, E 46-47), `projects/shoresh-sf-learned-plan.md`, ADR 0006
§19-21, ADR 0021. Greg's latest dated word wins.

A statement whose Test cell starts "gap" has no test yet.

| ID       | Statement                                                                                                                                         | Source                        | Test                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| MEMO-2.1 | An import that answers a remembered question differently MUST replace the answer; the same answer again MUST leave it, with who gave it and when. | ADR 0021 choice 9             | ImportAnswersTest                                                                      |
| MEMO-4.1 | One disagreement MUST demote a pattern.                                                                                                           | wiki D; learned plan          | gap: patterns not built yet (ADR 0021, PR 3)                                           |
| MEMO-4.2 | Things a person deleted MUST stay deleted: the next import MUST NOT add them again unless the person brings them back.                            | wiki D; ADR 0006 §20          | shoreshImportEngine deleted.test.js, electives.test.js                                 |
| MEMO-4.3 | Undo MUST NOT write over a newer answer; it shows the latest instead.                                                                             | ADR 0021 choice 6             | shoreshLearned shoreshLearned.test.js                                                  |
| MEMO-4.4 | Change MUST offer only the question's own answers, and Shoresh MUST accept no other.                                                              | ADR 0021 choice 5             | shoreshLearned kinds.test.js                                                           |
| MEMO-5.1 | An established "fixed activity" pattern MAY be applied automatically, with Undo; no other pattern MAY.                                            | Greg 2026-10-26 (wiki E 46)   | gap: automatic use not built yet (ADR 0021, PR 4)                                      |
| MEMO-6.1 | A remembered answer MUST be shown as remembered, and MUST NOT be applied unseen: it stays changeable on its card.                                 | wiki D; ADR 0021 choice 9     | shoreshImport shoreshImport.test.js, shoreshChoicesImport shoreshChoicesImport.test.js |
| MEMO-6.2 | Every remembered answer MUST say who answered it and when; "a former user" when that person is no longer here.                                    | ADR 0021 choices 4, 9         | shoreshLearned kinds.test.js, shoreshListImport shoreshListImport.test.js              |
| MEMO-6.3 | A remembered answer MUST be shown in camp words, never as an id or an internal name.                                                              | ADR 0021 choice 4; CORE-6.6   | shoreshLearned kinds.test.js                                                           |
| MEMO-6.4 | Forget and Change MUST each offer Undo, which stays until the screen is next opened.                                                              | ADR 0021 choice 6 (wiki E 47) | shoreshLearned shoreshLearned.test.js                                                  |
