import { createElement } from "lwc";
import ShoreshLearned from "c/shoreshLearned";
import getLearned from "@salesforce/apex/LearnedController.getLearned";
import getLearnedHistory from "@salesforce/apex/LearnedController.getLearnedHistory";
import changeLearned from "@salesforce/apex/LearnedController.changeLearned";
import forgetLearned from "@salesforce/apex/LearnedController.forgetLearned";
import restoreLearned from "@salesforce/apex/LearnedController.restoreLearned";
import undoChangeLearned from "@salesforce/apex/LearnedController.undoChangeLearned";
import forgetLearnedPattern from "@salesforce/apex/LearnedController.forgetLearnedPattern";

jest.mock(
  "@salesforce/apex/LearnedController.getLearned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.getLearnedHistory",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.changeLearned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.forgetLearned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.undoChangeLearned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.forgetLearnedPattern",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/LearnedController.restoreLearned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

// One answer remembered now; with no history of its own it reads as answered in an import.
const answer = (id, question, value, day = "2026-07-03", extra = {}) => ({
  id,
  question,
  answer: value,
  byYou: false,
  byName: "Dana",
  answeredOn: day,
  savedAt: `${day}T12:00:00.000Z`,
  ...extra
});
// One stored event (LearnedEvents.forCamp).
const event = (id, what, question, value, day, answerId, extra = {}) => ({
  id,
  what,
  question,
  answer: value,
  answerId,
  byYou: true,
  byName: "Sam",
  answeredOn: day,
  savedAt: `${day}T15:00:00.000Z`,
  ...extra
});

// Every promise waiting runs (each await in the component is one turn).
const flush = () =>
  [...Array(8)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function serve(answers, events = []) {
  getLearned.mockResolvedValue(answers);
  getLearnedHistory.mockResolvedValue(events);
}

async function mount(answers, events = [], setup) {
  serve(answers, events);
  const element = createElement("c-shoresh-learned", { is: ShoreshLearned });
  element.campId = "a00";
  if (setup) {
    element.setup = setup;
  }
  document.body.appendChild(element);
  element.active = true;
  await flush();
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const text = (node, id) => {
  const found = node.querySelector(`[data-id="${id}"]`);
  return found ? found.textContent.trim() : null;
};
// The learned lines (not what Shoresh already knew): [what, how, when, mark].
const lines = (element) =>
  $$(element, "li[data-line]").map((li) => [
    text(li, "title"),
    text(li, "how"),
    text(li, "when"),
    text(li, "flag")
  ]);
const line = (element, n = 0) => $$(element, "li[data-line]")[n];

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  jest.clearAllMocks();
});

describe("c-shoresh-learned: one running list", () => {
  // MEMO-7.1
  it("says nothing is learned yet, then lists what Shoresh already knew", async () => {
    const element = await mount([]);
    expect($(element, '[data-id="empty"]').title).toBe("Nothing learned yet");
    expect($(element, '[data-id="search"]')).toBeNull();
    expect($(element, "[data-heading]").textContent.trim()).toBe("Settings");
    expect(text(element.shadowRoot, "list-title")).toBe(
      "What Shoresh has learned"
    );
  });

  it("shows a load failure with Try again", async () => {
    getLearned.mockRejectedValueOnce({ body: { message: "No access." } });
    getLearnedHistory.mockResolvedValue([]);
    const element = createElement("c-shoresh-learned", { is: ShoreshLearned });
    element.campId = "a00";
    document.body.appendChild(element);
    element.active = true;
    await flush();
    expect($(element, '[data-id="load-error"]').textContent).toContain(
      "Couldn't load what Shoresh has learned."
    );
    getLearned.mockResolvedValueOnce([answer("1", "kind|Lunch", "fixed")]);
    $(element, '[data-id="retry-load"]').click();
    await flush();
    expect(text(line(element), "title")).toBe("Lunch: A fixed activity");
  });

  // MEMO-7.2, MEMO-6.2
  it("lists what, how and when, newest first, with no groups", async () => {
    const element = await mount([
      answer("1", "kind|Carpool", "fixed", "2026-07-03"),
      answer("2", "deleted|Activity||Riflery", "deleted", "2026-07-10", {
        byYou: true
      }),
      answer("3", "kind|Swim", "activity", "2026-07-12", { byName: null })
    ]);
    expect(lines(element)).toEqual([
      [
        "Swim: An activity",
        "From a former user's answer in an import",
        "12 Jul",
        null
      ],
      ["Riflery: Activity deleted", "Deleted by you", "10 Jul", null],
      [
        "Carpool: A fixed activity",
        "From Dana's answer in an import",
        "3 Jul",
        null
      ]
    ]);
    expect($(element, '[data-id="group-toggle"]')).toBeNull();
    expect(text(element.shadowRoot, "count")).toBe("3 answers");
    await expect(element).toBeAccessible();
  });

  it("shows 25 lines, then 25 more", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      answer(String(i), `kind|Item ${i}`, "activity")
    );
    const element = await mount(many);
    const answers = '[data-kind="answered"]';
    expect($$(element, answers).length).toBeLessThan(30);
    expect($$(element, "li[data-line]")).toHaveLength(25);
    $(element, '[data-id="more"]').click();
    await flush();
    expect($$(element, answers)).toHaveLength(30);
  });

  it("searches past 15 lines, by what, how or when", async () => {
    const many = Array.from({ length: 16 }, (_, i) =>
      answer(String(i), `kind|Item ${i}`, "activity")
    );
    many.push(
      answer("d", "deleted|Activity||Riflery", "deleted", "2026-07-20")
    );
    const element = await mount(many);
    const search = $(element, '[data-id="search"]');
    search.value = "riflery";
    search.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(lines(element).map((l) => l[0])).toEqual([
      "Riflery: Activity deleted"
    ]);
    // What Shoresh already knew is not searched.
    expect($$(element, "[data-rule]")).toHaveLength(0);
    search.value = "20 jul";
    search.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(lines(element)).toHaveLength(1);
    search.value = "zzz";
    search.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect($(element, '[data-id="no-matches"]').textContent).toContain(
      "Nothing matches “zzz”."
    );
    $(element, '[data-id="clear"]').click();
    await flush();
    expect(element.shadowRoot.activeElement.dataset.id).toBe("search");
  });

  // MEMO-6.4, MEMO-7.3
  it("Forget adds a line with Undo; Undo adds another and the answer is back", async () => {
    const riflery = answer("2", "deleted|Activity||Riflery", "deleted");
    const deleted = event(
      "e0",
      "answered",
      riflery.question,
      "deleted",
      "2026-07-03",
      "2",
      {
        byYou: false,
        byName: "Dana"
      }
    );
    const element = await mount([riflery], [deleted]);
    forgetLearned.mockResolvedValue(true);
    const forgotten = event(
      "e1",
      "forgotten",
      riflery.question,
      "deleted",
      "2026-10-28",
      "2"
    );
    serve([], [deleted, forgotten]);
    $(element, '[data-id="forget"]').click();
    await flush();
    expect(forgetLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "2"
    });
    expect(lines(element)).toEqual([
      ["Riflery: Activity deleted", "Forgotten by you", "28 Oct", null],
      ["Riflery: Activity deleted", "Deleted by Dana", "3 Jul", "Forgotten"]
    ]);
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Forgotten. It can come back next import."
    );
    expect(element.shadowRoot.activeElement.dataset.id).toBe("undo");
    expect(element.shadowRoot.activeElement.getAttribute("aria-label")).toBe(
      "Undo forgetting Riflery: Activity deleted"
    );
    // Nothing remembered to change or forget on either line now.
    expect($(element, '[data-id="forget"]')).toBeNull();

    restoreLearned.mockResolvedValue(true);
    serve(
      [riflery],
      [
        deleted,
        forgotten,
        event("e2", "undone", riflery.question, "deleted", "2026-10-28", "2", {
          savedAt: "2026-10-28T15:01:00.000Z"
        })
      ]
    );
    $(element, '[data-id="undo"]').click();
    await flush();
    expect(restoreLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "2"
    });
    expect(lines(element)).toEqual([
      ["Riflery: Activity deleted", "Undone by you", "28 Oct", null],
      ["Riflery: Activity deleted", "Forgotten by you", "28 Oct", "Undone"],
      ["Riflery: Activity deleted", "Deleted by Dana", "3 Jul", "Forgotten"]
    ]);
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Remembered again."
    );
    expect($(element, '[data-id="undo"]')).toBeNull();
    expect(element.shadowRoot.activeElement.dataset.id).toBe("forget");
  });

  // MEMO-6.4, MEMO-7.3
  it("Change adds a line with Undo; the line before stays, marked Updated", async () => {
    const lunch = answer("1", "kind|Lunch", "activity");
    const answered = event(
      "e0",
      "answered",
      "kind|Lunch",
      "activity",
      "2026-07-03",
      "1",
      {
        byYou: false,
        byName: "Dana"
      }
    );
    const element = await mount([lunch], [answered]);
    $(element, '[data-id="change"]').click();
    await flush();
    const choices = $$(element, '[data-id="choice"]');
    expect(choices.map((c) => c.textContent.trim())).toEqual([
      "A fixed activity",
      "A recurring activity",
      "An activity"
    ]);
    expect(element.shadowRoot.activeElement.dataset.value).toBe("activity");
    expect($(element, '[data-id="save"]')).toBeNull();
    choices[0].click();
    await flush();
    changeLearned.mockResolvedValue("7");
    const changed = event(
      "e1",
      "changed",
      "kind|Lunch",
      "fixed",
      "2026-10-26",
      "7"
    );
    serve(
      [
        answer("7", "kind|Lunch", "fixed", "2026-10-26", {
          fromLearned: true,
          byYou: true
        })
      ],
      [answered, changed]
    );
    $(element, '[data-id="save"]').click();
    await flush();
    expect(changeLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "1",
      answer: "fixed"
    });
    expect(lines(element)).toEqual([
      ["Lunch: A fixed activity", "Changed by you", "26 Oct", null],
      [
        "Lunch: An activity",
        "From Dana's answer in an import",
        "3 Jul",
        "Updated"
      ]
    ]);
    expect($(element, '[data-id="said"]').textContent.trim()).toBe("Updated.");
    expect(element.shadowRoot.activeElement.dataset.id).toBe("undo");
    expect(element.shadowRoot.activeElement.getAttribute("aria-label")).toBe(
      "Undo changing Lunch: A fixed activity"
    );

    undoChangeLearned.mockResolvedValue(true);
    serve(
      [lunch],
      [
        answered,
        changed,
        event("e2", "undone", "kind|Lunch", "activity", "2026-10-26", "1", {
          savedAt: "2026-10-26T15:01:00.000Z"
        })
      ]
    );
    $(element, '[data-id="undo"]').click();
    await flush();
    expect(undoChangeLearned).toHaveBeenCalledWith({
      campId: "a00",
      newId: "7",
      oldId: "1"
    });
    expect(lines(element)).toEqual([
      ["Lunch: An activity", "Undone by you", "26 Oct", null],
      ["Lunch: A fixed activity", "Changed by you", "26 Oct", "Undone"],
      [
        "Lunch: An activity",
        "From Dana's answer in an import",
        "3 Jul",
        "Updated"
      ]
    ]);
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Changed back."
    );
    expect($(element, '[data-id="undo"]')).toBeNull();
    expect(element.shadowRoot.activeElement.dataset.id).toBe("change");
  });

  // MEMO-6.4
  it("Undo lasts until the screen is next opened", async () => {
    const lunch = answer("1", "kind|Lunch", "fixed");
    const element = await mount([lunch]);
    forgetLearned.mockResolvedValue(true);
    serve(
      [],
      [event("e1", "forgotten", "kind|Lunch", "fixed", "2026-10-28", "1")]
    );
    $(element, '[data-id="forget"]').click();
    await flush();
    expect($(element, '[data-id="undo"]')).not.toBeNull();
    element.active = false;
    element.active = true;
    await flush();
    expect($(element, '[data-id="undo"]')).toBeNull();
  });

  // MEMO-4.3
  it("an Undo of a Change over a newer answer shows the latest instead", async () => {
    const element = await mount([answer("1", "kind|Lunch", "activity")]);
    $(element, '[data-id="change"]').click();
    await flush();
    $$(element, '[data-id="choice"]')[0].click();
    await flush();
    changeLearned.mockResolvedValue("7");
    serve(
      [answer("7", "kind|Lunch", "fixed")],
      [event("e1", "changed", "kind|Lunch", "fixed", "2026-10-26", "7")]
    );
    $(element, '[data-id="save"]').click();
    await flush();
    undoChangeLearned.mockResolvedValue(false);
    serve([answer("8", "kind|Lunch", "recurring", "2026-10-27")]);
    $(element, '[data-id="undo"]').click();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    );
    expect(text(line(element), "title")).toBe("Lunch: A recurring activity");
  });

  // MEMO-4.3
  it("an Undo of a Forget over a newer answer shows the latest instead", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockResolvedValue(true);
    serve(
      [],
      [event("e1", "forgotten", "kind|Lunch", "fixed", "2026-10-26", "1")]
    );
    $(element, '[data-id="forget"]').click();
    await flush();
    restoreLearned.mockResolvedValue(false);
    serve([answer("5", "kind|Lunch", "activity", "2026-10-27")]);
    $(element, '[data-id="undo"]').click();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    );
    expect(text(line(element), "title")).toBe("Lunch: An activity");
  });

  it("closes Change with Escape, the cursor back on Change", async () => {
    const element = await mount([answer("1", "kind|Lunch", "activity")]);
    $(element, '[data-id="change"]').click();
    await flush();
    $(element, '[data-id="editor"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" })
    );
    await flush();
    expect($(element, '[data-id="editor"]')).toBeNull();
    expect(element.shadowRoot.activeElement.dataset.id).toBe("change");
  });

  it("shows a name a key keeps in lower case as the camp writes it now", async () => {
    const element = await mount(
      [answer("1", "tueThu|main|swim lessons", "Tuesday")],
      [],
      {
        programs: [{ program: { Name: "Main" } }],
        activities: [{ Name: "Swim  Lessons" }]
      }
    );
    expect(text(line(element), "title")).toBe("Swim  Lessons: Tuesday");
  });

  it("offers no Change for an answer that is a name, only Forget", async () => {
    const element = await mount([answer("1", "program|Group A", "Main")]);
    expect($(element, '[data-id="change"]')).toBeNull();
    expect($(element, '[data-id="forget"]')).not.toBeNull();
  });

  it("keeps a refused Forget on the line with Try again", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockRejectedValueOnce({ body: { message: "No access." } });
    $(element, '[data-id="forget"]').click();
    await flush();
    expect($(element, '[data-id="row-error"]').textContent).toContain(
      "Couldn't save that. No access."
    );
    forgetLearned.mockResolvedValueOnce(true);
    serve(
      [],
      [event("e1", "forgotten", "kind|Lunch", "fixed", "2026-10-28", "1")]
    );
    $(element, '[data-id="retry"]').click();
    await flush();
    expect(text(line(element), "how")).toBe("Forgotten by you");
  });

  it("shows the latest when the answer was changed somewhere else", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockResolvedValue(false);
    serve([]);
    $(element, '[data-id="forget"]').click();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    ); // The line it was on is gone: the cursor goes to the heading, not lost.
    expect(element.shadowRoot.activeElement.hasAttribute("data-heading")).toBe(
      true
    );
  });

  // MEMO-7.5
  it("says when an import auto-applied an answer, with nothing to change on that line", async () => {
    const element = await mount(
      [],
      [
        event("e1", "auto", "kind|Specialty 4", "fixed", "2026-07-17", null, {
          byYou: false
        })
      ]
    );
    expect(lines(element)).toEqual([
      [
        "Specialty 4: A fixed activity",
        "Auto-applied in the 17 Jul import",
        "17 Jul",
        null
      ]
    ]);
    expect($(element, '[data-id="change"]')).toBeNull();
    expect($(element, '[data-id="forget"]')).toBeNull();
  });
});

describe("patterns, and what Shoresh already knew", () => {
  // Lunch 1 to 3: the numbered and the meal patterns, from two imports.
  const lunches = (extra = {}) => [
    answer("1", "kind|Lunch 1", "recurring", "2026-07-03", {
      byYou: true,
      ...extra
    }),
    answer("2", "kind|Lunch 2", "recurring", "2026-07-03"),
    answer("3", "kind|Lunch 3", "recurring", "2026-07-10")
  ];
  const patternLines = (element) =>
    $$(element, "li[data-line]")
      .filter((li) => li.querySelector('[data-id="progress"]'))
      .map((li) => ({
        title: text(li, "title"),
        how: text(li, "how"),
        flag: text(li, "flag"),
        progress: text(li, "progress")
      }));

  // MEMO-6.8
  it("lists what Shoresh already knew last, apart, with nothing to change or forget", async () => {
    const element = await mount([]);
    const rules = $$(element, "[data-rule]");
    expect(rules.map((li) => text(li, "title"))).toContain(
      "Every group, the same time block, every day: a fixed activity"
    );
    expect(rules.map((li) => text(li, "how"))).toEqual(
      rules.map(() => "Shoresh already knew this")
    );
    expect($(element, '[data-id="forget"]')).toBeNull();
    await expect(element).toBeAccessible();
    document.body.removeChild(element);
    const learned = await mount([answer("1", "kind|Lunch", "fixed")]);
    const all = $$(learned, "li");
    expect(all[0].dataset.line).toBeDefined();
    expect(all[all.length - 1].dataset.rule).toBeDefined();
  });

  // MEMO-6.7, MEMO-7.4
  it("shows each pattern's steps, the newest with its progress in counts", async () => {
    const element = await mount(lunches());
    expect(patternLines(element)).toEqual([
      {
        title: "A recurring activity: Lunch 1, Lunch 2 and Lunch 3",
        how: "Became Steady (after 3 answers)",
        flag: "Steady: suggested every time",
        progress: "3 of 3 answers - suggested every time"
      },
      {
        title: "A recurring activity: Lunch 1, Lunch 2 and Lunch 3",
        how: "Became Steady (after 3 answers)",
        flag: "Steady: suggested every time",
        progress: "3 of 3 answers - suggested every time"
      }
    ]);
    expect(
      lines(element).filter((l) => l[1].startsWith("Became Suggested"))
    ).toHaveLength(2);
    expect($$(element, ".dot_on")).toHaveLength(6);
    await expect(element).toBeAccessible();
  });

  // MEMO-6.7, MEMO-4.1
  it("says what is missing, and when the latest answer disagrees", async () => {
    const one = await mount(lunches().slice(0, 2));
    expect(patternLines(one)[0].flag).toBe("Suggested");
    expect(patternLines(one)[0].progress).toBe(
      "2 of 3 answers - needs one more import"
    );
    document.body.removeChild(one);
    const followed = await mount(
      lunches().map((r) => ({ ...r, fromSuggestion: true }))
    );
    expect(patternLines(followed)[0].progress).toBe(
      "3 of 3 answers - needs one answer you picked yourself"
    );
    document.body.removeChild(followed);
    const disagreed = await mount([
      ...lunches(),
      answer("4", "kind|Lunch 4", "activity", "2026-07-17")
    ]);
    expect(patternLines(disagreed)[0]).toEqual(
      expect.objectContaining({
        how: "Demoted (an answer disagreed)",
        flag: "Still asks",
        progress:
          "Your latest answer disagrees - 2 more agreeing answers to suggest again"
      })
    );
  });

  // MEMO-5.1
  it("a steady fixed-activity pattern says it fills in on its own, with Undo in the import", async () => {
    const fixed = lunches().map((r) => ({
      ...r,
      answer: "fixed",
      shape: "scattered|everyone|one"
    }));
    const element = await mount(fixed);
    expect(patternLines(element).map((r) => [r.flag, r.progress])).toEqual([
      [
        "Steady: auto-applied where the name sits the same way; Undo in the import",
        "3 of 3 answers - auto-applied where the name sits the same way"
      ],
      [
        "Steady: auto-applied where the name sits the same way; Undo in the import",
        "3 of 3 answers - auto-applied where the name sits the same way"
      ]
    ]);
    document.body.removeChild(element);
    const mixed = await mount(
      fixed.map((r, i) => ({ ...r, shape: i ? r.shape : "days|all|one" }))
    );
    expect(patternLines(mixed)[0].flag).toBe("Steady: suggested every time");
  });

  // MEMO-4.5
  it("Forget pattern keeps its answers, adds a line, with Undo", async () => {
    const element = await mount(lunches());
    forgetLearnedPattern.mockResolvedValue(["m1"]);
    const marker = event(
      "e1",
      "forgotten",
      "pattern|numbered|lunch",
      "forgotten",
      "2026-07-11",
      "m1"
    );
    serve(
      [
        ...lunches(),
        answer("m1", "pattern|numbered|lunch", "forgotten", "2026-07-11", {
          savedAt: marker.savedAt
        })
      ],
      [marker]
    );
    const numbered = $$(element, "li[data-line]").find(
      (li) =>
        li.dataset.line.startsWith("p:pattern:numbered") &&
        li.querySelector('[data-id="forget"]')
    );
    numbered.querySelector('[data-id="forget"]').click();
    await flush();
    expect(forgetLearnedPattern).toHaveBeenCalledWith({
      campId: "a00",
      template: "numbered",
      antecedent: "lunch"
    });
    expect(lines(element)[0]).toEqual([
      "A recurring activity: Lunch 1, Lunch 2 and Lunch 3",
      "Forgotten by you",
      "11 Jul",
      null
    ]);
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Forgotten. It won't be suggested again. Its answers stay."
    );
    // The answers stay remembered, each with Forget.
    expect(text(element.shadowRoot, "count")).toBe("3 answers");
    expect(element.shadowRoot.activeElement.dataset.id).toBe("undo");
    forgetLearned.mockResolvedValue(true);
    serve(lunches());
    $(element, '[data-id="undo"]').click();
    await flush();
    expect(forgetLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "m1"
    });
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Remembered again."
    );
    // The cursor on the pattern's line again, on its Forget pattern.
    const focused = element.shadowRoot.activeElement;
    expect(focused.dataset.id).toBe("forget");
    expect(focused.dataset.line).toMatch(/^p:pattern:numbered:/);
  });

  // MEMO-4.5
  it("Undo of a second Forget pattern brings the first one back", async () => {
    const element = await mount(lunches());
    forgetLearnedPattern.mockResolvedValue(["m2", "m1"]);
    serve(lunches(), [
      event(
        "e1",
        "forgotten",
        "pattern|meal|lunch",
        "forgotten",
        "2026-07-11",
        "m2"
      )
    ]);
    $$(element, "li[data-line]")
      .find(
        (li) =>
          li.dataset.line.startsWith("p:pattern:meal") &&
          li.querySelector('[data-id="forget"]')
      )
      .querySelector('[data-id="forget"]')
      .click();
    await flush();
    undoChangeLearned.mockResolvedValue(true);
    $(element, '[data-id="undo"]').click();
    await flush();
    expect(undoChangeLearned).toHaveBeenCalledWith({
      campId: "a00",
      newId: "m2",
      oldId: "m1"
    });
  });

  // MEMO-4.5
  it("a forgotten pattern's marker is no answer of its own", async () => {
    const element = await mount([
      ...lunches(),
      answer("m", "pattern|numbered|lunch", "forgotten", "2026-07-11")
    ]);
    expect(text(element.shadowRoot, "count")).toBe("3 answers");
    expect(lines(element).map((l) => l[0])).not.toContain(
      "pattern, numbered, lunch: forgotten"
    );
    // Only the meal pattern is there now: only it has progress and Forget pattern.
    expect(patternLines(element)).toHaveLength(1);
  });
});
