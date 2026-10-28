import { createElement } from "lwc";
import ShoreshLearned from "c/shoreshLearned";
import getLearned from "@salesforce/apex/LearnedController.getLearned";
import changeLearned from "@salesforce/apex/LearnedController.changeLearned";
import forgetLearned from "@salesforce/apex/LearnedController.forgetLearned";
import restoreLearned from "@salesforce/apex/LearnedController.restoreLearned";
import undoChangeLearned from "@salesforce/apex/LearnedController.undoChangeLearned";

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
    expect(heads.map((h) => h.textContent.trim())).toEqual([
      "Classification1",
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
    expect($$(element, '[data-id="title"]')).toHaveLength(25);
    $(element, '[data-id="more"]').click();
    await flush();
    expect($$(element, '[data-id="title"]')).toHaveLength(30);
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
