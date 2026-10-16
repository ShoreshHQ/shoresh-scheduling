const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver'],
    // Shared made-up data for tests, not tests themselves.
    testPathIgnorePatterns: [
        ...(jestConfig.testPathIgnorePatterns || []),
        '/__tests__/data/'
    ]
};
