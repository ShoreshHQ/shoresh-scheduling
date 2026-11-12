import { buildTerms } from "c/shoreshTerms";
import { historyLines } from "../history";
import { speller } from "../view";

const t = buildTerms([]);
const spell = speller(null);

// One stored event (LearnedEvents.forCamp). day: when it happened (noon, so one import is one time).
const ev = (id, what, question, answer, day, extra = {}) => ({
  id,
  what,
  question,
  answer,
  answerId: extra.answerId === undefined ? `a${id}` : extra.answerId,
  byYou: false,
  byName: "Dana",
  answeredOn: day,
  savedAt: `${day}T12:00:00.000Z`,
  ...extra
});
// One answer remembered now (LearnedAnswers.forCamp).
const now = (id, question, answer, day, extra = {}) => ({
  byYou: false,
  byName: "Dana",
  savedAt: `${day}T12:00:00.000Z`,
  ...extra,
  id,
  question,
  answer,
  answeredOn: day
});

const view = (lines) => lines.map((l) => [l.title, l.how, l.when, !!l.current]);

describe("one row per answer", () => {
  // MEMO-7.2
  it("says what, when and how, newest first, in camp words", () => {
    const events = [
      ev("1", "answered", "kind|Carpool", "fixed", "2026-07-03"),
      ev(
        "2",
        "answered",
        "deleted|Activity||Riflery",
        "deleted",
        "2026-07-10",
        {
          byYou: true
        }
      ),
      ev("3", "answered", "kind|Swim", "activity", "2026-07-12", {
        byName: null
      })
    ];
    const answers = events.map((e) =>
      now(e.answerId, e.question, e.answer, e.answeredOn, e)
    );
    expect(view(historyLines(events, answers, t, spell))).toEqual([
      [
        "Swim is an activity",
        "Answered as before · a former user",
        "Jul 12",
        true
      ],
      ["Riflery: Activity deleted", "Deleted by you", "Jul 10", true],
      [
        "Carpool is a fixed activity",
        "Answered as before · Dana",
        "Jul 3",
        true
      ]
    ]);
  });

  // MEMO-7.2
  it("reads an answer older than the history as answered when it was saved", () => {
    const lines = historyLines(
      [],
      [now("x", "kind|Lunch", "fixed", "2026-07-03", { byYou: true })],
      t,
      spell
    );
    expect(view(lines)).toEqual([
      ["Lunch is a fixed activity", "Answered as before", "Jul 3", true]
    ]);
    expect(lines[0].answer.id).toBe("x");
  });

  // MEMO-7.3 (word walk 2026-11-12: one row per answer, no history log)
  it("a change leaves one row: the answer now, and nothing of the one before", () => {
    const events = [
      ev("1", "answered", "kind|Lunch", "activity", "2026-07-03"),
      ev("2", "changed", "kind|Lunch", "fixed", "2026-07-20", { byYou: true })
    ];
    const lines = historyLines(
      events,
      [now("a2", "kind|Lunch", "fixed", "2026-07-20", { fromLearned: true })],
      t,
      spell
    );
    expect(view(lines)).toEqual([
      ["Lunch is a fixed activity", "Answered as before", "Jul 20", true]
    ]);
  });

  // MEMO-7.3
  it("shows each answer once, in the state its newest event left", () => {
    const events = [
      ev("1", "answered", "kind|Lunch", "activity", "2026-07-03"),
      ev("2", "answered", "kind|Lunch", "fixed", "2026-07-10"),
      ev("3", "forgotten", "kind|Lunch", "fixed", "2026-07-11", {
        answerId: "a2",
        byYou: true
      }),
      ev("4", "undone", "kind|Lunch", "fixed", "2026-07-11", {
        answerId: "a2",
        byYou: true,
        savedAt: "2026-07-11T12:05:00.000Z"
      }),
      ev("5", "answered", "kind|Swim", "activity", "2026-07-03"),
      ev("6", "forgotten", "kind|Swim", "activity", "2026-07-12", {
        answerId: "a5",
        byYou: true
      }),
      ev(
        "7",
        "answered",
        "guessed|s|Activity||Boating|often",
        "1-1",
        "2026-07-03"
      ),
      ev(
        "8",
        "forgotten",
        "guessed|s|Activity||Boating|often",
        "1-1",
        "2026-07-04",
        {
          answerId: "a7"
        }
      )
    ];
    const lines = historyLines(
      events,
      [now("a2", "kind|Lunch", "fixed", "2026-07-10")],
      t,
      spell
    );
    expect(view(lines)).toEqual([
      ["Swim is an activity", "Asks first", "Jul 12", false],
      [
        "Lunch is a fixed activity",
        "Answered as before · Dana",
        "Jul 11",
        true
      ],
      ["Boating: 1 a week", "No longer guessed", "Jul 4", false]
    ]);
  });

  // MEMO-7.5
  it("says when an import auto-applied an answer, which no one gave", () => {
    const lines = historyLines(
      [
        ev("1", "auto", "kind|Specialty 4", "fixed", "2026-07-17", {
          answerId: null
        })
      ],
      [],
      t,
      spell
    );
    expect(view(lines)).toEqual([
      [
        "Specialty 4 is a fixed activity",
        "Auto-applied in the Jul 17 import",
        "Jul 17",
        false
      ]
    ]);
  });
});

describe("the patterns' steps, worked out from the history", () => {
  const lunch = (n, verdict, day, extra = {}) =>
    ev(`${n}`, "answered", `kind|Lunch ${n}`, verdict, day, extra);
  const answersOf = (events) =>
    events.map((e) => now(e.answerId, e.question, e.answer, e.answeredOn, e));

  // MEMO-7.4
  it("became Suggested, then Steady, each when it happened", () => {
    const events = [
      lunch(1, "recurring", "2026-07-03", { byYou: true }),
      lunch(2, "recurring", "2026-07-03"),
      lunch(3, "recurring", "2026-07-10")
    ];
    const lines = historyLines(events, answersOf(events), t, spell);
    const steps = lines
      .filter((l) => l.derived && l.template === "numbered")
      .map((l) => [l.how, l.when, !!l.current]);
    // One row per pattern: its newest step.
    expect(steps).toEqual([
      ["Became Steady (after 3 answers)", "Jul 10", true]
    ]);
    const current = lines.find((l) => l.current && l.template === "numbered");
    expect(current.title).toBe(
      "Lunch 1, Lunch 2 and Lunch 3 are recurring activities"
    );
    expect(current.patternNow.progress).toBe(
      "3 of 3 answers - suggested every time"
    );
  });

  // MEMO-7.4, MEMO-4.1
  it("demoted when an answer disagreed", () => {
    const events = [
      lunch(1, "recurring", "2026-07-03", { byYou: true }),
      lunch(2, "recurring", "2026-07-03"),
      lunch(4, "activity", "2026-07-17")
    ];
    const lines = historyLines(events, answersOf(events), t, spell);
    expect(
      lines
        .filter((l) => l.derived && l.template === "numbered")
        .map((l) => [l.how, l.when])
    ).toEqual([["Demoted (an answer disagreed)", "Jul 17"]]);
  });

  // MEMO-7.4
  it("an answer older than the history, changed and changed back, still counts toward its pattern", () => {
    // Lunch 1 was saved before the history: only its change and the Undo are stored.
    const older = now("a1", "kind|Lunch 1", "recurring", "2026-07-03");
    const events = [
      lunch(2, "recurring", "2026-07-10"),
      ev("c", "changed", "kind|Lunch 1", "fixed", "2026-07-11", {
        answerId: "c1"
      }),
      ev("u", "undone", "kind|Lunch 1", "recurring", "2026-07-12", {
        answerId: "a1"
      })
    ];
    const lines = historyLines(
      events,
      [older, now("a2", "kind|Lunch 2", "recurring", "2026-07-10")],
      t,
      spell
    );
    const steps = lines
      .filter((l) => l.derived && l.template === "numbered")
      .map((l) => [l.how, l.when]);
    expect(steps).toEqual([["Became Suggested (after 2 answers)", "Jul 12"]]);
    expect(
      lines.find((l) => l.current && l.template === "numbered")
    ).toBeDefined();
  });

  // MEMO-7.4, MEMO-4.1
  it("is not demoted when an agreeing answer is forgotten, even with an older disagreement", () => {
    const events = [
      lunch(1, "activity", "2026-07-01"),
      lunch(2, "recurring", "2026-07-03"),
      lunch(3, "recurring", "2026-07-10"),
      ev("f", "forgotten", "kind|Lunch 3", "recurring", "2026-07-12", {
        answerId: "a3"
      })
    ];
    const lines = historyLines(events, answersOf(events.slice(0, 2)), t, spell);
    expect(lines.some((l) => l.how.startsWith("Demoted"))).toBe(false);
  });

  // MEMO-7.4, MEMO-4.5
  it("Forget pattern is a line named for the pattern, and is no step of its own", () => {
    const events = [
      lunch(1, "recurring", "2026-07-03"),
      lunch(2, "recurring", "2026-07-03"),
      ev(
        "m",
        "forgotten",
        "pattern|numbered|lunch",
        "forgotten",
        "2026-07-11",
        {
          byYou: true
        }
      )
    ];
    const lines = historyLines(events, answersOf(events), t, spell);
    const top = lines[0];
    expect([top.title, top.how, top.pattern]).toEqual([
      "Lunch 1 and Lunch 2 are recurring activities",
      "Asks first",
      "pattern:numbered:lunch"
    ]);
    expect(lines.some((l) => l.how.startsWith("Demoted"))).toBe(false);
  });

  // MEMO-7.6
  it("the same history gives the same list, in any order", () => {
    const events = [
      lunch(1, "recurring", "2026-07-03"),
      lunch(2, "recurring", "2026-07-03"),
      lunch(3, "recurring", "2026-07-10"),
      ev("9", "changed", "kind|Lunch 3", "fixed", "2026-07-20", {
        answerId: "a9"
      })
    ];
    const answers = answersOf(events.slice(0, 2)).concat(
      now("a9", "kind|Lunch 3", "fixed", "2026-07-20", { fromLearned: true })
    );
    const a = historyLines(events, answers, t, spell);
    const b = historyLines(
      [...events].reverse(),
      [...answers].reverse(),
      t,
      spell
    );
    expect(b).toEqual(a);
  });
});
