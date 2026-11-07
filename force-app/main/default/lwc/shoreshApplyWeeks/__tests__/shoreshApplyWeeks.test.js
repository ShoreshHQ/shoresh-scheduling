/**
 * Apply to other weeks (WEEK-6.2, ADR 0025 choice 5): the preview week by week, one call per
 * week, then the apply. Synthetic camp only.
 */
import { createElement } from "lwc";
import ShoreshApplyWeeks from "c/shoreshApplyWeeks";
import previewApply from "@salesforce/apex/WeekApplyController.previewApply";
import applyToWeek from "@salesforce/apex/WeekApplyController.applyToWeek";
import { buildTerms } from "c/shoreshTerms";

const apex = () => ({ default: jest.fn() });
jest.mock("@salesforce/apex/WeekApplyController.previewApply", () => apex(), {
  virtual: true
});
jest.mock("@salesforce/apex/WeekApplyController.applyToWeek", () => apex(), {
  virtual: true
});

const WEEKS = [
  { value: "w2", label: "Week 2" },
  { value: "w3", label: "Week 3" },
  { value: "w4", label: "Week 4" }
];
const outcome = (weekId, more = {}) => ({
  weekId,
  seen: `seen-${weekId}`,
  cellsChanging: 12,
  keptLocked: [],
  leftOut: [],
  notPlaced: [],
  published: false,
  ...more
});

const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  const element = createElement("c-shoresh-apply-weeks", {
    is: ShoreshApplyWeeks
  });
  element.sourceId = "s1";
  element.sourceName = "Week 1";
  element.seenRevisions = "rev1";
  element.weeks = WEEKS;
  element.terms = buildTerms([]);
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const row = (element, week) => q(element, `li[data-week="${week}"]`);
const said = (element, week) =>
  row(element, week).querySelector('[data-id="said"]').textContent;
const lines = (element, week, id) =>
  [...row(element, week).querySelectorAll(`[data-id="${id}"]`)].map((line) =>
    line.textContent.trim()
  );

describe("c-shoresh-apply-weeks (WEEK-6.2)", () => {
  beforeEach(() => {
    previewApply.mockImplementation(({ weekId }) =>
      Promise.resolve(outcome(weekId))
    );
    applyToWeek.mockImplementation(({ weekId }) =>
      Promise.resolve(outcome(weekId, { applied: true }))
    );
  });
  afterEach(() => {
    jest.clearAllMocks();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("WEEK-6.2: shows each week first, one call per week, and changes nothing until Apply", async () => {
    const element = await render();
    expect(previewApply.mock.calls.map(([args]) => args)).toEqual(
      WEEKS.map((week) => ({
        scheduleId: "s1",
        weekId: week.value,
        seenRevisions: "rev1"
      }))
    );
    expect(said(element, "w2")).toBe("12 cells change");
    expect(q(element, '[data-id="yes"]').textContent.trim()).toBe(
      "Apply to 3 weeks"
    );
    expect(q(element, '[data-id="progress"]').textContent).toContain(
      "Versions"
    );
    expect(applyToWeek).not.toHaveBeenCalled();
  });

  it("WEEK-6.2: while it reads, Apply waits and it says how far it has got", async () => {
    let answer;
    previewApply.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        })
    );
    const element = await render();
    expect(q(element, '[data-id="progress"]').textContent).toBe("1 of 3");
    expect(q(element, '[data-id="yes"]').disabled).toBe(true);
    answer(outcome("w2"));
    await flush();
    expect(q(element, '[data-id="yes"]').disabled).toBe(false);
  });

  it("WEEK-6.2: each locked cell kept and each thing that can't go is listed under its week", async () => {
    previewApply.mockImplementationOnce(({ weekId }) =>
      Promise.resolve(
        outcome(weekId, {
          keptLocked: ["Swim · Bunk 3 · Day 3 · Period 2"],
          leftOut: ["Day 6: that week has no such day"]
        })
      )
    );
    const element = await render();
    expect(lines(element, "w2", "kept")).toEqual([
      expect.stringContaining("Swim · Bunk 3 · Day 3 · Period 2")
    ]);
    expect(lines(element, "w2", "cant-go")).toEqual([
      "Day 6: that week has no such day"
    ]);
    expect(lines(element, "w3", "kept")).toEqual([]);
  });

  it("WEEK-6.2: a published week says its published schedule stays", async () => {
    previewApply.mockImplementationOnce(({ weekId }) =>
      Promise.resolve(outcome(weekId, { published: true }))
    );
    const element = await render();
    expect(
      row(element, "w2").querySelector('[data-id="published"]').textContent
    ).toContain("stays as it is");
    expect(
      row(element, "w3").querySelector('[data-id="published"]')
    ).toBeNull();
  });

  it("WEEK-6.2: applies only the weeks left ticked, one call each, with what each preview saw", async () => {
    const element = await render();
    const box = row(element, "w3").querySelector("input");
    box.checked = false;
    box.dispatchEvent(new CustomEvent("change"));
    await flush();
    expect(q(element, '[data-id="yes"]').textContent.trim()).toBe(
      "Apply to 2 weeks"
    );
    q(element, '[data-id="yes"]').click();
    await flush();
    expect(applyToWeek.mock.calls.map(([args]) => args)).toEqual([
      { scheduleId: "s1", weekId: "w2", seen: "seen-w2" },
      { scheduleId: "s1", weekId: "w4", seen: "seen-w4" }
    ]);
    expect(said(element, "w2")).toBe("12 cells changed");
    expect(said(element, "w3")).toBe("Not changed");
    expect(q(element, '[data-id="close"]')).not.toBeNull();
  });

  it("WEEK-6.2: a week with no change or a day that can't be read isn't offered", async () => {
    previewApply
      .mockImplementationOnce(({ weekId }) =>
        Promise.resolve(outcome(weekId, { cellsChanging: 0 }))
      )
      .mockImplementationOnce(({ weekId }) =>
        Promise.resolve(
          outcome(weekId, {
            cellsChanging: 0,
            problem: "A day could not be read."
          })
        )
      );
    const element = await render();
    expect(said(element, "w2")).toBe("No change");
    expect(said(element, "w3")).toBe("A day could not be read.");
    for (const week of ["w2", "w3"]) {
      const box = row(element, week).querySelector("input");
      expect(box.disabled).toBe(true);
      expect(box.checked).toBe(false);
    }
    expect(q(element, '[data-id="yes"]').textContent.trim()).toBe(
      "Apply to 1 week"
    );
  });

  it("WEEK-6.2: a week someone saved since is said on its row; the others still go", async () => {
    applyToWeek.mockImplementationOnce(({ weekId }) =>
      Promise.resolve(outcome(weekId, { changedSince: true }))
    );
    const element = await render();
    q(element, '[data-id="yes"]').click();
    await flush();
    expect(said(element, "w2")).toContain("Someone else changed");
    expect(said(element, "w3")).toBe("12 cells changed");
  });

  it("WEEK-6.2: a week refused says why on its row; the others still go", async () => {
    applyToWeek.mockImplementationOnce(() =>
      Promise.reject(new Error("no words of ours"))
    );
    const element = await render();
    q(element, '[data-id="yes"]').click();
    await flush();
    expect(said(element, "w2")).toBe("Try again.");
    expect(said(element, "w3")).toBe("12 cells changed");
  });

  it("WEEK-6.2: the week on screen saved since it was read: stops, says so, nothing applied", async () => {
    previewApply.mockImplementationOnce(() =>
      Promise.resolve({ changedSince: true })
    );
    const element = await render();
    const closed = jest.fn();
    element.addEventListener("close", closed);
    expect(previewApply).toHaveBeenCalledTimes(1);
    expect(q(element, '[data-id="source-changed"]')).not.toBeNull();
    q(element, '[data-id="close"]').click();
    expect(closed.mock.calls[0][0].detail).toEqual({ sourceChanged: true });
    expect(applyToWeek).not.toHaveBeenCalled();
  });

  it("Cancel and Escape close with nothing applied; focus starts on Cancel", async () => {
    const element = await render();
    const closed = jest.fn();
    element.addEventListener("close", closed);
    expect(element.shadowRoot.activeElement).toBe(q(element, '[data-id="no"]'));
    q(element, '[data-id="no"]').click();
    q(element, '[data-id="apply"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    );
    expect(closed).toHaveBeenCalledTimes(2);
    expect(applyToWeek).not.toHaveBeenCalled();
  });

  it("Tab stays inside the question", async () => {
    const element = await render();
    q(element, '[data-id="yes"]').focus();
    q(element, '[data-id="apply"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true })
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="lines"]')
    );
  });
});
