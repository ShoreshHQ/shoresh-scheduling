import { generateWeekSteps } from "c/shoreshEngine";

// How long one piece of the build may run before the page gets the browser back (to paint, take
// a click, scroll): short enough that the tab never feels stuck.
const SLICE_MS = 30;

/**
 * The browser's turn: a message the page sends itself is handled as a task of its own, so the
 * browser paints and takes input before it (as React's scheduler does). No timer is involved.
 * Where there is no MessageChannel (Jest's jsdom), or it can't be used, the next piece follows
 * at once.
 */
export function nextTurn() {
  if (typeof MessageChannel === "undefined") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    } catch {
      // A page that may not message itself still finishes the build, just without the turns.
      resolve();
    }
  });
}

/**
 * Builds a week a little at a time (ADR 0010 §22): c/shoreshEngine generateWeekSteps, run for
 * about 30 ms, then the browser gets a turn, then the next piece. Resolves to generateWeek's
 * result (the same week as building it at once). onProgress(fraction, now) is told how far the
 * build has got, 0 to 1, after each piece, and what it is doing at that moment (the engine's
 * watch.now: a code and ids, c/shoreshEngine NOW). stillWanted() is asked before each piece: when
 * it says no (the director moved to another week, or chose Cancel), the build stops and resolves
 * to null.
 */
export function buildInPieces(input, onProgress, stillWanted = () => true) {
  const watch = {};
  const steps = generateWeekSteps(input, watch);
  const piece = () => {
    if (!stillWanted()) {
      return null;
    }
    const until = Date.now() + SLICE_MS;
    let step = steps.next();
    while (!step.done && Date.now() < until) {
      step = steps.next();
    }
    if (step.done) {
      return step.value;
    }
    onProgress(step.value, watch.now);
    // The next piece, after the browser's turn.
    return nextTurn().then(piece);
  };
  return Promise.resolve().then(piece);
}
