import { createElement } from "lwc";
import ShoreshProgram from "c/shoreshProgram";
import { buildTerms } from "c/shoreshTerms";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  { term: "Division", singular: "Unit", plural: "Units", isCustom: true },
  {
    term: "TimeBlock",
    singular: "Time block",
    plural: "Time blocks",
    isCustom: false
  },
  { term: "Program", singular: "Program", plural: "Programs", isCustom: false },
  {
    term: "Availability",
    singular: "Availability",
    plural: "Availability",
    isCustom: false
  }
]);

const ENTRY = {
  program: {
    Id: "p1",
    Name: "Main",
    Monday__c: true,
    Tuesday__c: true,
    Wednesday__c: true,
    Thursday__c: true,
    Friday__c: false
  },
  timeBlocks: [
    {
      Id: "t1",
      Name: "Period 1",
      StartTime__c: 32400000,
      EndTime__c: 35100000,
      PartOfDay__c: "Morning"
    }
  ],
  divisions: [
    {
      division: { Id: "d1", Name: "Juniors" },
      groups: [{ Id: "g1", Name: "Bunk 1", Availability__c: "AllDay" }]
    }
  ]
};

const flush = () => Promise.resolve();

async function render(show = "program", entry = ENTRY) {
  const element = createElement("c-shoresh-program", { is: ShoreshProgram });
  element.entry = entry;
  element.terms = terms;
  element.show = show;
  element.weeks = [{ Id: "w1", Name: "Week 1" }];
  element.weekExceptions = [{ Id: "x1", Week__c: "w1", Group__c: "g1" }];
  document.body.appendChild(element);
  await flush();
  return element;
}

describe("c-shoresh-program", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows only the part its screen asks for, in the camp words", async () => {
    const titlesFor = async (show) => {
      const element = await render(show);
      const titles = [
        ...element.shadowRoot.querySelectorAll("c-shoresh-editable-table")
      ].map((t) => t.title);
      const hasForm = !!element.shadowRoot.querySelector(
        'lightning-input[data-id="name"]'
      );
      document.body.removeChild(element);
      return { titles, hasForm };
    };
    expect(await titlesFor("program")).toEqual({ titles: [], hasForm: true });
    expect(await titlesFor("timeBlocks")).toEqual({
      titles: ["Time blocks in Main"],
      hasForm: false
    });
    expect(await titlesFor("divisions")).toEqual({
      titles: ["Units in Main"],
      hasForm: false
    });
    expect(await titlesFor("groups")).toEqual({
      titles: ["Bunks in Juniors"],
      hasForm: false
    });
  });

  it("gives each division's groups their Runs in weeks", async () => {
    const element = await render("groups");
    const groups = element.shadowRoot.querySelector("c-shoresh-editable-table");
    expect(groups.addLabel).toBe("Add Bunk");
    expect(groups.newRowDefaults).toEqual({
      Division__c: "d1",
      Availability__c: "AllDay"
    });
    expect(groups.rows).toEqual(ENTRY.divisions[0].groups);
    expect(groups.weeksHeading).toBe("Runs in");
    expect(groups.weeks).toEqual([{ Id: "w1", Name: "Week 1" }]);
    expect(groups.weekExceptions).toEqual([
      { Id: "x1", Week__c: "w1", Group__c: "g1" }
    ]);
  });

  it("asks for divisions before groups", async () => {
    const element = await render("groups", { ...ENTRY, divisions: [] });
    expect(element.shadowRoot.querySelector("c-shoresh-editable-table")).toBe(
      null
    );
    expect(element.shadowRoot.querySelector("p").textContent).toBe(
      "Main has no Units yet. Add them under Units first."
    );
  });

  it("shows the operating days and saves a change to them", async () => {
    const element = await render();
    const friday = element.shadowRoot.querySelector(
      'lightning-input[data-day="Friday"]'
    );
    expect(friday.checked).toBe(false);
    const handler = jest.fn();
    element.addEventListener("save", handler);

    friday.checked = true;
    friday.dispatchEvent(new CustomEvent("change"));
    await flush();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.reportValidity = () => true;
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save")
      .click();

    expect(handler.mock.calls[0][0].detail.records).toEqual([
      {
        sobjectType: "Program__c",
        Id: "p1",
        Name: "Main",
        Monday__c: true,
        Tuesday__c: true,
        Wednesday__c: true,
        Thursday__c: true,
        Friday__c: true
      }
    ]);
  });

  it("passes saves and deletes from its tables up to the screen", async () => {
    const element = await render("timeBlocks");
    const saves = jest.fn();
    const deletes = jest.fn();
    element.addEventListener("save", saves);
    element.addEventListener("delete", deletes);
    const table = element.shadowRoot.querySelector("c-shoresh-editable-table");
    table.dispatchEvent(
      new CustomEvent("save", { detail: { records: [{ Id: "t1" }] } })
    );
    table.dispatchEvent(
      new CustomEvent("delete", {
        detail: { recordId: "t1", name: "Period 1" }
      })
    );
    expect(saves.mock.calls[0][0].detail).toEqual({ records: [{ Id: "t1" }] });
    expect(deletes.mock.calls[0][0].detail).toEqual({
      recordId: "t1",
      name: "Period 1"
    });
  });

  it("asks to delete the whole program", async () => {
    const element = await render();
    const deletes = jest.fn();
    element.addEventListener("delete", deletes);
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Delete this program")
      .click();
    expect(deletes.mock.calls[0][0].detail).toEqual({
      recordId: "p1",
      name: "Main"
    });
  });

  it("keeps a typed but unsaved name when something else is saved", async () => {
    const element = await render();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Typed" } })
    );
    element.entry = { ...ENTRY, timeBlocks: [] };
    await flush();
    expect(
      element.shadowRoot.querySelector('lightning-input[data-id="name"]').value
    ).toBe("Typed");
  });

  it("after its own save, shows the saved name", async () => {
    const element = await render();
    const name = element.shadowRoot.querySelector(
      'lightning-input[data-id="name"]'
    );
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Typed" } })
    );
    name.reportValidity = () => true;
    await flush();
    [...element.shadowRoot.querySelectorAll("lightning-button")]
      .find((b) => b.label === "Save")
      .click();
    element.entry = { ...ENTRY, program: { ...ENTRY.program, Name: "Saved" } };
    await flush();
    expect(
      element.shadowRoot.querySelector('lightning-input[data-id="name"]').value
    ).toBe("Saved");
  });
});
