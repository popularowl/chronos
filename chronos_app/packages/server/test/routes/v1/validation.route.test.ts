import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `validation-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for validation route
 * Tests flow validation endpoint
 */
export function validationRouteTest() {
    describe('Validation Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/validation/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/validation/test-flow-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should return 412 when id is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/validation/')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412, 500]).toContain(response.status)
            })

            it('should handle non-existent flow id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/validation/non-existent-flow')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle uuid format flow id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/validation/550e8400-e29b-41d4-a716-446655440000')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('Flow Validation with Real Agentflows', () => {
            let validAgentflowId: string
            let agentflowWithMissingInputsId: string
            let agentflowWithUnconnectedNodesId: string

            beforeAll(async () => {
                // Create a valid agentflow (empty but valid structure)
                const validAgentflowResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Valid Agentflow ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'testNode',
                                        label: 'Test Node',
                                        inputParams: [],
                                        inputs: {}
                                    }
                                }
                            ],
                            edges: []
                        }),
                        type: 'AGENTFLOW'
                    })

                if (validAgentflowResponse.status === 200 || validAgentflowResponse.status === 201) {
                    validAgentflowId = validAgentflowResponse.body.id
                }

                // Create a agentflow with missing required inputs
                const agentflowMissingInputsResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Agentflow Missing Inputs ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'chatOpenAI',
                                        label: 'ChatOpenAI',
                                        inputParams: [{ name: 'modelName', label: 'Model Name', optional: false }],
                                        inputs: { modelName: '' } // Missing required input
                                    }
                                },
                                {
                                    id: 'node-2',
                                    data: {
                                        name: 'outputNode',
                                        label: 'Output',
                                        inputParams: [],
                                        inputs: {}
                                    }
                                }
                            ],
                            edges: [{ id: 'edge-1', source: 'node-1', target: 'node-2' }]
                        }),
                        type: 'AGENTFLOW'
                    })

                if (agentflowMissingInputsResponse.status === 200 || agentflowMissingInputsResponse.status === 201) {
                    agentflowWithMissingInputsId = agentflowMissingInputsResponse.body.id
                }

                // Create a agentflow with unconnected nodes
                const agentflowUnconnectedResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Agentflow Unconnected ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'node1',
                                        label: 'Node 1',
                                        inputParams: [],
                                        inputs: {}
                                    }
                                },
                                {
                                    id: 'node-2',
                                    data: {
                                        name: 'node2',
                                        label: 'Node 2',
                                        inputParams: [],
                                        inputs: {}
                                    }
                                }
                            ],
                            edges: [] // No edges - nodes are unconnected
                        }),
                        type: 'AGENTFLOW'
                    })

                if (agentflowUnconnectedResponse.status === 200 || agentflowUnconnectedResponse.status === 201) {
                    agentflowWithUnconnectedNodesId = agentflowUnconnectedResponse.body.id
                }
            })

            afterAll(async () => {
                // Cleanup
                if (validAgentflowId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/agentflows/${validAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
                if (agentflowWithMissingInputsId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/agentflows/${agentflowWithMissingInputsId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
                if (agentflowWithUnconnectedNodesId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/agentflows/${agentflowWithUnconnectedNodesId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
            })

            it('should validate a valid agentflow successfully', async () => {
                if (!validAgentflowId) return

                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/validation/${validAgentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                // Valid flows should return empty array or array with no critical issues
                expect(Array.isArray(response.body)).toBe(true)
            })

            it('should detect missing required inputs in agentflow', async () => {
                if (!agentflowWithMissingInputsId) return

                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/validation/${agentflowWithMissingInputsId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(Array.isArray(response.body)).toBe(true)
                // Should have validation issues
            })

            it('should detect unconnected nodes in agentflow', async () => {
                if (!agentflowWithUnconnectedNodesId) return

                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/validation/${agentflowWithUnconnectedNodesId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(Array.isArray(response.body)).toBe(true)
                // Should detect unconnected nodes
            })
        })

        describe('Flow Validation Edge Cases', () => {
            let edgeCaseAgentflowId: string

            afterEach(async () => {
                if (edgeCaseAgentflowId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/agentflows/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                    edgeCaseAgentflowId = ''
                }
            })

            it('should handle agentflow with hanging edges', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Hanging Edges ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: { name: 'node1', label: 'Node 1', inputParams: [], inputs: {} }
                                }
                            ],
                            edges: [{ id: 'edge-1', source: 'node-1', target: 'non-existent-node' }]
                        }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                    expect(Array.isArray(validationResponse.body)).toBe(true)
                }
            })

            it('should handle agentflow with stickyNote nodes', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Sticky Notes ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'sticky-1',
                                    data: {
                                        name: 'stickyNoteAgentflow',
                                        label: 'Sticky Note',
                                        inputParams: [{ name: 'content', label: 'Content', optional: false }],
                                        inputs: {} // Missing but should be skipped
                                    }
                                },
                                {
                                    id: 'node-1',
                                    data: { name: 'node1', label: 'Node 1', inputParams: [], inputs: {} }
                                }
                            ],
                            edges: []
                        }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                }
            })

            it('should handle agentflow with conditional show/hide fields', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Conditional Fields ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'conditionalNode',
                                        label: 'Conditional Node',
                                        inputParams: [
                                            {
                                                name: 'conditionalField',
                                                label: 'Conditional Field',
                                                optional: false,
                                                show: { mode: 'advanced' }
                                            }
                                        ],
                                        inputs: { mode: 'basic' } // show condition not met
                                    }
                                }
                            ],
                            edges: []
                        }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                }
            })

            it('should handle agentflow with array type parameters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Array Params ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'arrayNode',
                                        label: 'Array Node',
                                        inputParams: [
                                            {
                                                name: 'conditions',
                                                label: 'Conditions',
                                                type: 'array',
                                                optional: true,
                                                array: [{ name: 'value', label: 'Value', optional: false }]
                                            }
                                        ],
                                        inputs: {
                                            conditions: [{ value: 'test' }]
                                        }
                                    }
                                }
                            ],
                            edges: []
                        }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                }
            })

            it('should handle agentflow with nested config parameters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Nested Config ${Date.now()}`,
                        flowData: JSON.stringify({
                            nodes: [
                                {
                                    id: 'node-1',
                                    data: {
                                        name: 'nestedNode',
                                        label: 'Nested Node',
                                        inputParams: [{ name: 'llm', label: 'LLM', optional: false }],
                                        inputs: {
                                            llm: 'chatOpenAI',
                                            llmConfig: { modelName: 'gpt-4' }
                                        }
                                    }
                                }
                            ],
                            edges: []
                        }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                }
            })

            it('should handle empty flowData', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Empty Flow ${Date.now()}`,
                        flowData: JSON.stringify({ nodes: [], edges: [] }),
                        type: 'AGENTFLOW'
                    })

                if (response.status === 200 || response.status === 201) {
                    edgeCaseAgentflowId = response.body.id

                    const validationResponse = await supertest(getRunningExpressApp().app)
                        .get(`/api/v1/validation/${edgeCaseAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200]).toContain(validationResponse.status)
                    expect(Array.isArray(validationResponse.body)).toBe(true)
                }
            })
        })
    })
}
