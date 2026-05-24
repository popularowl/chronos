import { capPayload, DEFAULT_MAX_PAYLOAD_BYTES, prepareForAudit, redactSecrets } from '../../src/utils/redactPayload.util'

export function redactPayloadUtilTest() {
    describe('redactPayload utility', () => {
        describe('redactSecrets', () => {
            it('passes through primitives, null, and undefined unchanged', () => {
                expect(redactSecrets(null)).toBeNull()
                expect(redactSecrets(undefined)).toBeUndefined()
                expect(redactSecrets(42)).toBe(42)
                expect(redactSecrets('hello')).toBe('hello')
                expect(redactSecrets(true)).toBe(true)
            })

            it('redacts top-level denylist keys', () => {
                const input = { username: 'alice', password: 'hunter2', token: 'abc.def' }
                expect(redactSecrets(input)).toEqual({ username: 'alice', password: '[REDACTED]', token: '[REDACTED]' })
            })

            it('matches denylist keys case-insensitively', () => {
                const input = { Password: 'x', API_KEY: 'y', AuthOrIzaTion: 'z', clientsecret: 'w' }
                const out = redactSecrets(input) as Record<string, unknown>
                expect(out.Password).toBe('[REDACTED]')
                expect(out.API_KEY).toBe('[REDACTED]')
                expect(out.AuthOrIzaTion).toBe('[REDACTED]')
                // 'clientsecret' (lowercase, no separator) is NOT in the denylist
                // — we only catch 'clientSecret' / 'client_secret'. Document this
                // gap so the test fails loudly if someone "fixes" it without
                // adding the variant intentionally.
                expect(out.clientsecret).toBe('w')
            })

            it('recurses into nested objects', () => {
                const input = { outer: { inner: { password: 'p' }, public: 'ok' } }
                expect(redactSecrets(input)).toEqual({ outer: { inner: { password: '[REDACTED]' }, public: 'ok' } })
            })

            it('walks array elements', () => {
                const input = {
                    items: [
                        { token: 't1', name: 'a' },
                        { token: 't2', name: 'b' }
                    ]
                }
                expect(redactSecrets(input)).toEqual({
                    items: [
                        { token: '[REDACTED]', name: 'a' },
                        { token: '[REDACTED]', name: 'b' }
                    ]
                })
            })

            it('does not mutate its input', () => {
                const input = { password: 'p', nested: { token: 't' } }
                redactSecrets(input)
                expect(input).toEqual({ password: 'p', nested: { token: 't' } })
            })

            it('handles cyclic references without throwing', () => {
                const input: Record<string, unknown> = { name: 'a', password: 'p' }
                input.self = input
                const out = redactSecrets(input) as Record<string, unknown>
                expect(out.name).toBe('a')
                expect(out.password).toBe('[REDACTED]')
                expect(out.self).toBe('[Circular]')
            })

            it('leaves redaction-key values that are objects also redacted (not deep-walked)', () => {
                const input = { authorization: { scheme: 'bearer', value: 'xyz' } }
                expect(redactSecrets(input)).toEqual({ authorization: '[REDACTED]' })
            })
        })

        describe('capPayload', () => {
            it('returns the input unchanged when serialised length <= maxBytes', () => {
                const small = { a: 1, b: 'two' }
                expect(capPayload(small, 1000)).toBe(small)
            })

            it('returns a truncation marker when serialised length exceeds maxBytes', () => {
                const big = { blob: 'x'.repeat(2000) }
                const out = capPayload(big, 100) as Record<string, unknown>
                expect(out._truncated).toBe(true)
                expect(out._originalBytes).toBeGreaterThan(100)
                expect(out._maxBytes).toBe(100)
                expect(typeof out.preview).toBe('string')
                expect((out.preview as string).length).toBeLessThanOrEqual(1024)
            })

            it('returns an unserializable marker for inputs that JSON.stringify cannot handle', () => {
                const bad: Record<string, unknown> = {}
                bad.self = bad
                const out = capPayload(bad, 1000) as Record<string, unknown>
                expect(out._truncated).toBe(true)
                expect(out._reason).toBe('unserializable')
            })
        })

        describe('prepareForAudit', () => {
            it('redacts then caps', () => {
                const input = { password: 'p', notes: 'x'.repeat(2000) }
                const out = prepareForAudit(input, 100) as Record<string, unknown>
                // Should be the truncation marker (size cap kicks in after redaction)
                expect(out._truncated).toBe(true)
                // Preview should show the redaction took effect before sizing
                expect(out.preview as string).toContain('[REDACTED]')
            })

            it('uses DEFAULT_MAX_PAYLOAD_BYTES when not specified', () => {
                expect(DEFAULT_MAX_PAYLOAD_BYTES).toBe(65536)
                const input = { ok: 'value', token: 't' }
                expect(prepareForAudit(input)).toEqual({ ok: 'value', token: '[REDACTED]' })
            })
        })
    })
}
