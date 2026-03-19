import { containsBase64File } from '../../src/utils/fileRepository'

/**
 * Test suite for file repository utility functions
 * Tests base64 file detection in agentflow data
 */
export function fileRepositoryUtilTest() {
    describe('File Repository Utilities', () => {
        describe('containsBase64File', () => {
            /**
             * Creates a minimal agentflow object with flow data
             * @param nodes - Array of node objects
             * @returns AgentFlow-like object
             */
            const createAgentflow = (nodes: any[]) =>
                ({
                    flowData: JSON.stringify({ nodes })
                } as any)

            /**
             * Creates a Document Loader node
             * @param inputs - Input key-value pairs
             * @returns Node object
             */
            const createDocLoaderNode = (inputs: Record<string, any>) => ({
                data: { category: 'Document Loaders', inputs }
            })

            it('should return true when node has base64 file input', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ file: 'data:application/pdf;base64,JVBERi0xLjQ=' })])
                expect(containsBase64File(agentflow)).toBe(true)
            })

            it('should return false when no nodes have base64 files', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ file: 'FILE-STORAGE::document.pdf' })])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should return false for non-Document Loader nodes', () => {
                const agentflow = createAgentflow([
                    {
                        data: {
                            category: 'LLM',
                            inputs: { file: 'data:application/pdf;base64,JVBERi0xLjQ=' }
                        }
                    }
                ])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should detect base64 in JSON array input', () => {
                const agentflow = createAgentflow([
                    createDocLoaderNode({
                        files: JSON.stringify(['data:application/pdf;base64,JVBERi0xLjQ='])
                    })
                ])
                expect(containsBase64File(agentflow)).toBe(true)
            })

            it('should return false for array input without base64', () => {
                const agentflow = createAgentflow([
                    createDocLoaderNode({
                        files: JSON.stringify(['FILE-STORAGE::file1.pdf', 'FILE-STORAGE::file2.pdf'])
                    })
                ])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle null input values', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ file: null })])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle non-string input values', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ count: 42 })])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle empty inputs', () => {
                const agentflow = createAgentflow([createDocLoaderNode({})])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle node with no inputs', () => {
                const agentflow = createAgentflow([{ data: { category: 'Document Loaders' } }])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle empty nodes array', () => {
                const agentflow = createAgentflow([])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should handle invalid JSON array string gracefully', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ files: '[invalid-json' })])
                expect(containsBase64File(agentflow)).toBe(false)
            })

            it('should detect base64 with various MIME types', () => {
                const agentflow = createAgentflow([createDocLoaderNode({ file: 'data:text/plain;base64,SGVsbG8=' })])
                expect(containsBase64File(agentflow)).toBe(true)
            })

            it('should handle multiple Document Loader nodes', () => {
                const agentflow = createAgentflow([
                    createDocLoaderNode({ file: 'FILE-STORAGE::doc1.pdf' }),
                    createDocLoaderNode({ file: 'data:application/pdf;base64,JVBERi0xLjQ=' })
                ])
                expect(containsBase64File(agentflow)).toBe(true)
            })
        })
    })
}
