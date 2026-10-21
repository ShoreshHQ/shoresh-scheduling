import { createElement } from "lwc";
import ShoreshScheduleGrid from "c/shoreshScheduleGrid";

// Two groups, three time blocks. Swim runs blocks 1-2 for Hawks; Owls are not at camp in block 3.
const GRID = {
  columns: [
    { key: "hawks", label: "Hawks" },
    { key: "owls", label: "Owls" }
  ],
  rows: [
    { key: "b1", name: "Period 1", timeLines: [] },
    { key: "b2", name: "Period 2", timeLines: [] },
    { key: "b3", name: "Period 3", timeLines: [] }
  ],
  cells: [
    {
      key: "0-0",
      row: 0,
      column: 0,
      length: 2,
      text: "Swim",
      className: "cell"
    },
    {
      key: "1-0",
      row: 0,
      column: 1,
      length: 1,
      text: "Art",
      className: "cell"
    },
    {
      key: "1-1",
      row: 1,
      column: 1,
      length: 1,
      text: "Open",
      className: "cell"
    },
    {
      key: "0-2",
      row: 2,
      column: 0,
      length: 1,
      text: "Open",
      className: "cell"
    }
  ]
};

function render(label) {
  const element = createElement("c-shoresh-schedule-grid", {
    is: ShoreshScheduleGrid
  });
  element.grid = GRID;
  element.corner = "Time block";
  element.label = label;
  document.body.appendChild(element);
  return element;
}

describe("c-shoresh-schedule-grid", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is a named table with its size", () => {
    const table = render("Monday").shadowRoot.querySelector('[role="table"]');
    expect(table.getAttribute("aria-label")).toBe("Monday");
    expect(table.getAttribute("aria-rowcount")).toBe("4");
    expect(table.getAttribute("aria-colcount")).toBe("3");
  });

  it("numbers the rows and the header columns", () => {
    const root = render("Monday").shadowRoot;
    const rows = [...root.querySelectorAll('[role="row"]')];
    expect(rows.map((r) => r.getAttribute("aria-rowindex"))).toEqual([
      "1",
      "2",
      "3",
      "4"
    ]);
    const heads = [...root.querySelectorAll('[role="columnheader"]')];
    expect(heads.map((h) => h.getAttribute("aria-colindex"))).toEqual([
      "1",
      "2",
      "3"
    ]);
    root
      .querySelectorAll('[role="rowheader"]')
      .forEach((h) => expect(h.getAttribute("aria-colindex")).toBe("1"));
  });

  it("says where each cell is and how many blocks it runs", () => {
    const root = render("Monday").shadowRoot;
    const at = (key) => root.querySelector(`[data-cell="${key}"]`);
    expect(at("0-0").getAttribute("aria-colindex")).toBe("2");
    expect(at("0-0").getAttribute("aria-rowspan")).toBe("2");
    expect(at("1-1").getAttribute("aria-colindex")).toBe("3");
    expect(at("1-1").getAttribute("aria-rowspan")).toBe("1");
    // Block 2 has no Hawks cell (Swim carries on) and block 3 no Owls cell (not at camp): the
    // column index keeps each remaining cell under its own column.
    const third = root.querySelectorAll('[role="row"]')[3];
    const cells = [...third.querySelectorAll('[role="cell"]')];
    expect(cells.map((c) => c.getAttribute("aria-colindex"))).toEqual(["2"]);
  });

  describe("locks and focus (Generated Schedule)", () => {
    const flush = () => Promise.resolve().then(() => undefined);
    function editable(cells) {
      const element = createElement("c-shoresh-schedule-grid", {
        is: ShoreshScheduleGrid
      });
      element.grid = { ...GRID, cells };
      element.editable = true;
      document.body.appendChild(element);
      return element;
    }

    it("draws the lock with its words: Locked, or what the page says", async () => {
      const element = editable([
        { ...GRID.cells[0], locked: true },
        { ...GRID.cells[2], locked: true, lockLabel: "Locked empty" },
        GRID.cells[1]
      ]);
      await flush();
      const lockOf = (key) =>
        element.shadowRoot.querySelector(
          `[data-cell="${key}"] .cell-lock [data-id="lock-words"]`
        );
      expect(lockOf("0-0").textContent).toBe("Locked");
      expect(lockOf("1-1").textContent).toBe("Locked empty");
      expect(lockOf("1-0")).toBeNull();
    });

    it("says which cell focus reached, the cell's dot included", async () => {
      const element = editable([
        { ...GRID.cells[0], dot: "Twice in a day" },
        GRID.cells[1]
      ]);
      const reached = jest.fn();
      element.addEventListener("cellfocus", reached);
      await flush();
      const cell = element.shadowRoot.querySelector('[data-cell="1-0"]');
      cell.dispatchEvent(
        new CustomEvent("focusin", { bubbles: true, composed: true })
      );
      const dot = element.shadowRoot.querySelector(
        '[data-cell="0-0"] c-shoresh-dot'
      );
      dot.dispatchEvent(
        new CustomEvent("focusin", { bubbles: true, composed: true })
      );
      expect(reached.mock.calls.map((c) => c[0].detail.key)).toEqual([
        "1-0",
        "0-0"
      ]);
    });
  });
});

describe("c-shoresh-schedule-grid, the round 13 look (ADR 0008 part 8)", () => {
  const flush = () => Promise.resolve().then(() => undefined);
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  // Three bunks, four blocks: Lunch for everyone in block 3; Swim twice, Art once; one Open.
  const lunch = (column) => ({
    key: `${column}-2`,
    row: 2,
    column,
    length: 1,
    text: "Lunch",
    title: "Lunch: Fixed activity",
    setTime: true,
    className: "cell cell_set-time"
  });
  const LOOK = {
    columns: [
      { key: "a", label: "Cedar" },
      { key: "b", label: "Birch", note: "(removed)" },
      { key: "c", label: "Maple" }
    ],
    rows: [
      {
        key: "b1",
        name: "Period 1",
        time: "9:00–9:45",
        said: "Period 1, 9:00 AM – 9:45 AM"
      },
      { key: "b2", name: "Period 2", time: "9:50–10:35", said: "Period 2" },
      { key: "b3", name: "Lunch", time: "11:30–12:20", said: "Lunch" },
      { key: "b4", name: "Period 4", time: "12:30–1:15", said: "Period 4" }
    ],
    cells: [
      {
        key: "0-0",
        row: 0,
        column: 0,
        length: 1,
        text: "Swim",
        activityKey: "A:swim",
        className: "cell cell_activity"
      },
      {
        key: "1-0",
        row: 0,
        column: 1,
        length: 1,
        text: "Art",
        activityKey: "A:art",
        className: "cell cell_activity"
      },
      {
        key: "2-0",
        row: 0,
        column: 2,
        length: 1,
        text: "Swim",
        activityKey: "A:swim",
        className: "cell cell_activity"
      },
      {
        key: "0-1",
        row: 1,
        column: 0,
        length: 1,
        text: "Open",
        open: true,
        className: "cell cell_open"
      },
      {
        key: "1-1",
        row: 1,
        column: 1,
        length: 1,
        text: "Swim",
        activityKey: "A:swim",
        className: "cell cell_activity"
      },
      {
        key: "2-1",
        row: 1,
        column: 2,
        length: 1,
        text: "Not at camp",
        away: true,
        className: "cell cell_away"
      },
      lunch(0),
      lunch(1),
      lunch(2),
      {
        key: "0-3",
        row: 3,
        column: 0,
        length: 1,
        text: "Open",
        open: true,
        className: "cell cell_open"
      },
      {
        key: "1-3",
        row: 3,
        column: 1,
        length: 1,
        text: "Chugim",
        notSetUp: true,
        note: "not set up yet",
        className: "cell cell_not-set-up"
      },
      {
        key: "2-3",
        row: 3,
        column: 2,
        length: 1,
        text: "Pottery",
        gone: true,
        note: "(removed)",
        activityKey: "A:pottery",
        className: "cell cell_activity"
      }
    ]
  };

  function renderLook(grid = LOOK, editable = true) {
    const element = createElement("c-shoresh-schedule-grid", {
      is: ShoreshScheduleGrid
    });
    element.grid = grid;
    element.corner = "Time block";
    element.label = "Monday";
    element.editable = editable;
    document.body.appendChild(element);
    return element;
  }
  const at = (element, key) =>
    element.shadowRoot.querySelector(`[data-cell="${key}"]`);
  const classes = (element, name) =>
    [...element.shadowRoot.querySelectorAll(`.${name}`)].map(
      (c) => c.dataset.cell
    );

  it("shows times only down the side and names only across the top; the rest is for screen readers", () => {
    const root = renderLook().shadowRoot;
    const head = root.querySelector('[role="rowheader"]');
    expect(head.querySelector(".block-time").textContent).toBe("9:00–9:45");
    expect(head.querySelector(".block-time").getAttribute("aria-hidden")).toBe(
      "true"
    );
    expect(head.querySelector(".slds-assistive-text").textContent).toBe(
      "Period 1, 9:00 AM – 9:45 AM"
    );
    const corner = root.querySelector('[role="columnheader"]');
    expect(corner.querySelector(".slds-assistive-text").textContent).toBe(
      "Time block"
    );
    // A removed bunk: struck through, and said.
    const birch = root.querySelector('[data-column="b"]');
    expect(birch.querySelector(".head-name_gone").textContent).toBe("Birch");
    expect(birch.querySelector(".slds-assistive-text").textContent).toContain(
      "(removed)"
    );
  });

  it("draws a row every bunk spends on the same fixed activity as one slim cell with the lock", () => {
    const element = renderLook();
    const row = element.shadowRoot.querySelectorAll('[role="row"]')[3];
    const cells = [...row.querySelectorAll('[role="gridcell"]')];
    expect(cells.map((c) => c.dataset.cell)).toEqual(["0-2"]);
    expect(cells[0].getAttribute("aria-colspan")).toBe("3");
    expect(cells[0].getAttribute("style")).toContain("grid-column: 2 / span 3");
    expect(cells[0].className).toContain("cell_slim");
    expect(cells[0].querySelector(".set-lock svg")).not.toBeNull();
    // Not a director's Lock: no "Locked" words.
    expect(cells[0].querySelector(".cell-lock")).toBeNull();
    expect(
      element.shadowRoot
        .querySelector('[data-id="schedule-grid"] .grid_body')
        .getAttribute("style")
    ).toContain(
      "grid-template-rows: minmax(var(--shoresh-tile-h), auto) minmax(var(--shoresh-tile-h), auto) var(--shoresh-short-h) minmax(var(--shoresh-tile-h), auto)"
    );
  });

  it("keeps a row whole when one bunk's fixed cell differs (its words would be lost)", () => {
    const cells = LOOK.cells.map((c) => {
      return c.key === "1-2" ? { ...c, dot: "Not set up for Birch" } : c;
    });
    const element = renderLook({ ...LOOK, cells });
    expect(at(element, "1-2")).not.toBeNull();
    expect(at(element, "0-2").getAttribute("aria-colspan")).toBeNull();
  });

  it("an Open cell shows no word but keeps its name; not at camp and not set up yet say so", () => {
    const element = renderLook();
    const open = at(element, "0-1");
    expect(open.querySelector(".cell-name").className).toContain(
      "slds-assistive-text"
    );
    expect(open.textContent.trim()).toBe("Open");
    expect(
      at(element, "2-1").querySelector(".slds-assistive-text").textContent
    ).toBe("Not at camp");
    expect(at(element, "1-3").textContent).toContain("not set up yet");
    expect(at(element, "2-3").querySelector(".cell-name_gone")).not.toBeNull();
    expect(at(element, "2-3").textContent).toContain("(removed)");
  });

  it("a quiet line names only the marks on the grid", () => {
    const element = renderLook();
    const legend = element.shadowRoot.querySelector('[data-id="legend"]');
    expect(
      [...legend.querySelectorAll(".legend-entry")].map((e) => e.textContent)
    ).toEqual(["not at camp", "not set up yet", "removed"]);
    const plain = renderLook({
      ...LOOK,
      columns: LOOK.columns.map((c) => ({ ...c, note: null })),
      cells: LOOK.cells.filter((c) => !c.away && !c.notSetUp && !c.gone)
    });
    expect(plain.shadowRoot.querySelector('[data-id="legend"]')).toBeNull();
  });

  it("the needs-a-look dot is the corner mark", () => {
    const cells = LOOK.cells.map((c) => {
      return c.key === "0-0" ? { ...c, dot: "Twice in a day" } : c;
    });
    const element = renderLook({ ...LOOK, cells });
    const dot = at(element, "0-0").querySelector("c-shoresh-dot");
    expect(dot.shape).toBe("corner");
    expect(at(element, "0-0").className).toContain("cell_look");
  });

  it("pointing at a cell outlines every other cell of its activity, never an Open one", async () => {
    const element = renderLook();
    at(element, "0-0").dispatchEvent(
      new CustomEvent("pointerover", { bubbles: true, composed: true })
    );
    await flush();
    expect(classes(element, "cell_same")).toEqual(["2-0", "1-1"]);
    element.shadowRoot
      .querySelector('[data-id="schedule-grid"]')
      .dispatchEvent(new CustomEvent("pointerleave"));
    await flush();
    expect(classes(element, "cell_same")).toEqual([]);
  });

  it("keyboard focus on a cell outlines its activity too", async () => {
    const element = renderLook();
    at(element, "1-1").dispatchEvent(
      new CustomEvent("focusin", { bubbles: true, composed: true })
    );
    await flush();
    expect(classes(element, "cell_same")).toEqual(["0-0", "2-0"]);
  });

  it("a held activity outlines all its cells and draws fits here on the Open cells named", async () => {
    const element = renderLook();
    element.held = { activityKey: "A:swim", fits: ["0-3", "1-1"] };
    await flush();
    expect(classes(element, "cell_same")).toEqual(["0-0", "2-0", "1-1"]);
    // "1-1" is filled: fits only ever lands on an Open cell.
    expect(classes(element, "cell_fits")).toEqual(["0-3"]);
    element.held = null;
    await flush();
    expect(classes(element, "cell_fits")).toEqual([]);
  });

  it("Up and Down through a slim row come out in the column they went in from", async () => {
    const element = renderLook();
    await flush();
    const press = (key, cell) =>
      at(element, cell).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, composed: true })
      );
    press("ArrowRight", "0-0");
    await flush();
    press("ArrowRight", "1-0");
    await flush();
    press("ArrowDown", "2-0");
    await flush();
    press("ArrowDown", "2-1");
    await flush();
    await flush();
    expect(element.shadowRoot.activeElement.dataset.cell).toBe("0-2");
    press("ArrowDown", "0-2");
    await flush();
    await flush();
    expect(element.shadowRoot.activeElement.dataset.cell).toBe("2-3");
    press("ArrowUp", "2-3");
    await flush();
    await flush();
    press("ArrowRight", "0-2");
    await flush();
    await flush();
    // Right from the slim row: nothing beyond it, focus stays.
    expect(element.shadowRoot.activeElement.dataset.cell).toBe("0-2");
  });
});
