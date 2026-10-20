/**
 * The parts of scripts/a11y-browser-check.mjs that need no browser and no org, so Jest can
 * check them (scripts/__tests__/a11y-browser-check-lib.test.js):
 * - describeFocus: where the keyboard focus really is, through shadow roots. It runs inside
 *   the page (Playwright sends its source), so it uses nothing from outside itself.
 * - focusMatches: whether that place is the one a step expects.
 * - scrub: takes anything that looks like a sign-in link or session id out of a message, so no
 *   error text can carry the org's login into the terminal or the report.
 * - Results and renderReport: the plain report written to docs/.
 */

/**
 * Where focus is, following each shadow root's activeElement down to the element itself.
 * Returns null when nothing in the page has focus (focus fell to <body>).
 * @param {Document} doc
 */
function describeFocus(doc) {
  let el = doc.activeElement;
  const hosts = [];
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    hosts.push(el.tagName.toLowerCase());
    el = el.shadowRoot.activeElement;
  }
  if (!el || el === doc.body || el === doc.documentElement) {
    return null;
  }
  // Ancestors across shadow boundaries: parent, or the host of the shadow root it sits in.
  const ancestors = [];
  for (let node = el; node;) {
    const parent =
      node.parentNode && node.parentNode.nodeType === 1
        ? node.parentNode
        : node.getRootNode && node.getRootNode() !== node
          ? node.getRootNode().host
          : null;
    if (!parent || parent === node) break;
    ancestors.push(parent);
    node = parent;
  }
  const classes = (n) =>
    typeof n.className === "string" ? n.className.split(/\s+/) : [];
  const words = (s) => (s || "").replace(/\s+/g, " ").trim();
  // Roughly the accessible name: aria-label, aria-labelledby, a <label>, placeholder, title,
  // then the element's own text (or a text box's value).
  const root = el.getRootNode();
  const labelledBy = (el.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const target = root.querySelector
        ? root.querySelector(`[id="${id}"]`)
        : null;
      return target ? target.textContent : "";
    })
    .join(" ");
  const labels = el.labels
    ? Array.from(el.labels)
        .map((l) => l.textContent)
        .join(" ")
    : "";
  const isBox =
    el.tagName === "INPUT" && !["checkbox", "radio"].includes(el.type);
  const name =
    [
      el.getAttribute("aria-label"),
      labelledBy,
      labels,
      el.getAttribute("placeholder"),
      el.getAttribute("title"),
      el.innerText || el.textContent,
      isBox ? el.value : ""
    ]
      .map(words)
      .find(Boolean) || "";
  return {
    tag: el.tagName.toLowerCase(),
    type: el.getAttribute("type"),
    dataId: el.getAttribute("data-id"),
    role: el.getAttribute("role"),
    name: name.slice(0, 80),
    // Our own components on the way down (c-shoresh-...), outermost first.
    components: hosts
      .concat(ancestors.map((a) => a.tagName.toLowerCase()).reverse())
      .filter((t, i, all) => t.startsWith("c-") && all.indexOf(t) === i),
    inToolbar: ancestors.some((a) => classes(a).includes("toolbar")),
    inDialog: ancestors.some((a) =>
      ["dialog", "alertdialog"].includes(a.getAttribute("role"))
    ),
    inGrid: ancestors.some((a) => a.getAttribute("data-id") === "edit-grid"),
    // Set by the toolbar check on each control it expects Tab to reach.
    checkMark: el.getAttribute("data-a11y-check")
  };
}

/** One line for the report: where focus is, in words a person can check on screen. */
function formatFocus(focus) {
  if (!focus) return "nowhere (the page itself)";
  const where = focus.inDialog
    ? " in a dialog"
    : focus.inGrid
      ? " in the grid"
      : focus.inToolbar
        ? " in the toolbar"
        : "";
  const name = focus.name ? ` "${focus.name}"` : "";
  return `${focus.tag}${name}${where}`;
}

/**
 * Whether focus is where a step expects. `expected` may give any of: dataId, name (exact, or a
 * RegExp), tag, inGrid, inDialog, inToolbar. Nothing focused never matches.
 */
function focusMatches(focus, expected) {
  if (!focus) return false;
  for (const [key, want] of Object.entries(expected)) {
    const got = focus[key];
    if (want instanceof RegExp) {
      if (typeof got !== "string" || !want.test(got)) return false;
    } else if (got !== want) {
      return false;
    }
  }
  return true;
}

/** Takes sign-in links, session ids and access tokens out of any text before it is shown. */
function scrub(text) {
  return String(text)
    .replace(
      /https?:\/\/[^\s"'<>]*(frontdoor|secur\/|sid=|otp=)[^\s"'<>]*/gi,
      "[link removed]"
    )
    .replace(/\b(sid|otp|access_token|token)=[^\s&"'<>]+/gi, "$1=[removed]")
    .replace(
      /\b00D[a-zA-Z0-9]{12,15}![A-Za-z0-9._-]{20,}/g,
      "[session removed]"
    );
}

/** The checks one run makes, in order, each passed, failed or not run. */
class Results {
  constructor() {
    this.rows = [];
  }

  add(screen, step, outcome, detail = "") {
    if (!["pass", "fail", "not run"].includes(outcome)) {
      throw new Error(`Unknown outcome ${outcome}`);
    }
    this.rows.push({ screen, step, outcome, detail: scrub(detail) });
  }

  pass(screen, step, detail) {
    this.add(screen, step, "pass", detail);
  }

  fail(screen, step, detail) {
    this.add(screen, step, "fail", detail);
  }

  notRun(screen, step, detail) {
    this.add(screen, step, "not run", detail);
  }

  count(outcome) {
    return this.rows.filter((r) => r.outcome === outcome).length;
  }
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/**
 * The report as Markdown: a summary, then what failed (screen and step), what could not be
 * run, and what passed.
 * @param {Results} results
 * @param {{date: string, commit: string, browser: string, axeVersion: string, camp: string, week: string}} about
 */
function renderReport(results, about) {
  const table = (rows) =>
    [
      "| Screen | Step | What happened |",
      "| ------ | ---- | ------------- |",
      ...rows.map(
        (r) => `| ${cell(r.screen)} | ${cell(r.step)} | ${cell(r.detail)} |`
      )
    ].join("\n");
  const failed = results.rows.filter((r) => r.outcome === "fail");
  const notRun = results.rows.filter((r) => r.outcome === "not run");
  const passed = results.rows.filter((r) => r.outcome === "pass");
  const parts = [
    `# Real-browser accessibility check, ${about.date}`,
    "",
    "Made by `scripts/a11y-browser-check.mjs` (how to run it: `docs/ci-setup.md`). It drives the",
    "Shoresh tab in the test org with the keyboard only, in a real browser, and checks where focus",
    "lands after each menu, dialog and tool closes, what the live regions say after saves, builds",
    "and publishing, that every toolbar action is reachable with Tab, and runs axe-core on each",
    "screen. It fixes nothing in the app and changes only its own made-up camp; failures are",
    "listed for follow-up.",
    "",
    `- Code checked: \`${about.commit}\``,
    `- Browser: ${about.browser}`,
    `- axe-core ${about.axeVersion}, rules: WCAG 2.0, 2.1 and 2.2, levels A and AA`,
    `- Data: the made-up camp "${about.camp}" (the walkthrough's seed, \`scripts/apex/sample-version.apex\`, under its own name), on ${about.week}, the check's own week, made fresh for this run`,
    "",
    `**${passed.length} passed, ${failed.length} failed, ${notRun.length} not run.**`,
    "",
    "## Failed",
    "",
    failed.length ? table(failed) : "Nothing failed.",
    "",
    "## Not run",
    "",
    notRun.length ? table(notRun) : "Every step ran.",
    "",
    "## Passed",
    "",
    passed.length ? table(passed) : "Nothing passed.",
    "",
    "## Not checked here",
    "",
    "- A screen reader itself (VoiceOver, NVDA): the check reads the live regions' text, not what",
    "  is spoken.",
    "- Pointer-only actions (drag and drop) and touch.",
    "- axe-core finds about a third of WCAG problems; colour contrast it can only judge where the",
    "  colours are plain.",
    ""
  ];
  return parts.join("\n");
}

module.exports = {
  describeFocus,
  formatFocus,
  focusMatches,
  scrub,
  Results,
  renderReport
};
