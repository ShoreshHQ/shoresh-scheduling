// Elective seats, the screen (electives slice E7; repo ADR 0018 choices 28 to 37): the start, both
// views, the roster beside with its padlock and Move to, Assign seats, Finalize and its refusal,
// Final and Out of date, Start a new version, the counter's problems, and axe. Names are made up.
import { createElement } from "lwc";
import ShoreshElectiveSeats from "c/shoreshElectiveSeats";
import seatsSetup from "@salesforce/apex/ElectiveSeatsController.seatsSetup";
import openRun from "@salesforce/apex/ElectiveSeatsController.openRun";
import assignSeats from "@salesforce/apex/ElectiveSeatsController.assignSeats";
import changeSeat from "@salesforce/apex/ElectiveSeatsController.changeSeat";
import finalizeRun from "@salesforce/apex/ElectiveSeatsController.finalizeRun";
import startNewVersion from "@salesforce/apex/ElectiveSeatsController.startNewVersion";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
import { MONDAY, TUESDAY, assignedView, runView, seat } from "./data/run";

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
  {
    virtual: true
  }
);
jest.mock("@salesforce/apex/ElectiveSeatsController.changeSeat", () => apex(), {
  virtual: true
});
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.finalizeRun",
  () => apex(),
  {
    virtual: true
  }
);
jest.mock(
  "@salesforce/apex/ElectiveSeatsController.startNewVersion",
  () => apex(),
  { virtual: true }
);

const SETUP = {
  season: { Id: "se1", Name: "Summer 2027", Camp__c: "ca1" },
  weeks: [
    { Id: "w1", Name: "Week 1" },
    { Id: "w2", Name: "Week 2" }
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
  labels: []
};
const RUN_INFO = runView().run;
const SITUATION = { runs: [RUN_INFO] };

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

async function render({
  situation = SITUATION,
  view = runView(),
  setup = SETUP,
  words = [],
  opening = null
} = {}) {
  seatsSetup.mockResolvedValue(situation);
  openRun.mockResolvedValue(view);
  const element = createElement("c-shoresh-elective-seats", {
    is: ShoreshElectiveSeats
  });
  element.terms = buildTerms([
    { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
    {
      term: "ElectiveSet",
      singular: "Elective set",
      plural: "Elective sets",
      isCustom: false
    },
    ...words
  ]);
  element.opening = opening;
  element.setup = nsRecord(setup);
  document.body.appendChild(element);
  await flush();
  return element;
}

/** The rail-pop's button, its rows, and opening it. */
const popButton = (element, id) =>
  $(element, `c-shoresh-rail-pop[data-id="${id}"]`).shadowRoot.querySelector(
    '[data-id="button"]'
  );

afterEach(() => {
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
  jest.clearAllMocks();
});

describe("the start", () => {
  it("‹ Roots leads the rail and says back to Roots to the page (decision 68)", async () => {
    const element = await render();
    const back = $(element, "c-shoresh-roots-back");
    expect(back.parentElement.firstElementChild).toBe(back);
    expect(back.nextElementSibling.dataset.id).toBe("week");
    expect(back.shadowRoot.querySelector(".shoresh-rail-line")).not.toBeNull();
    const heard = jest.fn();
    element.addEventListener("backtoroots", heard);
    back.shadowRoot.querySelector('[data-id="back"]').click();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("opens the latest run of the week and set, with Assign seats as the main button", async () => {
    const element = await render();
    expect(seatsSetup).toHaveBeenCalledWith({ seasonId: "se1" });
    expect(openRun).toHaveBeenCalledWith({ runId: "r1" });
    expect($(element, 'c-shoresh-rail-picker[data-id="week"]').value).toBe(
      "w1"
    );
    expect($(element, 'c-shoresh-rail-picker[data-id="set"]').value).toBe("e1");
    // One schedule this week: nothing asked.
    expect($(element, 'c-shoresh-rail-picker[data-id="schedule"]')).toBeNull();
    expect(text($(element, '[data-id="primary"]'))).toBe("Assign seats");
    // No seats yet: no counter, no Assign again.
    expect($(element, '[data-id="counter"]')).toBeNull();
    expect($(element, '[data-id="assign-again"]')).toBeNull();
    expect(text($(element, '[data-id="bring-in"]'))).toBe("Bring in choices");
    await expect(element).toBeAccessible();
  });

  it("opens on the run Roots' hand is about: its set and week (repo ADR 0020 choice 10)", async () => {
    const element = await render();
    expect(element.openWeek("w2", "e1")).toBe(true);
    await flush();
    expect($(element, 'c-shoresh-rail-picker[data-id="week"]').value).toBe(
      "w2"
    );
    // A week it doesn't know leaves it where it is.
    expect(element.openWeek("nope", "e1")).toBe(true);
    await flush();
    expect($(element, 'c-shoresh-rail-picker[data-id="week"]').value).toBe(
      "w2"
    );
  });

  it("drawn fresh from Roots' hand, starts on the week it was opened on, not the latest run's", async () => {
    const element = await render({ opening: { weekId: "w2", setId: "e1" } });
    expect($(element, 'c-shoresh-rail-picker[data-id="week"]').value).toBe(
      "w2"
    );
    expect($(element, 'c-shoresh-rail-picker[data-id="set"]').value).toBe("e1");
  });

  describe("the run Roots' hand counted (repo ADR 0020 choice 10)", () => {
    // Week 1 has two schedules; on s1, run A is committed and the later run B not (Final); on s2,
    // run C is the latest of all.
    const TWO = {
      ...SETUP,
      schedules: [
        ...SETUP.schedules,
        {
          Id: "s2",
          Program__c: "p1",
          Week__c: "w1",
          Status__c: "Draft",
          Origin__c: "Generated"
        }
      ]
    };
    const A = { ...RUN_INFO, id: "rA", scheduleId: "s1", status: "Committed" };
    const B = { ...RUN_INFO, id: "rB", scheduleId: "s1", status: "Final" };
    const C = { ...RUN_INFO, id: "rC", scheduleId: "s2", status: "Final" };
    const situation = { runs: [A, B, C] };
    const shown = (element) =>
      $(element, 'c-shoresh-rail-picker[data-id="schedule"]').value;
    const opened = () => openRun.mock.calls.map((c) => c[0].runId);

    it("on its own, opens the latest run's schedule, its committed run first", async () => {
      const element = await render({ setup: TWO, situation });
      expect(shown(element)).toBe("s2");
      expect(opened()).toEqual(["rC"]);
      // On s1, the committed run, not the later one.
      openRun.mockClear();
      $(element, 'c-shoresh-rail-picker[data-id="schedule"]').dispatchEvent(
        new CustomEvent("change", { detail: { value: "s1" } })
      );
      await flush();
      expect(opened()).toEqual(["rA"]);
    });

    it("drawn fresh, opens on the exact run asked for", async () => {
      const element = await render({
        setup: TWO,
        situation,
        opening: { weekId: "w1", setId: "e1", scheduleId: "s1", runId: "rB" }
      });
      expect(shown(element)).toBe("s1");
      expect(opened()).toEqual(["rB"]);
    });

    it("already open, moves to the exact run asked for", async () => {
      const element = await render({ setup: TWO, situation });
      openRun.mockClear();
      expect(element.openWeek("w1", "e1", "s1", "rA")).toBe(true);
      await flush();
      expect(shown(element)).toBe("s1");
      expect(opened()).toEqual(["rA"]);
    });

    it("when that run is gone, opens the set and week as before", async () => {
      const element = await render({
        setup: TWO,
        situation,
        opening: { weekId: "w1", setId: "e1", scheduleId: "s1", runId: "gone" }
      });
      expect(shown(element)).toBe("s2");
      expect(opened()).toEqual(["rC"]);
    });
  });

  it("asks Assign against when the week has two schedules", async () => {
    const element = await render({
      setup: {
        ...SETUP,
        schedules: [
          ...SETUP.schedules,
          {
            Id: "s2",
            Program__c: "p1",
            Week__c: "w1",
            Status__c: "Draft",
            Origin__c: "Generated"
          }
        ]
      }
    });
    const picker = $(element, 'c-shoresh-rail-picker[data-id="schedule"]');
    expect(picker.label).toBe("Assign against");
    expect(picker.options.map((o) => o.label)).toEqual([
      "Manual Build",
      "Generated Schedule"
    ]);
    expect(picker.value).toBe("s1");
  });

  it("says when no choices are in yet, and when there is no elective set", async () => {
    let element = await render({ situation: { runs: [] } });
    expect($(element, '[data-id="no-run"]').title).toBe(
      "No choices brought in for Chugim in Week 1 yet."
    );
    expect($(element, '[data-id="primary"]')).toBeNull();
    document.body.removeChild(element);
    element = await render({
      situation: { runs: [] },
      setup: { ...SETUP, electives: { sets: [] } }
    });
    expect($(element, '[data-id="no-sets"]').title).toBe(
      "No elective sets yet. Make one on Electives first."
    );
  });

  it("says electives in the camp's word: Chug seats, Chugim (wiki decision 66)", async () => {
    const words = [
      { term: "Elective", singular: "Chug", plural: "Chugim", isCustom: true }
    ];
    let element = await render({
      situation: { runs: [] },
      setup: { ...SETUP, electives: { sets: [] } },
      words
    });
    expect(text($(element, "[data-heading]"))).toBe("Chug seats");
    expect($(element, '[data-id="no-sets"]').title).toBe(
      "No elective sets yet. Make one on Chugim first."
    );
    document.body.removeChild(element);
    seatsSetup.mockRejectedValue({ body: { message: "Gone." } });
    element = createElement("c-shoresh-elective-seats", {
      is: ShoreshElectiveSeats
    });
    element.terms = buildTerms(words);
    element.setup = nsRecord(SETUP);
    document.body.appendChild(element);
    await flush();
    expect(text(element.shadowRoot.firstChild.parentNode)).toContain(
      "Couldn't open Chug seats."
    );
  });

  it("Bring in choices opens that screen, for the set, week and schedule on screen", async () => {
    const element = await render();
    const go = jest.fn();
    element.addEventListener("navigate", go);
    $(element, '[data-id="bring-in"]').click();
    const detail = go.mock.calls[0][0].detail;
    expect(detail.screen).toBe("bringInChoices");
    expect(detail.choices).toEqual({
      setId: $(element, '[data-id="set"]').value,
      weekId: $(element, '[data-id="week"]').value,
      scheduleId: expect.any(String)
    });
    expect(detail.choices.weekId).toBeTruthy();
    expect(detail.choices.setId).toBeTruthy();
  });
});

describe("By offering", () => {
  it("draws each offering's count at each time, the dots, and Dropped with what it had", async () => {
    const element = await render({
      view: assignedView({
        dropped: JSON.stringify([{ t: `${MONDAY}|b1|d1`, a: "a3", h: 2, m: 3 }])
      })
    });
    expect($$(element, ".time-head").map(text)).toEqual([
      "Mon 12:30",
      "Tue 12:30"
    ]);
    expect($$(element, ".offer-name").map(text)).toEqual([
      "Archery",
      "Drama",
      "Pottery"
    ]);
    const archery = $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]');
    expect(text(archery)).toBe("2 of 2");
    expect(archery.getAttribute("aria-label")).toBe(
      "Archery, Monday 12:30: 2 of 2"
    );
    expect(archery.querySelectorAll(".dot_on")).toHaveLength(2);
    const dropped = $(element, 'button[data-cell="2027-07-05|b1|d1|o3"]');
    expect(text(dropped)).toBe("Dropped had 2 of 3");
    expect(dropped.querySelector(".shoresh-look-mark")).not.toBeNull();
    await expect(element).toBeAccessible();
  });

  it("opens a cell's roster beside, with the cursor on its heading, and Close goes back", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
    await flush();
    const roster = $(element, '[data-id="roster"]');
    expect(text($(element, '[data-id="roster-heading"]'))).toBe(
      "Archery · Mon 12:30"
    );
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="roster-heading"]')
    );
    expect($$(element, ".person-name").map(text)).toEqual([
      "Ari Brookfield",
      "Maya Fernwood"
    ]);
    expect($$(element, ".person-group").map(text)).toEqual(["Aspen", "Aspen"]);
    expect(text($(element, '[data-id="free"]'))).toBe("0 seats free");
    // Ari's seat is locked: the padlock is pressed.
    const locks = $$(element, ".lock-button");
    expect(locks.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false"
    ]);
    expect(locks[0].getAttribute("aria-label")).toBe("Unlock Ari Brookfield");
    await expect(element).toBeAccessible();
    expect(roster).not.toBeNull();
    $(element, '[data-id="roster-close"]').click();
    await flush();
    expect($(element, '[data-id="roster"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]')
    );
  });

  it("the padlock locks a seat as it is", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
    await flush();
    changeSeat.mockResolvedValue(assignedView({ revision: 3 }));
    $$(element, ".lock-button")[1].click();
    await flush();
    expect(JSON.parse(changeSeat.mock.calls[0][0].request)).toEqual({
      runId: "r1",
      revision: 2,
      camperId: "c1",
      day: MONDAY,
      blockId: "b1",
      locked: true
    });
    expect(text($(element, '[data-id="status"]'))).toBe(
      "Locked Maya Fernwood."
    );
  });

  it("Move to… moves a camper to another offering then (a hand move, locked)", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
    await flush();
    const move = $$(element, "c-shoresh-rail-pop.move")[1];
    expect(move.alternativeText).toBe("Move Maya Fernwood to…");
    expect([...move.querySelectorAll("[data-value]")].map(text)).toEqual([
      "Drama",
      "Pottery"
    ]);
    changeSeat.mockResolvedValue(assignedView({ revision: 3 }));
    move.dispatchEvent(new CustomEvent("select", { detail: { value: "o2" } }));
    await flush();
    expect(JSON.parse(changeSeat.mock.calls[0][0].request)).toMatchObject({
      camperId: "c1",
      offeringId: "o2",
      day: MONDAY
    });
    expect(text($(element, '[data-id="status"]'))).toBe(
      "Moved Maya Fernwood to Drama, locked."
    );
  });

  it("a refused change is said, and nothing else changes", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
    await flush();
    changeSeat.mockRejectedValue({
      body: {
        message:
          "Someone else changed these seats since you opened them. Reload the page to see them."
      }
    });
    $$(element, ".lock-button")[0].click();
    await flush();
    expect(text($(element, '[data-id="error"]'))).toBe(
      "That seat wasn't changed. Someone else changed these seats since you opened them. Reload the page to see them."
    );
  });
  describe("a refused change keeps the cursor on what asked, never the page", () => {
    const refuse = () =>
      changeSeat.mockRejectedValue({
        body: {
          message: "Someone else changed these seats since you opened them."
        }
      });
    const openArchery = async (element) => {
      $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
      await flush();
    };

    it("the padlock", async () => {
      const element = await render({ view: assignedView() });
      await openArchery(element);
      refuse();
      $$(element, ".lock-button")[1].click();
      await flush();
      expect(element.shadowRoot.activeElement).toBe(
        $(element, '.lock-button[data-camper="c1"]')
      );
    });

    it("Move to…", async () => {
      const element = await render({ view: assignedView() });
      await openArchery(element);
      refuse();
      const move = $$(element, "c-shoresh-rail-pop.move")[1];
      move.dispatchEvent(
        new CustomEvent("select", { detail: { value: "o2" } })
      );
      await flush();
      expect(element.shadowRoot.activeElement).toBe(move);
    });

    it("a dragged name: the roster heading", async () => {
      const element = await render({ view: assignedView() });
      await openArchery(element);
      refuse();
      const dataTransfer = {
        setData: jest.fn(),
        effectAllowed: "",
        dropEffect: ""
      };
      const start = new CustomEvent("dragstart");
      start.dataTransfer = dataTransfer;
      $(element, 'li.person[data-camper="c1"]').dispatchEvent(start);
      const drop = new CustomEvent("drop", { cancelable: true });
      drop.dataTransfer = dataTransfer;
      $(element, 'td[data-cell="2027-07-05|b1|d1|o2"]').dispatchEvent(drop);
      await flush();
      expect(changeSeat).toHaveBeenCalled();
      expect(element.shadowRoot.activeElement).toBe(
        $(element, '[data-id="roster-heading"]')
      );
    });

    it("Unlock on a lock that no longer applies", async () => {
      const base = assignedView().seats.filter((s) => s.day === MONDAY);
      const c3 = seat("x9", "c3", TUESDAY, "o4", { locked: true });
      const c4 = seat("x10", "c4", TUESDAY, "o4", { locked: true });
      const element = await render({
        view: assignedView({ seats: [...base, c3, c4] })
      });
      refuse();
      $$(element, '[data-id="stray"] button')[1].click();
      await flush();
      expect(element.shadowRoot.activeElement).toBe(
        $(element, '[data-id="stray"] button[data-seat="x10"]')
      );
    });
  });

  it("Unlock on a lock that no longer applies keeps the cursor: the next notice, then the main button", async () => {
    const base = assignedView().seats.filter((s) => s.day === MONDAY);
    // Ceramics is not confirmed: both locks no longer apply.
    const c3 = seat("x9", "c3", TUESDAY, "o4", { locked: true });
    const c4 = seat("x10", "c4", TUESDAY, "o4", { locked: true });
    const element = await render({
      view: assignedView({ seats: [...base, c3, c4] })
    });
    expect($$(element, '[data-id="stray"]')).toHaveLength(2);
    changeSeat.mockResolvedValue(
      assignedView({ revision: 3, seats: [...base, c4] })
    );
    $(element, '[data-id="stray"] button').click();
    await flush();
    expect($$(element, '[data-id="stray"]')).toHaveLength(1);
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="stray"] button')
    );
    changeSeat.mockResolvedValue(assignedView({ revision: 4, seats: base }));
    $(element, '[data-id="stray"] button').click();
    await flush();
    expect($(element, '[data-id="stray"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="primary"]')
    );
  });
});

describe("By camper", () => {
  it("lists each bunk's campers with their offering and how it ranked, then No Bunk, marked", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-view="camper"]').click();
    await flush();
    expect(
      $(element, 'button[data-view="camper"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      $$(element, ".section-head").map((h) => [
        text(h.querySelector("span")),
        text(h.querySelector(".section-count"))
      ])
    ).toEqual([
      ["Aspen", "2"],
      ["Willow", "1"],
      ["No Bunk", "1"]
    ]);
    const rows = $$(element, ".camper-row");
    expect(text(rows[0].querySelector(".camper-name"))).toBe("Ari Brookfield");
    const ari = [...rows[0].querySelectorAll("td")];
    expect(ari.map(text)).toEqual(["Archery", "Pottery · 2nd"]);
    // His Monday seat is locked: the padlock in the cell's bottom-right.
    expect(ari[0].querySelector(".cell-lock c-shoresh-lock").label).toBe(
      "Locked"
    );
    expect(ari[1].querySelector(".cell-lock")).toBeNull();
    // Bea has no seat on Tuesday: an empty slot with the corner.
    const bea = [...rows[3].querySelectorAll("td")];
    expect(bea[1].querySelector(".empty-slot")).not.toBeNull();
    expect(bea[1].querySelector(".shoresh-look-mark")).not.toBeNull();
    expect(
      $(element, '[data-id="no-bunk"]').querySelector(".shoresh-look-mark")
    ).not.toBeNull();
    await expect(element).toBeAccessible();
  });

  it("opens a parent's comment from its speech bubble, and Escape closes it", async () => {
    const element = await render({ view: assignedView() });
    $(element, 'button[data-view="camper"]').click();
    await flush();
    const bubble = $(element, ".comment-button");
    expect(bubble.getAttribute("aria-label")).toBe(
      "From the sheet, for Ari Brookfield"
    );
    bubble.click();
    await flush();
    expect(text($(element, ".comment-head"))).toBe("From the sheet");
    expect(text($(element, ".comment-text"))).toBe(
      "Ari would love to be with his cousin for at least one chug."
    );
    expect($(element, ".comment-button").getAttribute("aria-expanded")).toBe(
      "true"
    );
    $(element, ".comment-button").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" })
    );
    await flush();
    expect($(element, '[data-id="comment"]')).toBeNull();
  });
});

describe("Assign seats", () => {
  it("works the seats out here and sends them; the counter then shows how it went", async () => {
    const element = await render();
    assignSeats.mockResolvedValue(assignedView());
    $(element, '[data-id="primary"]').click();
    await flush();
    const sent = JSON.parse(assignSeats.mock.calls[0][0].request);
    expect(sent.runId).toBe("r1");
    expect(sent.revision).toBe(1);
    expect(sent.seats.length).toBeGreaterThan(0);
    sent.seats.forEach((s) =>
      expect(["o1", "o2", "o3"]).toContain(s.offeringId)
    );
    expect(text($(element, '[data-id="status"]'))).toBe(
      "Seats assigned: 3 of 4 placed."
    );
    // Now: the counter, Assign again beside the main button, and Finalize.
    const counter = $(element, 'c-shoresh-rail-pop[data-id="counter"]');
    expect([counter.count, counter.label]).toEqual(["3", "of 4 placed"]);
    expect(text($(element, '[data-id="assign-again"]'))).toBe("Assign again");
    expect(text($(element, '[data-id="primary"]'))).toBe("Finalize");
    // The main button was held while saving: the cursor is back on it, not lost.
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="primary"]')
    );
  });

  it("Assign again puts the cursor back on Assign again once saved", async () => {
    const element = await render({ view: assignedView() });
    assignSeats.mockResolvedValue(assignedView({ revision: 3 }));
    $(element, '[data-id="assign-again"]').click();
    await flush();
    expect(assignSeats).toHaveBeenCalled();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="assign-again"]')
    );
  });

  it("stops before sending when an offering's seats aren't filled in", async () => {
    const view = runView();
    view.offerings = view.offerings.map((o) => ({
      ...o,
      seats: o.id === "o1" ? null : o.seats
    }));
    const element = await render({ view });
    $(element, '[data-id="primary"]').click();
    await flush();
    expect(assignSeats).not.toHaveBeenCalled();
    expect(text($(element, '[data-id="error"]'))).toBe(
      "Fill blank capacities first: Archery."
    );
  });

  it("the counter opens to the problems, and a camper who couldn't be placed leads to their row", async () => {
    const element = await render({ view: assignedView() });
    const counter = $(element, 'c-shoresh-rail-pop[data-id="counter"]');
    expect(counter.mark).toBe(true);
    expect(
      [...counter.querySelectorAll(".shoresh-pop-head")].map(text)
    ).toEqual([
      "1 couldn't be placed",
      "1 kept below minimum",
      "3 not their first choice",
      "Also"
    ]);
    counter.querySelector('[data-key="u|c4|2027-07-06|b1|d1"]').click();
    await flush();
    expect(
      $(element, 'button[data-view="camper"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-camper-row="c4"]')
    );
  });
});

describe("Finalize, Final, and a new version", () => {
  it("finalizes; the run then reads Final with when and by whom, and the main button is Download", async () => {
    const element = await render({ view: assignedView() });
    finalizeRun.mockResolvedValue(
      assignedView({
        revision: 3,
        run: {
          ...RUN_INFO,
          status: "Final",
          finalizedAt: "2027-10-14T15:00:00.000Z",
          finalizedBy: "Greg Feitel"
        }
      })
    );
    $(element, '[data-id="primary"]').click();
    await flush();
    expect(finalizeRun).toHaveBeenCalledWith({ runId: "r1", revision: 2 });
    expect(
      popButton(element, "state").textContent.replace(/\s+/g, " ").trim()
    ).toBe("Final · 14 Oct · Greg");
    expect($(element, '[data-id="primary"]')).toBeNull();
    expect(text(popButton(element, "download"))).toBe("Download");
    expect($(element, '[data-id="assign-again"]')).toBeNull();
    expect($(element, '[data-id="bring-in"]')).toBeNull();
    // The main button is now Download: the cursor goes to it, not lost.
    expect(element.shadowRoot.activeElement).toBe(
      $(element, 'c-shoresh-rail-pop[data-id="download"]')
    );
    // A final run's roster can be read, not changed.
    $(element, 'button[data-cell="2027-07-05|b1|d1|o1"]').click();
    await flush();
    expect($(element, ".lock-button")).toBeNull();
    expect($(element, "c-shoresh-rail-pop.move")).toBeNull();
  });

  it("a refused Finalize says why, with Assign again in place", async () => {
    const element = await render({
      view: assignedView({ scheduleChanged: true })
    });
    expect(
      popButton(element, "state").textContent.replace(/\s+/g, " ").trim()
    ).toBe("Committed");
    expect($(element, 'c-shoresh-rail-pop[data-id="state"]').mark).toBe(true);
    finalizeRun.mockRejectedValue({
      body: { message: "Schedule changed. Assign again first." }
    });
    $(element, '[data-id="primary"]').click();
    await flush();
    expect(text($(element, '[data-id="error"] span'))).toBe(
      "Not finalized. Schedule changed. Assign again first."
    );
    expect(text($(element, '[data-id="error-action"]'))).toBe("Assign again");
    // Refused: the cursor is back on Finalize.
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="primary"]')
    );
    assignSeats.mockResolvedValue(assignedView({ revision: 3 }));
    $(element, '[data-id="error-action"]').click();
    await flush();
    expect(assignSeats).toHaveBeenCalled();
    // The button went with the message: the cursor is on the main button, not lost.
    expect($(element, '[data-id="error-action"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[data-id="primary"]')
    );
  });

  it("a final run whose schedule changed reads Out of date, and offers Start a new version", async () => {
    const final = assignedView({
      scheduleChanged: true,
      run: {
        ...RUN_INFO,
        status: "Final",
        finalizedAt: "2027-10-14T15:00:00.000Z",
        finalizedBy: "Greg Feitel"
      }
    });
    const element = await render({
      situation: { runs: [final.run] },
      view: final
    });
    const state = $(element, 'c-shoresh-rail-pop[data-id="state"]');
    expect(
      popButton(element, "state").textContent.replace(/\s+/g, " ").trim()
    ).toBe("Out of date");
    expect(text(state.querySelector('[data-id="state-note"]'))).toBe(
      "Schedule changed since it was finalized"
    );
    expect(text(state.querySelector('[data-id="new-version"]'))).toBe(
      "Start a new version"
    );
    const copy = runView({
      run: { ...RUN_INFO, id: "r2", newVersionOf: "r1" },
      revision: 1
    });
    startNewVersion.mockResolvedValue(copy);
    seatsSetup.mockResolvedValue({ runs: [final.run, copy.run] });
    state.dispatchEvent(
      new CustomEvent("select", { detail: { value: "new" } })
    );
    await flush();
    expect(startNewVersion).toHaveBeenCalledWith({ runId: "r1" });
    expect(text($(element, '[data-id="status"]'))).toBe(
      "A new version started, with the choices, locks and moves made by hand."
    );
    expect(text($(element, '[data-id="primary"]'))).toBe("Assign seats");
    // The menu it was chosen from was held while saving: the cursor is back on it.
    expect(element.shadowRoot.activeElement).toBe(state);
    // Both are in the run's menu: the new one chosen.
    const rows = [...state.querySelectorAll(".run-row")];
    expect(rows.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "true",
      "false"
    ]);
  });
});
