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
      unobserve(el) {
        observed = observed.filter((x) => x !== el);
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

  it("a redraw with the cursor in it doesn't measure: an open calendar is no width", async () => {
    const { root, el } = list(800, 800);
    const first = document.createElement("input");
    const second = document.createElement("input");
    el.append(first, second);
    document.body.appendChild(root);
    const fit = new ListFit();
    fit.watch(root);
    first.focus();
    // A calendar open under the cursor makes the list read wider than it is.
    Object.defineProperty(el, "scrollWidth", { value: 1100 });
    fit.watch(root);
    expect(el.classList.contains("too-wide")).toBe(false);
    // On to the next field in the same list: not leaving it, nothing measured.
    second.focus();
    await Promise.resolve();
    expect(el.classList.contains("too-wide")).toBe(false);
    // Out of the list (a longer value typed in did widen it): measured.
    second.blur();
    await Promise.resolve();
    expect(el.classList.contains("too-wide")).toBe(true);
    root.remove();
  });

  it("a real change of size is measured even with the cursor in the list (a row's details)", () => {
    const { root, el, table } = list(800, 800);
    const button = document.createElement("button");
    table.appendChild(button);
    document.body.appendChild(root);
    new ListFit().watch(root);
    button.focus();
    Object.defineProperty(el, "scrollWidth", { value: 1100 });
    callback([{ target: table }]);
    expect(el.classList.contains("too-wide")).toBe(true);
    root.remove();
  });

  it("each part is watched once, and what a redraw took away is let go", () => {
    const { root, el, table } = list(800, 800);
    document.body.appendChild(root);
    const fit = new ListFit();
    fit.watch(root);
    fit.watch(root);
    expect(observed).toEqual([el, table]);
    table.remove();
    fit.watch(root);
    expect(observed).toEqual([el]);
    root.remove();
  });

  it("without ResizeObserver it still decides once, as drawn", () => {
    delete global.ResizeObserver;
    const { root, el } = list(1200, 800);
    new ListFit().watch(root);
    expect(el.classList.contains("too-wide")).toBe(true);
  });
});
