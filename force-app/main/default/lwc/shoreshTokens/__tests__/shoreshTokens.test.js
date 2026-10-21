/**
 * The design system's values (ADR 0015): Greg's three colours exactly, the tonal surfaces, the
 * spacing steps, and that every pair of words and surface the system allows is readable.
 */
const fs = require("fs");
const path = require("path");

const css = fs
  .readFileSync(path.join(__dirname, "../shoreshTokens.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = Object.fromEntries(
  [...css.matchAll(/(--[a-zA-Z0-9-]+):\s*([^;]+);/g)].map((m) => [
    m[1],
    m[2].trim().replace(/\s+/g, " ")
  ])
);

/** A token's colour, following var(--name) to the value it names. */
function colour(name) {
  const value = tokens[name];
  const ref = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(value || "");
  return ref ? colour(ref[1]) : value;
}

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("c/shoreshTokens", () => {
  it("has three colours, exactly: one primary family, one highlight, text (wiki decision 40)", () => {
    const colours = Object.keys(tokens).filter(
      (name) => name.startsWith("--shoresh-color-") && !name.includes("-press")
    );
    expect(
      colours.filter((name) => !/^--shoresh-color-primary-\d+$/.test(name))
    ).toEqual(["--shoresh-color-highlight", "--shoresh-color-text"]);
    // The primary family runs from the lightest step to Greg's primary (decision 35).
    expect(tokens["--shoresh-color-primary-50"]).toBe("#f6f8f5");
    expect(tokens["--shoresh-color-primary-500"]).toBe("#aeb6a7");
    expect(tokens["--shoresh-color-highlight"]).toBe("#1f6651");
    expect(tokens["--shoresh-color-text"]).toBe("#26231b");
    // No separate accent colour.
    expect(
      Object.keys(tokens).some(
        (name) => name.includes("color-accent") && name.startsWith("--shoresh")
      )
    ).toBe(false);
  });

  it("the primary family's steps get darker as they go up", () => {
    const steps = Object.keys(tokens)
      .filter((name) => /^--shoresh-color-primary-\d+$/.test(name))
      .sort(
        (a, b) =>
          parseInt(a.split("-").pop(), 10) - parseInt(b.split("-").pop(), 10)
      );
    const white = "#ffffff";
    const contrasts = steps.map((name) => contrast(tokens[name], white));
    expect(contrasts).toEqual([...contrasts].sort((a, b) => a - b));
  });

  it("has the tonal surfaces, page to drawer, as steps of the primary", () => {
    expect(
      ["page", "shelf", "grid", "drawer"].map((name) =>
        colour(`--shoresh-surface-${name}`)
      )
    ).toEqual(["#f3f5f2", "#eff1ee", "#ebede9", "#e6e9e4"]);
    ["page", "shelf", "grid", "drawer", "hover"].forEach((name) =>
      expect(tokens[`--shoresh-surface-${name}`]).toMatch(
        /^var\(--shoresh-color-primary-\d+\)$/
      )
    );
  });

  it("has one unit and six steps: 1, 2, 3, 4, 6 and 8 units", () => {
    expect(tokens["--shoresh-u"]).toBe("clamp(3px, calc(100vw / 360), 5px)");
    expect([1, 2, 3, 4, 5, 6].map((n) => tokens[`--shoresh-s${n}`])).toEqual(
      [1, 2, 3, 4, 6, 8].map((u) => `calc(var(--shoresh-u) * ${u})`)
    );
    // Every item is one height: 8 units.
    expect(tokens["--shoresh-control-h"]).toBe("var(--shoresh-s6)");
  });

  it("every pair of words and surface it allows reads at 4.5:1 or better", () => {
    const words = ["--shoresh-text-1", "--shoresh-text-2"];
    const surfaces = [
      "--shoresh-surface-page",
      "--shoresh-surface-shelf",
      "--shoresh-surface-grid",
      "--shoresh-surface-drawer",
      "--shoresh-surface-hover",
      "--shoresh-color-primary-50"
    ];
    words.forEach((word) =>
      surfaces.forEach((surface) =>
        expect(contrast(colour(word), colour(surface))).toBeGreaterThanOrEqual(
          4.5
        )
      )
    );
    // Highlight words on the light surfaces, and light words on the highlight (Publish).
    surfaces.forEach((surface) =>
      expect(
        contrast(colour("--shoresh-color-highlight"), colour(surface))
      ).toBeGreaterThanOrEqual(4.5)
    );
    expect(
      contrast(
        colour("--shoresh-color-primary-50"),
        colour("--shoresh-color-highlight")
      )
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("Salesforce's buttons take the highlight (SLDS styling hooks)", () => {
    expect(tokens["--slds-c-button-brand-color-background"]).toBe(
      "var(--shoresh-color-highlight)"
    );
    expect(tokens["--slds-c-button-neutral-color-background"]).toBe(
      "var(--shoresh-color-primary-50)"
    );
  });
});
