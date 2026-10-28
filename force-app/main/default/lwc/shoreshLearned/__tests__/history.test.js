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

const view = (lines) =>
  lines.map((l) => [l.title, l.how, l.when, l.flag || "", !!l.current]);

describe("the running list", () => {
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
        "From a former user's answer in an import",
        "12 Jul",
        "",
        true
      ],
      ["Riflery: Activity deleted", "Deleted by you", "10 Jul", "", true],
      [
        "Carpool is a fixed activity",
        "From Dana's answer in an import",
        "3 Jul",
        "",
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
      [
        "Lunch is a fixed activity",
        "From your answer in an import",
        "3 Jul",
        "",
        true
      ]
    ]);
    expect(lines[0].answer.id).toBe("x");
  });

  // MEMO-7.3
  it("a change adds a line; the one before stays, marked, and only the newest acts", () => {
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
      ["Lunch is a fixed activity", "Changed by you", "20 Jul", "", true],
      [
        "Lunch is an activity",
        "From Dana's answer in an import",
        "3 Jul",
        "Updated",
        false
      ]
    ]);
  });

  // MEMO-7.3
  it("marks a line replaced by an import, forgotten, and undone", () => {
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
      })
    ];
    const lines = historyLines(
      events,
      [now("a2", "kind|Lunch", "fixed", "2026-07-10")],
      t,
      spell
    );
    expect(view(lines)).toEqual([
      ["Lunch is a fixed activity", "Undone by you", "11 Jul", "", true],
      [
        "Lunch is a fixed activity",
        "Forgotten by you",
        "11 Jul",
        "Undone",
        false
      ],
      [
        "Lunch is a fixed activity",
        "From Dana's answer in an import",
        "10 Jul",
        "Forgotten",
        false
      ],
      [
        "Lunch is an activity",
        "From Dana's answer in an import",
        "3 Jul",
        "Replaced",
        false
      ]
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
        "Auto-applied in the 17 Jul import",
        "17 Jul",
        "",
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
    expect(steps).toEqual([
      ["Became Steady (after 3 answers)", "10 Jul", true],
      ["Became Suggested (after 2 answers)", "3 Jul", false]
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
    ).toEqual([
      ["Demoted (an answer disagreed)", "17 Jul"],
      ["Became Suggested (after 2 answers)", "3 Jul"]
    ]);
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
    expect(steps).toEqual([
      ["Became Suggested (after 2 answers)", "12 Jul"],
      ["Demoted (an answer disagreed)", "11 Jul"],
      ["Became Suggested (after 2 answers)", "10 Jul"]
    ]);
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
      "Forgotten by you",
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
