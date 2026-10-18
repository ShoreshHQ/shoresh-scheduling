// Registers @sa11y/jest's `await expect(element).toBeAccessible()` (axe-core, WCAG rules) for
// every test. jsdom has no layout, so it can't check focus order, contrast or tap-target size.
const { setup } = require("@sa11y/jest");

setup();
