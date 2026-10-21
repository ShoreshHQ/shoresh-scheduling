// Tests of Manual Build look through it into the week editor it draws (c-shoresh-week-editor):
// the grid, Undo and Redo, the typing box and the "keep theirs or use yours" question sit in
// the editor's shadow, the pickers, Versions and Start in Manual Build's own.

/** The editor's shadow root inside a Manual Build element, or null before it is drawn. */
export function editorRoot(element) {
  const editor = element.shadowRoot.querySelector("c-shoresh-week-editor");
  return editor ? editor.shadowRoot : null;
}

/** The first match in Manual Build's shadow, else in the editor's. */
export function find(element, selector) {
  const here = element.shadowRoot.querySelector(selector);
  if (here) {
    return here;
  }
  const root = editorRoot(element);
  return root ? root.querySelector(selector) : null;
}

/** Every match in Manual Build's shadow, then in the editor's. */
export function findAll(element, selector) {
  const root = editorRoot(element);
  return [
    ...element.shadowRoot.querySelectorAll(selector),
    ...(root ? root.querySelectorAll(selector) : [])
  ];
}

/** The grid cell keyboard focus is on (its key), or null when focus isn't in the editor's grid. */
export function focusedCellKey(element) {
  const editor = element.shadowRoot.querySelector("c-shoresh-week-editor");
  if (!editor || element.shadowRoot.activeElement !== editor) {
    return null;
  }
  const grid = editor.shadowRoot.activeElement;
  if (!grid || !grid.dataset || grid.dataset.id !== "edit-grid") {
    return null;
  }
  const cell = grid.shadowRoot.activeElement;
  return cell && cell.dataset ? cell.dataset.cell || null : null;
}

/** Keyboard focus is on a cell of the editor's grid (not the page, not a toolbar button). */
export function expectFocusInGrid(element) {
  expect(focusedCellKey(element)).not.toBeNull();
}

// The rail (ADR 0008 part 7): Edit is the editor's menu; the screens' own rows join it there
// (Generated's Lock choices), and the counter is c-shoresh-week-checks.

/** The Lock choices in the editor's Edit menu (Generated Schedule), as rows. */
export function lockRows(element) {
  const root = editorRoot(element);
  return root ? [...root.querySelectorAll('[data-value^="lock:"]')] : [];
}

/** The Lock choices' words, in order ("Lock Monday"). */
export function lockLabels(element) {
  return lockRows(element).map((row) => row.textContent.trim());
}

/** Chooses a Lock choice by its words, as a click in the Edit menu does. */
export function chooseLock(element, label) {
  const row = lockRows(element).find((r) => r.textContent.trim() === label);
  if (!row) {
    throw new Error(`No Lock choice "${label}": ${lockLabels(element)}`);
  }
  row.click();
}

/** The rail's counter as read ("2of 9 placed"), or null when it isn't drawn. */
export function counterText(element) {
  const checks = element.shadowRoot.querySelector("c-shoresh-week-checks");
  if (!checks) {
    return null;
  }
  const pop = checks.shadowRoot.querySelector('[data-id="counter"]');
  return pop.shadowRoot
    .querySelector('[data-id="button"]')
    .textContent.replace(/\s+/g, " ")
    .trim();
}
