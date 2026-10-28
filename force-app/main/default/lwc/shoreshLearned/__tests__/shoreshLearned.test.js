import { createElement } from "lwc";
import ShoreshLearned from "c/shoreshLearned";
import getLearned from "@salesforce/apex/LearnedController.getLearned";
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

const answer = (id, question, value, day = "2026-07-03") => ({
  id,
  question,
  answer: value,
  byYou: false,
  byName: "Dana",
  answeredOn: day
});

// Every promise waiting runs (each await in the component is one turn).
const flush = () =>
  [...Array(6)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function mount(answers) {
  getLearned.mockResolvedValue(answers);
  const element = createElement("c-shoresh-learned", { is: ShoreshLearned });
  element.campId = "a00";
  document.body.appendChild(element);
  element.active = true;
  await flush();
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  jest.clearAllMocks();
});

describe("c-shoresh-learned", () => {
  it("says nothing is learned yet, in one line", async () => {
    const element = await mount([]);
    expect($(element, '[data-id="empty"]').title).toBe("Nothing learned yet");
    expect($(element, '[data-id="search"]')).toBeNull();
  });

  it("shows a load failure with Try again", async () => {
    getLearned.mockRejectedValueOnce({ body: { message: "No access." } });
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
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Lunch: A fixed activity"
    );
  });

  it("groups answers with counts, who and when, and collapses a group", async () => {
    const element = await mount([
      answer("1", "kind|Lunch", "fixed"),
      answer("2", "deleted|Activity||Riflery", "deleted")
    ]);
    const heads = $$(element, '[data-id="group-toggle"]');
    // MEMO-6.8: Splits and merges shows what Shoresh already knew, with nothing learned to count.
    expect(heads.map((h) => h.textContent.trim())).toEqual([
      "Classification1",
      "Splits and merges",
      "Things you deleted1"
    ]);
    expect($(element, '[data-id="who"]').textContent).toBe(
      "Answered by Dana on 3 Jul"
    );
    heads[0].click();
    await flush();
    expect(heads[0].getAttribute("aria-expanded")).toBe("false");
    expect($$(element, '[data-id="title"]')).toHaveLength(1);
    await expect(element).toBeAccessible();
  });

  it("shows 25, then 25 more", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      answer(String(i), `kind|Item ${i}`, "activity")
    );
    const element = await mount(many);
    // The answers only: "Item 0" to "Item 29" are also one pattern, shown above them.
    const answers = '[data-row]:not([data-pattern]) [data-id="title"]';
    expect($$(element, answers)).toHaveLength(25);
    $(element, '[data-id="more"]').click();
    await flush();
    expect($$(element, answers)).toHaveLength(30);
  });

  it("searches and filters by kind only past 15 answers", async () => {
    const many = Array.from({ length: 16 }, (_, i) =>
      answer(String(i), `kind|Item ${i}`, "activity")
    );
    many.push(answer("d", "deleted|Activity||Riflery", "deleted"));
    const element = await mount(many);
    const search = $(element, '[data-id="search"]');
    search.value = "riflery";
    search.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect($$(element, '[data-id="title"]').map((n) => n.textContent)).toEqual([
      "Riflery: Activity deleted"
    ]);
    search.value = "zzz";
    search.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect($(element, '[data-id="no-matches"]').textContent).toContain(
      "Nothing matches “zzz”."
    );
    $(element, '[data-id="clear"]').click();
    await flush();
    const kind = $(element, '[data-id="kind"]');
    kind.value = "deleted";
    kind.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect($$(element, '[data-id="title"]')).toHaveLength(1);
  });

  // MEMO-6.4
  it("forgets, says so, puts the cursor on Undo, and Undo remembers it again", async () => {
    const element = await mount([
      answer("2", "deleted|Activity||Riflery", "deleted")
    ]);
    forgetLearned.mockResolvedValue(true);
    $(element, '[data-id="forget"]').click();
    await flush();
    expect(forgetLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "2"
    });
    expect($(element, '[data-id="forgotten"]').textContent).toBe(
      "It can come back next import."
    );
    expect($(element, '[data-id="flag"]').textContent).toBe("Forgotten");
    expect($(element, '[data-id="group-count"]').textContent).toBe("0");
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Forgotten. It can come back next import."
    );
    expect(element.shadowRoot.activeElement.dataset.id).toBe("undo");

    restoreLearned.mockResolvedValue(true);
    getLearned.mockResolvedValue([
      answer("2", "deleted|Activity||Riflery", "deleted")
    ]);
    $(element, '[data-id="undo"]').click();
    await flush();
    await flush();
    expect(restoreLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "2"
    });
    expect($(element, '[data-id="who"]').textContent).toBe(
      "Deleted by Dana on 3 Jul"
    );
    expect($(element, '[data-id="flag"]').textContent).toBe("Remembered again");
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Remembered again."
    );
    expect(element.shadowRoot.activeElement.dataset.id).toBe("forget");
  });

  // MEMO-6.4
  it("changes an answer to another of its choices", async () => {
    const element = await mount([answer("1", "kind|Lunch", "activity")]);
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
    getLearned.mockResolvedValue([
      {
        ...answer("7", "kind|Lunch", "fixed"),
        byYou: true,
        answeredOn: "2026-10-26"
      }
    ]);
    $(element, '[data-id="save"]').click();
    await flush();
    await flush();
    expect(changeLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "1",
      answer: "fixed"
    });
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Lunch: A fixed activity"
    );
    expect($(element, '[data-id="flag"]').textContent).toBe("Updated");
    expect($(element, '[data-id="who"]').textContent).toBe(
      "Answered by you on 26 Oct"
    );
    expect(element.shadowRoot.activeElement.dataset.id).toBe("undo-change");

    undoChangeLearned.mockResolvedValue(true);
    getLearned.mockResolvedValue([answer("1", "kind|Lunch", "activity")]);
    $(element, '[data-id="undo-change"]').click();
    await flush();
    await flush();
    expect(undoChangeLearned).toHaveBeenCalledWith({
      campId: "a00",
      newId: "7",
      oldId: "1"
    });
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Lunch: An activity"
    );
    expect($(element, '[data-id="who"]').textContent).toBe(
      "Answered by Dana on 3 Jul"
    );
    expect($(element, '[data-id="flag"]').textContent).toBe("Changed back");
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Changed back."
    );
    expect($(element, '[data-id="undo-change"]')).toBeNull();
    expect(element.shadowRoot.activeElement.dataset.id).toBe("change");
  });

  // MEMO-4.3
  it("an Undo of a Change over a newer answer shows the latest instead", async () => {
    const element = await mount([answer("1", "kind|Lunch", "activity")]);
    $(element, '[data-id="change"]').click();
    await flush();
    $$(element, '[data-id="choice"]')[0].click();
    await flush();
    changeLearned.mockResolvedValue("7");
    getLearned.mockResolvedValue([answer("7", "kind|Lunch", "fixed")]);
    $(element, '[data-id="save"]').click();
    await flush();
    await flush();
    undoChangeLearned.mockResolvedValue(false);
    getLearned.mockResolvedValue([answer("8", "kind|Lunch", "recurring")]);
    $(element, '[data-id="undo-change"]').click();
    await flush();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    );
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Lunch: A recurring activity"
    );
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
    getLearned.mockResolvedValue([
      answer("1", "tueThu|main|swim lessons", "Tuesday")
    ]);
    const element = createElement("c-shoresh-learned", { is: ShoreshLearned });
    element.campId = "a00";
    element.setup = {
      programs: [{ program: { Name: "Main" } }],
      activities: [{ Name: "Swim  Lessons" }]
    };
    document.body.appendChild(element);
    element.active = true;
    await flush();
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Swim  Lessons: Tuesday"
    );
  });

  it("offers no Change for an answer that is a name, only Forget", async () => {
    const element = await mount([answer("1", "program|Group A", "Main")]);
    expect($(element, '[data-id="change"]')).toBeNull();
    expect($(element, '[data-id="forget"]')).not.toBeNull();
  });

  it("keeps a refused Forget on the row with Try again", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockRejectedValueOnce({ body: { message: "No access." } });
    $(element, '[data-id="forget"]').click();
    await flush();
    expect($(element, '[data-id="row-error"]').textContent).toContain(
      "Couldn't save that. No access."
    );
    forgetLearned.mockResolvedValueOnce(true);
    $(element, '[data-id="retry"]').click();
    await flush();
    expect($(element, '[data-id="flag"]').textContent).toBe("Forgotten");
  });

  // MEMO-4.3
  it("an Undo that would overwrite a newer answer shows the latest instead", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockResolvedValue(true);
    $(element, '[data-id="forget"]').click();
    await flush();
    restoreLearned.mockResolvedValue(false);
    getLearned.mockResolvedValue([answer("5", "kind|Lunch", "activity")]);
    $(element, '[data-id="undo"]').click();
    await flush();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    );
    expect($(element, '[data-id="title"]').textContent).toBe(
      "Lunch: An activity"
    );
  });

  it("shows the latest when the answer was changed somewhere else", async () => {
    const element = await mount([answer("1", "kind|Lunch", "fixed")]);
    forgetLearned.mockResolvedValue(false);
    getLearned.mockResolvedValue([]);
    $(element, '[data-id="forget"]').click();
    await flush();
    await flush();
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Someone else changed this just now. Showing the latest."
    );
  });
});

describe("patterns, and what Shoresh already knew", () => {
  // Lunch 1 to 3: the numbered and the meal patterns, from two imports.
  const lunches = (extra = {}) => [
    {
      ...answer("1", "kind|Lunch 1", "recurring", "2026-07-03"),
      savedAt: "2026-07-03T12:00:00.000Z",
      byYou: true,
      ...extra
    },
    {
      ...answer("2", "kind|Lunch 2", "recurring", "2026-07-03"),
      savedAt: "2026-07-03T12:00:00.000Z"
    },
    {
      ...answer("3", "kind|Lunch 3", "recurring", "2026-07-10"),
      savedAt: "2026-07-10T12:00:00.000Z"
    }
  ];
  const patternRows = (element) =>
    $$(element, "[data-pattern]").map((li) => ({
      template: li.dataset.pattern,
      title: li.querySelector('[data-id="title"]').textContent,
      flag: li.querySelector('[data-id="flag"]').textContent,
      progress: li.querySelector('[data-id="progress"]').textContent,
      who: li.querySelector('[data-id="who"]').textContent
    }));

  // MEMO-6.8
  it("shows what Shoresh already knew apart from what it learned from you, even before any answer", async () => {
    const element = await mount([]);
    expect($(element, '[data-id="empty"]')).not.toBeNull();
    const rules = $$(element, "[data-rule]").map((li) => li.textContent.trim());
    expect(rules).toContain(
      "Every group, the same time block, every day: a fixed activity"
    );
    expect(rules).toContain(
      "Spelled with other spacing, capitals or punctuation: one name"
    );
    expect($(element, '[data-id="learned-head"]')).toBeNull();
    // The rules are no answers: nothing to change or forget, and no count.
    expect($(element, '[data-id="forget"]')).toBeNull();
    expect($(element, '[data-id="group-count"]')).toBeNull();
    await expect(element).toBeAccessible();

    document.body.removeChild(element);
    const learned = await mount([answer("1", "kind|Lunch", "fixed")]);
    const classify = $(learned, '[data-group="classify"]');
    expect(
      [...classify.querySelectorAll("h4")].map((h) => h.textContent.trim())
    ).toEqual(["Shoresh already knew", "Learned from you"]);
  });

  // MEMO-6.7
  it("shows each pattern with its progress in counts, and who answered", async () => {
    const element = await mount(lunches());
    expect(patternRows(element)).toEqual([
      {
        template: "meal",
        title: "A recurring activity: Lunch 1, Lunch 2 and Lunch 3",
        flag: "Steady: suggested every time",
        progress: "3 of 3 answers - suggested every time",
        who: "Answered by Dana and you, latest 10 Jul"
      },
      {
        template: "numbered",
        title: "A recurring activity: Lunch 1, Lunch 2 and Lunch 3",
        flag: "Steady: suggested every time",
        progress: "3 of 3 answers - suggested every time",
        who: "Answered by Dana and you, latest 10 Jul"
      }
    ]);
    expect($$(element, '[data-pattern="meal"] .dot_on')).toHaveLength(3);
    // The group counts the patterns with the answers.
    expect(
      $(element, '[data-group="classify"] [data-id="group-count"]').textContent
    ).toBe("5");
    await expect(element).toBeAccessible();
  });

  // MEMO-6.7, MEMO-4.1
  it("says what is missing, and when the latest answer disagrees", async () => {
    const one = await mount(lunches().slice(0, 2));
    expect(patternRows(one)[0].flag).toBe("Suggested");
    expect(patternRows(one)[0].progress).toBe(
      "2 of 3 answers - needs one more import"
    );
    document.body.removeChild(one);
    const followed = lunches().map((r) => ({ ...r, fromSuggestion: true }));
    const element = await mount(followed);
    expect(patternRows(element)[0].progress).toBe(
      "3 of 3 answers - needs one answer you picked yourself"
    );
    document.body.removeChild(element);
    const disagreed = await mount([
      ...lunches(),
      {
        ...answer("4", "kind|Lunch 4", "activity", "2026-07-17"),
        savedAt: "2026-07-17T12:00:00.000Z"
      }
    ]);
    expect(patternRows(disagreed)[0].flag).toBe("Still asks");
    expect(patternRows(disagreed)[0].progress).toBe(
      "Your latest answer disagrees - 2 more agreeing answers to suggest again"
    );
  });

  // MEMO-5.1
  it("a steady fixed-activity pattern says it fills in on its own, with Undo in the import", async () => {
    const fixed = lunches().map((r) => ({ ...r, answer: "fixed" }));
    const element = await mount(fixed);
    const rows = patternRows(element);
    expect(rows.map((r) => [r.flag, r.progress])).toEqual([
      [
        "Steady: fills in on its own; Undo in the import",
        "3 of 3 answers - fills in on its own"
      ],
      [
        "Steady: fills in on its own; Undo in the import",
        "3 of 3 answers - fills in on its own"
      ]
    ]);
    await expect(element).toBeAccessible();
  });

  // MEMO-4.5
  it("Forget pattern keeps its answers, with Undo", async () => {
    const element = await mount(lunches());
    forgetLearnedPattern.mockResolvedValue(["m1"]);
    $(element, '[data-pattern="numbered"] [data-id="forget"]').click();
    await flush();
    expect(forgetLearnedPattern).toHaveBeenCalledWith({
      campId: "a00",
      template: "numbered",
      antecedent: "lunch"
    });
    const row = $(element, '[data-pattern="numbered"]');
    expect(row.querySelector('[data-id="flag"]').textContent).toBe("Forgotten");
    expect(row.querySelector('[data-id="forgotten"]').textContent).toBe(
      "It won't be suggested again. Its answers stay."
    );
    expect($(element, '[data-id="said"]').textContent.trim()).toBe(
      "Forgotten. It won't be suggested again. Its answers stay."
    );
    // The answers stay listed.
    expect($$(element, "li[data-row]:not([data-pattern])")).toHaveLength(3);
    forgetLearned.mockResolvedValue(true);
    row.querySelector('[data-id="undo"]').click();
    await flush();
    await flush();
    expect(forgetLearned).toHaveBeenCalledWith({
      campId: "a00",
      answerId: "m1"
    });
    expect(
      $(element, '[data-pattern="numbered"] [data-id="flag"]').textContent
    ).toBe("Remembered again");
  });

  // MEMO-4.5
  it("Undo of a second Forget pattern brings the first one back", async () => {
    const element = await mount(lunches());
    forgetLearnedPattern.mockResolvedValue(["m2", "m1"]);
    $(element, '[data-pattern="meal"] [data-id="forget"]').click();
    await flush();
    undoChangeLearned.mockResolvedValue(true);
    $(element, '[data-pattern="meal"] [data-id="undo"]').click();
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
      {
        ...answer("m", "pattern|numbered|lunch", "forgotten", "2026-07-11"),
        savedAt: "2026-07-11T12:00:00.000Z"
      }
    ]);
    expect(
      $$(element, "[data-pattern]").map((li) => li.dataset.pattern)
    ).toEqual(["meal"]);
    expect($(element, '[data-id="count"]').textContent).toContain("3");
    expect(
      $$(element, '[data-id="title"]').map((t) => t.textContent)
    ).not.toContain("pattern, numbered, lunch: forgotten");
  });
});
