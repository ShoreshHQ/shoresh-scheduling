import { createElement } from "lwc";
import ShoreshRootsGlimpse from "c/shoreshRootsGlimpse";

const GLIMPSE = {
  w: 220,
  h: 128,
  align: "xMidYMid",
  fade: "right",
  shapes: [
    {
      key: "s0",
      rect: true,
      x: 0,
      y: 1,
      w: 40,
      h: 20,
      rx: 4,
      cls: "f50 sedge"
    },
    {
      key: "s1",
      text: true,
      x: 20,
      y: 14,
      value: "Swim",
      cls: "g-t",
      anchor: "middle",
      style: null
    },
    {
      key: "s2",
      path: true,
      d: "M3 2h6",
      cls: "g-lock",
      transform: "translate(1 2) scale(1)"
    }
  ]
};

describe("c-shoresh-roots-glimpse", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  async function render(glimpse) {
    const element = createElement("c-shoresh-roots-glimpse", {
      is: ShoreshRootsGlimpse
    });
    element.glimpse = glimpse;
    document.body.appendChild(element);
    await Promise.resolve();
    return element;
  }

  it("draws each shape as an SVG element, for the eye only", async () => {
    const element = await render(GLIMPSE);
    const svg = element.shadowRoot.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 220 128");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.getAttribute("class")).toBe("glimpse glimpse_fade-right");
    const rect = svg.querySelector("rect");
    expect(rect.getAttribute("width")).toBe("40");
    expect(rect.getAttribute("class")).toBe("f50 sedge");
    const text = svg.querySelector("text");
    expect(text.textContent.trim()).toBe("Swim");
    expect(text.getAttribute("text-anchor")).toBe("middle");
    expect(svg.querySelector("path").getAttribute("transform")).toBe(
      "translate(1 2) scale(1)"
    );
  });

  it("draws nothing for no glimpse, and is accessible", async () => {
    const element = await render(null);
    expect(element.shadowRoot.querySelectorAll("rect,text,path")).toHaveLength(
      0
    );
    await expect(element).toBeAccessible();
  });
});
