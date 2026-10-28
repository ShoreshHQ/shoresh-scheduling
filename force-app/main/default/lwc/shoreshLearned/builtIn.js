/**
 * What Shoresh knew before the camp's first answer (MEMO-6.8; wiki ingestion plan, Greg: "what
 * Shoresh knew before you came, and what it is learning from you"): the import's own reading
 * rules, clue and meaning, in camp words. Each is a numbered rule of docs/import/
 * (classification.md rule n is INGEST-3.n, names-and-divisions.md rule n is INGEST-2.n), shown
 * in the group its questions belong to. Read-only: they are how Shoresh reads, not answers.
 */
function article(word) {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/** The rules in the order the import applies them, each { id, rule, group, title }. */
export function builtInRows(t) {
  const group = t.sIn("Group");
  const groups = t.pIn("Group");
  const division = t.sIn("Division");
  const fixed = article(t.sIn("FixedActivity"));
  const recurring = article(t.sIn("RecurringActivity"));
  const activity = article(t.sIn("Activity"));
  const rules = [
    [
      "INGEST-3.1",
      "classify",
      `Every ${group}, the same ${t.sIn("TimeBlock")}, every day: ${fixed}`
    ],
    [
      "INGEST-3.2",
      "classify",
      `One ${group} has it at three or more times: ${activity}`
    ],
    ["INGEST-3.3", "classify", `At a set time that repeats: ${recurring}`],
    [
      "INGEST-3.7",
      "classify",
      `A whole ${division} together at once: ${recurring}`
    ],
    ["INGEST-3.6", "classify", `Anything else: ${activity}`],
    [
      "INGEST-2.2",
      "split",
      "Spelled with other spacing, capitals or punctuation: one name"
    ],
    [
      "INGEST-2.3",
      "split",
      "Another ending, a few times, in the same place: one name"
    ],
    [
      "INGEST-3.8",
      "split",
      `A ${division} whose ${groups} always move together: one ${group}`
    ],
    [
      "INGEST-2.1",
      "split",
      `A ${group} with no ${division} beside ones with: its own ${division}`
    ]
  ];
  return rules.map(([rule, key, title]) => ({
    id: `rule:${rule}`,
    rule,
    group: key,
    title,
    who: ""
  }));
}
