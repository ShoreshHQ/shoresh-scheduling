// The Print and Excel menu (PUB-6.4): the whole week, then each kind opening its choices.
import { createElement } from "lwc";
import ShoreshPrintMenu from "c/shoreshPrintMenu";

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

const CHOICES = [
  { kind: "week", label: "Whole Week", options: [] },
  {
    kind: "day",
    label: "Day",
    options: [
      { key: "0", label: "Monday, Jun 29" },
      { key: "1", label: "Tuesday, Jun 30" }
    ]
  },
  {
    kind: "group",
    label: "Bunk",
    options: [
      { key: "*", label: "Every Bunk" },
      { key: "g1", label: "Cedar" },
      { key: "g2", label: "Oak" }
    ]
  }
];

function render(props = {}) {
  const element = createElement("c-shoresh-print-menu", {
    is: ShoreshPrintMenu
  });
  Object.assign(element, { label: "Print", choices: CHOICES, ...props });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const all = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const pop = (element) => q(element, "c-shoresh-rail-pop");
const word = (element) =>
  pop(element).shadowRoot.querySelector('[data-id="button"]');

describe("c-shoresh-print-menu", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("lists the whole week, then each kind closed, its choices hidden", async () => {
    const element = render();
    await flush();
    word(element).click();
    await flush();
    expect(
      all(element, '[role="menuitem"]').map((row) => row.textContent.trim())
    ).toEqual(["Whole Week", "Day", "Bunk"]);
    expect(
      all(element, ".kind-row").map((row) => row.getAttribute("aria-expanded"))
    ).toEqual(["false", "false"]);
    await expect(element).toBeAccessible();
  });

  it("opens one kind at a time, keeping the menu open, and chooses one of it", async () => {
    const element = render();
    const chosen = jest.fn();
    element.addEventListener("choose", (e) => chosen(e.detail));
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-kind="day"]').click();
    await flush();
    expect(
      pop(element).shadowRoot.querySelector('[data-id="pop"]').hidden
    ).toBe(false);
    q(element, '[data-kind="group"]').click();
    await flush();
    const options = all(element, ".option").map((row) =>
      row.textContent.trim()
    );
    expect(options).toEqual(["Every Bunk", "Cedar", "Oak"]);
    q(element, '[data-value="group|g2"]').click();
    await flush();
    expect(chosen).toHaveBeenCalledWith({ kind: "group", key: "g2" });
    await expect(element).toBeAccessible();
  });

  it("opens again with every kind closed once focus has left it", async () => {
    const element = render();
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-kind="group"]').click();
    await flush();
    q(element, '[data-kind="group"]').dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, composed: true })
    );
    await flush();
    expect(
      q(element, '[data-kind="group"]').getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("chooses the whole week with no key", async () => {
    const element = render();
    const chosen = jest.fn();
    element.addEventListener("choose", (e) => chosen(e.detail));
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-id="week"]').click();
    expect(chosen).toHaveBeenCalledWith({ kind: "week" });
  });

  it("does nothing while busy, and is off with nothing to choose", async () => {
    const element = render({ busy: true });
    const chosen = jest.fn();
    element.addEventListener("choose", chosen);
    await flush();
    word(element).click();
    await flush();
    q(element, '[data-id="week"]').click();
    expect(chosen).not.toHaveBeenCalled();
    expect(word(element).disabled).toBe(false);
    element.choices = [];
    await flush();
    expect(word(element).disabled).toBe(true);
  });
});
