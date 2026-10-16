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
    expect(q(element, '[data-id="versions-button"]').label).toBe("Versions");
    expect(q(element, '[data-id="versions-panel"]')).toBeNull();
    await openList(element);
    const rows = qa(element, ".version");
    expect(
      rows.map((r) => r.querySelector(".version-name").textContent)
    ).toEqual(["Before my changes", "Imported from summer.xlsx"]);
    expect(rows[0].textContent).toContain("Manual Build");
    expect(rows[1].textContent).toContain("on screen now");
    expect(rows[0].textContent).not.toContain("on screen now");
    // Read-only in 4a: no restore, save, or delete.
    expect(element.shadowRoot.textContent).not.toMatch(
      /Restore|Delete|Save version/
    );
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
    input.value = "  Monday plan ";
    input.dispatchEvent(new CustomEvent("input"));
    await flush();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flush();
    expect(handler.mock.calls[0][0].detail.id).toBe("s2");
    expect(handler.mock.calls[0][0].detail.name).toBe("Monday plan");
    expect(q(element, '[data-id="rename-input"]')).toBeNull();
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
});
