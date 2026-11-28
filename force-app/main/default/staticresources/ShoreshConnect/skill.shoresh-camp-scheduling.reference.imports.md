# Imports

## Which import fits the file

| The person has                                     | Tool                      |
| -------------------------------------------------- | ------------------------- |
| Last year's schedule (Excel, CSV, or a PDF)        | `import_last_year`        |
| One screen's list (activities, groups, staff, ...) | `import_list`             |
| The whole-camp worksheet                           | `import_worksheet`        |
| A special day's or event's own schedule            | `import_special_schedule` |
| Campers' elective choices                          | `import_choices`          |

A PDF goes to `import_last_year` by where it is on the person's computer; never retype it
(API-1.160). To edit a list in a spreadsheet, `download_setup` it, then import it back.

## Every import is reviewed, as on the screen

1. Send the file without saving. The answer is the review: what comes in, and its questions.
2. **Show the person every question, in Shoresh's words, with its choices** (API-1.98). Never
   answer one yourself, even when the answer looks obvious (CORE-2.3). A suggested answer from
   what Shoresh has learned is still the person's to take (MEMO-6.5).
3. A question can wait: it stays on Roots for later. Answer later ones with `import_last_year`
   and `open_questions` (API-1.144).
4. Save only with the person's answers, and the `seen` from the review.

A second import of the same file updates the first; it doesn't duplicate it. What the person
deleted stays deleted (MEMO-4.2).

## Going back

- `read_last_imports` lists recent imports; `undo_import` puts the camp back as it was before one
  (it asks first).
- What Shoresh has learned from answers: `read_learned_answers`. Change or forget one only when the
  person asks (`change_learned_answer`, `forget_learned_answer`, `forget_learned_pattern`;
  `undo_learned_answer` takes the last change back).
