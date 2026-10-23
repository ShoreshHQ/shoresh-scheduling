import { createElement } from "lwc";
import ShoreshMenu from "c/shoreshMenu";
import {
  menuSections,
  canOpen,
  nextScreen,
  previewScreen
} from "c/shoreshScreens";
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
    term: "FixedActivity",
    singular: "Anchor",
    plural: "Anchors",
    isCustom: true
  },
  {
    term: "RecurringActivity",
    singular: "Recurring activity",
    plural: "Recurring activities",
    isCustom: false
  },
  {
    term: "SpecialEvent",
    singular: "Special event",
    plural: "Special events",
    isCustom: false
  }
]);

const flush = () => Promise.resolve();

async function render(
  hasSeason = true,
  current = "roots",
  marks = {},
  more = {}
) {
  const element = createElement("c-shoresh-menu", { is: ShoreshMenu });
  element.sections = menuSections(terms, hasSeason, marks);
  element.current = current;
  Object.assign(element, more);
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

  it("lists Roots, Camp, Activities & Events and Schedules, in the camp's words", async () => {
    const element = await render();
    // The desktop's section titles (navSections.js NAV_SECTIONS), activities in the camp's word.
    expect(
      [...element.shadowRoot.querySelectorAll("h2")].map((h) => h.textContent)
    ).toEqual(["Camp", "Periods & Events", "Schedules"]);
    // Each entry: its words, and whether it says "Coming".
    const entries = [...element.shadowRoot.querySelectorAll("[data-item]")].map(
      (item) => {
        const badge = item.querySelector(".slds-badge");
        const reason = item.querySelector("[data-reason]");
        const words = item.textContent
          .replace(badge ? badge.textContent : "", "")
          .replace(reason ? reason.textContent : "", "");
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
      "Anchors",
      "Recurring activities",
      "Special events",
      "Electives (Coming)",
      "Generated Schedule",
      "Manual Build",
      "Schedules"
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

  it("the screen shown wears the one raised treatment; the rest don't (ADR 0015)", async () => {
    const element = await render(true, "manualBuild");
    const raised = [...element.shadowRoot.querySelectorAll(".shoresh-raised")];
    expect(raised.map((a) => a.dataset.screen)).toEqual(["manualBuild"]);
    // Roots has its sprout; the entries under a section title sit in from it.
    const roots = element.shadowRoot.querySelector('a[data-screen="roots"]');
    expect(roots.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
    expect(element.shadowRoot.querySelectorAll(".section_titled").length).toBe(
      3
    );
    await expect(element).toBeAccessible();
  });

  it("shows the camp's name and season at the top", async () => {
    const element = await render(
      true,
      "roots",
      {},
      {
        campName: "Camp Willow",
        seasonName: "Summer 2026"
      }
    );
    const camp = element.shadowRoot.querySelector('[data-id="camp"]');
    expect(camp.querySelector(".camp-name").textContent).toBe("Camp Willow");
    expect(camp.querySelector('[data-id="season"]').textContent).toBe(
      "Summer 2026"
    );
    // No camp yet (the page asks for one): no row.
    const bare = await render();
    expect(bare.shadowRoot.querySelector('[data-id="camp"]')).toBeNull();
  });

  it("with the page's own controls, the camp row is their slot, under the same hairline", async () => {
    const element = await render(
      true,
      "roots",
      {},
      { campName: "Camp Willow", seasonName: "Summer 2026", controls: true }
    );
    const camp = element.shadowRoot.querySelector('[data-id="camp"]');
    expect(camp.querySelector('slot[name="camp"]')).not.toBeNull();
    // The words are the page's pickers now, never shown twice.
    expect(camp.querySelector(".camp-name")).toBeNull();
    expect(camp.querySelector('[data-id="season"]')).toBeNull();
    expect(camp.nextElementSibling.classList).toContain("shoresh-hairline");
  });

  it("its foot says setup changed, with Update to match setup, only when asked", async () => {
    const element = await render(true, "manualBuild");
    expect(
      element.shadowRoot.querySelector('[data-id="setup-notice"]')
    ).toBeNull();
    element.setupChanged = true;
    await flush();
    const foot = element.shadowRoot.querySelector('[data-id="setup-notice"]');
    expect(foot.querySelector(".notice-what").textContent.trim()).toBe(
      "Setup changed"
    );
    const go = foot.querySelector('[data-id="menu-update-to-match"]');
    expect(go.textContent.trim()).toBe("Update to match setup");
    expect(go.tagName).toBe("BUTTON");
    expect(go.disabled).toBe(false);
    const handler = jest.fn();
    element.addEventListener("updatetomatch", handler);
    go.click();
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(element).toBeAccessible();
    // While the schedule is busy it waits, as the screen's own button does.
    element.setupBusy = true;
    await flush();
    expect(go.disabled).toBe(true);
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
    expect(canOpen("specialEvents", true)).toBe(true);
    expect(canOpen("specialEvents", false)).toBe(false);
    expect(canOpen("schedules", true)).toBe(true);
    expect(canOpen("generatedSchedule", true)).toBe(true);
    expect(canOpen("generatedSchedule", false)).toBe(false);
    expect(canOpen("schedules", false)).toBe(false);
    expect(canOpen("fixedActivities", true)).toBe(true);
    expect(canOpen("recurringActivities", false)).toBe(false);
    expect(canOpen("weeks", false)).toBe(false);
    expect(canOpen("weeks", true)).toBe(true);
    // Electives are built but stay coming until slice E11 (decision 44; repo ADR 0018).
    expect(canOpen("electives", true)).toBe(false);
  });

  it("the page's address opens Electives before the menu does, and nothing else (ADR 0018)", async () => {
    expect(previewScreen("electives")).toBe("electives");
    expect(previewScreen("weeks")).toBeNull();
    expect(previewScreen(undefined)).toBeNull();
    expect(canOpen("electives", true, "electives")).toBe(true);
    // Still a season first.
    expect(canOpen("electives", false, "electives")).toBe(false);
    const listed = menuSections(terms, true, {}, "electives")
      .flatMap((section) => section.items)
      .find((item) => item.key === "electives");
    expect(listed).toMatchObject({
      label: "Electives",
      coming: false,
      disabled: false
    });
    // Without it, the entry is coming, and Special events is still the last setup screen.
    const coming = menuSections(terms, true, {})
      .flatMap((section) => section.items)
      .find((item) => item.key === "electives");
    expect(coming).toMatchObject({ coming: true, reason: "Coming" });
    expect(nextScreen("specialEvents", terms, true)).toBeNull();
  });

  it("an entry that can't open stays in the tab order, unavailable, and says why", async () => {
    const element = await render(false, null);
    // Electives are coming (decision 44): menuSections marks them so.
    const weeks = element.shadowRoot.querySelector('[data-item="weeks"]');
    expect(weeks.tagName).toBe("A");
    expect(weeks.getAttribute("href")).toBe("#");
    expect(weeks.getAttribute("aria-disabled")).toBe("true");
    expect(weeks.querySelector("[data-reason]").textContent).toBe(
      "Needs a season"
    );
    const coming = element.shadowRoot.querySelector('[data-item="electives"]');
    expect(coming.querySelector("[data-reason]").textContent).toBe("Coming");
    // The visible badge isn't read twice.
    expect(
      coming.querySelector(".slds-badge").getAttribute("aria-hidden")
    ).toBe("true");
    const handler = jest.fn();
    element.addEventListener("navigate", handler);
    const click = new CustomEvent("click", { bubbles: true, cancelable: true });
    weeks.dispatchEvent(click);
    expect(handler).not.toHaveBeenCalled();
    expect(click.defaultPrevented).toBe(true);
  });

  it("shows the desktop's marks: ! (Needed) and ✓ (Done), read out as words", async () => {
    const element = await render(true, "roots", {
      groups: "needed",
      weeks: "done"
    });
    const item = (screen) =>
      element.shadowRoot.querySelector(`a[data-screen="${screen}"]`);
    const mark = (screen) => item(screen).querySelector("[data-mark]");
    expect(mark("groups").textContent).toBe("!");
    expect(mark("groups").querySelector("svg")).toBeNull();
    expect(mark("groups").getAttribute("aria-hidden")).toBe("true");
    expect(mark("groups").title).toBe("Needed");
    expect(mark("groups").className).toContain("menu-mark_needed");
    // Done is a check drawn as an icon (contrast for a mark, not text).
    expect(mark("weeks").querySelector("svg")).not.toBeNull();
    expect(mark("weeks").title).toBe("Done");
    // Screen readers hear the entry's name, then its mark in words.
    expect(item("groups").textContent).toBe("Bunks!Needed");
    expect(
      item("groups").querySelector(".slds-assistive-text").textContent
    ).toBe("Needed");
    expect(mark("locations")).toBeNull();
  });

  it("an entry that can't be opened shows no mark", async () => {
    const element = await render(false, null, { groups: "needed" });
    expect(element.shadowRoot.querySelector("[data-mark]")).toBeNull();
  });

  it("each setup screen's next follows the menu, skipping what can't open yet", () => {
    expect(nextScreen("timeBlocks", terms, true)).toEqual({
      key: "locations",
      label: "Locations →"
    });
    expect(nextScreen("campWords", terms, true)).toEqual({
      key: "activities",
      label: "Periods →"
    });
    expect(nextScreen("activities", terms, true).label).toBe("Anchors →");
    expect(nextScreen("recurringActivities", terms, true)).toEqual({
      key: "specialEvents",
      label: "Special events →"
    });
    // The last setup screen has no next.
    expect(nextScreen("specialEvents", terms, true)).toBeNull();
    // Not setup screens.
    expect(nextScreen("roots", terms, true)).toBeNull();
    expect(nextScreen("generatedSchedule", terms, true)).toBeNull();
    // Before a season only camp words opens.
    expect(nextScreen("locations", terms, false)).toEqual({
      key: "campWords",
      label: "Camp words →"
    });
    expect(nextScreen("campWords", terms, false)).toBeNull();
  });
});
