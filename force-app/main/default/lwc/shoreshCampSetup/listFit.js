/**
 * A setup list scrolls sideways only while it is wider than the frame (a narrow screen, a row's
 * details open). A box that scrolls also cuts off whatever opens below its last row, so while the
 * list fits it doesn't scroll, and a time block's list or a date's calendar opens in full.
 */
const TOO_WIDE = "too-wide";

function fit(list) {
  list.classList.toggle(TOO_WIDE, list.scrollWidth > list.clientWidth + 1);
}

/**
 * On a redraw, not while the cursor is in the list: an open list or calendar would count as
 * width and turn the scrolling on under it. It is measured when the cursor leaves the list, and
 * whenever the list or what is in it really changes size (a row's details, a narrower window).
 */
function fitAtRest(list) {
  if (!list.matches(":focus-within")) {
    fit(list);
  }
}

export class ListFit {
  constructor() {
    this.watched = new Set();
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
    this.onFocusOut = (event) => {
      const list = event.currentTarget;
      // Moving to another field in the same list isn't leaving it.
      if (event.relatedTarget && list.contains(event.relatedTarget)) {
        return;
      }
      Promise.resolve().then(() => fitAtRest(list));
    };
  }

  /** Each list on screen, and what is in it (a row's details widen a table, not the list). */
  watch(root) {
    this.forgetGone();
    root.querySelectorAll(".setup-list").forEach((list) => {
      fitAtRest(list);
      if (!this.watched.has(list)) {
        list.addEventListener("focusout", this.onFocusOut);
      }
      [list, ...list.children].forEach((el) => {
        if (!this.watched.has(el)) {
          this.watched.add(el);
          if (this.observer) {
            this.observer.observe(el);
          }
        }
      });
    });
  }

  /** Lists and rows a redraw took away are no longer watched. */
  forgetGone() {
    this.watched.forEach((el) => {
      if (!el.isConnected) {
        this.watched.delete(el);
        if (this.observer) {
          this.observer.unobserve(el);
        }
      }
    });
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.watched.forEach((el) => {
      el.removeEventListener("focusout", this.onFocusOut);
    });
    this.watched.clear();
  }
}
