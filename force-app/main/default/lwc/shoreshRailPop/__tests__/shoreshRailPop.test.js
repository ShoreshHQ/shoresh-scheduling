import { createElement } from "lwc";
import ShoreshRailPop from "c/shoreshRailPop";
import RailPopFixture from "c/railPopFixture";

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

function page() {
  const element = createElement("c-rail-pop-fixture", { is: RailPopFixture });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const menuOf = (element) => q(element, '[data-id="edit-menu"]');
const word = (element) =>
  menuOf(element).shadowRoot.querySelector('[data-id="button"]');
const pop = (element) =>
  menuOf(element).shadowRoot.querySelector('[data-id="pop"]');
/** The element keyboard focus is on, inside the page (its rows are the page's own). */
const chosen = (element) => q(element, '[data-id="chosen"]').textContent;
const ones = (element) => q(element, '[data-id="ones"]').textContent;
const focused = (element) => element.shadowRoot.activeElement;
const key = (target, name, extra = {}) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      composed: true,
      ...extra
    })
  );

describe("c-shoresh-rail-pop", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is one rail item: a word and its chevron, never raised while closed", async () => {
    const element = createElement("c-shoresh-rail-pop", {
      is: ShoreshRailPop
    });
    element.label = "Versions";
    document.body.appendChild(element);
    await flush();
    const button = element.shadowRoot.querySelector('[data-id="button"]');
    expect(button.textContent.trim()).toBe("Versions");
    expect(button.className).toBe("shoresh-item");
    expect(button.querySelector("svg.shoresh-chevron")).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(element.shadowRoot.querySelector('[data-id="pop"]').hidden).toBe(
      true
    );
    await expect(element).toBeAccessible();
  });

  it("a count is set as a value, with the needs-a-look mark before it", async () => {
    const element = createElement("c-shoresh-rail-pop", {
      is: ShoreshRailPop
    });
    Object.assign(element, { label: "of 35 placed", count: 29, mark: true });
    document.body.appendChild(element);
    await flush();
    const button = element.shadowRoot.querySelector('[data-id="button"]');
    expect(button.querySelector("b").textContent).toBe("29");
    expect(button.textContent.replace(/\s+/g, " ").trim()).toBe(
      "29of 35 placed"
    );
    const mark = button.querySelector(".shoresh-look-mark");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens as a menu on its first row, and is raised while open", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    expect(word(element).getAttribute("aria-expanded")).toBe("true");
    expect(word(element).getAttribute("aria-haspopup")).toBe("menu");
    expect(word(element).className).toContain("shoresh-raised");
    expect(pop(element).hidden).toBe(false);
    expect(pop(element).getAttribute("role")).toBe("menu");
    expect(focused(element).dataset.id).toBe("one");
    await expect(element).toBeAccessible();
  });

  it("Down and Up move past a held row, and wrap; Home and End go to the ends", async () => {
    const element = page();
    await flush();
    key(word(element), "ArrowDown");
    await flush();
    expect(focused(element).dataset.id).toBe("one");
    key(focused(element), "ArrowDown");
    expect(focused(element).dataset.id).toBe("more");
    key(focused(element), "ArrowDown");
    expect(focused(element).dataset.id).toBe("three");
    key(focused(element), "ArrowDown");
    expect(focused(element).dataset.id).toBe("one");
    key(focused(element), "ArrowUp");
    expect(focused(element).dataset.id).toBe("three");
    key(focused(element), "Home");
    expect(focused(element).dataset.id).toBe("one");
    key(focused(element), "End");
    expect(focused(element).dataset.id).toBe("three");
  });

  it("Up on the word opens it on the last row", async () => {
    const element = page();
    await flush();
    key(word(element), "ArrowUp");
    await flush();
    expect(focused(element).dataset.id).toBe("three");
  });

  it("Escape closes it with focus back on the word", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    key(focused(element), "Escape");
    await flush();
    expect(pop(element).hidden).toBe(true);
    expect(word(element).getAttribute("aria-expanded")).toBe("false");
    expect(focused(element)).toBe(menuOf(element));
    expect(menuOf(element).shadowRoot.activeElement).toBe(word(element));
  });

  it("choosing a row does its work, says select with its value, and closes on the word", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-id="three"]').click();
    await flush();
    expect(chosen(element)).toBe("three");
    expect(pop(element).hidden).toBe(true);
    expect(menuOf(element).shadowRoot.activeElement).toBe(word(element));
    // A row with its own onclick does its own work.
    word(element).click();
    await flush();
    q(element, '[data-id="one"]').click();
    await flush();
    expect(ones(element)).toBe("1");
    expect(chosen(element)).toBe("three");
  });

  it("a row that opens rows under it keeps the menu open", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-id="more"]').click();
    await flush();
    expect(pop(element).hidden).toBe(false);
    expect(q(element, '[data-id="m1"]')).not.toBeNull();
    q(element, '[data-id="m1"]').click();
    await flush();
    expect(chosen(element)).toBe("m1");
    expect(pop(element).hidden).toBe(true);
  });

  it("a click outside closes it", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-id="after"]').click();
    await flush();
    expect(pop(element).hidden).toBe(true);
  });

  it("Tab closes it", async () => {
    const element = page();
    await flush();
    word(element).click();
    await flush();
    key(focused(element), "Tab");
    await flush();
    expect(pop(element).hidden).toBe(true);
  });

  it("a held menu doesn't open", async () => {
    const element = createElement("c-shoresh-rail-pop", {
      is: ShoreshRailPop
    });
    Object.assign(element, { label: "Edit", menu: true, disabled: true });
    document.body.appendChild(element);
    await flush();
    const button = element.shadowRoot.querySelector('[data-id="button"]');
    expect(button.disabled).toBe(true);
    key(button, "ArrowDown");
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
