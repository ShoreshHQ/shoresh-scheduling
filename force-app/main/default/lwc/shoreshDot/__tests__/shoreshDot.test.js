import { createElement } from "lwc";
import ShoreshDot from "c/shoreshDot";

const flush = () => Promise.resolve();

function render(props = {}) {
  const element = createElement("c-shoresh-dot", { is: ShoreshDot });
  Object.assign(element, { label: "Not set up for Bunk 2", ...props });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const tip = (element) => q(element, '[data-id="dot-tip"]');

describe("c-shoresh-dot", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("shows no words, but screen readers read them", () => {
    const element = render();
    expect(tip(element)).toBeNull();
    const words = q(element, '[data-id="dot-words"]');
    expect(words.textContent).toBe("Not set up for Bunk 2");
    expect(words.className).toContain("slds-assistive-text");
    expect(q(element, ".dot").getAttribute("aria-hidden")).toBe("true");
  });

  it("hovering shows the words; leaving hides them", async () => {
    const element = render();
    q(element, '[data-id="dot"]').dispatchEvent(new CustomEvent("mouseenter"));
    await flush();
    expect(tip(element).textContent).toBe("Not set up for Bunk 2");
    // The tooltip repeats the assistive text, so screen readers skip it.
    expect(tip(element).parentElement.getAttribute("aria-hidden")).toBe("true");
    q(element, '[data-id="dot"]').dispatchEvent(new CustomEvent("mouseleave"));
    await flush();
    expect(tip(element)).toBeNull();
  });

  it("on its own it is a tab stop, and focus shows the words", async () => {
    const element = render({ focusable: true });
    const dot = q(element, '[data-id="dot"]');
    expect(dot.getAttribute("tabindex")).toBe("0");
    dot.dispatchEvent(new CustomEvent("focus"));
    await flush();
    expect(tip(element).textContent).toBe("Not set up for Bunk 2");
    dot.dispatchEvent(new CustomEvent("blur"));
    await flush();
    expect(tip(element)).toBeNull();
  });

  it("inside a focusable row it isn't a tab stop; the row's focus shows the words", async () => {
    const element = render();
    expect(q(element, '[data-id="dot"]').getAttribute("tabindex")).toBeNull();
    element.open = true;
    await flush();
    expect(tip(element).textContent).toBe("Not set up for Bunk 2");
  });

  it("a tap shows the words and isn't taken as a click on the row", async () => {
    const element = render();
    const rowClick = jest.fn();
    element.addEventListener("click", rowClick);
    q(element, '[data-id="dot"]').click();
    await flush();
    expect(tip(element)).not.toBeNull();
    expect(rowClick).not.toHaveBeenCalled();
    q(element, '[data-id="dot"]').click();
    await flush();
    expect(tip(element)).toBeNull();
  });

  it("Escape closes the words; they come back when the row is next focused", async () => {
    const element = render();
    element.open = true;
    await flush();
    expect(tip(element)).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flush();
    expect(tip(element)).toBeNull();
    element.open = false;
    await flush();
    element.open = true;
    await flush();
    expect(tip(element)).not.toBeNull();
  });

  it("in a cell, Escape reaches the cell only while the cell's keyboard focus shows the words", async () => {
    const element = render();
    element.inCell = true;
    // Shown by hovering: Escape stops at the words (it mustn't also close a typing box).
    q(element, '[data-id="dot"]').dispatchEvent(new CustomEvent("mouseenter"));
    await flush();
    const held = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true
    });
    window.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    q(element, '[data-id="dot"]').dispatchEvent(new CustomEvent("mouseleave"));
    // Shown because the cell has keyboard focus: one press hides them and reaches the cell.
    element.open = true;
    await flush();
    const through = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true
    });
    window.dispatchEvent(through);
    await flush();
    expect(through.defaultPrevented).toBe(false);
    expect(tip(element)).toBeNull();
  });

  it("in a cell, a tap is the cell's: the dot doesn't take it", async () => {
    const element = render();
    element.inCell = true;
    await flush();
    const tap = new MouseEvent("click", { bubbles: true, cancelable: true });
    q(element, '[data-id="dot"]').dispatchEvent(tap);
    await flush();
    expect(tap.defaultPrevented).toBe(false);
    expect(tip(element)).toBeNull();
  });

  it("in a cell, the words open toward the cell and wrap", async () => {
    const element = render();
    element.inCell = true;
    element.open = true;
    await flush();
    expect(q(element, ".tip-area").className).toContain("tip-area_cell");
  });

  it("on touch, where a tap also counts as hovering, a second tap hides the words", async () => {
    const element = render();
    const dot = q(element, '[data-id="dot"]');
    dot.dispatchEvent(new CustomEvent("mouseenter"));
    dot.click();
    await flush();
    expect(tip(element)).not.toBeNull();
    dot.click();
    await flush();
    expect(tip(element)).toBeNull();
  });
});
