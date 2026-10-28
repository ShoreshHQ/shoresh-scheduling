import { readFileSync } from "fs";
import { join } from "path";
import {
  TEMPLATES,
  appliesOnItsOwn,
  autoAnswersFor,
  evaluate,
  staleAuto,
  isMeal,
  keyParts,
  patternKey,
  patternGroups,
  patternsOf,
  stem,
  suggestionFor,
  suggestionsFor,
  templatesOf,
  withLearning
} from "c/shoreshPatterns";

// One remembered answer, as the server sends it. day: the import it was saved in.
const row = (key, answer, day, extra = {}) => ({
  key,
  answer,
  savedAt: `${day}T12:00:00.000Z`,
  answeredOn: day,
  byYou: true,
  byName: "Greg",
  shape: "weeks|some|one",
  fromSuggestion: false,
  ...extra
});
const lunch = (n, answer, day, extra) =>
  row(`kind|Lunch ${n}`, answer, day, extra);
const kindCard = (name, shape = "weeks|some|one") => ({
  id: `kind|${name}`,
  options: [
    { value: "fixed" },
    { value: "recurring" },
    { value: "activity" },
    { value: "leaveOut" }
  ],
  learn: { shape }
});
const bandOf = (rows) => evaluate(patternGroups(rows)[0]).band;

describe("the templates: a fixed menu, never a search", () => {
  // MEMO-3.1
  it("reads a numbered name's stem, and only a trailing number", () => {
    expect(stem("Lunch 2")).toBe("lunch");
    expect(stem("Lunch2")).toBe("lunch");
    expect(stem("Period 12")).toBe("period");
    expect(stem("Group 2A")).toBeNull();
    expect(stem("Lunch")).toBeNull();
    expect(stem("Ab 1")).toBeNull();
    expect(stem("Bunk 1 2")).toBeNull();
  });

  // MEMO-3.1
  it("reads a meal's whole name only", () => {
    for (const name of ["Lunch", "lunch 3", "Menucha 2", "Snack", "Lunch2"]) {
      expect(isMeal(name)).toBe(true);
    }
    for (const name of [
      "Snack Shack",
      "Lunch Duty Volunteering",
      "Dinner Dance",
      "Bus Games"
    ]) {
      expect(isMeal(name)).toBe(false);
    }
  });

  // MEMO-3.1
  it("gives each question kind that can still be asked its own template, and nothing else one", () => {
    const of = (key, answer) =>
      templatesOf(key, answer).map((t) => [
        t.template,
        t.antecedent,
        t.verdict
      ]);
    expect(of("kind|Lunch 4", "recurring")).toEqual([
      ["numbered", "lunch", "recurring"],
      ["meal", "meal", "recurring"]
    ]);
    expect(of("kind|Lunch 4|Juniors", "fixed")).toEqual([
      ["numbered", "lunch|juniors", "fixed"],
      ["meal", "meal|juniors", "fixed"]
    ]);
    expect(of("kind|Swim", "activity")).toEqual([]);
    expect(of("similar|activity|music|musik|Music|Musik", "b")).toEqual([
      ["spelling", "activity|letter", "same"]
    ]);
    expect(of("similar|group|bunk1|bunk1|Bunk 1|Bunk-1", "different")).toEqual([
      ["spelling", "group|spelling", "different"]
    ]);
    expect(of("list|Archery / Riflery", "several")).toEqual([
      ["list", "/", "several"]
    ]);
    expect(of("list|Arts, Crafts", "one")).toEqual([["list", ",", "one"]]);
    expect(of("split|Juniors|Bunk 1,Bunk 2", "keep")).toEqual([
      ["together", "group", "keep"]
    ]);
    // Values, names, deletions and guesses have no pattern; nor does "all camp except",
    // which Salesforce never asks.
    for (const key of [
      "change|fixed|Main|Lunch|block",
      "deleted|Activity||Riflery",
      "guessed|s|fixed|Main|Lunch|often",
      "program|Juniors",
      "exclusion|Swim|CIT"
    ]) {
      expect(of(key, "keep")).toEqual([]);
    }
  });

  // MEMO-3.1
  it("the server takes a forgotten pattern only from the same menu", () => {
    const apex = readFileSync(
      join(__dirname, "../../../classes/LearnedAnswers.cls"),
      "utf8"
    );
    const menu = /TEMPLATES = new Set<String>\{([^}]*)\}/.exec(apex)[1];
    expect(menu.match(/'(\w+)'/g).map((q) => q.slice(1, -1))).toEqual([
      ...TEMPLATES
    ]);
  });
});

describe("the bands and the bar", () => {
  // MEMO-3.2
  it("two agreeing answers suggest; three from one import still only suggest", () => {
    expect(bandOf([lunch(1, "recurring", "2026-07-03")])).toBe("ask");
    expect(
      bandOf([
        lunch(1, "recurring", "2026-07-03"),
        lunch(2, "recurring", "2026-07-03")
      ])
    ).toBe("suggest");
    const one = patternGroups([
      lunch(1, "recurring", "2026-07-03"),
      lunch(2, "recurring", "2026-07-03"),
      lunch(3, "recurring", "2026-07-03")
    ])[0];
    expect(evaluate(one).band).toBe("suggest");
    expect(evaluate(one).progress.missing).toEqual(["another_import"]);
  });

  // MEMO-3.2
  it("three from two imports, one picked without a suggestion, are established", () => {
    expect(
      bandOf([
        lunch(1, "recurring", "2026-07-03"),
        lunch(2, "recurring", "2026-07-03", { fromSuggestion: true }),
        lunch(3, "recurring", "2026-07-10", { fromSuggestion: true })
      ])
    ).toBe("established");
  });

  // MEMO-3.2
  it("answers that only followed suggestions never establish a pattern", () => {
    const group = patternGroups([
      lunch(1, "recurring", "2026-07-03", { fromSuggestion: true }),
      lunch(2, "recurring", "2026-07-03", { fromSuggestion: true }),
      lunch(3, "recurring", "2026-07-10", { fromSuggestion: true })
    ])[0];
    expect(evaluate(group).band).toBe("suggest");
    expect(evaluate(group).progress.missing).toEqual(["explicit"]);
  });

  // MEMO-3.2
  it("counts each question once: one pattern per program", () => {
    const groups = patternGroups([
      row("kind|Lunch 1|Juniors", "recurring", "2026-07-03"),
      row("kind|Lunch 1|Seniors", "recurring", "2026-07-03")
    ]);
    expect(
      groups.map((g) => [g.template, g.antecedent, g.instances.length])
    ).toEqual([
      ["meal", "meal|juniors", 1],
      ["meal", "meal|seniors", 1],
      ["numbered", "lunch|juniors", 1],
      ["numbered", "lunch|seniors", 1]
    ]);
  });

  // MEMO-4.1
  it("one disagreement demotes, and one answer never flips a pattern to the other answer", () => {
    const established = [
      lunch(1, "recurring", "2026-07-03"),
      lunch(2, "recurring", "2026-07-03"),
      lunch(3, "recurring", "2026-07-10")
    ];
    expect(bandOf(established)).toBe("established");
    const overridden = [...established, lunch(4, "activity", "2026-07-17")];
    expect(bandOf(overridden)).toBe("ask");
    expect(suggestionFor(kindCard("Lunch 5"), overridden)).toBeNull();
    // Two more agreeing answers suggest again, the new answer, never the old one.
    const back = [...overridden, lunch(5, "activity", "2026-07-24")];
    expect(suggestionFor(kindCard("Lunch 6"), back).value).toBe("activity");
    expect(suggestionFor(kindCard("Lunch 6"), back).band).toBe("suggest");
  });
});

describe("the shape check", () => {
  const rows = [
    lunch(1, "recurring", "2026-07-03"),
    lunch(2, "recurring", "2026-07-03"),
    lunch(3, "recurring", "2026-07-10")
  ];

  // MEMO-3.3
  it("a question of another shape is held at suggested", () => {
    expect(suggestionFor(kindCard("Lunch 4"), rows).band).toBe("established");
    expect(
      suggestionFor(kindCard("Lunch 4", "scattered|everyone|one"), rows).band
    ).toBe("suggest");
  });

  // MEMO-3.3
  it("answers saved without a shape, or of mixed shapes, never establish a suggestion", () => {
    const old = rows.map((r) => ({ ...r, shape: null }));
    expect(suggestionFor(kindCard("Lunch 4"), old).band).toBe("suggest");
    const mixed = [...rows];
    mixed[0] = { ...rows[0], shape: "once|some|one" };
    expect(suggestionFor(kindCard("Lunch 4"), mixed).band).toBe("suggest");
  });

  // MEMO-3.3
  it("suggests only an answer the question offers", () => {
    const fixed = rows.map((r) => ({ ...r, answer: "fixed" }));
    const noFixed = {
      ...kindCard("Lunch 4"),
      options: [{ value: "recurring" }, { value: "activity" }]
    };
    expect(suggestionFor(noFixed, fixed)).toBeNull();
    expect(suggestionFor(kindCard("Lunch 4"), fixed).value).toBe("fixed");
  });
});

describe("the same answers, the same patterns", () => {
  // MEMO-3.4
  it("gives the same patterns in any order", () => {
    const rows = [
      lunch(1, "recurring", "2026-07-03"),
      lunch(2, "activity", "2026-07-03"),
      lunch(3, "recurring", "2026-07-10"),
      row("list|Archery / Riflery", "several", "2026-07-10"),
      row("list|Art / Clay", "several", "2026-07-03")
    ];
    const once = patternsOf(rows);
    expect(patternsOf([...rows].reverse())).toEqual(once);
    expect(patternsOf([rows[2], rows[0], rows[4], rows[1], rows[3]])).toEqual(
      once
    );
  });
});

describe("Forget pattern", () => {
  const rows = [
    lunch(1, "recurring", "2026-07-03"),
    lunch(2, "recurring", "2026-07-03"),
    lunch(3, "recurring", "2026-07-10")
  ];
  const forgot = (day) => ({
    key: "pattern|numbered|lunch",
    answer: "forgotten",
    savedAt: `${day}T13:00:00.000Z`
  });

  // MEMO-4.5
  it("stops the pattern, keeps its answers, and only newer answers clearing the bar bring it back", () => {
    const card = kindCard("Lunch 9");
    const forgotten = [...rows, forgot("2026-07-10")];
    expect(
      patternGroups(forgotten).find((g) => g.template === "numbered")
    ).toBeUndefined();
    // Lunch 9 is also a meal: that pattern is another one, not forgotten.
    expect(suggestionFor(card, forgotten).template).toBe("meal");
    const newer = [
      ...forgotten,
      lunch(4, "recurring", "2026-07-17"),
      lunch(5, "recurring", "2026-07-17")
    ];
    const numbered = patternGroups(newer).find(
      (g) => g.template === "numbered"
    );
    expect(numbered.instances.map((r) => r.key)).toEqual([
      "kind|Lunch 4",
      "kind|Lunch 5"
    ]);
    expect(evaluate(numbered).band).toBe("suggest");
  });
});

describe("suggestions on the import's cards", () => {
  const pair = (a, b, answer, day, extra) =>
    row(
      `similar|activity|${a.toLowerCase()}|${b.toLowerCase()}|${a}|${b}`,
      answer,
      day,
      { shape: "file", ...extra }
    );
  const rows = [
    pair("Potery", "Pottery", "b", "2026-07-03"),
    pair("Archary", "Archery", "a", "2026-07-10", {
      byYou: false,
      byName: "Dana Levi"
    })
  ];
  const card = (same) => ({
    id: "similar|activity|music|musik|Music|Musik",
    options: [
      { value: "a" },
      { value: "b" },
      { value: "different" },
      { value: "leaveOut" }
    ],
    learn: { shape: "file", same }
  });

  // MEMO-6.5
  it("a similar-names pattern pre-selects the spelling this question keeps", () => {
    expect(suggestionFor(card("b"), rows).value).toBe("b");
    expect(suggestionFor(card("a"), rows).value).toBe("a");
  });

  // MEMO-6.5
  it("a card with a remembered answer of its own is not suggested to", () => {
    const id = card("a").id;
    expect(suggestionsFor([card("a")], rows, { [id]: "different" })).toEqual(
      {}
    );
    expect(Object.keys(suggestionsFor([card("a")], rows, {}))).toEqual([id]);
  });

  // MEMO-6.6
  it("says whose answers and when, in the words of a remembered answer", () => {
    expect(suggestionFor(card("a"), rows).text).toBe(
      "Suggested from answers for “Archary” / “Archery” and “Potery” / “Pottery” (Dana's 10 Jul, yours 3 Jul)"
    );
    const mine = rows.map((r) => ({ ...r, byYou: true }));
    expect(suggestionFor(card("a"), mine).text).toBe(
      "Suggested from your answers for “Archary” / “Archery” and “Potery” / “Pottery” on 10 Jul and 3 Jul"
    );
    const former = rows.map((r) => ({ ...r, byYou: false, byName: null }));
    expect(suggestionFor(card("a"), former).text).toBe(
      "Suggested from a former user's answers for “Archary” / “Archery” and “Potery” / “Pottery” on 10 Jul and 3 Jul"
    );
  });

  // MEMO-3.2, MEMO-3.3
  it("each answer saved says its question's shape and whether it followed the suggestion", () => {
    const suggestions = { [card("a").id]: { value: "a" } };
    expect(
      withLearning(
        [
          { key: card("a").id, answer: "a" },
          { key: "kind|Swim", answer: "activity" }
        ],
        [card("a"), { id: "kind|Swim", learn: { shape: "weeks|some|one" } }],
        suggestions
      )
    ).toEqual([
      { key: card("a").id, answer: "a", shape: "file", suggested: true },
      { key: "kind|Swim", answer: "activity", shape: "weeks|some|one" }
    ]);
    // Answered otherwise than suggested: picked without it.
    expect(
      withLearning(
        [{ key: card("a").id, answer: "b" }],
        [card("a")],
        suggestions
      )
    ).toEqual([{ key: card("a").id, answer: "b", shape: "file" }]);
  });
});

describe("review fixes", () => {
  // MEMO-4.1
  it("answers saved together that disagree demote, whatever their keys' order", () => {
    const mixed = [
      lunch(1, "recurring", "2026-07-10"),
      lunch(2, "recurring", "2026-07-10"),
      lunch(3, "activity", "2026-07-10")
    ];
    const ev = evaluate(patternGroups(mixed)[0]);
    expect(ev.band).toBe("ask");
    expect(ev.disagree).toBeGreaterThan(0);
    // "Lunch 10" sorts before "Lunch 2": the disagreement still shows.
    const ten = [
      lunch(1, "recurring", "2026-07-10"),
      lunch(10, "activity", "2026-07-10"),
      lunch(2, "recurring", "2026-07-10")
    ];
    expect(evaluate(patternGroups(ten)[0]).band).toBe("ask");
    expect(suggestionFor(kindCard("Lunch 4"), ten)).toBeNull();
    // An earlier import that disagreed within itself stops the run.
    const later = [
      ...ten,
      lunch(4, "recurring", "2026-07-17"),
      lunch(5, "recurring", "2026-07-17")
    ];
    const run = evaluate(patternGroups(later)[0]);
    expect(run.progress.agreeing).toBe(2);
    expect(run.band).toBe("suggest");
  });

  // MEMO-3.2
  it("a change on What Shoresh has learned adds no import and no answer picked yourself", () => {
    const rows = [
      lunch(1, "recurring", "2026-07-03", { fromSuggestion: true }),
      lunch(2, "recurring", "2026-07-03", { fromSuggestion: true }),
      lunch(3, "recurring", "2026-07-10", { fromLearned: true })
    ];
    const ev = evaluate(patternGroups(rows)[0]);
    expect(ev.progress.agreeing).toBe(3);
    expect(ev.band).toBe("suggest");
    expect(ev.progress.missing).toEqual(["another_import", "explicit"]);
  });

  // MEMO-4.5
  it("a forgotten pattern's key escapes a program with | and \\ both ways", () => {
    const key = "kind|Lunch 1|Day|Camp\\1";
    const [t] = templatesOf(key, "recurring");
    expect(t.antecedent).toBe("lunch|day\\|camp\\\\1");
    const marker = patternKey(t.template, t.antecedent);
    // The same string LearnedAnswersTest expects the server to save.
    expect(marker).toBe("pattern|numbered|lunch\\|day\\\\\\|camp\\\\\\\\1");
    expect(keyParts(marker)).toEqual(["pattern", "numbered", t.antecedent]);
    const rows = [
      row(key, "recurring", "2026-07-03"),
      row("kind|Lunch 2|Day|Camp\\1", "recurring", "2026-07-03"),
      { key: marker, answer: "forgotten", savedAt: "2026-07-04T00:00:00.000Z" }
    ];
    expect(
      patternGroups(rows).find((g) => g.template === "numbered")
    ).toBeUndefined();
  });

  // MEMO-3.1
  it("a rule Shoresh guessed is no answer of a pattern", () => {
    const guesses = [1, 2, 3].map((n) =>
      row(`guessed|se1|fixed|Main|Lunch ${n}|often`, "2-3", "2026-07-03")
    );
    expect(patternsOf(guesses)).toEqual([]);
  });
});

describe("filled in on its own (MEMO-5.1)", () => {
  const spec = (n, answer, day, extra) =>
    row(`kind|Specialty ${n}`, answer, day, extra);
  const steady = (answer) => [
    spec(1, answer, "2026-07-03"),
    spec(2, answer, "2026-07-03", { fromSuggestion: true }),
    spec(3, answer, "2026-07-10", { fromSuggestion: true })
  ];
  const card = kindCard("Specialty 4");

  // MEMO-5.1
  it("a steady pattern that a name is a fixed activity fills it in, saying whose answers", () => {
    expect(autoAnswersFor([card], steady("fixed"))).toEqual({
      "kind|Specialty 4": expect.objectContaining({
        value: "fixed",
        band: "established",
        template: "numbered",
        text: "Auto-applied from your answers for Specialty 1, Specialty 2 and Specialty 3 on 10 Jul and 3 Jul"
      })
    });
  });

  // MEMO-5.1
  it("nothing else fills in: another answer, a pattern only suggested, another shape, another question", () => {
    expect(autoAnswersFor([card], steady("recurring"))).toEqual({});
    expect(autoAnswersFor([card], steady("fixed").slice(0, 2))).toEqual({});
    expect(
      autoAnswersFor([kindCard("Specialty 4", "days|all|one")], steady("fixed"))
    ).toEqual({});
    // Still suggested where it does not fill in.
    expect(suggestionFor(card, steady("recurring")).band).toBe("established");
    expect(
      appliesOnItsOwn(
        { id: "list|A; B" },
        { band: "established", value: "fixed", template: "numbered" }
      )
    ).toBe(false);
    expect(
      appliesOnItsOwn(
        { id: "split|Bunk A" },
        { band: "established", value: "fixed", template: "together" }
      )
    ).toBe(false);
  });

  // MEMO-5.1
  it("an answered question, or one undone in this import, is not filled in", () => {
    expect(
      autoAnswersFor([{ ...card, answer: "activity" }], steady("fixed"))
    ).toEqual({});
    expect(
      autoAnswersFor([card], steady("fixed"), {}, ["kind|Specialty 4"])
    ).toEqual({});
  });

  // MEMO-5.1, MEMO-4.1
  it("one later disagreement stops it", () => {
    const later = [...steady("fixed"), spec(5, "activity", "2026-07-17")];
    expect(autoAnswersFor([card], later)).toEqual({});
  });

  // MEMO-5.1, MEMO-4.5
  it("Forget pattern stops it", () => {
    const forgotten = [
      ...steady("fixed"),
      {
        key: "pattern|numbered|specialty",
        answer: "forgotten",
        savedAt: "2026-07-10T13:00:00.000Z"
      }
    ];
    expect(autoAnswersFor([card], forgotten)).toEqual({});
  });

  // MEMO-5.1
  it("an answer filled in on its own is not saved as anyone's answer, so a pattern never feeds itself", () => {
    const auto = autoAnswersFor([card], steady("fixed"));
    const saved = withLearning(
      [
        { key: "kind|Specialty 4", answer: "fixed" },
        { key: "kind|Specialty 5", answer: "fixed" }
      ],
      [card, kindCard("Specialty 5")],
      auto,
      auto
    );
    expect(saved.map((e) => e.key)).toEqual(["kind|Specialty 5"]);
    // Changed by a person: theirs, and saved.
    expect(
      withLearning(
        [{ key: "kind|Specialty 4", answer: "activity" }],
        [card],
        auto,
        auto
      )
    ).toHaveLength(1);
  });

  // MEMO-5.1, MEMO-3.4
  it("the same answers fill in the same questions, in any order", () => {
    const cards = [card, kindCard("Specialty 6"), kindCard("Lunch 2")];
    const rows = steady("fixed");
    expect(autoAnswersFor([...cards].reverse(), [...rows].reverse())).toEqual(
      autoAnswersFor(cards, rows)
    );
  });

  // MEMO-5.1
  it("says each person's answers and when, when more than one answered", () => {
    const rows = [
      spec(1, "fixed", "2026-07-03"),
      spec(2, "fixed", "2026-07-03", { fromSuggestion: true }),
      spec(3, "fixed", "2026-07-10", {
        fromSuggestion: true,
        byYou: false,
        byName: "Dana Levi"
      })
    ];
    expect(autoAnswersFor([card], rows)["kind|Specialty 4"].text).toBe(
      "Auto-applied from answers for Specialty 1, Specialty 2 and Specialty 3 (Dana's 10 Jul, yours 3 Jul)"
    );
  });

  // MEMO-5.1
  it("an auto-applied answer whose question went away is found, so none stays hidden", () => {
    const auto = { "kind|Specialty 4": {}, "kind|Specialty 7": {} };
    expect(staleAuto(auto, [card])).toEqual(["kind|Specialty 7"]);
    expect(staleAuto(auto, [])).toEqual([
      "kind|Specialty 4",
      "kind|Specialty 7"
    ]);
  });
});
