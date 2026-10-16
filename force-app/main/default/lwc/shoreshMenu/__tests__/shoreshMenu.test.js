import { createElement } from "lwc";
import ShoreshMenu from "c/shoreshMenu";
import { menuSections, canOpen } from "c/shoreshScreens";
import { buildTerms } from "c/shoreshTerms";

const terms = buildTerms([
  { term: "Group", singular: "Bunk", plural: "Bunks", isCustom: true },
  {
    term: "Activity",
    singular: "Period",
    plural: "Periods",
    isCustom: true
  },
  {
    term: "SpecialEvent",
    singular: "Special event",
    plural: "Special events",
    isCustom: false
  }
]);

const flush = () => Promise.resolve();

async function render(hasSeason = true, current = "roots") {
  const element = createElement("c-shoresh-menu", { is: ShoreshMenu });
  element.sections = menuSections(terms, hasSeason);
  element.current = current;
  document.body.appendChild(element);
  await flush();
  return element;
}

describe("c-shoresh-menu", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("lists Roots, Camp, Activities and Schedules, in the camp's words", async () => {
    const element = await render();
    expect(
      [...element.shadowRoot.querySelectorAll("h2")].map((h) => h.textContent)
    ).toEqual(["Camp", "Periods"]);
    // Each entry: its words, and whether it says "Coming".
    const entries = [...element.shadowRoot.querySelectorAll("[data-item]")].map(
      (item) => {
        const badge = item.querySelector(".slds-badge");
        const words = item.textContent.replace(
          badge ? badge.textContent : "",
          ""
        );
        return badge ? `${words.trim()} (${badge.textContent})` : words.trim();
      }
    );
    expect(entries).toEqual([
      "Roots",
      "Weeks",
      "Programs",
      "Divisions",
      "Bunks",
      "Time blocks",
      "Locations",
      "Camp words",
      "Periods",
      "Fixed Periods (Coming)",
      "Recurring Periods (Coming)",
      "Special events (Coming)",
      "Schedules (Coming)"
    ]);
  });

  it("marks the screen shown", async () => {
    const element = await render(true, "groups");
    const active = element.shadowRoot.querySelectorAll(".slds-is-active");
    expect(active.length).toBe(1);
    expect(active[0].textContent.trim()).toBe("Bunks");
    expect(active[0].querySelector("a").getAttribute("aria-current")).toBe(
      "page"
    );
  });

  it("asks to open a screen when one is clicked", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    element.shadowRoot.querySelector('a[data-screen="locations"]').click();
    expect(handler.mock.calls[0][0].detail).toEqual({ screen: "locations" });
  });

  it("coming entries, and before a season everything but camp words, cannot be opened", async () => {
    const element = await render(false, null);
    const links = [...element.shadowRoot.querySelectorAll("a[data-screen]")];
    expect(links.map((a) => a.dataset.screen)).toEqual(["campWords"]);
    expect(canOpen("schedules", true)).toBe(false);
    expect(canOpen("weeks", false)).toBe(false);
    expect(canOpen("weeks", true)).toBe(true);
  });
});
