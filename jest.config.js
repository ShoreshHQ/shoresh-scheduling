const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"],
  // Accessibility checks in tests: toBeAccessible() (jest/sa11y-setup.js).
  setupFilesAfterEnv: [
    ...(jestConfig.setupFilesAfterEnv || []),
    "<rootDir>/jest/sa11y-setup.js",
    // Room for every component's selectors in jsdom's selector cache (see the file).
    "<rootDir>/jest/selector-cache.js"
  ],
  // CI's shared runners run these tests four to seven times slower than a Mac, more while
  // several runs share them: Generated Schedule's builds (up to about 3 s here) and, before
  // jest/sa11y-setup.js kept selector answers during a check, the axe checks over a whole screen
  // passed 5 s there (#99). 20 s still stops a test that hangs.
  testTimeout: 20000,
  // A worker's memory grows across test files (each loads its own copy of the screens and the
  // engine) to about 3 GB, where Node spends its time collecting garbage and a 150 ms test can
  // pass 20 s on CI. Above 1 GB a worker is replaced between test files, starting fresh.
  workerIdleMemoryLimit: "1GB",
  // CSS-only modules (shared colours) have no JavaScript for Jest to find.
  moduleNameMapper: {
    ...(jestConfig.moduleNameMapper || {}),
    "^c/(shoreshTokens|shoreshScheduleScreen)$":
      "<rootDir>/force-app/main/default/lwc/$1/$1.css",
    // Test helpers shared by suites (jest/namespace.js: namespace-safe fixtures).
    "^shoresh-jest/(.*)$": "<rootDir>/jest/$1.js",
    // Pages used only by tests (a parent that slots rows into a rail menu).
    "^c/(railPopFixture)$": "<rootDir>/jest/fixtures/lwc/$1/$1.js"
  },
  // Shared made-up data for tests, not tests themselves.
  testPathIgnorePatterns: [
    ...(jestConfig.testPathIgnorePatterns || []),
    "/__tests__/data/"
  ]
};
