// How long a test waits for a component, decided once for every suite.

// Promise turns one flush gives the page: enough for an Apex answer, the component's handling of
// it and the re-render that follows, which the deepest suites needed 20 of.
const TURNS = 20;

/** Lets the page finish what it started: pending promises settle and LWC re-renders. */
export function flush() {
  return [...Array(TURNS)].reduce(
    (chain) => chain.then(() => undefined),
    Promise.resolve()
  );
}

// One turn of the event loop (a timer, so work the page queued as a task runs too). Suites that
// fake timers can't use until().
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Gives the page turns until done() says yes. Throws when it never does, so a test fails here,
 * at the wait, rather than at a later assertion about a page that was still busy.
 */
export async function until(done, tries = 2000) {
  for (let left = tries; left > 0; left--) {
    await flush();
    if (done()) {
      return;
    }
    await nextTask();
  }
  throw new Error(`until(): still waiting after ${tries} tries`);
}
