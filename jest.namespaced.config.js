// The namespaced Jest run: every component's tests run as if the package already had its
// `shoresh` namespace (jest/namespaced-resolver.js names every schema import shoresh__...), so a
// bare `__c` name in a component fails its tests here (docs/adr/0009-namespace-safe-names.md).
// New components are covered automatically. A component's tests hand records in through
// nsRecord() and check what it sends through bareRecord() (jest/namespace.js).
const base = require("./jest.config");

// Components whose tests can't run this way, each with the reason. Keep it empty if you can.
const EXCLUDED_SUITES = [];

// The engine's seed sweeps: hundreds of generated camps through the same setup reading
// (shoreshEngine/setup.js, checkInputs.js) that the engine's other suites and the screens' suites
// already run here. Measured 2026-10-26: without them every field read in those two files is
// still covered in this run (one `|| null` for a recurring activity without a place is not; that
// is a value, not a name). They run in full in the normal run. About half this run's time.
const ENGINE_SWEEPS = [
  "desktopDifferential",
  "performance",
  "ported",
  "progress",
  "properties",
  "search",
  "steps"
];

module.exports = {
  ...base,
  resolver: "<rootDir>/jest/namespaced-resolver.js",
  globals: { ...(base.globals || {}), SHORESH_JEST_NAMESPACED: true },
  testMatch: ["<rootDir>/force-app/main/default/lwc/*/__tests__/**/*.test.js"],
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns || []),
    ...EXCLUDED_SUITES.map((name) => `/lwc/${name}/`),
    ...ENGINE_SWEEPS.map(
      (name) => `/lwc/shoreshEngine/__tests__/${name}\\.test\\.js$`
    )
  ]
};
