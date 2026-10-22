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

  it("sits on the living dot field (wiki decision 49)", async () => {
    const element = createElement("c-shoresh-empty-state", {
      is: ShoreshEmptyState
    });
    element.title = "No weeks yet";
    document.body.appendChild(element);
    await Promise.resolve();
    const field = element.shadowRoot.querySelector("c-shoresh-dot-field");
    expect(field.querySelector('[data-id="empty-state"]')).not.toBeNull();
  });

  it("draws a tent, not a software inbox tray", async () => {
    const element = createElement("c-shoresh-empty-state", {
      is: ShoreshEmptyState
    });
    element.title = "No weeks yet";
    document.body.appendChild(element);
    await Promise.resolve();
    const paths = [
      ...element.shadowRoot.querySelectorAll('[data-id="empty-icon"] path')
    ].map((p) => p.getAttribute("d"));
    expect(paths[0]).toBe("M12 4 2.5 20h19L12 4z");
    expect(paths.join(" ")).not.toContain("M3 13h5");
  });
});
