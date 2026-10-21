import { createElement } from "lwc";
import ShoreshSavedMark, { leftField } from "c/shoreshSavedMark";

const flush = () => Promise.resolve();

describe("c-shoresh-saved-mark", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  async function render() {
    const element = createElement("c-shoresh-saved-mark", {
      is: ShoreshSavedMark
    });
    document.body.appendChild(element);
    await flush();
    return element;
  }
  const region = (element) =>
    element.shadowRoot.querySelector('[data-id="saved"]');

  it("is a polite live region that is empty until something is saved", async () => {
    const element = await render();
    expect(region(element).getAttribute("role")).toBe("status");
    expect(region(element).getAttribute("aria-live")).toBe("polite");
    expect(region(element).textContent).toBe("");
    await expect(element).toBeAccessible();
  });

  it("shows ✓ Saved, says it again on every save, and clears", async () => {
    const element = await render();
    element.saved();
    await flush();
    const first = region(element).textContent;
    expect(first).toContain("Saved");
    expect(region(element).querySelector(".tick-text").textContent).toContain(
      "✓"
    );
    element.saved();
    await flush();
    const second = region(element).textContent;
    expect(second.trim()).toBe(first.trim());
    // The text changes, so screen readers read it again.
    expect(second).not.toBe(first);
    element.clear();
    await flush();
    expect(region(element).textContent).toBe("");
  });

  it("silent: shown the same, never said (the rail, where the table says each save)", async () => {
    const element = createElement("c-shoresh-saved-mark", {
      is: ShoreshSavedMark
    });
    element.silent = true;
    document.body.appendChild(element);
    await flush();
    expect(region(element).getAttribute("role")).toBeNull();
    expect(region(element).getAttribute("aria-live")).toBeNull();
    element.saved();
    await flush();
    expect(region(element).textContent).toContain("Saved");
    expect(region(element).querySelector("svg.tick")).not.toBeNull();
    await expect(element).toBeAccessible();
  });

  it("leftField: true when focus goes elsewhere, false when it stays inside the field", () => {
    const field = document.createElement("div");
    const inside = document.createElement("button");
    field.appendChild(inside);
    const outside = document.createElement("button");
    const event = (relatedTarget) => ({ currentTarget: field, relatedTarget });
    expect(leftField(event(null))).toBe(true);
    expect(leftField(event(outside))).toBe(true);
    expect(leftField(event(field))).toBe(false);
    expect(leftField(event(inside))).toBe(false);
  });
});
