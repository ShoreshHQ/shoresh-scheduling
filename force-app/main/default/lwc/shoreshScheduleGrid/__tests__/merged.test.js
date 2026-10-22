// Cells with the same merge key side by side are one cell (ADR 0014 slice 4): a special event
// across bunks, with its flag and place; different looks stay apart.
import { createElement } from "lwc";
import ShoreshScheduleGrid from "c/shoreshScheduleGrid";

const flush = () => Promise.resolve().then(() => Promise.resolve());

function cell(column, extra = {}) {
  return {
    key: `${column}-0`,
    row: 0,
    column,
    length: 1,
    slot: { day: 0, group: column, block: 0 },
    style: `grid-row: 1 / span 1; grid-column: ${column + 2} / span 1;`,
    text: "Carnival",
    title: "Carnival: Special event",
    className: "cell cell_event",
    event: true,
    where: "Main field",
    mergeKey: "S:e1|0|1",
    ...extra
  };
}

async function render(cells) {
  const element = createElement("c-shoresh-schedule-grid", {
    is: ShoreshScheduleGrid
  });
  element.grid = {
    columns: [0, 1, 2].map((i) => ({ key: `g${i}`, label: `Bunk ${i + 1}` })),
    rows: [
      { key: "t1", name: "Period 1", time: "9:00–9:45", said: "Period 1" }
    ],
    cells
  };
  element.corner = "Time block";
  element.label = "Monday";
  element.editable = true;
  document.body.appendChild(element);
  await flush();
  return element;
}

describe("c-shoresh-schedule-grid: merged cells", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws an event in bunks side by side as one cell, flag and place", async () => {
    const element = await render([cell(0), cell(1), cell(2)]);
    const drawn = element.shadowRoot.querySelectorAll("[data-cell]");
    expect(drawn).toHaveLength(1);
    expect(drawn[0].getAttribute("aria-colspan")).toBe("3");
    expect(drawn[0].style.gridColumn).toMatch(/2 \/ span 3/);
    expect(drawn[0].querySelector(".flag")).not.toBeNull();
    expect(drawn[0].querySelector(".event-where").textContent).toBe(
      "Main field"
    );
  });

  it("keeps apart cells that don't sit side by side or don't look the same", async () => {
    const element = await render([cell(0), cell(1, { locked: true }), cell(2)]);
    expect(element.shadowRoot.querySelectorAll("[data-cell]")).toHaveLength(3);
  });

  it("shows the flag, the padlock and the look mark at once (decision 51)", async () => {
    const element = await render([cell(0, { locked: true, dot: "Over" })]);
    const drawn = element.shadowRoot.querySelector("[data-cell]");
    expect(drawn.querySelector(".flag")).not.toBeNull();
    expect(drawn.querySelector(".cell-lock")).not.toBeNull();
    expect(drawn.querySelector(".cell-dot")).not.toBeNull();
  });
});
