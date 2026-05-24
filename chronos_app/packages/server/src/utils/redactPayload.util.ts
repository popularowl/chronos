/**
 * Audit-payload preparation: case-insensitive key-name redaction + size cap.
 *
 * The MCP gateway hot path passes every `tools/call` request and response
 * through `prepareForAudit` before persisting to `tool_invocation_audit`.
 * Goal: turn the raw payload into a shape safe to store at rest — secrets
 * masked, oversize blobs truncated — without losing the structure that
 * makes the audit row useful for debugging.
 *
 */

const DEFAULT_REDACT_KEYS = new Set(
    [
        'password',
        'pass',
        'passwd',
        'token',
        'apiKey',
        'api_key',
        'secret',
        'authorization',
        'auth',
        'bearer',
        'clientSecret',
        'client_secret',
        'accessToken',
        'access_token',
        'refreshToken',
        'refresh_token',
        'cookie',
        'set-cookie',
        'privateKey',
        'private_key'
    ].map((k) => k.toLowerCase())
)

const REDACTED_MARKER = '[REDACTED]'

/**
 * Recursive walk that replaces values at any key whose lowercased name
 * matches the denylist with `[REDACTED]`. Returns a structural clone —
 * the input is never mutated, so the gateway's own use of `params` and
 * the upstream `result` is untouched. Cycles guarded via a `WeakSet`;
 * cyclic refs become the literal string `'[Circular]'`.
 */
export const redactSecrets = (value: unknown): unknown => {
    const seen = new WeakSet<object>()
    const walk = (node: unknown): unknown => {
        if (node === null || node === undefined) return node
        if (typeof node !== 'object') return node
        if (seen.has(node as object)) return '[Circular]'
        seen.add(node as object)

        if (Array.isArray(node)) {
            return node.map(walk)
        }
        const out: Record<string, unknown> = {}
        for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
            if (DEFAULT_REDACT_KEYS.has(key.toLowerCase())) {
                out[key] = REDACTED_MARKER
            } else {
                out[key] = walk(val)
            }
        }
        return out
    }
    return walk(value)
}

/**
 * If the JSON-stringified payload exceeds `maxBytes`, returns a marker
 * object describing the truncation; otherwise returns the input unchanged.
 * Includes a short preview (first 1KB of the serialised form) so the audit
 * row still shows the *shape* of what was cut. Uses UTF-16 length as a
 * cheap byte proxy — exact byte count is not worth the extra `Buffer`
 * allocation on the hot path.
 */
export const capPayload = (value: unknown, maxBytes: number): unknown => {
    let serialised: string
    try {
        serialised = JSON.stringify(value)
    } catch {
        return { _truncated: true, _reason: 'unserializable', _originalBytes: 0 }
    }
    if (serialised == null) return value
    if (serialised.length <= maxBytes) return value
    return {
        _truncated: true,
        _originalBytes: serialised.length,
        _maxBytes: maxBytes,
        preview: serialised.slice(0, 1024)
    }
}

export const DEFAULT_MAX_PAYLOAD_BYTES = 65536

/**
 * Compose `redactSecrets` then `capPayload`. The single entry point the
 * gateway invoke site calls. Order matters: redaction first so the size
 * check sees `[REDACTED]` (shorter than most secrets), not the raw value.
 */
export const prepareForAudit = (value: unknown, maxBytes: number = DEFAULT_MAX_PAYLOAD_BYTES): unknown =>
    capPayload(redactSecrets(value), maxBytes)
