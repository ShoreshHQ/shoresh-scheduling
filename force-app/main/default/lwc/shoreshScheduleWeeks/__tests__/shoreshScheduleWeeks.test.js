import { createElement } from "lwc";
import ShoreshScheduleWeeks from "c/shoreshScheduleWeeks";
import { buildTerms } from "c/shoreshTerms";

// Synthetic camp words and weeks.
const terms = buildTerms([
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
]);
const WEEKS = [
  { Id: "w1", Name: "Session 1" },
  { Id: "w2", Name: "Session 2" }
];

async function render(weeks = WEEKS) {
  const element = createElement("c-shoresh-schedule-weeks", {
    is: ShoreshScheduleWeeks
  });
  element.terms = terms;
  element.setup = { weeks };
  document.body.appendChild(element);
  await Promise.resolve();
  return element;
}

const rows = (element) => [
  ...element.shadowRoot.querySelectorAll("li[data-week]")
];
const buttons = (row) => [...row.querySelectorAll("button")];

describe("c-shoresh-schedule-weeks (the Schedules doorway, wiki decision 61)", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("lists the season's weeks in order, each with Generated Schedule and Manual Build", async () => {
    const element = await render();
    expect(
      rows(element).map((row) => row.querySelector(".week-name").textContent)
    ).toEqual(["Session 1", "Session 2"]);
    rows(element).forEach((row) => {
      // The menu's order (desktop navSections.js: by name; neither is the real schedule).
      expect(buttons(row).map((b) => b.dataset.screen)).toEqual([
        "generatedSchedule",
        "manualBuild"
      ]);
    });
    // No explaining sentences: the weeks and their two doors, nothing else.
    expect(element.shadowRoot.querySelectorAll("p").length).toBe(0);
    await expect(element).toBeAccessible();
  });

  it("each button is a real button, named with its week for screen readers", async () => {
    const element = await render();
    const [generated, manual] = buttons(rows(element)[1]);
    expect(generated.getAttribute("type")).toBe("button");
    expect(generated.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Generated Schedule, Session 2"
    );
    expect(manual.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Manual Build, Session 2"
    );
    expect(manual.querySelector(".slds-assistive-text").textContent).toBe(
      ", Session 2"
    );
    // In the tab order, one after another (a native button takes Enter and Space).
    expect(manual.tabIndex).toBe(0);
    manual.focus();
    expect(element.shadowRoot.activeElement).toBe(manual);
  });

  it("asks to open that schedule on that week", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const [generated, manual] = buttons(rows(element)[1]);
    manual.click();
    generated.click();
    buttons(rows(element)[0])[1].click();
    expect(handler.mock.calls.map((call) => call[0].detail)).toEqual([
      { screen: "manualBuild", weekId: "w2" },
      { screen: "generatedSchedule", weekId: "w2" },
      { screen: "manualBuild", weekId: "w1" }
    ]);
  });

  it("while a schedule's week picker waits, its button is held on every other week, as the picker is", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const held = () =>
      rows(element).map((row) => buttons(row).map((b) => b.disabled));
    expect(held()).toEqual([
      [false, false],
      [false, false]
    ]);
    // Manual Build is busy on Session 1: Session 2's Manual Build waits; Session 1's still opens
    // the week shown, and Generated Schedule is not held.
    element.held = {
      manualBuild: { weekId: "w1", locked: true },
      generatedSchedule: { weekId: "w2", locked: false }
    };
    await Promise.resolve();
    expect(held()).toEqual([
      [false, false],
      [false, true]
    ]);
    buttons(rows(element)[1])[1].click();
    expect(handler).not.toHaveBeenCalled();
    // No explaining sentences: the held button looks like any button waiting.
    expect(element.shadowRoot.querySelectorAll("p").length).toBe(0);
    await expect(element).toBeAccessible();
    // The work done: every button opens again.
    element.held = { manualBuild: { weekId: "w1", locked: false } };
    await Promise.resolve();
    expect(held()).toEqual([
      [false, false],
      [false, false]
    ]);
  });

  it("with no weeks yet, says so in the camp's words and leads to the weeks screen", async () => {
    const element = await render([]);
    expect(rows(element).length).toBe(0);
    expect(
      element.shadowRoot.querySelector("c-shoresh-empty-state").title
    ).toBe("No Sessions yet");
    const go = element.shadowRoot.querySelector('[data-id="to-weeks"]');
    expect(go.textContent.trim()).toBe("Sessions →");
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    go.click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "weeks" });
    await expect(element).toBeAccessible();
  });
});
