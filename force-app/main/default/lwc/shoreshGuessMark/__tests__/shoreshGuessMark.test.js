import { createElement } from "lwc";
import ShoreshGuessMark from "c/shoreshGuessMark";

const flush = () => Promise.resolve();

function render(props = {}) {
  const element = createElement("c-shoresh-guess-mark", {
    is: ShoreshGuessMark
  });
  Object.assign(element, {
    label: "Guessed from your file",
    name: "How often for Swim: guessed from your file",
    ...props
  });
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);

describe("c-shoresh-guess-mark", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is the design system's needs-a-look corner, named for whose it is, closed at first", async () => {
    const element = render();
    await flush();
    const mark = q(element, '[data-id="guess-mark"]');
    expect(mark.tagName).toBe("BUTTON");
    expect(mark.getAttribute("aria-label")).toBe(
      "How often for Swim: guessed from your file"
    );
    expect(mark.getAttribute("aria-expanded")).toBe("false");
    expect(mark.querySelector(".shoresh-look-mark")).not.toBeNull();
    expect(q(element, '[data-id="guess-pop"]')).toBeNull();
    await expect(element).toBeAccessible();
  });

  it("pressed, it shows its words and Looks right, with the cursor on Looks right", async () => {
    const element = render();
    await flush();
    q(element, '[data-id="guess-mark"]').click();
    await flush();
    expect(
      q(element, '[data-id="guess-mark"]').getAttribute("aria-expanded")
    ).toBe("true");
    expect(q(element, '[data-id="guess-words"]').textContent).toBe(
      "Guessed from your file"
    );
    const looksRight = q(element, '[data-id="looks-right"]');
    expect(looksRight.textContent.trim()).toBe("Looks right");
    expect(element.shadowRoot.activeElement).toBe(looksRight);
    await expect(element).toBeAccessible();
  });

  it("Looks right asks the screen to forget the guess", async () => {
    const element = render();
    const handler = jest.fn();
    element.addEventListener("confirm", handler);
    await flush();
    q(element, '[data-id="guess-mark"]').click();
    await flush();
    q(element, '[data-id="looks-right"]').click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("waits while the page is busy", async () => {
    const element = render({ busy: true });
    await flush();
    q(element, '[data-id="guess-mark"]').click();
    await flush();
    expect(q(element, '[data-id="looks-right"]').disabled).toBe(true);
  });

  it("Escape closes it, the cursor back on the mark, and goes no further", async () => {
    const element = render();
    await flush();
    q(element, '[data-id="guess-mark"]').click();
    await flush();
    const outside = jest.fn();
    element.addEventListener("keydown", outside);
    q(element, '[data-id="looks-right"]').dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true
      })
    );
    await flush();
    expect(q(element, '[data-id="guess-pop"]')).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="guess-mark"]')
    );
    expect(outside).not.toHaveBeenCalled();
  });

  it("leaving it closes it", async () => {
    const element = render();
    await flush();
    q(element, '[data-id="guess-mark"]').click();
    await flush();
    q(element, ".wrap").dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
    );
    await flush();
    expect(q(element, '[data-id="guess-pop"]')).toBeNull();
  });
});
