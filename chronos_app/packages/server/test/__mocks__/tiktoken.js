/**
 * Mock for @dqbd/tiktoken
 * This package uses WASM + ESM which Jest cannot handle
 */

const mockEncoder = {
    encode: jest.fn((text) => {
        // Simple mock: return array of char codes
        return Array.from(text).map((c) => c.charCodeAt(0))
    }),
    decode: jest.fn((tokens) => {
        return String.fromCharCode(...tokens)
    }),
    free: jest.fn()
}

module.exports = {
    get_encoding: jest.fn(() => mockEncoder),
    encoding_for_model: jest.fn(() => mockEncoder),
    Tiktoken: jest.fn(() => mockEncoder)
}
