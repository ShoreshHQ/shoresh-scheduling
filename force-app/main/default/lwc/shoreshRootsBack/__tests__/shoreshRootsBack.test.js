import { createElement } from "lwc";
import ShoreshRootsBack from "c/shoreshRootsBack";

describe("c-shoresh-roots-back", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  async function render() {
    const element = createElement("c-shoresh-roots-back", {
      is: ShoreshRootsBack
    });
    document.body.appendChild(element);
    await Promise.resolve();
    return element;
  }

  it("is a button named Back to Roots that reads Roots", async () => {
    const element = await render();
    const button = element.shadowRoot.querySelector('[data-id="back"]');
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-label")).toBe("Back to Roots");
    expect(button.textContent.trim()).toBe("Roots");
    await expect(element).toBeAccessible();
  });

  it("says back to Roots, out of the screen it sits in", async () => {
    const element = await render();
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    wrapper.appendChild(element);
    const heard = jest.fn();
    wrapper.addEventListener("backtoroots", heard);
    element.shadowRoot.querySelector('[data-id="back"]').click();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
