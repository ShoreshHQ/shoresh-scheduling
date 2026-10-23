// Bring in choices, the screen (electives slice E6; docs/adr/0017): the start, the three cards,
// the refusal, a final run, and the save. Names are made up (docs/samples/choices/names.json).
import { createElement } from "lwc";
import ShoreshChoicesImport from "c/shoreshChoicesImport";
import choicesSetup from "@salesforce/apex/ChoicesImportController.choicesSetup";
import checkChoices from "@salesforce/apex/ChoicesImportController.checkChoices";
import bringInChoices from "@salesforce/apex/ChoicesImportController.bringInChoices";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/ChoicesImportController.choicesSetup",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ChoicesImportController.checkChoices",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ChoicesImportController.bringInChoices",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const SETUP = {
  season: { Id: "se1", Name: "Summer 2027", Camp__c: "ca1" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
  ],
  programs: [
    {
      program: { Id: "p1", Name: "Main" },
      timeBlocks: [],
      divisions: [
        {
          division: { Id: "d1", Name: "Juniors" },
          groups: [
            { Id: "g1", Name: "Aspen" },
            { Id: "g2", Name: "Willow" },
            { Id: "g3", Name: "Oak" }
          ]
        }
      ]
    }
  ],
  activities: [
    { Id: "a1", Name: "Archery" },
    { Id: "a2", Name: "Drama" },
    { Id: "a3", Name: "Pottery" }
  ],
  schedules: [
    {
      Id: "c1",
      Program__c: "p1",
      Week__c: "w1",
      Status__c: "Draft",
      Origin__c: "Manual"
    },
    {
      Id: "c9",
      Program__c: "p1",
      Week__c: "w1",
      Status__c: "Version",
      Origin__c: "Manual"
    }
  ],
  labels: []
};
const SITUATION = {
  sets: [{ id: "e1", name: "Chugim", activityIds: ["a1", "a2"] }],
  runs: [],
  answers: []
};
const SHEET = [
  "Camper ID,Child's name,Cabin,Chug choice 1,Chug choice 2,Comments",
  "1001,Maya Fernwood,Aspen,Archery,Drama,",
  "1002,Eli Marblecrest,Aspen,Pottery Wheel,Archery,Prefers mornings",
  '1036,Ruby Pebblestone,Pine,"Archery, Drama, Pottery",,'
].join("\n");
const SAME_NAME = [
  "Name,Cabin,#1,#2",
  "Noa Oakhollow,Willow,Drama,Pottery",
  "Noa Oakhollow,Oak,Archery,Drama"
].join("\n");
const CHECK = {
  runId: null,
  runName: null,
  runRevision: null,
  isFinal: false,
  known: 0,
  added: 3,
  handChanged: [],
  differs: [],
  renamed: [],
  notOnSheet: 0
};

function file(name, text) {
  const bytes = Buffer.from(text, "utf8");
  return {
    name,
    text: () => Promise.resolve(text),
    arrayBuffer: () =>
      Promise.resolve(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        )
      )
  };
}

const flush = () =>
  [...Array(20)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function render(situation = SITUATION) {
  choicesSetup.mockResolvedValue(situation);
  const element = createElement("c-shoresh-choices-import", {
    is: ShoreshChoicesImport
  });
  element.terms = buildTerms([
    { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
    {
      term: "ElectiveSet",
      singular: "Elective set",
      plural: "Elective sets",
      isCustom: false
    }
  ]);
  element.setup = nsRecord(SETUP);
  document.body.appendChild(element);
  await flush();
  return element;
}

async function choose(element, name, text) {
  const input = $(element, 'input[data-id="file"]');
  Object.defineProperty(input, "files", {
    value: [file(name, text)],
    configurable: true
  });
  input.dispatchEvent(new CustomEvent("change"));
  await flush();
}

async function click(element, selector) {
  $(element, selector).click();
  await flush();
}

describe("c-shoresh-choices-import", () => {
  beforeEach(() => {
    checkChoices.mockResolvedValue(CHECK);
    bringInChoices.mockResolvedValue({
      runId: "r1",
      runName: "Chugim · Week 1",
      campers: 3,
      added: 3,
      handKept: 0,
      activitiesAdded: 0
    });
  });

  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllMocks();
  });

  it("starts from the elective set and week, with the file to drop, and asks nothing about the schedule when there is one", async () => {
    const element = await render();
    expect(choicesSetup).toHaveBeenCalledWith({ seasonId: "se1" });
    expect($(element, '[data-id="set"]').value).toBe("e1");
    expect($(element, '[data-id="week"]').value).toBe("w1");
    expect($(element, '[data-id="schedule"]')).toBeNull();
    expect($(element, '[data-id="drop"]').textContent).toContain(
      "Drop the choices sheet here"
    );
    await expect(element).toBeAccessible();
  });

  it("says when there are no elective sets, or no schedule that week", async () => {
    const none = await render({ sets: [], runs: [], answers: [] });
    expect($(none, '[data-id="no-sets"]').title).toBe("No elective sets yet");
    document.body.removeChild(none);
    const element = await render();
    const week = $(element, '[data-id="week"]');
    week.dispatchEvent(new CustomEvent("change", { detail: { value: "w2" } }));
    await flush();
    expect($(element, '[data-id="no-schedule"]').title).toBe(
      "No schedule for this week yet"
    );
    expect($(element, '[data-id="drop"]')).toBeNull();
  });

  it("card 1 draws the sheet with its reading and reads two campers back; card 2 settles names; card 3 counts and brings in", async () => {
    const element = await render();
    await choose(element, "chugim-week1.csv", SHEET);

    // 1 of 3
    expect($(element, '[data-id="step"]').textContent).toBe("1 of 3");
    expect($(element, '[data-id="file-name"]').textContent).toBe(
      "chugim-week1.csv"
    );
    expect($(element, '[data-id="shape"]').textContent).toContain(
      "One ranked list"
    );
    expect($$(element, "[data-tag]").map((s) => s.textContent)).toEqual([
      "Camper #",
      "Name",
      "Bunk",
      "1st",
      "2nd",
      "Comment"
    ]);
    const readbacks = $$(element, "[data-readback]");
    expect(readbacks).toHaveLength(2);
    expect(readbacks[0].textContent).toContain("Maya Fernwood");
    expect(readbacks[1].textContent).toContain("One of their choices:");
    expect($(element, '[data-id="primary"]').textContent.trim()).toBe(
      "That's right"
    );
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-card="1"]')
    );
    await expect(element).toBeAccessible();

    // 2 of 3
    await click(element, '[data-id="primary"]');
    expect($(element, '[data-id="step"]').textContent).toBe("2 of 3");
    const row = $(element, '[data-settle="potterywheel"]');
    expect(row.textContent).toContain("Pottery Wheel");
    expect(row.querySelector(".corner")).not.toBeNull();
    expect($(element, '[data-id="primary"]').disabled).toBe(true);
    const proposal = row.querySelector('[data-answer="proposal"]');
    expect(proposal.textContent.trim()).toBe("Same as Pottery");
    expect(proposal.getAttribute("aria-pressed")).toBe("false");
    proposal.click();
    await flush();
    expect(
      $(
        element,
        '[data-settle="potterywheel"] [data-answer="proposal"]'
      ).getAttribute("aria-pressed")
    ).toBe("true");
    expect($(element, '[data-settle="potterywheel"] .corner')).toBeNull();
    expect($(element, '[data-id="primary"]').disabled).toBe(false);
    expect($(element, '[data-section="not-read"]').textContent).toContain(
      'No Bunk "Pine"'
    );
    expect($(element, '[data-section="kept"]').textContent).toContain(
      "Prefers mornings"
    );
    await expect(element).toBeAccessible();

    // 3 of 3
    await click(element, '[data-id="primary"]');
    expect(checkChoices).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(checkChoices.mock.calls[0][0].request);
    expect(sent).toMatchObject({
      seasonId: "se1",
      electiveSetId: "e1",
      weekId: "w1",
      scheduleId: "c1",
      fileName: "chugim-week1.csv",
      runRevision: null,
      remember: { "choiceName|potterywheel": "same|Pottery" }
    });
    expect(sent.campers.map((c) => [c.name, c.groupId, c.comment])).toEqual([
      ["Maya Fernwood", "g1", null],
      ["Eli Marblecrest", "g1", "Prefers mornings"],
      ["Ruby Pebblestone", null, null]
    ]);
    expect(sent.campers[1].choices[0]).toEqual({
      n: "Pottery Wheel",
      a: "a3",
      r: 1,
      k: "ranked"
    });
    expect($(element, '[data-line="count"]').textContent).toContain(
      "3 campers: 3 new, 0 already here"
    );
    expect($(element, '[data-line="offered-a3"]').textContent).toContain(
      "Pottery isn't offered in Chugim"
    );
    expect($(element, '[data-id="primary"]').textContent.trim()).toBe(
      "Bring in"
    );
    await expect(element).toBeAccessible();

    await click(element, '[data-id="primary"]');
    expect(bringInChoices).toHaveBeenCalledTimes(1);
    expect(JSON.parse(bringInChoices.mock.calls[0][0].request)).toEqual(sent);
    expect($(element, '[data-id="done"]').textContent).toBe(
      'Brought in 3 campers to "Chugim · Week 1".'
    );
    expect($(element, '[data-id="status"]').textContent).toContain(
      "Brought in 3 campers"
    );
    expect(choicesSetup).toHaveBeenCalledTimes(2);
  });

  it("Leave out and Add are answers too; a remembered answer shows as answered and marked", async () => {
    const element = await render({
      ...SITUATION,
      answers: [{ key: "choiceName|potterywheel", answer: "leave" }]
    });
    await choose(element, "chugim-week1.csv", SHEET);
    await click(element, '[data-id="primary"]');
    const row = $(element, '[data-settle="potterywheel"]');
    expect(
      row.querySelector('[data-answer="leave"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(row.querySelector('[data-id="remembered"]')).not.toBeNull();
    await click(element, '[data-settle="potterywheel"] [data-answer="add"]');
    await click(element, '[data-id="primary"]');
    const sent = JSON.parse(checkChoices.mock.calls[0][0].request);
    expect(sent.addActivities).toEqual(["Pottery Wheel"]);
    expect(sent.campers[1].choices[0]).toEqual({
      n: "Pottery Wheel",
      add: "Pottery Wheel",
      r: 1,
      k: "ranked"
    });
  });

  it("refuses a sheet with two campers it can't tell apart, naming the rows and bunks, with no Bring in", async () => {
    const element = await render();
    await choose(element, "same.csv", SAME_NAME);
    await click(element, '[data-id="primary"]');
    const apart = $(element, '[data-section="apart"]');
    expect(apart.textContent).toContain("Noa Oakhollow");
    expect(apart.textContent).toContain("Rows 2, 3");
    expect(apart.textContent).toContain("No camper number. Willow and Oak.");
    await click(element, '[data-id="primary"]');
    expect($(element, '[data-id="refusal"]').textContent).toContain(
      "This sheet can't be brought in yet"
    );
    expect($(element, '[data-id="primary"]')).toBeNull();
    expect(checkChoices).not.toHaveBeenCalled();
    await expect(element).toBeAccessible();
  });

  it("says a final run takes no new choices, with no Bring in", async () => {
    checkChoices.mockResolvedValue({
      ...CHECK,
      isFinal: true,
      runName: "Chugim · Week 1"
    });
    const element = await render();
    await choose(element, "chugim-week1.csv", SHEET);
    await click(element, '[data-id="primary"]');
    await click(element, '[data-settle="potterywheel"] [data-answer="leave"]');
    await click(element, '[data-id="primary"]');
    expect($(element, '[data-id="final"]').textContent).toContain(
      '"Chugim · Week 1" is final, so it can\'t take new choices.'
    );
    expect($(element, '[data-id="primary"]')).toBeNull();
  });

  it("Cancel brings in nothing and goes back to the file, with the cursor on Choose a file", async () => {
    const element = await render();
    await choose(element, "chugim-week1.csv", SHEET);
    await click(element, '[data-id="cancel"]');
    expect($(element, '[data-id="drop"]')).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="choose"]')
    );
    expect($(element, '[data-id="status"]').textContent).toContain(
      "Nothing was brought in."
    );
    expect(bringInChoices).not.toHaveBeenCalled();
  });

  it("says why a file isn't read, and brings nothing in", async () => {
    const element = await render();
    await choose(element, "notes.txt", "hello");
    expect($(element, '[data-id="error"]').textContent).toContain(
      "Shoresh reads Excel (.xlsx, .xls) and CSV files"
    );
    await choose(element, "empty.csv", "Name,Notes\nMaya Fernwood,hi");
    expect($(element, '[data-id="error"]').textContent).toContain(
      "no campers with choices found"
    );
  });

  it("shows the server's reason when the save is refused, and stays on the card", async () => {
    bringInChoices.mockRejectedValue({
      body: {
        message:
          "Someone else brought in choices for this run since you started."
      }
    });
    const element = await render();
    await choose(element, "chugim-week1.csv", SHEET);
    await click(element, '[data-id="primary"]');
    await click(element, '[data-settle="potterywheel"] [data-answer="leave"]');
    await click(element, '[data-id="primary"]');
    await click(element, '[data-id="primary"]');
    expect($(element, '[data-id="error"]').textContent).toContain(
      "Nothing was brought in."
    );
    expect($(element, '[data-id="error"]').textContent).toContain(
      "Someone else brought in choices"
    );
    expect($(element, '[data-id="step"]').textContent).toBe("3 of 3");
  });
});
