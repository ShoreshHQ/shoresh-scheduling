const { jestConfig } = require("@salesforce/sfdx-lwc-jest/config");

module.exports = {
  ...jestConfig,
  modulePathIgnorePatterns: ["<rootDir>/.localdevserver"],
  // Accessibility checks in tests: toBeAccessible() (jest/sa11y-setup.js).
  setupFilesAfterEnv: [
    ...(jestConfig.setupFilesAfterEnv || []),
    "<rootDir>/jest/sa11y-setup.js"
  ],
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
