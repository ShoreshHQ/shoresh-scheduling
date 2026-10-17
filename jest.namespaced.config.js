// The namespaced Jest run: the suites below run as if the package already had its `shoresh`
// namespace (jest/namespaced-resolver.js). A suite joins this list once its component reads and
// writes every record through c/shoreshSchema and its fixtures go through nsRecord()
// (jest/namespace.js); from then on a bare `__c` name in that component fails its tests here.
const base = require('./jest.config');

const NAMESPACED_SUITES = [
    'shoreshSchema',
    'shoreshSetupRules',
    'shoreshImportEngine',
    'shoreshLists',
    'shoreshEditableTable',
    'shoreshProgram',
    'shoreshActivityDetails',
    'shoreshCopySeason',
    'shoreshImport',
    'shoreshListImport',
    'shoreshSchedules',
    'shoreshManualBuild',
    'shoreshCampSetup',
    'shoreshRoots'
];

module.exports = {
    ...base,
    resolver: '<rootDir>/jest/namespaced-resolver.js',
    globals: { ...(base.globals || {}), SHORESH_JEST_NAMESPACED: true },
    testMatch: NAMESPACED_SUITES.map(
        (name) =>
            `<rootDir>/force-app/main/default/lwc/${name}/__tests__/**/*.test.js`
    )
};
