/**
 * read_learned_answers (API-1.93): "What Shoresh has learned" as the screen lists it. What the
 * screen reads is read as it reads it (GET /v1/read_learned_answers: the season's setup with the
 * camp's words, LearnedController.getLearned and getLearnedHistory), and the list is worked out
 * with the screen's own modules (c/shoreshLearned history.js and builtIn.js, shipped beside this
 * file), so the AI reads the same lines, in the same order and words, as the person. Each line
 * the screen gives Change or Forget (an answer remembered now) or Forget pattern (a pattern there
 * now) carries what those actions take back: an answer by its line (API-1.150) or a pattern, and seen.
 */
const { foldName } = require("./common");

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
    text += ` - remembered now: seen ${JSON.stringify(line.answer.answer)}`;
    text +=
      line.answer.choices && line.answer.choices.length > 1
        ? `, can be changed to ${choices.map((c) => `${c.value} (${c.label})`).join(", ")}`
        : ", can only be forgotten";
  } else if (line.current && line.patternNow) {
    text += ` - pattern now: ${line.patternNow.progress}; ${line.patternNow.flag}; pattern ${JSON.stringify(line.pattern)}, seen ${JSON.stringify(markOf(answers, line, m))}`;
  }
  return text;
}

async function readLearned(capability, input, { read, answer, load }) {
  const fields = input.season !== undefined ? { season: input.season } : {};
  const got = await read(capability.api, fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await load();
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

/**
 * forget_learned_pattern (API-1.96) only for a pattern the screen offers Forget pattern on now:
 * any other is refused naming the ones there, before Shoresh is asked (API-1.25), so nothing is
 * previewed for a pattern that isn't there.
 */
async function forgetPattern(capability, input, { read, send, answer, load }) {
  const fields = input.season !== undefined ? { season: input.season } : {};
  const got = await read("read_learned_answers", fields);
  if (got.status !== 200) return answer(got);
  const body = JSON.parse(got.body);
  const m = await load();
  const setup = body.setup || {};
  const lines = m
    .historyLines(
      body.events || [],
      body.answers || [],
      m.buildTerms(setup.labels || []),
      m.speller(setup)
    )
    .filter((line) => line.current && line.patternNow);
  const there = lines.map((line) => line.pattern);
  const line = lines.find(
    (l) => l.pattern === String(input.pattern ?? "").trim()
  );
  if (!line) {
    return {
      ok: false,
      status: 400,
      text: `There is no pattern ${JSON.stringify(String(input.pattern ?? "").slice(0, 120))} on What Shoresh has learned now. ${
        there.length
          ? `The patterns there: ${there.map((p) => JSON.stringify(p)).join(", ")}.`
          : "There are no patterns there now."
      }`
    };
  }
  const done = answer(await send(capability.api, input));
  // The question the person is asked names the pattern as the screen shows it, never its key.
  const named = (text) =>
    String(text)
      .split(`the pattern "${line.pattern}"`)
      .join(`the pattern "${line.title}"`);
  const asks = done.asks && {
    ...done.asks,
    said: named(done.asks.said),
    preview: named(done.asks.preview)
  };
  return { ...done, text: named(done.text), ...(asks && { asks }) };
}

/**
 * The remembered answer the AI named by its line, as read_learned_answers works the lines out
 * (API-1.150): { line } or, when no line or more than one reads so, { refusal }. Shoresh's own
 * Id stays between the connector and Salesforce.
 */
async function answerLine(input, { read, answer, load }) {
  const fields = input.season !== undefined ? { season: input.season } : {};
  const got = await read("read_learned_answers", fields);
  if (got.status !== 200) return { refusal: answer(got) };
  const body = JSON.parse(got.body);
  const m = await load();
  const setup = body.setup || {};
  const named = new Map();
  for (const line of m.historyLines(
    body.events || [],
    body.answers || [],
    m.buildTerms(setup.labels || []),
    m.speller(setup)
  )) {
    // As listed, with its date, or without it.
    const sent = foldName(input.line);
    if (
      line.current &&
      line.answer &&
      (sent === foldName(line.title) ||
        sent === foldName(`${line.when}: ${line.title}`))
    ) {
      named.set(line.answer.id, line);
    }
  }
  const said = JSON.stringify(String(input.line ?? "").slice(0, 120));
  if (named.size === 1) return { line: [...named.values()][0] };
  return {
    refusal: {
      ok: false,
      status: 400,
      text: named.size
        ? `More than one answer remembered now reads ${said} on What Shoresh has learned, so Shoresh can't tell which one. Nothing was changed.`
        : `No answer remembered now reads ${said} on What Shoresh has learned. Nothing was changed.`
    }
  };
}

/** What Salesforce is sent for an answer named by its line: its own Id, never shown. */
function sentFor(input, line) {
  const sent = { ...input, answer_id: line.answer.id };
  delete sent.line;
  return sent;
}

/** change_learned_answer: the answer named by its line (API-1.150), changed as the screen changes it. */
async function changeAnswer(capability, input, at) {
  const { line, refusal } = await answerLine(input, at);
  if (refusal) return refusal;
  return at.answer(await at.send(capability.api, sentFor(input, line)));
}

/**
 * forget_learned_answer: Shoresh's question and answer name the answer by its line, as the
 * screen's Forget names it ("Forget Archery: 2–4 a week"), never by what is stored ("2-4") that a
 * person can't read (API-1.150). The line is read first: once forgotten, it is no longer there.
 */
async function forgetAnswer(capability, input, at) {
  const { line, refusal } = await answerLine(input, at);
  if (refusal) return refusal;
  const done = at.answer(await at.send(capability.api, sentFor(input, line)));
  if (!done.ok) return done;
  const named = (text) =>
    text
      .replace(/the remembered answer "[^"]*"/, () => `"${line.title}"`)
      .replace(/^Forgot "[^"]*"/, () => `Forgot "${line.title}"`);
  // Asked first: its preview, shown to the person, names the line too.
  const asks = done.asks && {
    ...done.asks,
    said: named(done.asks.said),
    preview: named(done.asks.preview)
  };
  return { ...done, text: named(done.text), ...(asks && { asks }) };
}

/**
 * Undo on What Shoresh has learned lasts as long as the screen's (API-1.97): the screen holds each
 * Change, Forget and Forget pattern this visit made and offers Undo on it only while its page is
 * open (c/shoreshLearned shoreshLearned.js undos). The connector holds each undo its own actions
 * were given while it runs, one conversation, and only those can be undone, each once.
 */
const undos = new Set();
const UNDO_GIVEN = /use undo_learned_answer with undo "([^"]+)"/;
const NOTHING_TO_UNDO =
  "There's nothing to undo in this conversation: Undo on What Shoresh has learned is only for a change, forget or forget pattern made in it, as the screen offers Undo only while its page is open. Nothing was changed.";

// The command line runs one command per process, so it holds no Undo, as a closed page holds none.
let oneCommand = false;
const UNDO_SENTENCE = /To undo it, use undo_learned_answer with undo "[^"]+"\./;
const NO_UNDO_HERE =
  "The command line keeps no Undo between commands, as the screen keeps none once its page is closed.";

/** The command line: each command is its own conversation, with no Undo offered after it. */
function oneCommandAtATime(on = true) {
  oneCommand = on;
}

/** Holds the undo a change, forget or forget pattern was given, for this conversation. */
function holdUndo(done, org) {
  const given = done && done.ok && UNDO_GIVEN.exec(String(done.text));
  if (given && oneCommand) {
    return {
      ...done,
      text: String(done.text).replace(UNDO_SENTENCE, NO_UNDO_HERE)
    };
  }
  if (given) undos.add(`${org ?? ""}|${given[1]}`);
  return done;
}

/** undo_learned_answer: the screen's own Undo (the server's), only for an undo held here. */
async function undoLearned(input, { ask, answer }, org) {
  const key = `${org ?? ""}|${String(input.undo ?? "").trim()}`;
  if (!undos.has(key)) return { ok: false, status: 400, text: NOTHING_TO_UNDO };
  const done = answer(await ask());
  if (done.ok) undos.delete(key);
  return done;
}

module.exports = {
  readLearned,
  forgetPattern,
  forgetAnswer,
  changeAnswer,
  holdUndo,
  undoLearned,
  oneCommandAtATime
};
