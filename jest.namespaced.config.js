// The namespaced Jest run: every component's tests run as if the package already had its
// `shoresh` namespace (jest/namespaced-resolver.js names every schema import shoresh__...), so a
// bare `__c` name in a component fails its tests here (docs/adr/0009-namespace-safe-names.md).
// New components are covered automatically. A component's tests hand records in through
// nsRecord() and check what it sends through bareRecord() (jest/namespace.js).
const base = require("./jest.config");

// Components whose tests can't run this way, each with the reason. Keep it empty if you can.
const EXCLUDED_SUITES = [];

module.exports = {
  ...base,
  resolver: "<rootDir>/jest/namespaced-resolver.js",
  globals: { ...(base.globals || {}), SHORESH_JEST_NAMESPACED: true },
  testMatch: ["<rootDir>/force-app/main/default/lwc/*/__tests__/**/*.test.js"],
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns || []),
    ...EXCLUDED_SUITES.map((name) => `/lwc/${name}/`)
  ]
};
