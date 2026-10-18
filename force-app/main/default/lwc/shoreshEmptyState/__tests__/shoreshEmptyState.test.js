import { createElement } from "lwc";
import ShoreshEmptyState from "c/shoreshEmptyState";

describe("c-shoresh-empty-state", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is one outline icon and a title, nothing more", async () => {
    const element = createElement("c-shoresh-empty-state", {
      is: ShoreshEmptyState
    });
    element.title = "No programs yet";
    document.body.appendChild(element);
    await Promise.resolve();
    const root = element.shadowRoot;
    const icons = root.querySelectorAll("svg");
    expect(icons.length).toBe(1);
    expect(icons[0].getAttribute("aria-hidden")).toBe("true");
    expect(icons[0].getAttribute("fill")).toBe("none");
    expect(root.querySelector("p").textContent).toBe("No programs yet");
    expect(root.textContent.trim()).toBe("No programs yet");
  });
});
