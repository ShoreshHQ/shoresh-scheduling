import { createElement } from "lwc";
import ShoreshAbout, { readAbout } from "c/shoreshAbout";
import { ABOUT, LEGAL } from "../aboutText";

// Node's own file reading, required as the repo's other tests do (an import would read as an
// Aura library to the code analyzer).
const { readFileSync } = require("fs");
const { join } = require("path");

const ROOT = join(__dirname, "../../../../../..");

function mount() {
  const element = createElement("c-shoresh-about", { is: ShoreshAbout });
  document.body.appendChild(element);
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];
const text = (node) => node.textContent.replace(/\s+/g, " ").trim();

afterEach(() => {
  while (document.body.firstChild) document.body.firstChild.remove();
});

describe("readAbout", () => {
  const about = readAbout(ABOUT);

  it("reads the title, the five headings and the five notes", () => {
    expect(about.title).toBe("About Shoresh");
    expect(about.blocks.filter((b) => b.heading).map((b) => b.text)).toEqual([
      "What it is",
      "Where it lives",
      "What it costs",
      "Who made it",
      "Anyway"
    ]);
    expect(about.notes.map((n) => n.note)).toEqual([1, 2, 3, 4, 5]);
    expect(about.notes[1].text).toBe(
      "Brayden is a composite. Brayden is doing his best. Brayden also has a quota."
    );
  });

  it("turns each superscript number into a link to its note, in order", () => {
    const refs = about.blocks
      .flatMap((b) => b.runs || [])
      .filter((r) => r.note)
      .map((r) => r.note);
    expect(refs).toEqual([1, 2, 3, 4, 5]);
  });

  it("puts the subtitle and the closing line in italics, and nothing else", () => {
    const italic = about.blocks.filter((b) => b.className === "lede");
    expect(italic).toHaveLength(1);
    expect(italic[0].runs[0].text).toMatch(/^An About page, which is a page/);
    expect(about.credit).toHaveLength(1);
    expect(about.credit[0].runs[0].text).toMatch(/^Written by Claude\./);
  });

  it("keeps every word: the page's text is the draft's, less its markup", () => {
    const shown = [
      about.title,
      ...about.blocks.map((b) => {
        if (b.heading) return b.text;
        return b.runs.map((r) => r.text ?? "").join("");
      }),
      ...about.notes.map((n) => n.text),
      ...about.credit.map((b) => b.runs.map((r) => r.text).join(""))
    ].join("");
    const plain = ABOUT.replace(/[#*⁰¹²³⁴⁵⁶⁷⁸⁹]|---|\s/g, "");
    expect(shown.replace(/\s/g, "")).toBe(plain);
  });
});

describe("c-shoresh-about", () => {
  it("shows About as prose: its title, headings and paragraphs", async () => {
    const element = mount();
    await Promise.resolve();
    expect(text($(element, '[data-id="about"] h3'))).toBe("About Shoresh");
    expect($$(element, '[data-id="about"] h4')).toHaveLength(5);
    expect(text($(element, ".lede"))).toMatch(/expected you to\.1$/);
    expect(text($(element, ".credit"))).toMatch(/^Written by Claude\./);
    await expect(element).toBeAccessible();
  });

  it("links each footnote number to its note, and each note back", async () => {
    const element = mount();
    await Promise.resolve();
    const refs = $$(element, "a.ref");
    expect(refs.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Note 1",
      "Note 2",
      "Note 3",
      "Note 4",
      "Note 5"
    ]);
    expect(refs.every((a) => a.parentElement.tagName === "SUP")).toBe(true);

    refs[2].click();
    const note = $(element, 'li[data-note="3"]');
    expect(element.shadowRoot.activeElement).toBe(note);
    expect(text(note)).toMatch(/^3 ?Showing you the problem/);

    note.querySelector("a.back").click();
    expect(element.shadowRoot.activeElement).toBe(refs[2]);
  });

  it("shows Legal: copyright, the licence and its full text, the code, the parts", async () => {
    const element = mount();
    await Promise.resolve();
    expect(text($(element, '[data-id="legal"] h3'))).toBe("Legal");
    expect(text($(element, '[data-id="copyright"]'))).toBe(
      "Copyright 2026 Gregory Feitel, doing business as Shoresh"
    );
    const licence = $(element, 'a[data-id="licence-text"]');
    expect(licence.getAttribute("href")).toMatch(/ShoreshLicense/);
    expect(licence.getAttribute("target")).toBe("_blank");
    expect($(element, 'a[data-id="code"]').getAttribute("href")).toBe(
      "https://github.com/ShoreshHQ/shoresh-scheduling"
    );
    expect($$(element, '[data-id="parts"] li').map(text)).toEqual(LEGAL.parts);
    await expect(element).toBeAccessible();
  });
});

describe("what Legal says matches the repo", () => {
  it("the full licence text shown is the repo's LICENSE", () => {
    const shipped = readFileSync(
      join(ROOT, "force-app/main/default/staticresources/ShoreshLicense.txt"),
      "utf8"
    );
    expect(shipped).toBe(readFileSync(join(ROOT, "LICENSE"), "utf8"));
  });

  it("the copyright line and every listed part are in NOTICE", () => {
    const notice = readFileSync(join(ROOT, "NOTICE"), "utf8");
    expect(notice).toContain(LEGAL.copyright);
    for (const name of [
      "Shoresh desktop",
      "SheetJS Community Edition 0.20.3",
      "Inter",
      "JetBrains Mono",
      "SIL Open Font"
    ]) {
      expect(notice).toContain(name);
    }
  });
});
