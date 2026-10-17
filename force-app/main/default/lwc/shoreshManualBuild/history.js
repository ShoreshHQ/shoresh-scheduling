/**
 * Manual Build's Undo and Redo (desktop useUndoRedo.js): the last 50 changes of this visit, each
 * with its runs (as sent to the server) and its words ("Placed Swim · Bunk 3 · Monday · Period 2").
 * Undoing sends the runs back the other way, so it is checked like any edit: over someone else's
 * newer change it asks "keep theirs or use yours". Older history is in Versions (Greg #10).
 */
import { inverse } from "./moves";

export const LIMIT = 50;

export class History {
  constructor() {
    this.undos = [];
    this.redos = [];
  }

  get canUndo() {
    return this.undos.length > 0;
  }
  get canRedo() {
    return this.redos.length > 0;
  }
  get undoLabel() {
    return this.canUndo ? this.undos[this.undos.length - 1].label : null;
  }
  get redoLabel() {
    return this.canRedo ? this.redos[this.redos.length - 1].label : null;
  }

  /** A new change: it can be undone, and what was undone can no longer be redone. */
  record(step) {
    this.undos = [...this.undos, step].slice(-LIMIT);
    this.redos = [];
  }

  /** The step to undo, with the runs that undo it; it moves to Redo. */
  undo() {
    const step = this.undos[this.undos.length - 1];
    this.undos = this.undos.slice(0, -1);
    this.redos = [...this.redos, step];
    return { step, runs: inverse(step.runs) };
  }

  /** The step to redo, with its runs again; it moves back to Undo. */
  redo() {
    const step = this.redos[this.redos.length - 1];
    this.redos = this.redos.slice(0, -1);
    this.undos = [...this.undos, step].slice(-LIMIT);
    return { step, runs: step.runs };
  }

  /** A step whose change didn't happen (theirs was kept): gone from both lists. */
  forget(id) {
    this.undos = this.undos.filter((step) => step.id !== id);
    this.redos = this.redos.filter((step) => step.id !== id);
  }

  /** A step whose change was made differently (Use yours): the same place in the list. */
  replace(id, step) {
    this.undos = this.undos.map((s) => (s.id === id ? step : s));
    this.redos = this.redos.map((s) => (s.id === id ? step : s));
  }

  /** An Undo that was never made (dropped): its step goes back to the top of Undo. */
  unundo(id) {
    const step = this.redos.find((s) => s.id === id);
    if (step) {
      this.redos = this.redos.filter((s) => s.id !== id);
      this.undos = [...this.undos, step].slice(-LIMIT);
    }
  }

  clear() {
    this.undos = [];
    this.redos = [];
  }
}
