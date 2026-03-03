module.exports = {
    // Use ts-jest preset for testing TypeScript files with Jest
    preset: 'ts-jest',
    // Set the test environment to Node.js
    testEnvironment: 'node',
    // Ensure Jest resolves package.json "exports" using Node CJS conditions
    // (prevents ESM-only packages from being loaded via require())
    testEnvironmentOptions: {
        customExportConditions: ['node', 'require']
    },

    // Define the root directory for tests and modules
    roots: ['<rootDir>/test'],

    // Use ts-jest to transform TypeScript files
    transform: {
        '^.+\\.tsx?$': 'ts-jest'
    },

    // Regular expression to find test files
    testRegex: '((\\.|/)index\\.test)\\.tsx?$',

    // File extensions to recognize in module resolution
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

    // Map modules that Jest cannot resolve through pnpm symlinks or that use ESM/WASM
    moduleNameMapper: {
        '^typeorm$': '<rootDir>/node_modules/typeorm/index.js',
        '^uuid$': '<rootDir>/test/__mocks__/uuid.js',
        '^@dqbd/tiktoken$': '<rootDir>/test/__mocks__/tiktoken.js',
        '^pyodide$': '<rootDir>/test/__mocks__/pyodide.js',
        // ESM-only packages: map to their CJS builds
        '^msgpackr$': '<rootDir>/../../node_modules/msgpackr/dist/node.cjs',
        '^pkce-challenge$': '<rootDir>/../../node_modules/pkce-challenge/dist/index.node.cjs'
    },

    // Setup file for Web API polyfills needed by @langchain/core
    setupFiles: ['<rootDir>/jest.setup.js'],

    // Display individual test results with the test suite hierarchy.
    verbose: true,

    // Coverage configuration
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/database/migrations/**'],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary']
}
