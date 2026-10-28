import { createElement } from "lwc";
import ShoreshGeneratedSchedule from "c/shoreshGeneratedSchedule";
import {
  counterText,
  expectCleanGrid,
  find,
  findAll,
  whyLines
} from "shoresh-jest/week-editor";
import getInputs from "@salesforce/apex/GeneratedScheduleController.getInputs";
import saveWeekOnServer from "@salesforce/apex/GeneratedScheduleController.saveWeek";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";
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

const SETUP = nsRecord({
  season: { Id: "a0Z000000000001AAA", Name: "Summer 2026" },
  weeks: [
    { Id: WEEK, Name: "Week 1" },
    { Id: WEEK_2, Name: "Week 2" }
  ],
  // Everything building needs (desktop readiness.js), so Generate is offered.
  programs: [
    {
      program: { Id: PROGRAM, Name: "Main", Monday__c: true },
      divisions: [
        {
          division: { Id: "a0D000000000001AAA", Name: "Juniors" },
          groups: [{ Id: "a0G000000000001AAA" }]
        }
      ],
      timeBlocks: [{ Id: "a0B000000000001AAA", Name: "Period 1" }]
    }
  ],
  activities: [{ Id: "a0A000000000001AAA", Name: "Swim" }],
  locations: []
});
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

const q = (element, selector) => find(element, selector);

/** The screen's element with focus (slotted into the editor, it is still the screen's own). */
const focused = (element) => element.shadowRoot.activeElement;

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

async function render(inputs = camp(SMALL), setup = SETUP) {
  getInputs.mockResolvedValue(inputs);
  const element = createElement("c-shoresh-generated-schedule", {
    is: ShoreshGeneratedSchedule
  });
  element.terms = terms;
  element.setup = setup;
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

const qa = (element, selector) => findAll(element, selector);
const action = (element, name) => q(element, `[data-action="${name}"]`);
const grid = (element) => q(element, '[data-id="edit-grid"]');
const cells = (element) => [
  ...grid(element).shadowRoot.querySelectorAll("[data-cell]")
];
const checks = (element) => q(element, "c-shoresh-week-checks");
const buildMenu = (element) => q(element, '[data-id="build-menu"]');
/** The options in the Build menu: each one's number, and the one checked. */
const optionValues = (element) =>
  qa(element, "[data-option]").map((row) => row.dataset.option);
const optionShown = (element) => {
  const row = qa(element, "[data-option]").find(
    (r) => r.getAttribute("aria-checked") === "true"
  );
  return row ? row.dataset.option : null;
};
const chooseOption = (element, value) =>
  q(element, `[data-option="${value}"]`).click();
/** The counter's dropdown, opened: its rows (c-shoresh-week-checks). */
async function openCounter(element) {
  const word = checks(element)
    .shadowRoot.querySelector('[data-id="counter"]')
    .shadowRoot.querySelector('[data-id="button"]');
  if (word.getAttribute("aria-expanded") !== "true") {
    word.click();
    await flush();
  }
}
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
    jest.resetAllMocks();
  });

  it("‹ Roots leads the rail and says back to Roots to the page (decision 68)", async () => {
    const element = await render();
    const back = element.shadowRoot.querySelector("c-shoresh-roots-back");
    expect(back.getAttribute("slot")).toBe("pickers");
    expect(back.nextElementSibling.dataset.id).toBe("week");
    // A picker follows: its own divider separates them.
    expect(back.shadowRoot.querySelector(".shoresh-rail-line")).not.toBeNull();
    const heard = jest.fn();
    element.addEventListener("backtoroots", heard);
    back.shadowRoot.querySelector('[data-id="back"]').click();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("‹ Roots alone draws no divider of its own, so none is doubled before Edit", async () => {
    const element = await render(camp(SMALL), { ...SETUP, weeks: [] });
    const back = element.shadowRoot.querySelector("c-shoresh-roots-back");
    expect(back.lineless).toBe(true);
    expect(back.shadowRoot.querySelector(".shoresh-rail-line")).toBeNull();
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
    await expect(element).toBeAccessible();
  });

  it("building waits for the basics: the desktop's sentence, its links and Set up …, no Generate", async () => {
    const element = await render(camp(SMALL), { ...SETUP, activities: [] });
    const box = q(element, '[data-id="still-needed-box"]');
    expect(box.querySelector('[data-id="still-needed"]').textContent).toBe(
      "One thing still needed before you can build the schedule: Activities."
    );
    expect(q(element, '[data-id="generate"]')).toBeNull();
    const setUp = q(element, '[data-id="set-up-first"]');
    expect(setUp.label).toMatch(/^Set up activities$/i);
    const navigate = jest.fn();
    element.addEventListener("navigate", navigate);
    setUp.click();
    box.querySelector("a").click();
    expect(navigate.mock.calls.map((c) => c[0].detail.screen)).toEqual([
      "activities",
      "activities"
    ]);
  });

  it("a week already generated opens even with basics missing since", async () => {
    const element = await render(camp({ ...SMALL, scheduleId: SCHEDULE }), {
      ...SETUP,
      activities: []
    });
    expect(q(element, '[data-id="still-needed-box"]')).toBeNull();
    expect(grid(element)).not.toBeNull();
  });

  it("lists a blank week's fixed activities that couldn't be placed", async () => {
    const element = await render(
      camp({ ...SMALL, notPlaced: ["Rest · Bunk 1 · Monday"] })
    );
    expect(q(element, '[data-id="not-placed"]').textContent).toContain(
      "Rest · Bunk 1 · Monday"
    );
  });

  describe("the same layout as Manual Build", () => {
    const slotOf = (element, selector) => q(element, selector).assignedSlot;

    it("the week picker sits in the editor's toolbar before and after Generate, so it never moves", async () => {
      const element = await render();
      const before = q(element, '[data-id="week"]');
      expect(before.assignedSlot.name).toBe("pickers");
      // No toolbar of the screen's own above the editor.
      expect(element.shadowRoot.querySelector(".toolbar")).toBeNull();
      expect(slotOf(element, '[data-id="start"]').name).toBe("outcome");
      await generate(element);
      const after = q(element, '[data-id="week"]');
      expect(after).toBe(before);
      expect(after.assignedSlot.name).toBe("pickers");
    });

    it("the counter sits on the rail's right (the editor's checks slot), as on Manual Build", async () => {
      const element = await render();
      await generate(element);
      expect(checks(element).assignedSlot.name).toBe("checks");
    });

    it("Build sits after Edit; Versions and Publish at the rail's right edge, after the counter", async () => {
      const element = await render();
      await generate(element);
      expect(buildMenu(element).assignedSlot.name).toBe("tools");
      expect(buildMenu(element).label).toBe("Build");
      expect(action(element, "StartOver").parentElement).toBe(
        buildMenu(element)
      );
      expect(q(element, '[data-id="versions"]').assignedSlot.name).toBe("end");
      expect(q(element, '[data-id="publish-area"]').assignedSlot.name).toBe(
        "end"
      );
      const follows = (a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(
        follows(
          q(element, '[data-id="versions"]'),
          q(element, '[data-id="publish"]')
        )
      ).toBeTruthy();
    });

    it("another week not generated yet: the last week's grid goes, the pickers stay put", async () => {
      const element = await render(camp({ ...SMALL, scheduleId: SCHEDULE }));
      expect(grid(element)).not.toBeNull();
      getInputs.mockResolvedValue(camp(SMALL));
      const picker = q(element, '[data-id="week"]');
      picker.dispatchEvent(
        new CustomEvent("change", { detail: { value: WEEK_2 } })
      );
      await flush();
      expect(grid(element)).toBeNull();
      expect(action(element, "Rebuild")).toBeNull();
      expect(q(element, '[data-id="start"]')).not.toBeNull();
      expect(q(element, '[data-id="week"]')).toBe(picker);
      await expect(element).toBeAccessible();
    });
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
    // Shown: the grid, the actions, the counter (as on Manual Build).
    expect(q(element, '[data-id="start"]')).toBeNull();
    expect(grid(element)).not.toBeNull();
    expect(action(element, "Rebuild")).not.toBeNull();
    expect(counterText(element)).toBe(
      `${expected.cells.filled}of ${expected.cells.total} placed`
    );
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
    // Flagpole for every bunk, each bunk's own cell (a hand edit may move or cover one: Greg,
    // 2026-10-26), with the set-time lock.
    const flagpole = cells(element).filter(
      (c) => c.querySelector(".cell-name").textContent === "Flagpole"
    );
    expect(flagpole).toHaveLength(2);
    expect(flagpole[0].getAttribute("aria-colspan")).toBeNull();
    expect(flagpole[0].querySelector(".set-lock svg")).not.toBeNull();
    // Bunk 2 is at camp mornings only: its afternoon cell is hatched.
    expect(texts).toContain("Not at camp");
    const away = cells(element).find((c) => c.className.includes("cell_away"));
    expect(away).toBeTruthy();
    await expect(element).toBeAccessible();
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

  describe("while it builds, what it is doing in camp words", () => {
    // Words a camp director should never see on the line.
    const MACHINERY =
      /search|budget|step \d|algorithm|repair|constraint|slot|engine|undefined|null/i;

    it("shows one line in the setup's names and the camp's words, never machinery", async () => {
      const element = await render(camp(BIG));
      saveWeekOnServer.mockResolvedValue(savedAnswer());
      q(element, '[data-id="generate"]').click();
      await flush();
      const line = () => q(element, '[data-id="busy-now"]');
      const seen = new Set();
      let live;
      await until(() => {
        if (line() && line().textContent.trim()) {
          seen.add(line().textContent.trim());
          live = line().getAttribute("aria-live");
        }
        return saveWeekOnServer.mock.calls.length > 0;
      });
      expect(seen.size).toBeGreaterThan(0);
      for (const text of seen) {
        expect(text).not.toMatch(MACHINERY);
      }
      // Named as the camp names them: its bunks, periods, activities and days.
      expect(
        [...seen].some((text) =>
          /Bunk \d+|Period \d+|Activity \d+|Monday|Tuesday|Wednesday|Thursday|Friday/.test(
            text
          )
        )
      ).toBe(true);
      // The line is not a live region (it changes too often); the bar keeps its label.
      expect(live).toBeNull();
      await settle(element);
      await expect(element).toBeAccessible();
    }, 60000); // a big camp's whole build: slow CI runners need longer

    it("says the line aloud at most every five seconds, not at every change", async () => {
      // A clock that moves on 40 ms each time it is read.
      let clock = 0;
      const now = jest.spyOn(Date, "now").mockImplementation(() => {
        clock += 40;
        return clock;
      });
      try {
        const element = await render(camp(BIG));
        saveWeekOnServer.mockResolvedValue(savedAnswer());
        const editor = q(element, '[data-id="week-editor"]');
        const said = [];
        const announce = editor.announce.bind(editor);
        editor.announce = (text) => {
          said.push({ text, at: clock });
          announce(text);
        };
        q(element, '[data-id="generate"]').click();
        await until(() => saveWeekOnServer.mock.calls.length > 0);
        const lines = new Set();
        await until(() => {
          const line = q(element, '[data-id="busy-now"]');
          if (line && line.textContent.trim()) {
            lines.add(line.textContent.trim());
          }
          return !q(element, '[data-id="busy"]');
        });
        // What was said while building: "Generating…" first, then progress lines.
        const progress = said.filter(
          (s) => s.text !== "Generating…" && !/^Generated|Filled/.test(s.text)
        );
        expect(progress.length).toBeGreaterThan(0);
        expect(progress.length).toBeLessThan(clock / 5000 + 2);
        for (let i = 1; i < progress.length; i++) {
          expect(progress[i].at - progress[i - 1].at).toBeGreaterThanOrEqual(
            5000
          );
        }
        // A line is said once, never again while it stays the same.
        for (let i = 1; i < progress.length; i++) {
          expect(progress[i].text).not.toBe(progress[i - 1].text);
        }
      } finally {
        now.mockRestore();
      }
    });

    it("Cancel stops the build: nothing is saved, the week is as it was, and it says so", async () => {
      const element = await render(camp(BIG));
      q(element, '[data-id="generate"]').click();
      await flush();
      const stop = q(element, '[data-id="stop-build"]');
      expect(stop.textContent.trim()).toBe("Cancel");
      // The test's stand-in for Salesforce's button can't hold focus: see that it is asked to.
      const generateButton = q(element, '[data-id="generate"]');
      generateButton.focus = jest.fn();
      stop.click();
      await settle(element);
      expect(saveWeekOnServer).not.toHaveBeenCalled();
      expect(q(element, '[data-id="announce"]').textContent).toContain(
        "Stopped. Week 1 wasn't changed."
      );
      // Shown too, on the editor's quiet line.
      expect(q(element, '[data-id="notice"]').textContent).toBe(
        "Stopped. Week 1 wasn't changed."
      );
      // Not generated, so Generate is offered again, and has focus.
      expect(generateButton.disabled).toBe(false);
      await until(() => generateButton.focus.mock.calls.length > 0);
    });

    it("moves focus from Cancel as soon as the week is built, not after the save", async () => {
      const element = await render(camp(BIG));
      let answer;
      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      q(element, '[data-id="generate"]').click();
      await flush();
      q(element, '[data-id="stop-build"]').focus();
      expect(focused(element)).toBe(q(element, '[data-id="stop-build"]'));
      await until(() => saveWeekOnServer.mock.calls.length > 0);
      // Still saving: focus is on the progress, not lost with Cancel.
      await until(() => focused(element) === q(element, '[data-id="busy"]'));
      answer(savedAnswer());
      await settle(element);
    });

    it("offers no Cancel once the week is built and being saved", async () => {
      const element = await render(camp(BIG));
      let answer;
      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      q(element, '[data-id="generate"]').click();
      await until(() => saveWeekOnServer.mock.calls.length > 0);
      await flush();
      expect(q(element, '[data-id="busy"]')).not.toBeNull();
      expect(q(element, '[data-id="stop-build"]')).toBeNull();
      expect(q(element, '[data-id="busy-now"]').textContent.trim()).toBe("");
      answer(savedAnswer());
      await settle(element);
    });

    it("keeps the bar still under reduced motion, and the line never moves", () => {
      const css = require("fs").readFileSync(
        require("path").join(__dirname, "../shoreshGeneratedSchedule.css"),
        "utf8"
      );
      const reduced = css
        .split("@media (prefers-reduced-motion: reduce)")
        .slice(1)
        .join("");
      expect(reduced).toMatch(/\.progress-fill\s*{\s*transition: none;/);
      expect(reduced).toMatch(
        /\.progress_moving \.progress-fill\s*{[^}]*animation: none;/
      );
      const lineRule = css.match(/\.busy-now\s*{[^}]*}/)[0];
      expect(lineRule).not.toMatch(/animation|transition/);
    });
  });

  it("Rebuild asks first, in the desktop's words without replacing edits, then builds the same option again", async () => {
    const element = await render();
    await generate(element);
    action(element, "Rebuild").click();
    await flush();
    const dialog = q(element, '[data-id="confirm"]');
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.textContent).toContain("Rebuild this schedule?");
    const body = q(element, '[data-id="confirm-body"]').textContent;
    expect(body).toBe(
      "Updates Week 1 to your setup, keeping everything that still fits."
    );
    // Hand edits are locks and stay (decision 2): never "replaces your edits". Locks come in G4.
    expect(body).not.toMatch(/your edits|replaces|lock/i);
    expect(q(element, '[data-id="confirm-note"]').textContent).toBe(
      "Saved to Versions first."
    );
    await expect(element).toBeAccessible();
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
    // Focus is back on Build, where Rebuild is, not lost with the dialog.
    expect(element.shadowRoot.activeElement).toBe(buildMenu(element));
  });

  it("Cancel and Escape close the confirm without building, focus back on Build", async () => {
    const element = await render();
    await generate(element);
    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm-cancel"]').click();
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(buildMenu(element));

    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(buildMenu(element));
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
    expect(element.shadowRoot.activeElement).toBe(buildMenu(element));
    const second = await built(inputs, { option: 2, mode: MODE.FULL });
    expect(sent(1).days.map((d) => d.rows)).toEqual(
      second.days.map((d) => d.rows)
    );

    // Build lists the options tried, the one shown checked ("Option 2").
    expect(optionShown(element)).toBe("2");
    expect(optionValues(element)).toEqual(["1", "2"]);
    expect(q(element, '[data-option="2"]').textContent.trim()).toBe("Option 2");
    expect(q(element, '[data-option="2"]').getAttribute("role")).toBe(
      "menuitemradio"
    );
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(3));
    chooseOption(element, "1");
    await settle(element);
    expect(sent(2).action).toBe("TryAnother");
    expect(sent(2).option).toBe(1);
    expect(sent(2).days.map((d) => d.rows)).toEqual(first);
    // Option 2 can still be brought back.
    expect(optionValues(element)).toEqual(["1", "2"]);
  });

  it("Fill the open cells builds in fill mode and is held while nothing is Open", async () => {
    const inputs = camp(SMALL);
    const element = await render(inputs);
    await generate(element);
    // The small week fills every cell.
    expect(counterText(element)).toBe("10of 10 placed");
    expect(action(element, "FillOpen").disabled).toBe(true);

    // Start over leaves cells Open; then Fill the open cells fills them, in fill mode.
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "StartOver").click();
    await settle(element);
    expect(action(element, "FillOpen").disabled).toBe(false);
    // The cleared cells have no reason: counted in "still needed", not listed one by one.
    expect(checks(element).measure.open).toEqual([]);
    expect(checks(element).measure.stillNeeded).toBe(10);
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

  it("Start over asks nothing: it clears every activity at once and keeps Flagpole", async () => {
    const element = await render();
    await generate(element);
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "StartOver").click();
    await flush();
    expect(q(element, '[data-id="confirm"]')).toBeNull();
    await settle(element);
    const request = sent(1);
    expect(request.action).toBe("StartOver");
    request.days.forEach((day) => {
      expect(day.items).toEqual([
        { kind: "F", id: FLAGPOLE, name: "Flagpole" }
      ]);
      day.rows.forEach((row) => expect(row).toBe("1,,,"));
    });
    // Bunk 1's three periods and Bunk 2's two morning ones, on two days.
    expect(counterText(element)).toBe("0of 10 placed");
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
    // The statement only: the Reload button is the way to act on it.
    expect(box.querySelector("p").textContent).toBe(
      "Someone else changed this schedule since you opened it."
    );
    expect(box.textContent).not.toContain("Open it again");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="reload"]')
    );
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
    // What didn't happen first, then Shoresh's own reason.
    expect(q(element, '[data-id="build-error"]').textContent.trim()).toBe(
      "Option 2 wasn't saved. Nothing was changed. Flagpole stays where it is set up."
    );
    expect(cells(element).map((c) => c.textContent)).toEqual(before);
    expect(optionShown(element)).toBe("1");
  });

  it("Salesforce's own text never reaches the director: it says what didn't happen, then Try again", async () => {
    const element = await render();
    await generate(element);
    saveWeekOnServer.mockRejectedValueOnce({
      body: {
        message:
          "Insert failed. First exception on row 0; first error: FIELD_CUSTOM_VALIDATION_EXCEPTION"
      }
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    action(element, "Rebuild").click();
    await flush();
    q(element, '[data-id="confirm-go"]').click();
    await settle(element);
    expect(q(element, '[data-id="build-error"]').textContent.trim()).toBe(
      "Week 1 wasn't rebuilt. Nothing was changed. Try again."
    );
    console.error.mockRestore();
  });

  it("a week that can't be opened says which, in camp words", async () => {
    getInputs.mockRejectedValue({
      body: { message: "Script-thrown exception" }
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    const element = createElement("c-shoresh-generated-schedule", {
      is: ShoreshGeneratedSchedule
    });
    element.terms = terms;
    element.setup = SETUP;
    document.body.appendChild(element);
    await flush();
    expect(q(element, '[data-id="build-error"]').textContent.trim()).toBe(
      "Week 1 couldn't be opened. Nothing was changed. Try again."
    );
    console.error.mockRestore();
  });

  it("a build is said when it ends, from the screen's one live region", async () => {
    const element = await render();
    await generate(element);
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "TryAnother").click();
    await settle(element);
    await flush();
    expect(q(element, '[data-id="announce"]').textContent).toMatch(
      /^\s*Option 2\. Filled \d+ of \d+\.\s*$/
    );
    // One polite region on the screen: the editor's (Versions says things through it).
    expect(element.shadowRoot.querySelectorAll("[aria-live]")).toHaveLength(0);
    expect(findAll(element, "[aria-live]")).toHaveLength(1);
    const versions = q(element, "c-shoresh-versions");
    expect(versions.shadowRoot.querySelector("[aria-live]")).toBeNull();
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

  it("a week that is gone from setup stops a build under way: nothing is saved for it", async () => {
    const element = await render(camp(BIG));
    q(element, '[data-id="generate"]').click();
    await flush();
    expect(q(element, '[data-id="busy"]')).not.toBeNull();
    // The season is read again without Week 1 (someone deleted it).
    getInputs.mockResolvedValue(camp(SMALL));
    element.setup = { ...SETUP, weeks: [{ Id: WEEK_2, Name: "Week 2" }] };
    let turns = 0;
    await until(() => turns++ >= 20);
    expect(saveWeekOnServer).not.toHaveBeenCalled();
    expect(q(element, '[data-id="busy"]')).toBeNull();
    expect(getInputs).toHaveBeenLastCalledWith({
      programId: PROGRAM,
      weekId: WEEK_2
    });
  });

  it("the season read again mid-build: the build finishes and saves, then the week is read again", async () => {
    const element = await render(camp(BIG));
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer());
    q(element, '[data-id="generate"]').click();
    await flush();
    getInputs.mockClear();
    getInputs.mockResolvedValue(camp({ ...BIG, scheduleId: SCHEDULE }));
    element.setup = { ...SETUP };
    await flush();
    // Still building; the read waits for it.
    expect(q(element, '[data-id="busy"]')).not.toBeNull();
    expect(getInputs).not.toHaveBeenCalled();
    await settle(element);
    expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
    expect(getInputs).toHaveBeenCalledTimes(1);
  });

  it("while a read of the week is out, nothing can be built over it", async () => {
    const element = await render();
    await generate(element);
    // Coming back to the window starts a read of the week (someone saved option 2)...
    let answerRead;
    getInputs.mockReturnValueOnce(
      new Promise((resolve) => {
        answerRead = resolve;
      })
    );
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    // ...and a second focus while it is out asks for nothing more.
    window.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(getInputs).toHaveBeenCalledTimes(2);
    ["Rebuild", "TryAnother", "StartOver"].forEach((name) =>
      expect(action(element, name).disabled).toBe(true)
    );
    expect(q(element, "[data-option]").disabled).toBe(true);
    expect(buildMenu(element).disabled).toBe(true);
    answerRead(camp({ ...SMALL, scheduleId: SCHEDULE, option: 2 }));
    await flush();
    expect(action(element, "TryAnother").disabled).toBe(false);
    expect(optionShown(element)).toBe("2");
    // The next save goes from the week just read.
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(3));
    action(element, "TryAnother").click();
    await settle(element);
    expect(sent(1).revision).toBe("2026-06-29:1");
    expect(sent(1).option).toBe(3);
  });

  it("an option that wasn't saved isn't shown or offered", async () => {
    const element = await render();
    await generate(element);
    saveWeekOnServer.mockRejectedValueOnce({
      body: { message: "Flagpole stays where it is set up." }
    });
    action(element, "TryAnother").click();
    await settle(element);
    expect(optionShown(element)).toBe("1");
    expect(optionValues(element)).toEqual(["1"]);

    // Try another saved (option 2), then picking 1 again is refused: Option goes back to 2.
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    action(element, "TryAnother").click();
    await settle(element);
    saveWeekOnServer.mockRejectedValueOnce({
      body: { message: "Flagpole stays where it is set up." }
    });
    chooseOption(element, "1");
    await settle(element);
    expect(sent(3).option).toBe(1);
    expect(optionShown(element)).toBe("2");
  });

  it("a bunk away this week keeps its row: hatched, not counted to fill, not Open", async () => {
    // A saved week, nothing placed yet; Bunk 2 was marked away after the draft was made, so the
    // server sends its row but not the bunk.
    const inputs = camp({ ...SMALL, scheduleId: SCHEDULE });
    inputs.groups = inputs.groups.slice(0, 1);
    const element = await render(inputs);
    // Placed: only Bunk 1's six cells (three periods on two days) are to fill.
    expect(counterText(element)).toBe("0of 6 placed");
    // Every Bunk 2 cell but Flagpole (fixed, it stays) is hatched, Not at camp (the second
    // column).
    const bunk2 = cells(element).filter(
      (c) =>
        c.dataset.cell.startsWith("1-") &&
        !c.className.includes("cell_set-time")
    );
    expect(bunk2.length).toBeGreaterThan(0);
    bunk2.forEach((c) => {
      expect(c.className).toContain("cell_away");
      expect(c.querySelector(".cell-name").textContent).toBe("Not at camp");
    });
  });

  // CORE-6.2, GEN-9.7
  it("a gap no activity fits stays Open, with the engine's reason in the Why list", async () => {
    // Every activity takes two blocks; Period 3 (afternoon) is a one-block gap for Bunk 1.
    const inputs = camp({
      ...SMALL,
      activities: [{ name: "Hike", min: 0, max: 5, atOnce: 2, length: 2 }]
    });
    const element = await render(inputs);
    await generate(element);
    const open = cells(element).filter((c) =>
      c.className.includes("cell_open")
    );
    expect(open.length).toBeGreaterThan(0);
    // Nothing on the grid (wiki engine care plan Q18): each Open cell is a line, in its words.
    expectCleanGrid(element);
    expect(checks(element).measure.open.map((l) => l.text)).toEqual([
      "Bunk 1 · Monday · Period 3: No activity fits this gap",
      "Bunk 1 · Tuesday · Period 3: No activity fits this gap"
    ]);
    // Placed counts them as not filled.
    expect(counterText(element)).not.toMatch(/^(\d+)of \1 placed$/);
  });

  it("the engine's notes with no cell are in the Why list for the week it just built", async () => {
    const inputs = camp({
      ...SMALL,
      activities: [{ name: "Swim", min: 0, max: 5, atOnce: 2 }]
    });
    const atOnce = Object.keys(inputs.activities[0]).find((k) =>
      /GroupsAtOnce__c$/.test(k)
    );
    inputs.activities = inputs.activities.map((a) => ({
      ...a,
      [atOnce]: null
    }));
    const element = await render(inputs);
    await generate(element);
    expect(checks(element).measure.notes.map((l) => l.text)).toEqual([
      "Swim: Groups at once is blank, so it counts as 1"
    ]);
  });

  // Greg 2026-10-27 (protocol section 10): Rebuild keeps the week and changes only what setup
  // forces, saying so in the Why list; Try another stays a fresh build (above).
  // GEN-10.7
  it("Rebuild keeps the week as it is when setup hasn't changed, and says so in the Why list", async () => {
    const inputs = camp(SMALL);
    const element = await render(inputs);
    await generate(element);
    const first = sent(0).days.map((d) => d.rows);
    action(element, "Rebuild").click();
    await flush();
    saveWeekOnServer.mockResolvedValueOnce(savedAnswer(2));
    q(element, '[data-id="confirm-go"]').click();
    await settle(element);
    expect(sent(1).action).toBe("Rebuild");
    expect(sent(1).days.map((d) => d.rows)).toEqual(first);
    expect(checks(element).measure.notes.map((l) => l.text)).toEqual([
      "Nothing in setup needed a change, so everything was kept as it was."
    ]);
  });

  // GEN-9.7
  it("the engine's reasons and notes are kept with the week: opened again, the Why list says the same", async () => {
    // Every activity takes two blocks (Period 3 is a gap none fits) and Hike's groups at once is
    // blank (a note with no cell).
    const spec = {
      ...SMALL,
      activities: [{ name: "Hike", min: 0, max: 5, atOnce: 2, length: 2 }]
    };
    const blankAtOnce = (inputs) => {
      const atOnce = Object.keys(inputs.activities[0]).find((k) =>
        /GroupsAtOnce__c$/.test(k)
      );
      inputs.activities = inputs.activities.map((a) => ({
        ...a,
        [atOnce]: null
      }));
      return inputs;
    };
    const element = await render(blankAtOnce(camp(spec)));
    await generate(element);
    const open = checks(element).measure.open.map((l) => l.text);
    const notes = checks(element).measure.notes.map((l) => l.text);
    expect(open).toContain(
      "Bunk 1 · Monday · Period 3: No activity fits this gap"
    );
    expect(notes).toEqual(["Hike: Groups at once is blank, so it counts as 1"]);
    // Kept as codes and Ids, never sentences.
    const kept = sent().engineNotes;
    expect(typeof kept).toBe("string");
    expect(kept).not.toContain("No activity fits");

    // The same week opened later (another day, the draft and what was kept with it).
    const days = sent().days;
    const saved = blankAtOnce(camp({ ...spec, scheduleId: SCHEDULE }));
    saved.days = saved.days.map((day, i) => ({
      ...day,
      items: days[i].items.map((it) => ({ ...it, gone: false })),
      rows: days[i].rows
    }));
    saved.engine = { notes: kept };
    document.body.removeChild(element);
    const again = await render(saved);
    expect(checks(again).measure.open.map((l) => l.text)).toEqual(open);
    expect(checks(again).measure.notes.map((l) => l.text)).toEqual(notes);
  });

  it("notes kept in a shape this screen doesn't know are never shown", async () => {
    const saved = camp({ ...SMALL, scheduleId: SCHEDULE });
    saved.engine = { notes: '{"v":99,"open":[["<b>raw</b>"]]}' };
    const element = await render(saved);
    expect(checks(element).measure.notes).toEqual([]);
  });

  it("lists a cell that bends a rule, never on the grid, worked out again on load", async () => {
    // One activity with a weekly max of 0: never blank goes over the limit on the first day shown
    // (it never doubles up in a day: once a day is a limit, Greg 2026-10-25).
    const inputs = camp({
      ...SMALL,
      activities: [{ name: "Swim", min: 0, max: 0, atOnce: 2 }]
    });
    const element = await render(inputs);
    await generate(element);
    expectCleanGrid(element);
    const look = checks(element).measure.look.map((l) => l.text);
    expect(look.length).toBeGreaterThan(0);
    expect(look.some((w) => w.includes("Over its weekly limit"))).toBe(true);

    // The same week opened later lists the same.
    const days = sent().days;
    const saved = camp({
      ...SMALL,
      activities: [{ name: "Swim", min: 0, max: 0, atOnce: 2 }],
      scheduleId: SCHEDULE
    });
    saved.days = saved.days.map((day, i) => ({
      ...day,
      items: days[i].items.map((it) => ({ ...it, gone: false })),
      rows: days[i].rows
    }));
    document.body.removeChild(element);
    const again = await render(saved);
    expect(checks(again).measure.look.map((l) => l.text)).toEqual(look);
  });

  it("the counter's under row shows that activity; a line to look at takes the director to that bunk", async () => {
    // Swim owed three times in two days, at most once a day: under its goal.
    const inputs = camp({
      ...SMALL,
      activities: [
        { name: "Swim", min: 3, max: 3, atOnce: 2 },
        { name: "Art", min: 0, max: 5, atOnce: 2 }
      ]
    });
    const element = await render(inputs);
    await generate(element);
    await openCounter(element);
    const swim = checks(element).shadowRoot.querySelector(
      "button[data-activity]"
    );
    expect(swim.textContent.replace(/\s+/g, " ").trim()).toMatch(
      /^Swim\d+of 6$/
    );
    swim.click();
    await flush();
    expect(
      q(element, '[data-view="activity"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(q(element, ".drill-name").textContent).toBe("Swim");
  });

  it("an activity closed this week is never counted under: the counter measures what the checks check", async () => {
    // Swim (three a week) is closed this week; Art has no goal or limit. Nothing is under or over.
    const inputs = camp({
      ...SMALL,
      activities: [
        { name: "Swim", min: 3, max: 3, atOnce: 2 },
        { name: "Art", min: 0, max: null, atOnce: 2 }
      ]
    });
    const swimId = inputs.activities[0].Id;
    inputs.weekExceptions = [
      nsRecord({ Id: "a0X000000000001AAA", Week__c: WEEK, Activity__c: swimId })
    ];
    const element = await render(inputs);
    await generate(element);
    await openCounter(element);
    const root = checks(element).shadowRoot;
    expect(root.querySelector(`button[data-activity="${swimId}"]`)).toBeNull();
    expect(root.querySelector('[data-id="under"]')).toBeNull();
    // What it couldn't fill is listed as Open, in the engine's words; nothing else is.
    expect(whyLines(element)).toEqual([
      "Bunk 1 · Monday · Period 2: Everything for Bunk 1 is taken then",
      "Bunk 1 · Monday · Period 3: Everything for Bunk 1 is taken then",
      "Bunk 2 · Monday · Period 2: Everything for Bunk 2 is taken then",
      "Bunk 1 · Tuesday · Period 2: Everything for Bunk 1 is taken then",
      "Bunk 1 · Tuesday · Period 3: Everything for Bunk 1 is taken then",
      "Bunk 2 · Tuesday · Period 2: Everything for Bunk 2 is taken then"
    ]);
  });

  it("cells can be reached from the keyboard and changed by hand, never through a whole-week save", async () => {
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
    // An activity can be changed by hand (the editor's grid), and so can Flagpole (Greg,
    // 2026-10-26), but only as a hand edit, never through a whole-week save.
    const swim = all.find(
      (c) => c.querySelector(".cell-name").textContent === "Swim"
    );
    expect(swim.getAttribute("aria-readonly")).toBeNull();
    const flagpole = all.find(
      (c) => c.querySelector(".cell-name").textContent === "Flagpole"
    );
    expect(flagpole.getAttribute("aria-readonly")).toBeNull();
    const before = sent().days;
    flagpole.dispatchEvent(
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
    ).toEqual(["Daily", "Group", "Activity"]);
    // The quiet line under the grid names the hatch (a bunk away part of the day).
    expect(
      q(element, '[data-id="edit-grid"]').shadowRoot.querySelector(
        '[data-id="legend"]'
      ).textContent
    ).toContain("not at camp");
  });

  describe("a short build, and Start over", () => {
    it("shows a moving bar with no number for a build too short to report, and its own words for Start over", async () => {
      const element = await render();
      let answer;
      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      q(element, '[data-id="generate"]').click();
      await until(() => saveWeekOnServer.mock.calls.length > 0);
      const bar = q(element, '[role="progressbar"]');
      expect(bar.className).toContain("progress_moving");
      expect(bar.getAttribute("aria-valuenow")).toBeNull();
      answer(savedAnswer());
      await settle(element);

      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      action(element, "StartOver").click();
      await flush();
      expect(q(element, '[data-id="busy"]').textContent).toContain(
        "Starting over…"
      );
      expect(q(element, '[data-id="busy"]').textContent).not.toContain(
        "Generating"
      );
      // Start over builds nothing: nothing to stop.
      expect(q(element, '[data-id="stop-build"]')).toBeNull();
      expect(q(element, '[data-id="announce"]').textContent).toContain(
        "Starting over…"
      );
      answer(savedAnswer(2));
      await settle(element);
    });

    it("a long build's bar reaches 100 before the save", async () => {
      const element = await render(camp(BIG));
      let answer;
      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      q(element, '[data-id="generate"]').click();
      await until(() => saveWeekOnServer.mock.calls.length > 0);
      expect(
        q(element, '[role="progressbar"]').getAttribute("aria-valuenow")
      ).toBe("100");
      answer(savedAnswer());
      await settle(element);
    });
  });

  describe("conflicts stay until the director answers them", () => {
    it("the season read again mid-build, then a conflict: the box stays, with focus on Reload", async () => {
      const element = await render(camp(BIG));
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: true,
        message: CONFLICT_SENTENCE
      });
      q(element, '[data-id="generate"]').click();
      await flush();
      element.setup = { ...SETUP };
      await settle(element);
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
      expect(element.shadowRoot.activeElement).toBe(
        q(element, '[data-id="reload"]')
      );
      // No read was made behind the box.
      expect(getInputs).toHaveBeenCalledTimes(1);
    });

    it("the season read again while the box shows: the box stays", async () => {
      const element = await render();
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: true,
        message: CONFLICT_SENTENCE
      });
      q(element, '[data-id="generate"]').click();
      await settle(element);
      element.setup = { ...SETUP };
      await flush();
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="conflict"]')).not.toBeNull();
      expect(getInputs).toHaveBeenCalledTimes(1);
    });

    it("the conflict is read out once, by its alert box", async () => {
      const element = await render();
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: true,
        message: CONFLICT_SENTENCE
      });
      q(element, '[data-id="generate"]').click();
      await settle(element);
      expect(q(element, '[data-id="announce"]').textContent).not.toContain(
        "Someone else"
      );
    });

    it("an already generated week: every action waits for Reload", async () => {
      const element = await render();
      await generate(element);
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: true,
        message: CONFLICT_SENTENCE
      });
      action(element, "TryAnother").click();
      await settle(element);
      ["Rebuild", "TryAnother", "StartOver"].forEach((name) =>
        expect(action(element, name).disabled).toBe(true)
      );
    });

    it("Reload holds the actions until the week is read, then puts focus on Build", async () => {
      const element = await render();
      await generate(element);
      saveWeekOnServer.mockResolvedValueOnce({
        conflict: true,
        message: CONFLICT_SENTENCE
      });
      action(element, "TryAnother").click();
      await settle(element);
      let answerRead;
      getInputs.mockReturnValueOnce(
        new Promise((resolve) => {
          answerRead = resolve;
        })
      );
      q(element, '[data-id="reload"]').click();
      await flush();
      expect(q(element, '[data-id="conflict"]')).toBeNull();
      expect(action(element, "TryAnother").disabled).toBe(true);
      answerRead(camp({ ...SMALL, scheduleId: SCHEDULE, option: 3 }));
      await flush();
      expect(action(element, "TryAnother").disabled).toBe(false);
      expect(element.shadowRoot.activeElement).toBe(buildMenu(element));
      expect(q(element, '[data-id="announce"]').textContent).toContain(
        "Week 1 as saved now."
      );
      // Every option up to the one saved can be brought back.
      expect(optionValues(element)).toEqual(["1", "2", "3"]);
    });
  });

  describe("reads and builds that overlap", () => {
    it("a read that failed, then one that works: its error goes", async () => {
      const element = await render();
      await generate(element);
      getInputs.mockRejectedValueOnce({
        body: { message: "Network went away." }
      });
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="build-error"]').textContent).toContain(
        "Network went away."
      );
      getInputs.mockResolvedValueOnce(camp({ ...SMALL, scheduleId: SCHEDULE }));
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="build-error"]')).toBeNull();
    });

    it("a refused save's sentence stays when the week is read again after it", async () => {
      const element = await render(camp(BIG));
      await generate(element);
      saveWeekOnServer.mockRejectedValueOnce({
        body: { message: "Flagpole stays where it is set up." }
      });
      action(element, "TryAnother").click();
      await flush();
      getInputs.mockResolvedValueOnce(camp({ ...BIG, scheduleId: SCHEDULE }));
      element.setup = { ...SETUP };
      await settle(element);
      await flush();
      expect(q(element, '[data-id="build-error"]').textContent).toContain(
        "Flagpole stays where it is set up."
      );
    });

    it("a read that failed, then a refused save: the save's sentence outlasts the next read", async () => {
      const element = await render();
      await generate(element);
      getInputs.mockRejectedValueOnce({
        body: { message: "Network went away." }
      });
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      saveWeekOnServer.mockRejectedValueOnce({
        body: { message: "Flagpole stays where it is set up." }
      });
      action(element, "TryAnother").click();
      await settle(element);
      getInputs.mockResolvedValueOnce(camp({ ...SMALL, scheduleId: SCHEDULE }));
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="build-error"]').textContent).toContain(
        "Flagpole stays where it is set up."
      );
    });

    it("the week a confirm is about is gone from setup: the confirm closes", async () => {
      const element = await render();
      await generate(element);
      action(element, "Rebuild").click();
      await flush();
      getInputs.mockResolvedValueOnce(camp(SMALL));
      element.setup = { ...SETUP, weeks: [{ Id: WEEK_2, Name: "Week 2" }] };
      await flush();
      expect(q(element, '[data-id="confirm"]')).toBeNull();
    });

    it("another season chosen mid-build: the build stops and nothing is saved", async () => {
      const element = await render(camp(BIG));
      q(element, '[data-id="generate"]').click();
      await flush();
      // The page clears setup first while it reads the new season.
      element.setup = null;
      let turns = 0;
      await until(() => turns++ >= 20);
      expect(saveWeekOnServer).not.toHaveBeenCalled();
      expect(q(element, '[data-id="busy"]')).toBeNull();
    });

    it("coming back to the window mid-build doesn't stop it or read over it", async () => {
      const element = await render(camp(BIG));
      saveWeekOnServer.mockResolvedValueOnce(savedAnswer());
      q(element, '[data-id="generate"]').click();
      await flush();
      window.dispatchEvent(new CustomEvent("focus"));
      await settle(element);
      expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
      expect(getInputs).toHaveBeenCalledTimes(1);
      expect(grid(element)).not.toBeNull();
    });

    it("coming back to the window with the confirm open leaves it open", async () => {
      const element = await render();
      await generate(element);
      action(element, "Rebuild").click();
      await flush();
      window.dispatchEvent(new CustomEvent("focus"));
      await flush();
      expect(q(element, '[data-id="confirm"]')).not.toBeNull();
      expect(getInputs).toHaveBeenCalledTimes(1);
    });

    it("the season read again with the confirm open: it stays, and the week is read once it closes", async () => {
      const element = await render();
      await generate(element);
      action(element, "Rebuild").click();
      await flush();
      element.setup = { ...SETUP };
      await flush();
      expect(q(element, '[data-id="confirm"]')).not.toBeNull();
      expect(getInputs).toHaveBeenCalledTimes(1);
      getInputs.mockResolvedValueOnce(camp({ ...SMALL, scheduleId: SCHEDULE }));
      q(element, '[data-id="confirm-cancel"]').click();
      await flush();
      expect(getInputs).toHaveBeenCalledTimes(2);
    });

    it("leaving the page mid-save: the answer changes nothing", async () => {
      const element = await render();
      let answer;
      saveWeekOnServer.mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      q(element, '[data-id="generate"]').click();
      await until(() => saveWeekOnServer.mock.calls.length > 0);
      document.body.removeChild(element);
      answer(savedAnswer());
      await flush();
      document.body.appendChild(element);
      await flush();
      expect(q(element, '[data-id="generate"]')).not.toBeNull();
      expect(grid(element)).toBeNull();
    });

    it("a second click while building builds once", async () => {
      const element = await render(camp(BIG));
      saveWeekOnServer.mockResolvedValue(savedAnswer());
      q(element, '[data-id="generate"]').click();
      q(element, '[data-id="generate"]').click();
      await settle(element);
      expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
    });

    it("the week picker waits while building", async () => {
      const element = await render(camp(BIG));
      saveWeekOnServer.mockResolvedValueOnce(savedAnswer());
      q(element, '[data-id="generate"]').click();
      await flush();
      expect(q(element, '[data-id="week"]').disabled).toBe(true);
      await settle(element);
      expect(q(element, '[data-id="week"]').disabled).toBe(false);
    });

    it("opens on the week the Schedules doorway names, as the week picker would (wiki decision 61)", async () => {
      const element = await render();
      getInputs.mockClear();
      expect(element.openWeek(WEEK_2)).toBe(true);
      await flush();
      expect(q(element, '[data-id="week"]').value).toBe(WEEK_2);
      expect(getInputs).toHaveBeenLastCalledWith({
        programId: PROGRAM,
        weekId: WEEK_2
      });
      // The week already shown: nothing read again. A week not in the season: nothing changes.
      getInputs.mockClear();
      expect(element.openWeek(WEEK_2)).toBe(true);
      expect(element.openWeek("a0W00000000000XAAA")).toBe(false);
      await flush();
      expect(getInputs).not.toHaveBeenCalled();
      expect(q(element, '[data-id="week"]').value).toBe(WEEK_2);
    });

    it("while building, the doorway leaves the week shown, as the waiting picker does", async () => {
      const element = await render(camp(BIG));
      const told = [];
      element.addEventListener("weekstate", (e) => told.push(e.detail));
      saveWeekOnServer.mockResolvedValueOnce(savedAnswer());
      q(element, '[data-id="generate"]').click();
      await flush();
      // The page hears the picker waits, so the doorway holds this screen's other weeks.
      expect(told[told.length - 1]).toEqual({ weekId: WEEK, locked: true });
      expect(element.openWeek(WEEK_2)).toBe(false);
      expect(q(element, '[data-id="week"]').value).toBe(WEEK);
      await settle(element);
      expect(saveWeekOnServer).toHaveBeenCalledTimes(1);
      expect(told[told.length - 1]).toEqual({ weekId: WEEK, locked: false });
    });
  });

  describe("focus and keys", () => {
    it("a line about the second block of a two-block cell takes focus to that cell", async () => {
      // Saved: both bunks hike Monday Periods 1-2, one bunk at a time: each cell overlaps.
      const inputs = camp({
        ...SMALL,
        scheduleId: SCHEDULE,
        activities: [{ name: "Hike", min: 0, max: 5, atOnce: 1, length: 2 }]
      });
      const hike = {
        kind: "A",
        id: inputs.activities[0].Id,
        name: "Hike",
        gone: false
      };
      inputs.days[0] = {
        ...inputs.days[0],
        items: [...inputs.days[0].items, hike],
        rows: ["1,2,^,", "1,2,^,"]
      };
      const element = await render(inputs);
      await openCounter(element);
      const line = [
        ...checks(element).shadowRoot.querySelectorAll(".look-row")
      ].find((b) =>
        b.textContent.trim().startsWith("Bunk 2 · Monday · Period 2")
      );
      expect(line).toBeTruthy();
      line.click();
      await flush();
      // Group View, Bunk 2: Monday's Hike cell starts in Period 1 (row 1).
      expect(grid(element).shadowRoot.activeElement.dataset.cell).toBe("0-1");
    });

    it("after the first Generate, focus is on Build; after one the engine can't build, on Generate", async () => {
      const element = await render();
      await generate(element);
      expect(element.shadowRoot.activeElement).toBe(buildMenu(element));

      document.body.removeChild(element);
      const none = await render(camp({ ...SMALL, activities: [] }));
      // The test's stand-in for Salesforce's button can't hold focus: see that it is asked to.
      const button = q(none, '[data-id="generate"]');
      button.focus = jest.fn();
      button.click();
      await settle(none);
      expect(button.focus).toHaveBeenCalled();
    });

    it("Escape in the confirm goes no further; Tab is kept from moving focus twice", async () => {
      const element = await render();
      await generate(element);
      action(element, "Rebuild").click();
      await flush();
      const dialog = q(element, '[data-id="confirm"]');
      const outside = jest.fn();
      element.shadowRoot
        .querySelector('[data-id="generated-schedule"]')
        .addEventListener("keydown", outside);
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true
      });
      dialog.dispatchEvent(tab);
      expect(tab.defaultPrevented).toBe(true);
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      expect(
        outside.mock.calls.filter((c) => c[0].key === "Escape")
      ).toHaveLength(0);
    });
  });
});
