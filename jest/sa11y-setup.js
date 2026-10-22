// Registers @sa11y/jest's `await expect(element).toBeAccessible()` (axe-core, WCAG rules) for
// every test. jsdom has no layout, so it can't check focus order, contrast or tap-target size.
const { setup, toBeAccessible } = require("@sa11y/jest");

setup();

// Why an axe check over a whole screen is slow in jsdom: axe asks for each element's computed
// style, and jsdom answers by matching every stylesheet rule on the page (about 900 on a setup
// screen) against the element, then again against each of its ancestors to work out the
// inherited `visibility`. That is tens of thousands of selector matches per check, about 1 s on a
// Mac and four to seven times that on CI's runners, close to Jest's limit (#99, #105). The DOM
// doesn't change while axe runs, so during a check each (selector, element) answer is kept and
// reused: axe sees exactly the same styles, it just stops asking jsdom the same question.
// jest/selector-cache.js gives the page's document the selector engine this wraps.
const implSymbol = Object.getOwnPropertySymbols(document).find(
  (symbol) => symbol.description === "impl"
);
function rememberMatchesWhile(run) {
  const engine = implSymbol && document[implSymbol]._nwsapiDontThrow;
  if (!engine) return run();
  const match = engine.match;
  const seen = new WeakMap();
  engine.match = function (selector, element, ...rest) {
    if (rest.length || typeof selector !== "string" || !element) {
      return match.call(this, selector, element, ...rest);
    }
    let answers = seen.get(element);
    if (!answers) seen.set(element, (answers = new Map()));
    if (!answers.has(selector)) {
      answers.set(selector, match.call(this, selector, element));
    }
    return answers.get(selector);
  };
  return (async () => {
    try {
      return await run();
    } finally {
      engine.match = match;
    }
  })();
}

// axe allows one check at a time. If a test times out mid-check, its check carries on, and the
// next test's check would fail with "Axe is already running" although nothing is wrong with it.
// Each test waits here for any check still running, so a timeout fails only its own test.
let running = null;
afterEach(async () => {
  if (running) await running.catch(() => {});
});

// axe reads `checked` on every element, and LWC warns when a component has no public `checked`.
// Only while axe runs, drop that one warning; every other warning still shows.
const AXE_NOISE = 'The property "checked" is not publicly accessible';
expect.extend({
  async toBeAccessible(...args) {
    const warn = console.warn;
    console.warn = (...messages) => {
      if (!String(messages[0]).includes(AXE_NOISE)) warn(...messages);
    };
    const check = rememberMatchesWhile(() => toBeAccessible.apply(this, args));
    running = check;
    try {
      return await check;
    } finally {
      if (running === check) running = null;
      console.warn = warn;
    }
  }
});
