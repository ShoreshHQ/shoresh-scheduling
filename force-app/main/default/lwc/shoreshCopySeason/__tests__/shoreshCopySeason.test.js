import { createElement } from "lwc";
import ShoreshCopySeason from "c/shoreshCopySeason";
import previewCopy from "@salesforce/apex/SeasonSetupController.previewCopy";
import copySeason from "@salesforce/apex/SeasonSetupController.copySeason";
import { buildTerms } from "c/shoreshTerms";

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
  element.season = SEASON;
  element.terms = terms;
  document.body.appendChild(element);
  await flush();
  return element;
}

function button(element, label) {
  return [...element.shadowRoot.querySelectorAll("lightning-button")].find(
    (b) => b.label === label
  );
}

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
    expect(element.shadowRoot.textContent).toContain("Session 1");
    expect(element.shadowRoot.textContent).toContain("stays exactly as it is");
    expect(
      element.shadowRoot.querySelector('[data-id="weekday-warning"]')
    ).toBeNull();
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
    expect(warning.textContent).toContain("this date is a Tuesday");
    expect(warning.textContent).toContain("Every Session will move");
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
    button(element, "Copy season").click();
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
    button(element, "Copy season").click();
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
    expect(button(element, "Copy season").disabled).toBe(true);
    expect(element.shadowRoot.textContent).toContain("Choose a start date");
  });

  it("cancel goes back", async () => {
    previewCopy.mockResolvedValue(SAME_DAYS);
    const element = await render();
    const cancel = jest.fn();
    element.addEventListener("cancel", cancel);
    button(element, "Cancel").click();
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
