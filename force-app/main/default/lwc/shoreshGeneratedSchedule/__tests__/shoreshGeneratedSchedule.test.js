import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import { buildTerms } from "c/shoreshTerms";
import { MODE, generateWeek } from "c/shoreshEngine";
import { loadWeek } from "c/shoreshGeneratedWeek";
import { nextTurn } from "../pieces";
import {
  BIG,
  FLAGPOLE,
  PROGRAM,
  SCHEDULE,
  SMALL,
  WEEK,
  WEEK_2,
  camp
} from "./data/camp";

jest.mock(
  "@salesforce/apex/GeneratedScheduleController.getInputs",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/GeneratedScheduleController.saveWeek",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const SETUP = {
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [
    { Id: WEEK, Name: "Week 1" },
    { Id: WEEK_2, Name: "Week 2" }
  ],
  programs: [{ program: { Id: PROGRAM, Name: "Main" } }],
  activities: [],
  locations: []
};
const LABELS = [
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true }
];
const terms = buildTerms(LABELS);

const CONFLICT_SENTENCE =
  "Someone else changed this schedule since you opened it. Open it again to see their changes.";

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

// The browser's turn, as the screen gives it between pieces of a build.
const tick = () => nextTurn();

/** Gives the page turns until done() says yes. */
async function until(done, tries = 2000) {
  await flush();
  if (done()) {
    return;
  }
  if (!tries) {
    throw new Error("still waiting");
  }
  await tick();
  await until(done, tries - 1);
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);

/** Until the screen has stopped building (the build runs in pieces, between timers). */
const settle = (element) => until(() => !q(element, '[data-id="busy"]'));

function savedAnswer(n = 1) {
  return {
    conflict: false,
    scheduleId: SCHEDULE,
    revision: `2026-06-29:${n}|2026-06-30:${n}`,
    versionId: null
  };
}

async function render(inputs = camp(SMALL)) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = SETUP;
  document.body.appendChild(element);
  await flush();
  return element;
}

/** What the engine builds from this camp, as the screen asks it. */
async function built(inputs, extra) {
  const loaded = await loadWeek(PROGRAM, WEEK);
  getInputs.mockResolvedValue(inputs);
  return generateWeek({ ...loaded.input, terms, ...extra });
}

const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const action = (element, name) => q(element, `[data-action="${name}"]`);
const grid = (element) => q(element, '[data-id="grid"]');
const cells = (element) => [
  ...grid(element).shadowRoot.querySelectorAll("[data-cell]")
];
const checks = (element) => q(element, "c-shoresh-week-checks");
const counter = (element, key) =>
  checks(element).shadowRoot.querySelector(`[data-counter="${key}"]`);
const sent = (call = 0) => saveWeekOnServer.mock.calls[call][0].request;

async function generate(element) {
  saveWeekOnServer.mockResolvedValueOnce(savedAnswer());
  q(element, '[data-id="generate"]').click();
  await settle(element);
}

describe("c-shoresh-generated-schedule", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("offers Generate a schedule for a week not generated yet, and nothing else", async () => {
    const element = await render();
    expect(getInputs).toHaveBeenCalledWith({
      programId: PROGRAM,
      weekId: WEEK
    });
    expect(q(element, '[data-id="start"]').textContent).toContain(
      "Let the app propose one"
    );
    expect(q(element, '[data-id="generate"]').label).toBe(
      "Generate a schedule"
    );
    expect(action(element, "Rebuild")).toBeNull();
    expect(grid(element)).toBeNull();
    expect(saveWeekOnServer).not.toHaveBeenCalled();
  });

  it("lists a blank week's fixed activities that couldn't be placed", async () => {
    const element = await render(
      camp({ ...SMALL, notPlaced: ["Rest · Bunk 1 · Monday"] })
    );
    expect(q(element, '[data-id="not-placed"]').textContent).toContain(
      "Rest · Bunk 1 · Monday"
    );
  });

  it("Generate builds the week with option 1 and saves the whole week, then shows it", async () => {
    const inputs = camp(SMALL);
    const element = await render(inputs);
    await generate(element);

    const expected = await built(inputs, { option: 1, mode: MODE.FULL });
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
    const request = sent();
    expect(request.action).toBe("Generate");
    expect(request.option).toBe(1);
    expect(request.scheduleId).toBeNull();
    expect(request.programId).toBe(PROGRAM);
    expect(request.weekId).toBe(WEEK);
    expect(request.days.map((d) => d.rows)).toEqual(
      expected.days.map((d) => d.rows)
    );
    // Shown: the grid, the actions, the counters (Filled, Open on this route).
    expect(q(element, '[data-id="start"]')).toBeNull();
    expect(grid(element)).not.toBeNull();
    expect(action(element, "Rebuild")).not.toBeNull();
    const filled =
      checks(element).shadowRoot.querySelector('[data-id="filled"]');
    expect(filled.textContent).toContain(
      `${expected.cells.filled} of ${expected.cells.total}`
    );
    expect(counter(element, "open")).not.toBeNull();
    expect(counter(element, "overlapping")).toBeNull();
    expect(q(element, '[data-id="announce"]').textContent).toContain(
      `Filled ${expected.cells.filled} of ${expected.cells.total}.`
    );
  });

  it("shows a saved Generated week as saved, with not-at-camp cells hatched and Flagpole kept", async () => {
    const element = await render();
    await generate(element);
    const texts = cells(element).map(
      (c) => c.querySelector(".cell-name").textContent
    );
    expect(texts.filter((t) => t === "Flagpole")).toHaveLength(2);
    // Bunk 2 is at camp mornings only: its afternoon cell is hatched.
    expect(texts).toContain("Not at camp");
    const away = cells(element).find((c) => c.className.includes("cell_away"));
    expect(away).toBeTruthy();
  });

  it("builds a big week in pieces, showing its progress, with the actions held until it is saved", async () => {
    const inputs = camp(BIG);
    const element = await render(inputs);
    let answer;
    saveWeekOnServer.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    q(element, '[data-id="generate"]').click();
    await flush();
    const busy = q(element, '[data-id="busy"]');
    expect(busy.textContent).toContain("Generating…");
    const bar = busy.querySelector('[role="progressbar"]');
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(q(element, '[data-id="generate"]').disabled).toBe(true);

    // The page gets the browser back between pieces, and the bar moves on.
    const seen = new Set();
    await until(() => {
      const now = q(element, '[role="progressbar"]');
      if (now) {
        seen.add(Number(now.getAttribute("aria-valuenow")));
      }
      return saveWeekOnServer.mock.calls.length > 0;
    });
    expect(seen.size).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBeGreaterThan(0);
    // Still busy until the server has the week.
    expect(q(element, '[data-id="busy"]')).not.toBeNull();
    answer(savedAnswer());
    await settle(element);
    expect(q(element, '[data-id="busy"]')).toBeNull();
    // The week sent is the one built at once.
    const expected = await built(inputs, { option: 1, mode: MODE.FULL });
    expect(sent().days.map((d) => d.rows)).toEqual(
      expected.days.map((d) => d.rows)
    );
  });

  it("Rebuild asks first, in words that keep locked cells, then builds the same option again", async () => {
    const element = await render();
    await generate(element);
    action(element, "Rebuild").click();
    await flush();
    const dialog = q(element, '[data-id="confirm"]');
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain("Rebuild this schedule?");
    const body = q(element, '[data-id="confirm-body"]').textContent;
    expect(body).toContain("Builds Week 1 again from your setup.");
    expect(body).toContain("Locked cells stay as they are.");
    expect(body).not.toMatch(/your edits|replaces/i);
    expect(q(element, '[data-id="confirm-note"]').textContent).toBe(
      "Saved to Versions first."
    );
    // Cancel has focus first, as on the desktop.
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="confirm-cancel"]')
    );
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    q(element, '[data-id="confirm-go"]').click();
    await settle(element);
    expect(sent(1).action).toBe("Rebuild");
    expect(sent(1).option).toBe(1);
    // The next save goes from what this one was saved at.
    expect(sent(1).revision).toBe("2026-06-29:1|2026-06-30:1");
    expect(sent(1).scheduleId).toBe(SCHEDULE);
  });

  it("Cancel and Escape close the confirm without building, focus back on the button", async () => {
    const element = await render();
    await generate(element);
    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm-cancel"]').click();
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(action(element, "Rebuild"));

    action(element, "StartOver").click();
    await flush();
    q(element, '[data-id="confirm"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(action(element, "StartOver"));
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
  });

  it("Tab stays inside the confirm", async () => {
    const element = await render();
    await generate(element);
    action(element, "Rebuild").click();
    await flush();
    const dialog = q(element, '[data-id="confirm"]');
    const tab = (shiftKey) =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true })
      );
    tab(false);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="confirm-go"]')
    );
    tab(false);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="confirm-cancel"]')
    );
    tab(true);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="confirm-go"]')
    );
  });

  it("Try another builds the next option, and Option brings an earlier one back exactly", async () => {
    const inputs = camp(SMALL);
    const element = await render(inputs);
    await generate(element);
    const first = sent(0).days.map((d) => d.rows);

    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "TryAnother").click();
    await settle(element);
    expect(sent(1).action).toBe("TryAnother");
    expect(sent(1).option).toBe(2);
    const second = await built(inputs, { option: 2, mode: MODE.FULL });
    expect(sent(1).days.map((d) => d.rows)).toEqual(
      second.days.map((d) => d.rows)
    );

    const option = q(element, '[data-id="option"]');
    expect(option.value).toBe("2");
    expect(option.options.map((o) => o.value)).toEqual(["1", "2"]);
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(3));
    option.dispatchEvent(new CustomEvent("change", { detail: { value: "1" } }));
    await settle(element);
    expect(sent(2).action).toBe("TryAnother");
    expect(sent(2).option).toBe(1);
    expect(sent(2).days.map((d) => d.rows)).toEqual(first);
    // Option 2 can still be brought back.
    expect(
      q(element, '[data-id="option"]').options.map((o) => o.value)
    ).toEqual(["1", "2"]);
  });

  it("Fill the open cells builds in fill mode and is held while nothing is Open", async () => {
    const inputs = camp(SMALL);
    const element = await render(inputs);
    await generate(element);
    // The small week fills every cell.
    expect(counter(element, "open").querySelector(".count").textContent).toBe(
      "0"
    );
    expect(action(element, "FillOpen").disabled).toBe(true);

    // Start over leaves cells Open; then Fill the open cells fills them, in fill mode.
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "StartOver").click();
    await flush();
    q(element, '[data-id="confirm-go"]').click();
    await settle(element);
    expect(action(element, "FillOpen").disabled).toBe(false);
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(3));
    action(element, "FillOpen").click();
    await settle(element);
    expect(sent(2).action).toBe("FillOpen");
    expect(sent(2).option).toBe(1);
    const cleared = sent(1).days;
    const loaded = await loadWeek(PROGRAM, WEEK);
    const expected = generateWeek({
      ...loaded.input,
      days: loaded.input.days.map((day, i) => ({
        ...day,
        items: cleared[i].items,
        rows: cleared[i].rows
      })),
      terms,
      option: 1,
      mode: MODE.FILL_OPEN
    });
    expect(sent(2).days.map((d) => d.rows)).toEqual(
      expected.days.map((d) => d.rows)
    );
  });

  it("Start over asks first, naming what it clears, then clears every activity and keeps Flagpole", async () => {
    const element = await render();
    await generate(element);
    action(element, "StartOver").click();
    await flush();
    expect(q(element, '[data-id="confirm"]').textContent).toContain(
      "Start over?"
    );
    const body = q(element, '[data-id="confirm-body"]').textContent;
    expect(body).toMatch(
      /^Clears all \d+ filled cells in Week 1, locked ones too\./
    );
    expect(q(element, '[data-id="confirm-go"]').textContent.trim()).toBe(
      "Start over"
    );
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    q(element, '[data-id="confirm-go"]').click();
    await settle(element);
    const request = sent(1);
    expect(request.action).toBe("StartOver");
    request.days.forEach((day) => {
      expect(day.items).toEqual([
        { kind: "F", id: FLAGPOLE, name: "Flagpole" }
      ]);
      day.rows.forEach((row) => expect(row).toBe("1,,,"));
    });
    const filled =
      checks(element).shadowRoot.querySelector('[data-id="filled"]');
    // Bunk 1's three periods and Bunk 2's two morning ones, on two days.
    expect(filled.textContent).toContain("0 of 10");
  });

  it("someone else's save first: says so, writes nothing over it, and Reload shows theirs", async () => {
    const element = await render();
    saveWeekOnServer.mockResolvedValueOnce({
      conflict: true,
      message: CONFLICT_SENTENCE
    });
    q(element, '[data-id="generate"]').click();
    await settle(element);
    const box = q(element, '[data-id="conflict"]');
    expect(box.getAttribute("role")).toBe("alert");
    expect(box.textContent).toContain(CONFLICT_SENTENCE);
    // Nothing shown as saved, and nothing can be built over it until it is reloaded.
    expect(grid(element)).toBeNull();
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);

    getInputs.mockResolvedValue(camp({ ...SMALL, scheduleId: SCHEDULE }));
    q(element, '[data-id="reload"]').click();
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    expect(q(element, '[data-id="conflict"]')).toBeNull();
    expect(grid(element)).not.toBeNull();
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
  });

  it("a refused save says why and keeps the week as it was", async () => {
    const element = await render();
    await generate(element);
    const before = cells(element).map((c) => c.textContent);
    saveWeekOnServer.mockRejectedValueOnce({
      body: { message: "Flagpole stays where it is set up." }
    });
    action(element, "TryAnother").click();
    await settle(element);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "Flagpole stays where it is set up."
    );
    expect(cells(element).map((c) => c.textContent)).toEqual(before);
    expect(q(element, '[data-id="option"]').value).toBe("1");
  });

  it("a week the engine can't build says so and saves nothing", async () => {
    const element = await render(camp({ ...SMALL, activities: [] }));
    q(element, '[data-id="generate"]').click();
    await settle(element);
    expect(q(element, '[data-id="build-error"]').textContent).toContain(
      "No activities are set up yet."
    );
    expect(saveWeekOnServer).not.toHaveBeenCalled();
  });

  it("moving to another week stops a build under way: nothing is saved for the old week", async () => {
    const element = await render(camp(BIG));
    q(element, '[data-id="generate"]').click();
    await flush();
    expect(q(element, '[data-id="busy"]')).not.toBeNull();
    getInputs.mockResolvedValue(camp(SMALL));
    q(element, '[data-id="week"]').dispatchEvent(
      new CustomEvent("change", { detail: { value: WEEK_2 } })
    );
    let turns = 0;
    await until(() => turns++ >= 20);
    expect(saveWeekOnServer).not.toHaveBeenCalled();
    expect(q(element, '[data-id="busy"]')).toBeNull();
    expect(getInputs).toHaveBeenLastCalledWith({
      programId: PROGRAM,
      weekId: WEEK_2
    });
  });

  it("dots a cell that bends a rule, its words in assistive text, worked out again on load", async () => {
    // One activity, at most once a week, for four cells: never blank goes over the limit.
    const inputs = camp({
      ...SMALL,
      activities: [{ name: "Swim", min: 0, max: 1, atOnce: 2 }]
    });
    const element = await render(inputs);
    await generate(element);
    const dotted = cells(element).filter((c) =>
      c.querySelector("c-shoresh-dot")
    );
    expect(dotted.length).toBeGreaterThan(0);
    const words = dotted.map((c) => c.querySelector("c-shoresh-dot").label);
    expect(words.some((w) => w.includes("Over its weekly limit"))).toBe(true);

    // The same week opened later has the same dots.
    const days = sent().days;
    const saved = camp({
      ...SMALL,
      activities: [{ name: "Swim", min: 0, max: 1, atOnce: 2 }],
      scheduleId: SCHEDULE
    });
    saved.days = saved.days.map((day, i) => ({
      ...day,
      items: days[i].items.map((it) => ({ ...it, gone: false })),
      rows: days[i].rows
    }));
    document.body.removeChild(element);
    const again = await render(saved);
    const dottedAgain = cells(again).filter((c) =>
      c.querySelector("c-shoresh-dot")
    );
    expect(dottedAgain.map((c) => c.dataset.cell)).toEqual(
      dotted.map((c) => c.dataset.cell)
    );
  });

  it("a counter lights up the cells it is about; a line takes the director to that bunk", async () => {
    // Swim owed three times in two days, at most once a day: still needed.
    const inputs = camp({
      ...SMALL,
      activities: [
        { name: "Swim", min: 3, max: 3, atOnce: 2 },
        { name: "Art", min: 0, max: 5, atOnce: 2 }
      ]
    });
    const element = await render(inputs);
    await generate(element);
    const needed = counter(element, "stillNeeded");
    expect(Number(needed.querySelector(".count").textContent)).toBeGreaterThan(
      0
    );
    needed.click();
    await flush();
    const lit = cells(element).filter((c) => c.className.includes("cell_lit"));
    expect(lit.length).toBeGreaterThan(0);
    lit.forEach((c) =>
      expect(c.querySelector(".cell-name").textContent).toBe("Swim")
    );
    // Clicking the counter again turns them off.
    counter(element, "stillNeeded").click();
    await flush();
    expect(
      cells(element).filter((c) => c.className.includes("cell_lit"))
    ).toHaveLength(0);

    // A line: that bunk's week, in Group View.
    counter(element, "stillNeeded").click();
    await flush();
    checks(element).shadowRoot.querySelector(".line-text").click();
    await flush();
    expect(q(element, '[data-view="group"]').getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      cells(element).filter((c) => c.className.includes("cell_lit"))
    ).toHaveLength(0);
  });

  it("cells can be reached from the keyboard but not changed (editing comes with locks)", async () => {
    const element = await render();
    await generate(element);
    const frame = grid(element).shadowRoot.querySelector(
      '[data-id="schedule-grid"]'
    );
    expect(frame.getAttribute("role")).toBe("grid");
    const all = cells(element);
    expect(all.filter((c) => c.getAttribute("tabindex") === "0")).toHaveLength(
      1
    );
    all.forEach((c) => {
      expect(c.getAttribute("aria-readonly")).toBe("true");
      expect(c.getAttribute("draggable")).toBeNull();
    });
    const before = sent().days;
    all[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true })
    );
    await flush();
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
    expect(sent().days).toBe(before);
  });

  it("names every program's week in the camp's own words", async () => {
    const element = await render();
    expect(q(element, '[data-id="week"]').label).toBe("Week");
    await generate(element);
    expect(
      qa(element, ".view-button").map((b) => b.textContent.trim())
    ).toEqual(["Daily View", "Group View", "Activity View"]);
    expect(q(element, ".legend").textContent).toContain("Not at camp");
  });
});
