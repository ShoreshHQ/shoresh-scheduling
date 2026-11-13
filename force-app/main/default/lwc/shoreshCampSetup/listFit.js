/**
 * A setup list scrolls sideways only while it is wider than the frame (a narrow screen, a row's
 * details open). A box that scrolls also cuts off whatever opens below its last row, so while the
 * list fits it doesn't scroll, and a time block's list or a date's calendar opens in full.
 */
const TOO_WIDE = "too-wide";

function fit(list) {
  list.classList.toggle(TOO_WIDE, list.scrollWidth > list.clientWidth + 1);
}

export class ListFit {
  constructor() {
    this.observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver((entries) => {
            // A list's own size, or something in it: the list it is in.
            const listOf = (target) => {
              return target.classList.contains("setup-list")
                ? target
                : target.parentElement;
            };
            const lists = new Set(entries.map((e) => listOf(e.target)));
            lists.forEach((list) => list && fit(list));
          })
        : null;
  }

  /** Each list on screen, and what is in it (a row's details widen a table, not the list). */
  watch(root) {
    root.querySelectorAll(".setup-list").forEach((list) => {
      fit(list);
      if (this.observer) {
        this.observer.observe(list);
        [...list.children].forEach((child) => this.observer.observe(child));
      }
    });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
