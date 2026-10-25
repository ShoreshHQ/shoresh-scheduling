// Every seeded camp in the engine's heaviest tests (jest/sample.js): the desktop differential's
// 400 camps, the search's proof check over 150, all of the ported option sweeps and property
// seeds. About 15 minutes on CI's runners; run before changing the engine
// (`npm run test:engine:full`). CI's default run takes a smaller sample of the same seeds.
const base = require("./jest.config");

module.exports = {
  ...base,
  globals: { ...(base.globals || {}), SHORESH_JEST_FULL: true }
};
