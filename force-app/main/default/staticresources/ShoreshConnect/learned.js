/**
 * read_learned_answers (API-1.93): "What Shoresh has learned" as the screen lists it. What the
 * screen reads is read as it reads it (GET /v1/read_learned_answers: the season's setup with the
 * camp's words, LearnedController.getLearned and getLearnedHistory), and the list is worked out
 * with the screen's own modules (c/shoreshLearned history.js and builtIn.js, shipped beside this
 * file), so the AI reads the same lines, in the same order and words, as the person. Each line
 * the screen gives Change or Forget (an answer remembered now) or Forget pattern (a pattern there
 * now) carries what those actions take back: answer_id or pattern, and seen.
 */

// LearnedEvents.forCamp reads the newest 5000: a full read means older ones were left out.
const HISTORY_LIMIT = 5000;

/** The forgotten pattern's mark now (its Id), or "none": what forget_learned_pattern compares. */
function markOf(answers, line, m) {
  const mark = (answers || []).find((a) => {
    if (!String(a.question || "").startsWith(m.PATTERN_PREFIX)) return false;
    const [, template, antecedent] = m.keyParts(a.question);
    return `pattern:${template}:${antecedent}` === line.pattern;
  });
  return mark ? mark.id : "none";
}

/** One line as the screen shows it: what, how, when, its mark, and what can be done on it. */
function lineText(line, answers, m) {
  let text = `${line.when ? `${line.when}: ` : ""}${line.title} (${line.how})`;
  if (line.flag) text += ` [${line.flag}]`;
  if (line.current && line.answer) {
    const choices = (line.answer.choices || []).filter(
      (c) => c.value !== line.answer.answer
    );
    text += ` - remembered now: answer_id ${line.answer.id}, seen ${JSON.stringify(line.answer.answer)}`;
    text +=
      line.answer.choices && line.answer.choices.length > 1
        ? `, can be changed to ${choices.map((c) => `${c.value} (${c.label})`).join(", ")}`
        : ", can only be forgotten";
  } else if (line.current && line.patternNow) {
    text += ` - pattern now: ${line.patternNow.progress}; ${line.patternNow.flag}; pattern ${JSON.stringify(line.pattern)}, seen ${JSON.stringify(markOf(answers, line, m))}`;
  }
  return text;
}

async function readLearned(
  capability,
  input,
  { ask, answer, load, namespaceOf }
) {
  const fields = input.season !== undefined ? { season: input.season } : {};
  const read = await ask({
    path: `/services/apexrest/v1/${capability.api}?${new URLSearchParams(fields)}`,
    method: "GET"
  });
  if (read.status !== 200) return answer(read);
  const body = JSON.parse(read.body);
  const m = await load(namespaceOf(body));
  const setup = body.setup || {};
  const t = m.buildTerms(setup.labels || []);
  const lines = m.historyLines(
    body.events || [],
    body.answers || [],
    t,
    m.speller(setup)
  );
  const count = (body.answers || []).filter(m.isAnswer).length;
  const said = [
    `What Shoresh has learned for ${body.camp || "this camp"}: ${count} ${count === 1 ? "answer" : "answers"} remembered now. Newest first:`
  ];
  if (!lines.length) said.push("Nothing yet: no import has been answered.");
  for (const line of lines) said.push(`- ${lineText(line, body.answers, m)}`);
  if ((body.events || []).length >= HISTORY_LIMIT) {
    said.push("Older history than this isn't shown, as on the screen.");
  }
  said.push("What Shoresh already knew (how it reads; nothing to change):");
  for (const row of m.builtInRows(t)) said.push(`- ${row.title}`);
  return {
    ok: true,
    status: 200,
    text: said.join("\n"),
    about: capability.about
  };
}

module.exports = { readLearned };
