import { createElement } from "lwc";
import ShoreshCopySeason from "c/shoreshCopySeason";
import previewCopy from "@salesforce/apex/SeasonSetupController.previewCopy";
import copySeason from "@salesforce/apex/SeasonSetupController.copySeason";
import { buildTerms } from "c/shoreshTerms";
import { nsRecord } from "shoresh-jest/namespace";

jest.mock(
  "@salesforce/apex/SeasonSetupController.previewCopy",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/SeasonSetupController.copySeason",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const SEASON = {
  Id: "s1",
  Name: "Summer 2026",
  StartDate__c: "2026-06-29",
  EndDate__c: "2026-08-07"
};
const terms = buildTerms([
  { term: "Week", singular: "Session", plural: "Sessions", isCustom: true }
]);

const SAME_DAYS = {
  startDate: "2027-06-28",
  endDate: "2027-08-06",
  oldWeekday: "Monday",
  newWeekday: "Monday",
  weekdaysChange: false,
  weeks: [
    {
      name: "Session 1",
      oldStartDate: "2026-06-29",
      oldEndDate: "2026-07-03",
      startDate: "2027-06-28",
      endDate: "2027-07-02"
    }
  ]
};

// Lets pending (mocked) server calls and re-renders finish before checking the screen.
const flush = () =>
  [...Array(10)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render() {
  const element = createElement("c-shoresh-copy-season", {
    is: ShoreshCopySeason
  });
  element.season = nsRecord(SEASON);
  element.terms = terms;
  document.body.appendChild(element);
  await flush();
  return element;
}

function button(element, id) {
  return element.shadowRoot.querySelector(`button[data-id="${id}"]`);
}

const texts = (element, selector) =>
  [...element.shadowRoot.querySelectorAll(selector)].map((el) =>
    el.textContent.trim()
  );

describe("c-shoresh-copy-season", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("suggests a name and date and previews where every week lands", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    expect(previewCopy).toHaveBeenCalledWith({
      seasonId: "s1",
      newStartDate: "2027-06-28"
    });
    const [name, date] = element.shadowRoot.querySelectorAll("lightning-input");
    expect(name.value).toBe("Summer 2027");
    expect(date.value).toBe("2027-06-28");
    // Marked for the date box style (its calendar button at least 24 by 24).
    expect(date.classList.contains("shoresh-date")).toBe(true);
    // Last season's weeks over the new ones, each row named by its season.
    const old = element.shadowRoot.querySelector('[data-id="old-weeks"]');
    const now = element.shadowRoot.querySelector('[data-id="new-weeks"]');
    expect(old.querySelector("th").textContent.trim()).toBe("Summer 2026");
    expect(now.querySelector("th").textContent.trim()).toBe("Summer 2027");
    expect(old.textContent).toContain("Session 1");
    const dates = (row) =>
      [...row.querySelectorAll("lightning-formatted-date-time")].map(
        (d) => d.value
      );
    expect(dates(old)).toEqual(["2026-06-29"]);
    expect(dates(now)).toEqual(["2027-06-28"]);
    expect(
      element.shadowRoot.querySelector("table").getAttribute("aria-label")
    ).toBe("Sessions in Summer 2026 and in the new season");
    expect(
      element.shadowRoot.querySelector('[data-id="weekday-warning"]')
    ).toBeNull();
    // The heading says what and from which season; the button names the result.
    expect(
      element.shadowRoot
        .querySelector('[data-id="copy-title"]')
        .getAttribute("aria-label")
    ).toBe("Copy season Summer 2026");
    expect(button(element, "copy").textContent.trim()).toBe(
      "Copy to Summer 2027"
    );
  });

  it("shows what comes along and what stays behind, in the camp's words", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    expect(texts(element, '[data-id="comes-along"] li')).toEqual([
      "Sessions",
      "Programs",
      "Divisions",
      "Groups",
      "Time blocks",
      "Locations",
      "Camp words",
      "Activities",
      "Fixed activities",
      "Recurring activities",
      "Elective sets"
    ]);
    expect(texts(element, '[data-id="stays-behind"] h3')).toEqual([
      "Stays in Summer 2026"
    ]);
    // Elective seats and the campers' choices belong to the summer (decision 56, ADR 0018).
    expect(texts(element, '[data-id="stays-behind"] li')).toEqual([
      "Schedules",
      "Versions",
      "Special days",
      "Special events",
      "Elective seats",
      "Camper choices"
    ]);
  });

  it("gives the new dates in words for a season without weeks", async () => {
    previewCopy.mockResolvedValue({ ...SAME_DAYS, weeks: [] });
    const element = await render();
    expect(element.shadowRoot.querySelector("table")).toBeNull();
    const dates = element.shadowRoot.querySelector('[data-id="new-dates"]');
    expect(
      [...dates.querySelectorAll("lightning-formatted-date-time")].map(
        (d) => d.value
      )
    ).toEqual(["2027-06-28", "2027-08-06"]);
  });

  it("is accessible", async () => {
    previewCopy.mockResolvedValue({
      ...SAME_DAYS,
      oldWeekday: "Monday",
      newWeekday: "Tuesday",
      weekdaysChange: true
    });
    const element = await render();
    await expect(element).toBeAccessible();
  });

  it("warns when the new start date moves weeks to other weekdays", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    previewCopy.mockResolvedValue({
      ...SAME_DAYS,
      newWeekday: "Tuesday",
      weekdaysChange: true
    });
    const date = element.shadowRoot.querySelectorAll("lightning-input")[1];
    date.dispatchEvent(
      new CustomEvent("change", { detail: { value: "2027-06-29" } })
    );
    await flush();
    const warning = element.shadowRoot.querySelector(
      '[data-id="weekday-warning"]'
    );
    // Shown, not refused: the mark and one line.
    expect(warning.textContent.trim()).toBe("Summer 2026 started on a Monday");
    expect(warning.parentElement.getAttribute("role")).toBe("status");
    expect(
      element.shadowRoot.querySelector('[data-id="weekday-mark"]')
    ).not.toBeNull();
    expect(button(element, "copy").disabled).toBe(false);
  });

  it("copies and reports the new season", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    copySeason.mockResolvedValue("s2");
    const element = await render();
    const copied = jest.fn();
    element.addEventListener("copied", copied);
    const name = element.shadowRoot.querySelectorAll("lightning-input")[0];
    name.dispatchEvent(
      new CustomEvent("change", { detail: { value: "Summer 27" } })
    );
    await flush();
    expect(button(element, "copy").textContent.trim()).toBe(
      "Copy to Summer 27"
    );
    button(element, "copy").click();
    await flush();
    expect(copySeason).toHaveBeenCalledWith({
      seasonId: "s1",
      newName: "Summer 27",
      newStartDate: "2027-06-28"
    });
    expect(copied.mock.calls[0][0].detail).toEqual({ seasonId: "s2" });
  });

  it("shows why a copy failed and stays open", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    copySeason.mockRejectedValue({
      body: { message: "Give the new season a name." }
    });
    const element = await render();
    const copied = jest.fn();
    element.addEventListener("copied", copied);
    button(element, "copy").click();
    await flush();
    expect(element.shadowRoot.textContent).toContain(
      "Give the new season a name."
    );
    expect(copied).not.toHaveBeenCalled();
  });

  it("cannot copy without a preview, and shows why the preview failed", async () => {
    previewCopy.mockRejectedValue({
      body: { message: "Choose a start date for the new season." }
    });
    const element = await render();
    expect(button(element, "copy").disabled).toBe(true);
    expect(element.shadowRoot.textContent).toContain("Choose a start date");
  });

  it("cannot copy without a name, and then names no result", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    const name = element.shadowRoot.querySelectorAll("lightning-input")[0];
    name.dispatchEvent(new CustomEvent("change", { detail: { value: "  " } }));
    await flush();
    expect(button(element, "copy").disabled).toBe(true);
    expect(button(element, "copy").textContent.trim()).toBe("Copy season");
  });

  it("puts the cursor on its heading when it opens", async () => {
    const element = await render();
    const title = element.shadowRoot.querySelector('[data-id="copy-title"]');
    expect(element.shadowRoot.activeElement).toBe(title);
    expect(title.getAttribute("tabindex")).toBe("-1");
  });

  it("cancel goes back", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    const cancel = jest.fn();
    element.addEventListener("cancel", cancel);
    button(element, "cancel").click();
    expect(cancel).toHaveBeenCalled();
  });

  it("shows the preview for the date chosen last, even if an earlier answer is slow", async () => {
    let answerFirst;
    previewCopy.mockResolvedValueOnce(SAME_DAYS);
    const element = await render();
    previewCopy
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answerFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ ...SAME_DAYS, newWeekday: "Monday" });
    const date = element.shadowRoot.querySelectorAll("lightning-input")[1];
    date.dispatchEvent(
      new CustomEvent("change", { detail: { value: "2027-06-29" } })
    );
    date.dispatchEvent(
      new CustomEvent("change", { detail: { value: "2027-07-05" } })
    );
    await flush();
    answerFirst({ ...SAME_DAYS, newWeekday: "Tuesday", weekdaysChange: true });
    await flush();
    expect(
      element.shadowRoot.querySelector('[data-id="weekday-warning"]')
    ).toBeNull();
  });
});
