import { createElement } from "lwc";
import ShoreshAsk from "c/shoreshAsk";

const flush = () => Promise.resolve();

async function render() {
  const element = createElement("c-shoresh-ask", { is: ShoreshAsk });
  element.heading = 'Turn off "Bunk 3" for Week 2?';
  element.lines = [
    "Placed in 4 cells in Week 2.",
    "They stay until you change them."
  ];
  element.confirmLabel = "Turn off anyway";
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);

describe("c-shoresh-ask", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is a modal question naming its buttons by what they do", async () => {
    const element = await render();
    const dialog = q(element, '[data-id="ask"]');
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // Screen readers hear the lines too, not just the heading and Cancel.
    const lines = q(element, ".slds-modal__content");
    expect(dialog.getAttribute("aria-describedby")).toBe(lines.id);
    expect(q(element, "h2").textContent).toBe('Turn off "Bunk 3" for Week 2?');
    expect(
      [...element.shadowRoot.querySelectorAll("p")].map((p) => p.textContent)
    ).toEqual([
      "Placed in 4 cells in Week 2.",
      "They stay until you change them."
    ]);
    expect(q(element, '[data-id="yes"]').textContent.trim()).toBe(
      "Turn off anyway"
    );
    expect(element.shadowRoot.activeElement).toBe(q(element, '[data-id="no"]'));
  });

  it("answers yes, no, or no on Escape; Tab stays on the lines and the two buttons", async () => {
    const element = await render();
    const answers = [];
    element.addEventListener("answer", (e) => answers.push(e.detail.yes));
    q(element, '[data-id="yes"]').click();
    q(element, '[data-id="no"]').click();
    const dialog = q(element, '[data-id="ask"]');
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(answers).toEqual([true, false, false]);
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="yes"]')
    );
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="lines"]')
    );
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(element.shadowRoot.activeElement).toBe(q(element, '[data-id="no"]'));
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true
      })
    );
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="lines"]')
    );
  });

  it("lets a long list of lines be scrolled with the keyboard", async () => {
    const element = await render();
    const lines = q(element, '[data-id="lines"]');
    // A named, focusable scroll region: arrow keys scroll it once it has focus.
    expect(lines.getAttribute("tabindex")).toBe("0");
    expect(lines.getAttribute("role")).toBe("region");
    expect(lines.getAttribute("aria-labelledby")).toBe(q(element, "h2").id);
    lines.focus();
    expect(element.shadowRoot.activeElement).toBe(lines);
  });

  it("Escape is used up by the question, so it doesn't also close what is behind it", async () => {
    const element = await render();
    const behind = jest.fn();
    element.addEventListener("keydown", behind);
    q(element, '[data-id="ask"]').dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true
      })
    );
    expect(behind).not.toHaveBeenCalled();
  });
});
