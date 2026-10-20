import { createElement } from "lwc";
import ShoreshSetupMatch from "c/shoreshSetupMatch";

// What "Update to match setup" would change, shown before anything changes. Synthetic camp.

const ONE_CELL = {
  key: "k1",
  dateValue: "2026-06-29",
  summary: null,
  takesChoices: true,
  lines: [
    {
      place: "Bunk 1 · Monday · Period 2",
      before: "Swim",
      after: "Open",
      reason: "Deleted from setup"
    }
  ]
};
const A_DAY = {
  key: "k2",
  dateValue: "2026-06-30",
  summary: "Tuesday: Period 3 added, Bunk 3 not at camp this week",
  takesChoices: true,
  lines: [
    {
      place: "Bunk 3 · Tuesday · Period 1",
      before: "Archery",
      after: "Open",
      reason: "Not at camp this week"
    }
  ]
};

const flush = () => Promise.resolve();

async function render(props = {}) {
  const element = createElement("c-shoresh-setup-match", {
    is: ShoreshSetupMatch
  });
  element.heading = "Update Week 1 to match setup?";
  element.changes = [ONE_CELL, A_DAY];
  Object.assign(element, props);
  const heard = [];
  element.addEventListener("update", (e) => heard.push(e.detail.keys));
  element.addEventListener("close", () => heard.push("close"));
  document.body.appendChild(element);
  await flush();
  return { element, heard };
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function press(element, key, shiftKey = false) {
  q(element, '[data-id="setup-match"]').dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })
  );
  await flush();
}

describe("c-shoresh-setup-match", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("is a modal listing each change: where, what it becomes, and why", async () => {
    const { element } = await render();
    const dialog = q(element, '[data-id="setup-match"]');
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(q(element, "h2").textContent).toBe("Update Week 1 to match setup?");
    const rows = qa(element, '[data-id="change"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".place").textContent).toBe(
      "Bunk 1 · Monday · Period 2"
    );
    expect(rows[0].querySelector(".from-to").textContent).toBe("Swim → Open");
    expect(rows[0].querySelector(".reason").textContent).toBe(
      "Deleted from setup"
    );
    expect(rows[0].querySelector(".summary")).toBeNull();
    // A day whose time blocks or groups changed is one row, its summary first.
    expect(rows[1].querySelector(".summary").textContent).toBe(
      "Tuesday: Period 3 added, Bunk 3 not at camp this week"
    );
    expect(
      qa(element, '[data-id="update-one"]').map((b) =>
        b.getAttribute("aria-label")
      )
    ).toEqual([
      "Update Bunk 1 · Monday · Period 2",
      "Update Tuesday: Period 3 added, Bunk 3 not at camp this week"
    ]);
  });

  it("starts on Cancel, so nothing changes by a stray Enter", async () => {
    const { element } = await render();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="close"]')
    );
  });

  it("Update on a row asks for that change only; Update all for every one listed", async () => {
    const { element, heard } = await render();
    qa(element, '[data-id="update-one"]')[1].click();
    q(element, '[data-id="update-all"]').click();
    expect(heard).toEqual([["k2"], ["k1", "k2"]]);
  });

  it("says Close, not Cancel, once an update was made in this opening", async () => {
    const { element } = await render();
    expect(q(element, '[data-id="close"]').textContent.trim()).toBe("Cancel");
    element.updated = true;
    await flush();
    expect(q(element, '[data-id="close"]').textContent.trim()).toBe("Close");
  });

  it("Cancel and Escape close it", async () => {
    const { element, heard } = await render();
    q(element, '[data-id="close"]').click();
    await press(element, "Escape");
    expect(heard).toEqual(["close", "close"]);
  });

  it("keeps Tab inside, on the list and the buttons", async () => {
    const { element } = await render();
    // From Cancel (the second-to-last stop) to Update all, then round to the list.
    await press(element, "Tab");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-all"]')
    );
    await press(element, "Tab");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="changes"]')
    );
    await press(element, "Tab", true);
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-all"]')
    );
  });

  it("waits while an update is on its way, Cancel and Escape too", async () => {
    // Closing then would not stop the update, whose answer would open the list again by itself.
    const { element, heard } = await render({ busy: true });
    expect(qa(element, '[data-id="update-one"]').every((b) => b.disabled)).toBe(
      true
    );
    expect(q(element, '[data-id="update-all"]').disabled).toBe(true);
    expect(q(element, '[data-id="close"]').disabled).toBe(true);
    await press(element, "Escape");
    expect(heard).toEqual([]);
    element.busy = false;
    await flush();
    await press(element, "Escape");
    expect(heard).toEqual(["close"]);
  });

  it("shows a notice above the list, and says it from a live region already there", async () => {
    const { element } = await render();
    // Present and empty from the start: a live region added already filled is often not read.
    const live = q(element, '[data-id="announce"]');
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent.trim()).toBe("");
    expect(live.closest('[role="dialog"]')).not.toBeNull();
    element.notice = "Setup changed again since you looked.";
    await flush();
    expect(q(element, '[data-id="notice"]').textContent).toBe(
      "Setup changed again since you looked."
    );
    expect(q(element, '[data-id="announce"]')).toBe(live);
    expect(live.textContent.trim()).toBe(
      "Setup changed again since you looked."
    );
  });

  it("says an announcement only to screen readers", async () => {
    const { element } = await render();
    element.announcement = "Updated to match setup.";
    await flush();
    expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
      "Updated to match setup."
    );
    expect(q(element, '[data-id="notice"]')).toBeNull();
  });

  it("moves focus to the next row once the row it was on is gone", async () => {
    const { element } = await render();
    qa(element, '[data-id="update-one"]')[0].focus();
    element.changes = [A_DAY];
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-one"]')
    );
  });

  it("keeps focus inside the dialog, on the list, while an update is on its way", async () => {
    const { element } = await render();
    q(element, '[data-id="update-all"]').focus();
    element.busy = true;
    await flush();
    // Its button waits (disabled): focus waits on the list rather than falling to the page.
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="changes"]')
    );
    // Tab stays there: every button waits.
    await press(element, "Tab");
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="changes"]')
    );
    // The update done (the list as it was, none gone): focus goes to the first row's Update.
    element.busy = false;
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="update-one"]')
    );
  });

  it("leaves focus on the list when the director put it there", async () => {
    const { element } = await render();
    q(element, '[data-id="changes"]').focus();
    element.notice = "Setup changed again since you looked.";
    await flush();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="changes"]')
    );
  });

  it("asks for no update while one is on its way, even from a button drawn before", async () => {
    const { element, heard } = await render({ busy: true });
    const all = q(element, '[data-id="update-all"]');
    const one = q(element, '[data-id="update-one"]');
    all.disabled = false;
    one.disabled = false;
    all.click();
    one.click();
    expect(heard).toEqual([]);
  });

  it("reads the same words out again each time it is told to", async () => {
    const { element } = await render({
      announcement: "Updated to match setup.",
      said: 1
    });
    const live = q(element, '[data-id="announce"]');
    const first = live.textContent;
    element.said = 2;
    await flush();
    const second = live.textContent;
    expect(first.trim()).toBe("Updated to match setup.");
    expect(second.trim()).toBe("Updated to match setup.");
    // Changed words are what a screen reader reads out from a live region.
    expect(second).not.toBe(first);
    element.notice = "Setup changed again since you looked.";
    element.said = 3;
    await flush();
    const third = live.textContent;
    element.said = 4;
    await flush();
    expect(live.textContent.trim()).toBe(third.trim());
    expect(live.textContent).not.toBe(third);
  });

  it("is accessible", async () => {
    const { element } = await render();
    await expect(element).toBeAccessible();
  });
});
