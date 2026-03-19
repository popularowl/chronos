import { AbortControllerPool } from '../src/AbortControllerPool'

/**
 * Test suite for AbortControllerPool class
 * Tests abort controller management for agentflow sessions
 */
export function abortControllerPoolTest() {
    describe('AbortControllerPool', () => {
        let pool: AbortControllerPool

        beforeEach(() => {
            pool = new AbortControllerPool()
        })

        describe('add', () => {
            it('should add an abort controller to the pool', () => {
                const controller = new AbortController()
                pool.add('agentflow_chat_123', controller)

                expect(pool.get('agentflow_chat_123')).toBe(controller)
            })

            it('should overwrite existing controller with same id', () => {
                const controller1 = new AbortController()
                const controller2 = new AbortController()

                pool.add('same-id', controller1)
                pool.add('same-id', controller2)

                expect(pool.get('same-id')).toBe(controller2)
            })

            it('should handle multiple controllers', () => {
                const controller1 = new AbortController()
                const controller2 = new AbortController()
                const controller3 = new AbortController()

                pool.add('id1', controller1)
                pool.add('id2', controller2)
                pool.add('id3', controller3)

                expect(pool.get('id1')).toBe(controller1)
                expect(pool.get('id2')).toBe(controller2)
                expect(pool.get('id3')).toBe(controller3)
            })
        })

        describe('get', () => {
            it('should return the abort controller for given id', () => {
                const controller = new AbortController()
                pool.add('test-id', controller)

                const result = pool.get('test-id')

                expect(result).toBe(controller)
            })

            it('should return undefined for non-existent id', () => {
                const result = pool.get('non-existent')

                expect(result).toBeUndefined()
            })
        })

        describe('remove', () => {
            it('should remove abort controller from pool', () => {
                const controller = new AbortController()
                pool.add('to-remove', controller)

                pool.remove('to-remove')

                expect(pool.get('to-remove')).toBeUndefined()
            })

            it('should not throw when removing non-existent id', () => {
                expect(() => pool.remove('non-existent')).not.toThrow()
            })

            it('should only remove specified controller', () => {
                const controller1 = new AbortController()
                const controller2 = new AbortController()

                pool.add('keep', controller1)
                pool.add('remove', controller2)

                pool.remove('remove')

                expect(pool.get('keep')).toBe(controller1)
                expect(pool.get('remove')).toBeUndefined()
            })
        })

        describe('abort', () => {
            it('should abort and remove controller', () => {
                const controller = new AbortController()
                pool.add('to-abort', controller)

                pool.abort('to-abort')

                expect(controller.signal.aborted).toBe(true)
                expect(pool.get('to-abort')).toBeUndefined()
            })

            it('should not throw when aborting non-existent id', () => {
                expect(() => pool.abort('non-existent')).not.toThrow()
            })

            it('should only abort specified controller', () => {
                const controller1 = new AbortController()
                const controller2 = new AbortController()

                pool.add('abort-this', controller1)
                pool.add('keep-this', controller2)

                pool.abort('abort-this')

                expect(controller1.signal.aborted).toBe(true)
                expect(controller2.signal.aborted).toBe(false)
                expect(pool.get('keep-this')).toBe(controller2)
            })

            it('should handle abort reason', () => {
                const controller = new AbortController()
                pool.add('abort-with-reason', controller)

                pool.abort('abort-with-reason')

                expect(controller.signal.aborted).toBe(true)
            })
        })

        describe('integration', () => {
            it('should support full lifecycle: add, get, abort', () => {
                const controller = new AbortController()

                // Add
                pool.add('lifecycle-test', controller)
                expect(pool.get('lifecycle-test')).toBe(controller)

                // Verify not aborted
                expect(controller.signal.aborted).toBe(false)

                // Abort
                pool.abort('lifecycle-test')
                expect(controller.signal.aborted).toBe(true)
                expect(pool.get('lifecycle-test')).toBeUndefined()
            })

            it('should handle rapid add/remove cycles', () => {
                for (let i = 0; i < 100; i++) {
                    const controller = new AbortController()
                    pool.add(`rapid-${i}`, controller)
                    pool.remove(`rapid-${i}`)
                }

                // All should be removed
                for (let i = 0; i < 100; i++) {
                    expect(pool.get(`rapid-${i}`)).toBeUndefined()
                }
            })
        })
    })
}
