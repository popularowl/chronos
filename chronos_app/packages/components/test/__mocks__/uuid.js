/**
 * Mock for uuid
 * Jest resolves uuid to its ESM browser bundle via the package.json "exports"
 * "default" field, which fails to parse in CJS mode. This shim provides the
 * real functionality via Node's built-in crypto.randomUUID().
 */

const crypto = require('crypto')

module.exports = {
    v4: () => crypto.randomUUID(),
    v1: () => crypto.randomUUID(),
    v5: () => crypto.randomUUID(),
    v3: () => crypto.randomUUID(),
    validate: (uuid) =>
        typeof uuid === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid),
    version: (uuid) => parseInt(uuid.charAt(14), 16),
    NIL: '00000000-0000-0000-0000-000000000000',
    MAX: 'ffffffff-ffff-ffff-ffff-ffffffffffff'
}
