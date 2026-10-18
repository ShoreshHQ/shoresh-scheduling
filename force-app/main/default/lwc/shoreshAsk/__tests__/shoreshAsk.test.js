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

  it("answers yes, no, or no on Escape; Tab stays on the two buttons", async () => {
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
    expect(element.shadowRoot.activeElement).toBe(q(element, '[data-id="no"]'));
  });
});
