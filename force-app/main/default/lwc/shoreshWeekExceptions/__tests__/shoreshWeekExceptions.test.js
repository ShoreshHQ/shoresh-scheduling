import { createElement } from "lwc";
import ShoreshWeekExceptions from "c/shoreshWeekExceptions";
import { buildTerms } from "c/shoreshTerms";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true },
  { term: "Season", singular: "Season", plural: "Seasons", isCustom: false },
  {
    term: "WeekException",
    singular: "Week exception",
    plural: "Week exceptions",
    isCustom: false
  }
]);

const SETUP = {
  weeks: [
    { Id: "w1", Name: "Session 1" },
    { Id: "w2", Name: "Session 2" }
  ],
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Bunk 1" },
            { Id: "g2", Name: "Bunk 2" }
          ]
        }
      ]
    }
  ],
  weekExceptions: [{ Id: "x1", Group__c: "g2", Week__c: "w1" }]
};

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(setup = SETUP) {
  const element = createElement("c-shoresh-week-exceptions", {
    is: ShoreshWeekExceptions
  });
  element.terms = terms;
  element.setup = setup;
  document.body.appendChild(element);
  await flush();
  return element;
}

const box = (element, key) =>
  element.shadowRoot.querySelector(`lightning-input[data-key="${key}"]`);
const button = (element, label) =>
  [...element.shadowRoot.querySelectorAll("lightning-button")].find(
    (b) => b.label === label
  );

function tick(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new CustomEvent("change"));
}

describe("c-shoresh-week-exceptions", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows a row per group and a column per week, in the camp words", async () => {
    const element = await render();
    expect(
      element.shadowRoot.querySelectorAll('tbody th[scope="row"]').length
    ).toBe(2);
    expect(element.shadowRoot.textContent).toContain("Session 2");
    expect(element.shadowRoot.textContent).toContain("Main · Juniors");
    expect(element.shadowRoot.textContent).toContain(
      "Tick each Session a Bunk or activity does not run"
    );
    expect(box(element, "g2|w1").checked).toBe(true);
    expect(box(element, "g1|w1").checked).toBe(false);
    expect(box(element, "g1|w2").label).toBe(
      "Bunk 1 does not run in Session 2"
    );
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("asks for weeks and groups first when there are none", async () => {
    const element = await render({ ...SETUP, weeks: [] });
    expect(element.shadowRoot.textContent).toContain(
      "Add Sessions and Bunks first."
    );
  });

  it("saves new ticks and cleared ticks together", async () => {
    const element = await render();
    tick(box(element, "g1|w2"), true);
    tick(box(element, "g2|w1"), false);
    await flush();
    const handler = jest.fn();
    element.addEventListener("save", handler);
    button(element, "Save changes").click();
    const { toAdd, toRemove, onFailure } = handler.mock.calls[0][0].detail;
    expect(toAdd).toEqual([
      { sobjectType: "WeekException__c", Group__c: "g1", Week__c: "w2" }
    ]);
    expect(toRemove).toEqual(["x1"]);
    expect(typeof onFailure).toBe("function");
  });

  it("ticking and unticking again is no change", async () => {
    const element = await render();
    tick(box(element, "g1|w1"), true);
    tick(box(element, "g1|w1"), false);
    await flush();
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("cancel puts the saved ticks back", async () => {
    const element = await render();
    tick(box(element, "g2|w1"), false);
    await flush();
    button(element, "Cancel changes").click();
    await flush();
    expect(box(element, "g2|w1").checked).toBe(true);
  });

  it("keeps unsaved ticks when something else is saved, and clears them after its own save", async () => {
    const element = await render();
    tick(box(element, "g1|w2"), true);
    element.setup = { ...SETUP };
    await flush();
    expect(box(element, "g1|w2").checked).toBe(true);

    element.addEventListener("save", () => {});
    button(element, "Save changes").click();
    element.setup = {
      ...SETUP,
      weekExceptions: [
        ...SETUP.weekExceptions,
        { Id: "x2", Group__c: "g1", Week__c: "w2" }
      ]
    };
    await flush();
    expect(box(element, "g1|w2").checked).toBe(true);
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("drops unsaved ticks for a group that has since been deleted", async () => {
    const element = await render();
    tick(box(element, "g1|w2"), true);
    const withoutBunk1 = {
      ...SETUP,
      programs: [
        {
          ...SETUP.programs[0],
          divisions: [
            {
              ...SETUP.programs[0].divisions[0],
              groups: [{ Id: "g2", Name: "Bunk 2" }]
            }
          ]
        }
      ]
    };
    element.setup = withoutBunk1;
    await flush();
    expect(button(element, "Save changes").disabled).toBe(true);
  });

  it("keeps ticks when its save failed", async () => {
    const element = await render();
    tick(box(element, "g1|w2"), true);
    const handler = jest.fn();
    element.addEventListener("save", handler);
    await flush();
    button(element, "Save changes").click();
    handler.mock.calls[0][0].detail.onFailure();
    element.setup = { ...SETUP };
    await flush();
    expect(box(element, "g1|w2").checked).toBe(true);
  });

  it("clears every saved record behind a tick", async () => {
    const element = await render({
      ...SETUP,
      weekExceptions: [
        { Id: "x1", Group__c: "g2", Week__c: "w1" },
        { Id: "x9", Group__c: "g2", Week__c: "w1" }
      ]
    });
    tick(box(element, "g2|w1"), false);
    const handler = jest.fn();
    element.addEventListener("save", handler);
    await flush();
    button(element, "Save changes").click();
    expect(handler.mock.calls[0][0].detail.toRemove).toEqual(["x1", "x9"]);
  });

  it("adds activity and location rows, saving each mark on the right field", async () => {
    const element = await render({
      ...SETUP,
      activities: [{ Id: "a1", Name: "Archery" }],
      locations: [{ Id: "l1", Name: "Pool" }],
      weekExceptions: [
        ...SETUP.weekExceptions,
        { Id: "x2", Location__c: "l1", Week__c: "w2" }
      ]
    });
    expect(
      element.shadowRoot.querySelectorAll('tbody th[scope="row"]').length
    ).toBe(4);
    expect(box(element, "l1|w2").checked).toBe(true);
    expect(box(element, "l1|w1").label).toBe("Pool is closed in Session 1");
    expect(box(element, "a1|w1").label).toBe(
      "Archery does not run in Session 1"
    );

    const handler = jest.fn();
    element.addEventListener("save", handler);
    tick(box(element, "a1|w1"), true);
    tick(box(element, "l1|w2"), false);
    await flush();
    button(element, "Save changes").click();
    const { toAdd, toRemove } = handler.mock.calls[0][0].detail;
    expect(toAdd).toEqual([
      { sobjectType: "WeekException__c", Activity__c: "a1", Week__c: "w1" }
    ]);
    expect(toRemove).toEqual(["x2"]);
  });

  it("shows activities and locations even before any groups exist", async () => {
    const element = await render({
      weeks: SETUP.weeks,
      programs: [],
      activities: [{ Id: "a1", Name: "Archery" }],
      locations: [],
      weekExceptions: []
    });
    expect(box(element, "a1|w2")).not.toBeNull();
    expect(element.shadowRoot.textContent).not.toContain("first.");
  });
});
