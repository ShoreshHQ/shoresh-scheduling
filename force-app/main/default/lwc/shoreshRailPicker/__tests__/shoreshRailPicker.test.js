import { createElement } from "lwc";
import ShoreshRailPicker from "c/shoreshRailPicker";

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
const WEEKS = [
  { label: "Week 1", value: "w1" },
  { label: "Week 2", value: "w2" },
  { label: "Week 3", value: "w3" }
];

function render(props) {
  const element = createElement("c-shoresh-rail-picker", {
    is: ShoreshRailPicker
  });
  Object.assign(element, props);
  const changes = [];
  element.addEventListener("change", (e) => changes.push(e.detail.value));
  document.body.appendChild(element);
  return { element, changes };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const choose = (element) => q(element, '[data-id="choose"]');
const word = (element) =>
  choose(element).shadowRoot.querySelector('[data-id="button"]');

describe("c-shoresh-rail-picker", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("the week: an arrow either side, the week raised, no chevron", async () => {
    const { element } = render({
      label: "Week",
      value: "w2",
      options: WEEKS,
      arrows: true
    });
    await flush();
    expect(word(element).textContent.trim()).toBe("Week 2");
    expect(word(element).className).toContain("shoresh-raised");
    expect(word(element).querySelector(".shoresh-chevron")).toBeNull();
    // Its name starts with the words shown (WCAG 2.5.3), then what it is a choice of.
    expect(word(element).getAttribute("aria-label")).toBe("Week 2, Week");
    expect(q(element, '[data-id="previous"]').getAttribute("aria-label")).toBe(
      "Previous: Week 1"
    );
    expect(q(element, '[data-id="next"]').getAttribute("aria-label")).toBe(
      "Next: Week 3"
    );
    expect(q(element, '[role="group"]').getAttribute("aria-label")).toBe(
      "Week"
    );
    await expect(element).toBeAccessible();
  });

  it("the arrows step through the weeks, and stop at the ends", async () => {
    const { element, changes } = render({
      label: "Week",
      value: "w1",
      options: WEEKS,
      arrows: true
    });
    await flush();
    expect(q(element, '[data-id="previous"]').disabled).toBe(true);
    q(element, '[data-id="next"]').click();
    expect(changes).toEqual(["w2"]);
    element.value = "w3";
    await flush();
    expect(q(element, '[data-id="next"]').disabled).toBe(true);
    q(element, '[data-id="previous"]').click();
    expect(changes).toEqual(["w2", "w2"]);
  });

  it("an arrow that goes dim at the first or last week leaves focus on the week", async () => {
    const { element } = render({
      label: "Week",
      value: "w2",
      options: WEEKS,
      arrows: true
    });
    // The screen shows the week chosen, as Manual Build and Generated Schedule do.
    element.addEventListener("change", (e) => {
      element.value = e.detail.value;
    });
    await flush();
    const focused = () => {
      const inner = element.shadowRoot.activeElement;
      return inner && inner.shadowRoot && inner.shadowRoot.activeElement
        ? inner.shadowRoot.activeElement
        : inner;
    };

    q(element, '[data-id="previous"]').focus();
    q(element, '[data-id="previous"]').click();
    await flush();
    expect(element.value).toBe("w1");
    expect(q(element, '[data-id="previous"]').disabled).toBe(true);
    expect(focused()).toBe(word(element));
    expect(word(element).getAttribute("aria-label")).toBe("Week 1, Week");

    // Not at an end: focus stays on the arrow.
    q(element, '[data-id="next"]').focus();
    q(element, '[data-id="next"]').click();
    await flush();
    expect(element.value).toBe("w2");
    expect(focused()).toBe(q(element, '[data-id="next"]'));

    q(element, '[data-id="next"]').click();
    await flush();
    expect(element.value).toBe("w3");
    expect(q(element, '[data-id="next"]').disabled).toBe(true);
    expect(focused()).toBe(word(element));
  });

  it("the word opens every choice, the one shown checked; choosing one says change", async () => {
    const { element, changes } = render({
      label: "Week",
      value: "w2",
      options: WEEKS,
      arrows: true
    });
    await flush();
    word(element).click();
    await flush();
    const rows = qa(element, '[role="menuitemradio"]');
    expect(rows.map((r) => r.textContent.trim())).toEqual(
      WEEKS.map((w) => w.label)
    );
    expect(rows.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false"
    ]);
    rows[2].click();
    await flush();
    expect(changes).toEqual(["w3"]);
    // The one shown again: nothing to change.
    word(element).click();
    await flush();
    qa(element, '[role="menuitemradio"]')[1].click();
    expect(changes).toEqual(["w3"]);
  });

  it("a program: its name and a chevron, not raised", async () => {
    const { element } = render({
      label: "Program",
      value: "p1",
      options: [
        { label: "Day camp", value: "p1" },
        { label: "Teens", value: "p2" }
      ]
    });
    await flush();
    expect(word(element).textContent.trim()).toBe("Day camp");
    expect(word(element).className).not.toContain("shoresh-raised");
    expect(word(element).querySelector(".shoresh-chevron")).not.toBeNull();
    expect(q(element, '[data-id="previous"]')).toBeNull();
  });

  it("held, nothing can be chosen", async () => {
    const { element } = render({
      label: "Week",
      value: "w2",
      options: WEEKS,
      arrows: true,
      disabled: true
    });
    await flush();
    expect(q(element, '[data-id="previous"]').disabled).toBe(true);
    expect(q(element, '[data-id="next"]').disabled).toBe(true);
    expect(word(element).disabled).toBe(true);
  });
});
