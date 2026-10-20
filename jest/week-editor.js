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
