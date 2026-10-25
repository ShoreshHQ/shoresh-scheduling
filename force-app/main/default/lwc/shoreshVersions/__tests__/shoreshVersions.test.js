import { createElement } from "lwc";
import ShoreshVersions from "c/shoreshVersions";
import { buildTerms } from "c/shoreshTerms";

const VERSIONS = [
  {
    id: "s2",
    name: "Before my changes",
    origin: "Manual",
    savedAt: "2026-10-16T15:00:00.000Z"
  },
  {
    id: "s1",
    name: "Imported from summer.xlsx",
    origin: "Imported",
    savedAt: "2026-10-16T14:00:00.000Z"
  }
];

const flush = () =>
  [...Array(5)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );

async function render(versions = VERSIONS) {
  const element = createElement("c-shoresh-versions", { is: ShoreshVersions });
  element.terms = buildTerms([]);
  element.versions = versions;
  element.openId = "s1";
  document.body.appendChild(element);
  await flush();
  return element;
}

const q = (element, selector) => element.shadowRoot.querySelector(selector);
const qa = (element, selector) => [
  ...element.shadowRoot.querySelectorAll(selector)
];

async function openList(element) {
  q(element, '[data-id="versions-button"]').click();
  await flush();
}

describe("c-shoresh-versions", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("lists versions, newest first, with how each was made and which is on screen", async () => {
    const element = await render();
    const button = q(element, '[data-id="versions-button"]');
    // A plain button, so the list's open state is on the button itself (aria-expanded).
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent.trim()).toBe("Versions");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(q(element, '[data-id="versions-panel"]')).toBeNull();
    await openList(element);
    const rows = qa(element, ".version");
    expect(
      rows.map((r) => r.querySelector(".version-name").textContent)
    ).toEqual(["Before my changes", "Imported from summer.xlsx"]);
    expect(rows[0].textContent).toContain("Manual Build");
    expect(rows[1].textContent).toContain("on screen now");
    expect(rows[0].textContent).not.toContain("on screen now");
    // The Schedules page only looks: Open, never Restore, delete or Save version.
    expect(element.shadowRoot.textContent).not.toMatch(/Restore|delete/i);
    expect(q(element, '[data-action="delete"]')).toBeNull();
    expect(q(element, '[data-id="save-version"]')).toBeNull();
    expect(q(element, '[data-action="open"]').textContent.trim()).toBe("Open");
    // No line telling the director what to do.
    expect(q(element, ".panel-head").textContent.trim()).toBe("Versions");
    await expect(element).toBeAccessible();
  });

  it("can name the version on screen on its button, still said to be Versions", async () => {
    const element = await render();
    const button = q(element, '[data-id="versions-button"]');
    expect(button.hasAttribute("aria-label")).toBe(false);
    element.label = "Published Oct 18, 2:40 PM";
    await flush();
    expect(button.textContent.trim()).toBe("Published Oct 18, 2:40 PM");
    // The name starts with the words shown (WCAG 2.5.3), then says what the menu is.
    expect(button.getAttribute("aria-label")).toBe(
      "Published Oct 18, 2:40 PM, Versions"
    );
    expect(button.title).toBe("Published Oct 18, 2:40 PM, Versions");
    await openList(element);
    // The list itself is still headed Versions.
    expect(q(element, ".panel-head").textContent.trim()).toBe("Versions");
    await expect(element).toBeAccessible();
  });

  it("says when there are none", async () => {
    const element = await render([]);
    await openList(element);
    expect(q(element, ".empty").textContent).toBe("None yet");
  });

  it("asks to open a version, and closes", async () => {
    const element = await render();
    const handler = jest.fn();
    element.addEventListener("open", handler);
    await openList(element);
    q(element, '[data-id="s2"][data-action="open"]').click();
    await flush();
    expect(handler.mock.calls[0][0].detail).toEqual({ id: "s2" });
    expect(q(element, '[data-id="versions-panel"]')).toBeNull();
  });

  it("renames a version: starts from its name, saves with Enter or Save", async () => {
    const element = await render();
    const handler = jest.fn((event) => event.detail.onDone(true));
    element.addEventListener("rename", handler);
    await openList(element);
    q(element, '[data-id="s2"][data-action="rename"]').click();
    await flush();
    const input = q(element, '[data-id="rename-input"]');
    expect(input.value).toBe("Before my changes");
    // The rename button it was started from is gone: focus goes into the box (the desktop's
    // autoFocus), not the page (real-browser check, 2026-10-20).
    expect(element.shadowRoot.activeElement).toBe(input);
    await expect(element).toBeAccessible();
    input.value = "  Monday plan ";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(handler.mock.calls[0][0].detail.id).toBe("s2");
    expect(handler.mock.calls[0][0].detail.name).toBe("Monday plan");
    expect(q(element, '[data-id="rename-input"]')).toBeNull();
    // The box it was in is gone: focus goes to that version's rename, not the page.
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="s2"][data-action="rename"]')
    );
  });

  it("the Versions button says whether its list is open", async () => {
    const element = await render();
    await openList(element);
    expect(
      q(element, '[data-id="versions-button"]').getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("with announceWith, words are read out by the page, from no region of its own", async () => {
    const element = createElement("c-shoresh-versions", {
      is: ShoreshVersions
    });
    element.terms = buildTerms([]);
    element.versions = [{ ...VERSIONS[0], reason: "AutoSaved" }];
    element.restore = true;
    const said = jest.fn();
    element.announceWith = said;
    document.body.appendChild(element);
    await flush();
    await openList(element);
    expect(q(element, '[data-id="announce"]')).toBeNull();
    q(element, '[data-action="delete"]').click();
    await flush();
    expect(said).toHaveBeenCalledWith(
      "Delete Before my changes? Press again to delete."
    );
  });

  it("keeps the rename open when it was refused, and Escape cancels it", async () => {
    const element = await render();
    element.addEventListener("rename", (event) => event.detail.onDone(false));
    await openList(element);
    q(element, '[data-id="s1"][data-action="rename"]').click();
    await flush();
    const input = q(element, '[data-id="rename-input"]');
    input.value = "x";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    q(element, '[data-id="rename-save"]').click();
    await flush();
    expect(q(element, '[data-id="rename-input"]')).not.toBeNull();
    q(element, ".versions").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect(q(element, '[data-id="rename-input"]')).toBeNull();
    expect(q(element, '[data-id="versions-panel"]')).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      q(element, '[data-id="s1"][data-action="rename"]')
    );
  });

  it("a blank name cannot be saved", async () => {
    const element = await render();
    await openList(element);
    q(element, '[data-id="s1"][data-action="rename"]').click();
    await flush();
    const input = q(element, '[data-id="rename-input"]');
    input.value = "   ";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    expect(q(element, '[data-id="rename-save"]').disabled).toBe(true);
  });

  it("closes when clicking elsewhere on the page", async () => {
    const element = await render();
    await openList(element);
    document.body.click();
    await flush();
    expect(q(element, '[data-id="versions-panel"]')).toBeNull();
  });

  // In Salesforce the page sees each component through a wrapper (Lightning Locker / Lightning
  // Web Security): a page-wide listener gets the click's path as stand-ins, never the very
  // element the component knows as its host. The list then closed the moment it opened, by Enter
  // or a click, on Manual Build and Generated Schedule (real-browser check, 2026-10-20). Here a
  // page-wide click listener gets its event the same way.
  describe("when a page-wide listener sees the click through a wrapper (Salesforce)", () => {
    const realAdd = document.addEventListener;
    const realRemove = document.removeEventListener;
    const wrappers = new Map();
    const standIn = (event) =>
      new Proxy(event, {
        get(target, prop) {
          if (prop === "composedPath") {
            return () =>
              target.composedPath().map((node) => new Proxy(node, {}));
          }
          const value = target[prop];
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
    beforeEach(() => {
      document.addEventListener = function add(type, listener, options) {
        if (type !== "click") {
          return realAdd.call(this, type, listener, options);
        }
        const wrapper = (event) => listener(standIn(event));
        wrappers.set(listener, wrapper);
        return realAdd.call(this, type, wrapper, options);
      };
      document.removeEventListener = function remove(type, listener, options) {
        return realRemove.call(
          this,
          type,
          wrappers.get(listener) || listener,
          options
        );
      };
    });
    afterEach(() => {
      document.addEventListener = realAdd;
      document.removeEventListener = realRemove;
    });

    it("opens on a click, and stays open for clicks inside it", async () => {
      const element = await render();
      const button = q(element, '[data-id="versions-button"]');
      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(q(element, '[data-id="versions-panel"]')).not.toBeNull();
      q(element, '[data-action="rename"]').click();
      await flush();
      expect(q(element, '[data-id="rename-input"]')).not.toBeNull();
    });

    it("still closes when clicking elsewhere on the page", async () => {
      const element = await render();
      await openList(element);
      document.body.click();
      await flush();
      expect(q(element, '[data-id="versions-panel"]')).toBeNull();
      expect(
        q(element, '[data-id="versions-button"]').getAttribute("aria-expanded")
      ).toBe("false");
    });
  });

  describe("on Manual Build (restore)", () => {
    const WITH_AUTO = [
      {
        id: "s3",
        name: "Before Restore",
        origin: "Manual",
        reason: "AutoSaved",
        savedAt: "2026-10-16T16:00:00.000Z"
      },
      ...VERSIONS
    ];

    async function renderRestore(versions = WITH_AUTO) {
      const element = createElement("c-shoresh-versions", {
        is: ShoreshVersions
      });
      element.terms = buildTerms([]);
      element.versions = versions;
      element.restore = true;
      document.body.appendChild(element);
      await flush();
      await openList(element);
      return element;
    }

    it("each row's buttons name their version; an auto-saved one says so", async () => {
      const element = await renderRestore();
      const first = qa(element, ".version")[0];
      expect(
        first.querySelector('[data-action="open"]').getAttribute("aria-label")
      ).toBe("Restore Before Restore");
      expect(
        first.querySelector('[data-action="delete"]').getAttribute("aria-label")
      ).toBe("Delete Before Restore");
      expect(
        first.querySelector('[data-action="rename"]').getAttribute("aria-label")
      ).toBe("Rename Before Restore");
      expect(first.textContent).toContain("Auto-saved");
      expect(qa(element, ".version")[1].textContent).not.toContain(
        "Auto-saved"
      );
    });

    it("a version that was once the published schedule says so and can't be deleted", async () => {
      const element = await renderRestore([
        {
          id: "p1",
          name: "Published schedule",
          origin: "Manual",
          savedAt: "2026-10-16T17:00:00.000Z",
          publishedAt: "2026-10-16T17:00:00.000Z"
        },
        ...VERSIONS
      ]);
      const [published, other] = qa(element, ".version");
      expect(published.textContent).toContain("Published ·");
      expect(published.querySelector('[data-action="delete"]')).toBeNull();
      // It can still be restored and renamed, like any version.
      expect(published.querySelector('[data-action="open"]')).not.toBeNull();
      expect(published.querySelector('[data-action="rename"]')).not.toBeNull();
      expect(other.textContent).not.toContain("Published ·");
      expect(other.querySelector('[data-action="delete"]')).not.toBeNull();
    });

    it("the imported week says Imported and can't be deleted", async () => {
      const element = await renderRestore([
        {
          id: "i1",
          name: "Imported from last-summer.xlsx",
          origin: "Imported",
          savedAt: "2026-10-16T17:00:00.000Z"
        },
        ...VERSIONS
      ]);
      const [imported, other] = qa(element, ".version");
      expect(imported.textContent).toContain("Imported");
      expect(imported.querySelector('[data-action="delete"]')).toBeNull();
      // It can still be restored and renamed, like any version.
      expect(imported.querySelector('[data-action="open"]')).not.toBeNull();
      expect(imported.querySelector('[data-action="rename"]')).not.toBeNull();
      expect(other.querySelector('[data-action="delete"]')).not.toBeNull();
    });

    it("a copy named by when it was published doesn't say Published or the time again", async () => {
      const element = await renderRestore([
        {
          id: "p2",
          name: "Published Oct 16, 1:00 PM",
          origin: "Manual",
          savedAt: "2026-10-16T17:00:00.000Z",
          publishedAt: "2026-10-16T17:00:00.000Z",
          namedByPublish: true
        },
        {
          id: "p1",
          name: "Opening week",
          origin: "Manual",
          savedAt: "2026-10-15T17:00:00.000Z",
          publishedAt: "2026-10-15T17:00:00.000Z",
          namedByPublish: false
        }
      ]);
      const [named, renamed] = qa(element, ".version");
      const meta = (row) => row.querySelector(".version-meta").textContent;
      expect(meta(named).trim()).toBe("Manual Build");
      expect(named.querySelector('[data-id="saved-at"]')).toBeNull();
      // Renamed while published: its name doesn't say it, so the line still does.
      expect(meta(renamed)).toBe("Manual Build · Published · ");
      expect(renamed.querySelector('[data-id="saved-at"]')).not.toBeNull();
      // Still kept: never deleted.
      expect(named.querySelector('[data-action="delete"]')).toBeNull();
    });

    it("Delete? looks different, is said aloud, and blur takes it back", async () => {
      const element = await renderRestore();
      const handler = jest.fn();
      element.addEventListener("delete", handler);
      const del = q(element, '[data-action="delete"]');
      expect(del.className).toContain("link_quiet");
      del.click();
      await flush();
      expect(del.textContent.trim()).toBe("Delete?");
      expect(del.className).toContain("link_danger");
      expect(del.getAttribute("aria-label")).toBe(
        "Delete Before Restore? Press again to delete."
      );
      expect(q(element, '[data-id="announce"]').textContent.trim()).toBe(
        "Delete Before Restore? Press again to delete."
      );
      del.dispatchEvent(new CustomEvent("blur"));
      await flush();
      expect(del.textContent.trim()).toBe("delete");
      del.click();
      await flush();
      expect(handler).not.toHaveBeenCalled();
    });

    it("after a delete, focus goes to the next version once the action is done (list read again first)", async () => {
      const element = await renderRestore();
      const del = q(element, '[data-action="delete"]');
      del.click();
      del.click();
      // As Manual Build does it: busy while deleting and while the list is read again.
      element.busy = true;
      await flush();
      element.versions = VERSIONS;
      await flush();
      expect(element.shadowRoot.activeElement).not.toBe(
        q(element, '[data-action="open"]')
      );
      element.busy = false;
      await flush();
      expect(element.shadowRoot.activeElement).toBe(
        q(element, '[data-action="open"]')
      );
      expect(element.shadowRoot.activeElement.getAttribute("aria-label")).toBe(
        "Restore Before my changes"
      );
    });

    it("a delete that was refused keeps focus on that version's delete", async () => {
      const element = await renderRestore();
      const del = q(element, '[data-action="delete"]');
      del.click();
      del.click();
      element.busy = true;
      await flush();
      element.busy = false;
      await flush();
      expect(element.shadowRoot.activeElement).toBe(
        q(element, '[data-action="delete"][data-id="s3"]')
      );
    });

    it("after Restore or Escape, focus goes back to the Versions button", async () => {
      const element = await renderRestore();
      const button = q(element, '[data-id="versions-button"]');
      // lightning-button forwards focus to its inner button (the Jest stub has none).
      button.focus = jest.fn();
      q(element, '[data-action="open"]').click();
      await flush();
      expect(button.focus).toHaveBeenCalledTimes(1);
      await openList(element);
      q(element, ".versions").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape" })
      );
      await flush();
      expect(q(element, '[data-id="versions-panel"]')).toBeNull();
      expect(button.focus).toHaveBeenCalledTimes(2);
    });

    it("while busy, Restore and delete are disabled", async () => {
      const element = await renderRestore();
      element.busy = true;
      await flush();
      expect(q(element, '[data-action="open"]').disabled).toBe(true);
      expect(q(element, '[data-action="delete"]').disabled).toBe(true);
      expect(q(element, '[data-id="save-button"]').disabled).toBe(true);
    });

    it("Save version: not with a blank name; Enter saves; the name clears only once saved", async () => {
      const element = await renderRestore();
      const saves = [];
      element.addEventListener("save", (event) => saves.push(event.detail));
      const input = q(element, '[data-id="save-name"]');
      input.value = "   ";
      input.dispatchEvent(new CustomEvent("input"));
      await flush();
      expect(q(element, '[data-id="save-button"]').disabled).toBe(true);
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(saves).toHaveLength(0);
      input.value = "Lunch swap";
      input.dispatchEvent(new CustomEvent("input"));
      await flush();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(saves.map((d) => d.name)).toEqual(["Lunch swap"]);
      saves[0].onDone(false);
      await flush();
      expect(q(element, '[data-id="save-name"]').value).toBe("Lunch swap");
      saves[0].onDone(true);
      await flush();
      expect(q(element, '[data-id="save-name"]').value).toBe("");
    });

    it("Ctrl+Z or Cmd+Shift+Z in a name box stays in the box: no schedule Undo around it", async () => {
      const element = await renderRestore();
      const outside = jest.fn();
      element.addEventListener("keydown", outside);
      const press = (box, key, extra) =>
        box.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            composed: true,
            ...extra
          })
        );
      const save = q(element, '[data-id="save-name"]');
      press(save, "z", { ctrlKey: true });
      press(save, "Z", { metaKey: true, shiftKey: true });
      press(save, "y", { ctrlKey: true });
      expect(outside).not.toHaveBeenCalled();
      // Other keys still go on (Tab, Escape for the panel).
      press(save, "a");
      expect(outside).toHaveBeenCalledTimes(1);
      q(element, '[data-id="s2"][data-action="rename"]').click();
      await flush();
      press(q(element, '[data-id="rename-input"]'), "z", { metaKey: true });
      expect(outside).toHaveBeenCalledTimes(1);
    });
  });
});
