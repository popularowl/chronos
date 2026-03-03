module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Ensure Jest resolves package.json "exports" using Node CJS conditions
    // (prevents uuid etc. from resolving to ESM browser bundles)
    testEnvironmentOptions: {
        customExportConditions: ['node', 'require']
    },
    roots: ['<rootDir>/nodes', '<rootDir>/src'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest'
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    verbose: true,
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],

    // Setup file for Web API polyfills
    setupFiles: ['<rootDir>/jest.setup.js'],

    // Module name mapper for problematic ESM packages and path aliases
    moduleNameMapper: {
        '^../../../src/(.*)$': '<rootDir>/src/$1',
        // Mock tiktoken (uses WASM + ESM)
        '^@dqbd/tiktoken$': '<rootDir>/test/__mocks__/tiktoken.js',
        // Mock pyodide (heavy WASM dependency)
        '^pyodide$': '<rootDir>/test/__mocks__/pyodide.js',
        // Shim uuid (Jest resolves to esm-browser via package.json exports "default" condition)
        '^uuid$': '<rootDir>/test/__mocks__/uuid.js',
        // typeorm: Jest cannot follow pnpm symlinks; point to the real location
        '^typeorm$': '<rootDir>/node_modules/typeorm/index.js'
    },

    // Transform ESM packages in pnpm node_modules
    // .pnpm must be included so Jest enters the .pnpm directory and matches the real package names
    transformIgnorePatterns: [
        'node_modules/(?!(' +
            '\\.pnpm|' +
            '@langchain|' +
            'langchain|' +
            'uuid|' +
            'nanoid|' +
            'langfuse|' +
            'langsmith|' +
            '@anthropic-ai|' +
            'openai|' +
            'zod-to-json-schema|' +
            '@mistralai' +
            ')/)'
    ],

    // Fallback module path for pnpm symlink resolution
    modulePaths: ['<rootDir>/../../node_modules'],

    // Increase timeout for slow tests
    testTimeout: 30000,

    // Coverage configuration
    collectCoverageFrom: [
        'src/**/*.ts',
        'nodes/**/*.ts',
        '!**/*.d.ts',
        '!**/dist/**',
        // Exclude handler.ts from coverage - it's 80,000 lines and crashes instrumentation
        '!src/handler.ts'
    ],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

    // Skip handler.ts related files from coverage path
    coveragePathIgnorePatterns: ['/node_modules/', '/dist/', 'handler.ts']
}
