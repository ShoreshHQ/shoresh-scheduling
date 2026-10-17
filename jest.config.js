const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver'],
    // CSS-only modules (shared colours) have no JavaScript for Jest to find.
    moduleNameMapper: {
        ...(jestConfig.moduleNameMapper || {}),
        '^c/shoreshTokens$':
            '<rootDir>/force-app/main/default/lwc/shoreshTokens/shoreshTokens.css'
    },
    // Shared made-up data for tests, not tests themselves.
    testPathIgnorePatterns: [
        ...(jestConfig.testPathIgnorePatterns || []),
        '/__tests__/data/'
    ]
};
