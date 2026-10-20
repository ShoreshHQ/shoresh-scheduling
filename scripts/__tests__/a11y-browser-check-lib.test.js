/**
 * scripts/a11y-browser-check-lib.js: the parts of the real-browser check that need no browser
 * and no org. The check itself runs by hand against the test org (docs/ci-setup.md).
 */
const {
  describeFocus,
  formatFocus,
  focusMatches,
  scrub,
  Results,
  renderReport
} = require("../a11y-browser-check-lib.js");

afterEach(() => {
  document.body.innerHTML = "";
});

/** <c-outer> with a shadow root holding a toolbar, and <c-inner> inside it with a button. */
function nested() {
  const outer = document.createElement("c-outer");
  document.body.appendChild(outer);
  const outerRoot = outer.attachShadow({ mode: "open" });
  outerRoot.innerHTML =
    '<div class="toolbar"><c-inner></c-inner></div><div data-id="edit-grid"><div tabindex="0" data-id="cell">Swim</div></div>';
  const inner = outerRoot.querySelector("c-inner");
  const innerRoot = inner.attachShadow({ mode: "open" });
  innerRoot.innerHTML =
    '<button data-id="versions-button" aria-label="Versions">Versions ▾</button>';
  return { outerRoot, innerRoot };
}

describe("describeFocus", () => {
  it("follows focus through nested shadow roots to the element itself", () => {
    const { innerRoot } = nested();
    innerRoot.querySelector("button").focus();
    const f = describeFocus(document);
    expect(f.tag).toBe("button");
    expect(f.dataId).toBe("versions-button");
    expect(f.name).toBe("Versions");
    expect(f.components).toEqual(["c-outer", "c-inner"]);
    expect(f.inToolbar).toBe(true);
    expect(f.inGrid).toBe(false);
    expect(f.inDialog).toBe(false);
  });

  it("says when focus is in the grid, and uses the text when there is no aria-label", () => {
    const { outerRoot } = nested();
    outerRoot.querySelector('[data-id="cell"]').focus();
    const f = describeFocus(document);
    expect(f.inGrid).toBe(true);
    expect(f.inToolbar).toBe(false);
    expect(f.name).toBe("Swim");
  });

  it("says when focus is inside a dialog, alert dialogs included", () => {
    document.body.innerHTML =
      '<section role="alertdialog"><div><button>Cancel</button></div></section>';
    document.querySelector("button").focus();
    expect(describeFocus(document).inDialog).toBe(true);
  });

  it("names a box by its label, labelledby or placeholder before its value", () => {
    document.body.innerHTML =
      '<label for="a">Season name</label><input id="a" value="Summer">' +
      '<span id="t">First day</span><input id="b" aria-labelledby="t" value="Jun 28">' +
      '<input id="c" placeholder="Add Fixed activity">' +
      '<input id="d" type="checkbox">';
    const nameOf = (id) => {
      document.getElementById(id).focus();
      return describeFocus(document).name;
    };
    expect(nameOf("a")).toBe("Season name");
    expect(nameOf("b")).toBe("First day");
    expect(nameOf("c")).toBe("Add Fixed activity");
    // A tick box with no name has none: its value ("on") is not a name.
    expect(nameOf("d")).toBe("");
    expect(describeFocus(document).type).toBe("checkbox");
  });

  it("is null when focus fell to the page", () => {
    nested();
    expect(describeFocus(document)).toBeNull();
  });

  it("carries the toolbar check's mark", () => {
    document.body.innerHTML = '<button data-a11y-check="3">Publish</button>';
    document.querySelector("button").focus();
    expect(describeFocus(document).checkMark).toBe("3");
  });

  it("uses nothing from outside itself, so it can run inside the page", () => {
    const { innerRoot } = nested();
    innerRoot.querySelector("button").focus();
    // What Playwright does: send the source and evaluate it in the page.
    // eslint-disable-next-line no-new-func
    const inPage = new Function(
      `return (${describeFocus.toString()})(document);`
    );
    expect(inPage()).toEqual(describeFocus(document));
  });
});

describe("formatFocus and focusMatches", () => {
  const cancel = {
    tag: "button",
    type: "button",
    dataId: "no",
    role: null,
    name: "Cancel",
    components: ["c-shoresh-ask"],
    inToolbar: false,
    inDialog: true,
    inGrid: false,
    checkMark: null
  };

  it("words where focus is for the report", () => {
    expect(formatFocus(cancel)).toBe('button "Cancel" in a dialog');
    expect(formatFocus(null)).toBe("nowhere (the page itself)");
  });

  it("matches exact values and regular expressions, all of them", () => {
    expect(focusMatches(cancel, { inDialog: true, name: /^Cancel$/ })).toBe(
      true
    );
    expect(focusMatches(cancel, { inDialog: true, name: /^Close$/ })).toBe(
      false
    );
    expect(focusMatches(cancel, { dataId: "yes" })).toBe(false);
    expect(focusMatches(cancel, { dataId: /^no$/ })).toBe(true);
  });

  it("never matches when nothing has focus", () => {
    expect(focusMatches(null, {})).toBe(false);
  });

  it("does not match a pattern against a missing value", () => {
    expect(focusMatches(cancel, { role: /menuitem/ })).toBe(false);
  });
});

describe("scrub", () => {
  it("removes a sign-in link, whole", () => {
    const text =
      "page.goto: Timeout navigating to https://example.my.salesforce.com/secur/frontdoor.jsp?otp=abc123&startURL=%2Flightning now";
    const out = scrub(text);
    expect(out).toBe("page.goto: Timeout navigating to [link removed] now");
  });

  it("removes session ids and tokens in any text", () => {
    expect(scrub("sid=00Dxx0000001gPL!AQ4AQF.abc_def-ghijklmnopqrstu")).toBe(
      "sid=[removed]"
    );
    expect(scrub("access_token=abc.def&x=1")).toBe(
      "access_token=[removed]&x=1"
    );
    expect(
      scrub("token 00DRL00000AbCdE!ARcAQGx1y2z3abcdefghijklmnop end")
    ).toBe("token [session removed] end");
  });

  it("leaves ordinary words alone", () => {
    expect(scrub('Focus on button "Publish".')).toBe(
      'Focus on button "Publish".'
    );
  });
});

describe("Results and renderReport", () => {
  const about = {
    date: "2026-10-20",
    commit: "abc1234",
    browser: "Google Chrome 141 (headless)",
    axeVersion: "4.13.0",
    camp: "Keyboard check camp (made up)",
    week: "Week 3"
  };

  it("counts each outcome and refuses unknown ones", () => {
    const r = new Results();
    r.pass("Roots", "axe", "No violations.");
    r.fail("Manual Build", "Start", "Focus fell to the page.");
    r.notRun("Generated Schedule", "Lock", "Lock not reached.");
    expect([r.count("pass"), r.count("fail"), r.count("not run")]).toEqual([
      1, 1, 1
    ]);
    expect(() => r.add("x", "y", "maybe")).toThrow("Unknown outcome");
  });

  it("scrubs what it records", () => {
    const r = new Results();
    r.notRun(
      "Camp setup",
      "Open",
      "at https://x.salesforce.com/secur/frontdoor.jsp?otp=1"
    );
    expect(r.rows[0].detail).toBe("at [link removed]");
  });

  it("lists failures with their screen and step, before what passed", () => {
    const r = new Results();
    r.pass("Roots", "axe", "No violations.");
    r.fail(
      "Manual Build",
      "Start a blank week: focus not lost",
      "Focus fell | to the page."
    );
    const md = renderReport(r, about);
    expect(md).toContain("# Real-browser accessibility check, 2026-10-20");
    expect(md).toContain("**1 passed, 1 failed, 0 not run.**");
    expect(md).toContain(
      "| Manual Build | Start a blank week: focus not lost | Focus fell \\| to the page. |"
    );
    expect(md.indexOf("## Failed")).toBeLessThan(md.indexOf("## Passed"));
    expect(md).toContain("Every step ran.");
    expect(md).toContain("`abc1234`");
    expect(md).toContain('"Keyboard check camp (made up)"');
    expect(md).toContain("on Week 3,");
  });

  it("says so when nothing failed", () => {
    const r = new Results();
    r.pass("Roots", "axe", "No violations.");
    expect(renderReport(r, about)).toContain("Nothing failed.");
  });
});
