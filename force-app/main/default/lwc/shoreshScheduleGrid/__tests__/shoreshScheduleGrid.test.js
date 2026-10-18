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
          `[data-cell="${key}"] .cell-lock lightning-icon`
        );
      expect(lockOf("0-0").alternativeText).toBe("Locked");
      expect(lockOf("1-1").alternativeText).toBe("Locked empty");
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
