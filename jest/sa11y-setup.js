// Registers @sa11y/jest's `await expect(element).toBeAccessible()` (axe-core, WCAG rules) for
// every test. jsdom has no layout, so it can't check focus order, contrast or tap-target size.
const { setup, toBeAccessible } = require("@sa11y/jest");

setup();

// axe reads `checked` on every element, and LWC warns when a component has no public `checked`.
// Only while axe runs, drop that one warning; every other warning still shows.
const AXE_NOISE = 'The property "checked" is not publicly accessible';
expect.extend({
  async toBeAccessible(...args) {
    const warn = console.warn;
    console.warn = (...messages) => {
      if (!String(messages[0]).includes(AXE_NOISE)) warn(...messages);
    };
    try {
      return await toBeAccessible.apply(this, args);
    } finally {
      console.warn = warn;
    }
  }
});
