// Elective seats, the downloads and end-of-season Clear on the screen (electives slice E10; repo
// ADR 0018 choices 51 to 58): Download only once final, and why before; each download made and
// said; the rosters printed; Clear taking over the screen, the whole season or one week, exactly
// what it drew, refused with the reason, and Cancel. With axe. Names are made up.
import { createElement } from "lwc";
import ShoreshElectiveSeats from "c/shoreshElectiveSeats";
import seatsSetup from "@salesforce/apex/ElectiveSeatsController.seatsSetup";
import openRun from "@salesforce/apex/ElectiveSeatsController.openRun";
import runDownload from "@salesforce/apex/ElectiveSeatsController.runDownload";
import clearPicture from "@salesforce/apex/ElectiveSeatsController.clearPicture";
import clearElectives from "@salesforce/apex/ElectiveSeatsController.clearElectives";
import { downloadWorkbook } from "c/shoreshDownload";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { assignedView } from "./data/run";
import { finalDownload, finalView } from "./data/download";
import { PICTURE } from "./data/clear";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/ElectiveSeatsController.seatsSetup", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/ElectiveSeatsController.openRun", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.assignSeats",
  () => apex(),
  { virtual: true }
);
jest.mock("@salesforce/apex/ElectiveSeatsController.changeSeat", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.finalizeRun",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.startNewVersion",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.runDownload",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.clearPicture",
  () => apex(),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.clearElectives",
  () => apex(),
  { virtual: true }
);
jest.mock("c/shoreshDownload", () => ({
  ...jest.requireActual("c/shoreshDownload"),
  downloadWorkbook: jest.fn(() => Promise.resolve())
}));

const SETUP = {
  season: { Id: "se1", Name: "Summer 2027", Camp__c: "ca1" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" },
    { Id: "w3", Name: "Week 3" }
  ],
  programs: [{ program: { Id: "p1", Name: "Main" }, divisions: [] }],
  schedules: [
    {
      Id: "s1",
      Program__c: "p1",
      Week__c: "w1",
      Status__c: "Draft",
      Origin__c: "Manual"
    }
  ],
  electives: {
    sets: [{ Id: "e1", Name: "Chugim" }],
    offerings: [],
    linkedChoices: []
  },
  activities: [],
  labels: []
};

const flush = () =>
  [...Array(20)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
function text(node) {
  return node ? node.textContent.replace(/\s+/g, " ").trim() : null;
}
const pop = (element, id) => $(element, `c-shoresh-rail-pop[data-id="${id}"]`);
const choose = async (element, id, value) => {
  pop(element, id).dispatchEvent(
    new CustomEvent("select", { detail: { value } })
  );
  await flush();
};

async function render(view) {
  seatsSetup.mockResolvedValue({ runs: [view.run] });
  openRun.mockResolvedValue(view);
  const element = createElement("c-shoresh-elective-seats", {
    is: ShoreshElectiveSeats
  });
  element.terms = buildTerms([
    { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
    { term: "Seats", singular: "Seats", plural: "Seats", isCustom: false },
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

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
  jest.clearAllMocks();
});

describe("downloads come once seats are final", () => {
  it("a committed run says Download waits for Finalize, and offers Clear", async () => {
    const element = await render(assignedView());
    expect(pop(element, "download")).toBeNull();
    const state = pop(element, "state");
    const wait = state.querySelector('[data-id="download-wait"]');
    expect(wait.getAttribute("aria-label")).toBe("Download, after Finalize");
    expect(wait.getAttribute("aria-disabled")).toBe("true");
    expect(text(state.querySelector('[data-id="clear-open"]'))).toBe(
      "Clear at season end…"
    );
  });

  it("a final run's main button is Download, with the mock-up's menu", async () => {
    const element = await render(finalView());
    const menu = pop(element, "download");
    expect(menu.primary).toBe(true);
    expect(
      [...menu.querySelectorAll('[role="menuitem"]')].map(
        (r) => r.getAttribute("aria-label") || text(r)
      )
    ).toEqual([
      "Rosters",
      "Print rosters",
      "Camper schedules",
      "Full report",
      "Campers, to edit and bring back",
      "Clear at season end…"
    ]);
    await expect(element).toBeAccessible();
  });

  it.each([
    ["rosters", "Chugim Week 1 rosters.xlsx", ["Archery", "Drama", "Pottery"]],
    ["schedules", "Chugim Week 1 camper schedules.xlsx", ["Camper schedules"]],
    [
      "report",
      "Chugim Week 1 full report.xlsx",
      ["Camper schedules", "Rosters", "Exceptions", "Summary"]
    ],
    ["campers", "Chugim Week 1 campers.xlsx", ["Campers"]]
  ])(
    "%s: made from the final run, saved, and said",
    async (kind, file, names) => {
      const element = await render(finalView());
      runDownload.mockResolvedValue(finalDownload());
      await choose(element, "download", kind);
      expect(runDownload).toHaveBeenCalledWith({ runId: "r1" });
      const [, sheets, fileName] = downloadWorkbook.mock.calls[0];
      expect(fileName).toBe(file);
      expect(sheets.map((s) => s.name)).toEqual(names);
      expect(text($(element, '[data-id="status"]'))).toBe(
        `Downloaded ${file}.`
      );
      expect(element.shadowRoot.activeElement).toBe(pop(element, "download"));
    }
  );

  it("reads the run once for several downloads", async () => {
    const element = await render(finalView());
    runDownload.mockResolvedValue(finalDownload());
    await choose(element, "download", "rosters");
    await choose(element, "download", "report");
    expect(runDownload).toHaveBeenCalledTimes(1);
    expect(downloadWorkbook).toHaveBeenCalledTimes(2);
  });

  it("a refused download says why", async () => {
    const element = await render(finalView());
    runDownload.mockRejectedValue({
      body: { message: "Downloads come once seats are final. Finalize first." }
    });
    await choose(element, "download", "rosters");
    expect(text($(element, '[data-id="error"] span'))).toBe(
      "Nothing was downloaded. Downloads come once seats are final. Finalize first."
    );
    expect(downloadWorkbook).not.toHaveBeenCalled();
  });

  it("prints the rosters, one page per offering, and takes them off after", async () => {
    const element = await render(finalView());
    runDownload.mockResolvedValue(finalDownload());
    window.print = jest.fn();
    await choose(element, "download", "print");
    expect(window.print).toHaveBeenCalled();
    const printout = $(element, "c-shoresh-roster-print");
    expect(printout.pages.map((p) => p.title)).toEqual([
      "Archery",
      "Drama",
      "Pottery"
    ]);
    expect(printout.header).toBe("Chugim · Week 1 · Final 14 Oct");
    expect(printout.file).toBe("Chugim Week 1 rosters");
    window.dispatchEvent(new CustomEvent("afterprint"));
    await flush();
    expect($(element, "c-shoresh-roster-print")).toBeNull();
  });
});

describe("end-of-season Clear", () => {
  async function openClear(view = finalView()) {
    const element = await render(view);
    clearPicture.mockResolvedValue(PICTURE);
    await choose(element, "download", "clear");
    return element;
  }
  const going = (element, row) =>
    $$(element, `tr[data-row="${row}"] td`).map((td) => {
      const cell = td.querySelector(".clear-cell");
      return cell ? cell.dataset.going : "";
    });

  it("takes over the screen with the summer drawn, the whole season going", async () => {
    const element = await openClear();
    expect(clearPicture).toHaveBeenCalledWith({ seasonId: "se1" });
    expect(text($(element, '[data-id="clear-heading"]'))).toBe(
      "Clear Summer 2027"
    );
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="clear-heading"]')
    );
    // The board is gone while Clear is open.
    expect($(element, '[data-id="by-offering"]')).toBeNull();
    expect(
      $$(element, "button[data-scope]").map((b) => [
        text(b),
        b.getAttribute("aria-pressed")
      ])
    ).toEqual([
      ["Whole season · 3 weeks", "true"],
      ["Week 1", "false"]
    ]);
    expect(text($(element, '[data-id="no-undo"]'))).toBe("Can't be undone");
    expect(going(element, "campers")).toEqual(["true", "true", ""]);
    expect(
      $$(element, '[data-id="clear-total"] s').map((s) => text(s))
    ).toEqual(["52", "270", "634", "3"]);
    expect($$(element, "[data-stay]").map((s) => s.dataset.stay)).toEqual([
      "sets",
      "offerings",
      "linked"
    ]);
    await expect(element).toBeAccessible();
  });

  it("one week dashes only that week; Clear sends exactly that, with the picture's stamp", async () => {
    const element = await openClear();
    $(element, 'button[data-scope="w1"]').click();
    await flush();
    expect(going(element, "seats")).toEqual(["true", "false", ""]);
    expect(text($(element, 'tr[data-row="campers"] .clear-stay'))).toBe("40");
    clearElectives.mockResolvedValue({ runs: 2, campers: 4, picture: PICTURE });
    seatsSetup.mockResolvedValue({ runs: [] });
    $(element, '[data-id="clear-go"]').click();
    await flush();
    expect(JSON.parse(clearElectives.mock.calls[0][0].request)).toEqual({
      seasonId: "se1",
      weekId: "w1",
      stamp: "abc"
    });
    expect(text($(element, '[data-id="status"]'))).toBe(
      "Cleared: 2 runs, 4 campers."
    );
    // Back on the seats screen, read again: this week has nothing now.
    expect($(element, '[data-id="clear-heading"]')).toBeNull();
    expect(seatsSetup).toHaveBeenCalledTimes(2);
    expect($(element, '[data-id="no-run"]')).not.toBeNull();
  });

  it("refused, it says why and draws the season again as it now is", async () => {
    const element = await openClear();
    clearElectives.mockRejectedValue({
      body: {
        message:
          '"Chugim · Week 2" is still being worked on. Finalize first, then clear.'
      }
    });
    $(element, '[data-id="clear-go"]').click();
    await flush();
    expect(text($(element, '[data-id="clear-error"]'))).toBe(
      'Nothing was cleared. "Chugim · Week 2" is still being worked on. Finalize first, then clear.'
    );
    expect(clearPicture).toHaveBeenCalledTimes(2);
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="clear-go"]')
    );
  });

  it("a week with nothing can't be cleared", async () => {
    const view = finalView();
    const element = await render(view);
    clearPicture.mockResolvedValue({
      ...PICTURE,
      campers: 0,
      weeks: PICTURE.weeks.map((w) => ({
        ...w,
        campers: 0,
        campersOnlyHere: 0,
        choices: 0,
        seats: 0,
        runs: 0,
        working: []
      }))
    });
    await choose(element, "download", "clear");
    expect($(element, '[data-id="clear-go"]').disabled).toBe(true);
  });

  it("Cancel, or Escape, goes back with nothing cleared, the cursor on the menu it came from", async () => {
    const element = await openClear();
    $(element, '[data-id="clear-cancel"]').click();
    await flush();
    expect($(element, '[data-id="clear-heading"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(pop(element, "download"));
    clearPicture.mockResolvedValue(PICTURE);
    await choose(element, "download", "clear");
    $(element, '[data-id="clear-body"], [data-id="clear"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect($(element, '[data-id="clear-heading"]')).toBeNull();
    expect(clearElectives).not.toHaveBeenCalled();
  });

  it("opens from a committed run's menu too", async () => {
    const element = await render(assignedView());
    clearPicture.mockResolvedValue(PICTURE);
    await choose(element, "state", "clear");
    expect(text($(element, '[data-id="clear-heading"]'))).toBe(
      "Clear Summer 2027"
    );
    $(element, '[data-id="clear-cancel"]').click();
    await flush();
    expect(element.shadowRoot.activeElement).toBe(pop(element, "state"));
  });
});
