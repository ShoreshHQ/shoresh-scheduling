import { createElement } from "lwc";
import ShoreshLock from "c/shoreshLock";

function render(props = {}) {
  const element = createElement("c-shoresh-lock", { is: ShoreshLock });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);

describe("c-shoresh-lock", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  // LOCK-6.1
  it("draws the one padlock, hidden from screen readers", () => {
    const element = render();
    const lock = q(element, '[data-id="lock"]');
    expect(lock.getAttribute("aria-hidden")).toBe("true");
    expect(lock.getAttribute("viewBox")).toBe("0 0 12 12");
    expect(lock.querySelector("rect")).not.toBeNull();
    expect(lock.querySelector("path")).not.toBeNull();
    // No words of its own when none are given: the words beside it say it.
    expect(q(element, '[data-id="lock-words"]')).toBeNull();
  });

  it("reads its words out when it is the only thing saying it", async () => {
    const element = render({ label: "Locked empty" });
    await Promise.resolve();
    const words = q(element, '[data-id="lock-words"]');
    expect(words.textContent).toBe("Locked empty");
    expect(words.className).toContain("slds-assistive-text");
    await expect(element).toBeAccessible();
  });
});
