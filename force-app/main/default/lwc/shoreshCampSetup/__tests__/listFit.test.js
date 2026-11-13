import { ListFit } from "../listFit";

// UX pass 2026-11-13 (live check): a box that scrolls sideways also cuts off what opens below
// its last row, so a short setup list's time block list or date calendar showed one row.
describe("a setup list scrolls sideways only while too wide", () => {
  let observed;
  let callback;
  beforeEach(() => {
    observed = [];
    global.ResizeObserver = class {
      constructor(cb) {
        callback = cb;
      }
      observe(el) {
        observed.push(el);
      }
      disconnect() {}
    };
  });
  afterEach(() => {
    delete global.ResizeObserver;
  });

  function list(scrollWidth, clientWidth) {
    const root = document.createElement("div");
    const el = document.createElement("div");
    el.className = "setup-list";
    const table = document.createElement("div");
    el.appendChild(table);
    root.appendChild(el);
    Object.defineProperty(el, "scrollWidth", {
      configurable: true,
      value: scrollWidth
    });
    Object.defineProperty(el, "clientWidth", {
      configurable: true,
      value: clientWidth
    });
    return { root, el, table };
  }

  it("a list that fits doesn't scroll, so nothing opening in it is cut off", () => {
    const { root, el } = list(800, 800);
    new ListFit().watch(root);
    expect(el.classList.contains("too-wide")).toBe(false);
  });

  it("a list wider than the frame scrolls, and stops once it fits again", () => {
    const { root, el, table } = list(1200, 800);
    new ListFit().watch(root);
    expect(el.classList.contains("too-wide")).toBe(true);
    // What is in it is watched too: a row's details widen the table, not the list's box.
    expect(observed).toEqual([el, table]);
    Object.defineProperty(el, "scrollWidth", { value: 800 });
    callback([{ target: table }]);
    expect(el.classList.contains("too-wide")).toBe(false);
  });

  it("without ResizeObserver it still decides once, as drawn", () => {
    delete global.ResizeObserver;
    const { root, el } = list(1200, 800);
    new ListFit().watch(root);
    expect(el.classList.contains("too-wide")).toBe(true);
  });
});
