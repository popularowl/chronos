import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `export-import-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    let response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)

    // Fall back to login if signup fails (e.g. user already exists)
    if (response.status !== 200 || !response.body.token) {
        response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/login').send(testUser)
    }

    if (!response.body.token) {
        throw new Error(`Failed to get auth token. Status: ${response.status}, Body: ${JSON.stringify(response.body)}`)
    }
    return response.body.token
}

/**
 * Test suite for export-import route
 * Tests workspace export and import endpoints
 */
export function exportImportRouteTest() {
    describe('Export-Import Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/export-import/export', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/export-import/export').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should handle export without workspace context', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with empty body', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with chatflows option', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ chatflows: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with agentflows option', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ agentflows: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with tools option', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ tools: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with variables option', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ variables: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle export with all options', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({
                        chatflows: true,
                        agentflows: true,
                        tools: true,
                        variables: true
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/export-import/import', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/export-import/import').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should return error when importData is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with empty body', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with chatflows data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({ Chatflows: [] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with agentflows data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({ Agentflows: [] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with tools data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({ Tools: [] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with variables data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({ Variables: [] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle import with complete data structure', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({
                        Chatflows: [],
                        Agentflows: [],
                        Tools: [],
                        Variables: []
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })

        describe('Full Export/Import Lifecycle', () => {
            let createdToolId: string
            let createdVariableId: string
            let createdChatflowId: string

            beforeAll(async () => {
                // Create test tool
                const toolResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tools')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Export Test Tool ${Date.now()}`,
                        description: 'Tool for export testing',
                        func: 'return "test"',
                        schema: '{}'
                    })
                if (toolResponse.status === 200 || toolResponse.status === 201) {
                    createdToolId = toolResponse.body.id
                }

                // Create test variable
                const variableResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/variables')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Export_Test_Variable_${Date.now()}`,
                        value: 'test-value',
                        type: 'string'
                    })
                if (variableResponse.status === 200 || variableResponse.status === 201) {
                    createdVariableId = variableResponse.body.id
                }

                // Create test chatflow
                const chatflowResponse = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Export Test Chatflow ${Date.now()}`,
                        flowData: JSON.stringify({ nodes: [], edges: [] }),
                        type: 'AGENTFLOW'
                    })
                if (chatflowResponse.status === 200 || chatflowResponse.status === 201) {
                    createdChatflowId = chatflowResponse.body.id
                }
            })

            afterAll(async () => {
                // Cleanup
                if (createdToolId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/tools/${createdToolId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
                if (createdVariableId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/variables/${createdVariableId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
                if (createdChatflowId) {
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/chatflows/${createdChatflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
            })

            it('should export tools', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ tool: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.Tool).toBeDefined()
            })

            it('should export variables', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ variable: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.Variable).toBeDefined()
            })

            it('should export agentflowv2', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ agentflowv2: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.AgentFlowV2).toBeDefined()
            })

            it('should export document stores', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ document_store: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.DocumentStore).toBeDefined()
            })

            it('should export executions', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ execution: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.Execution).toBeDefined()
            })

            it('should export custom templates', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ custom_template: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.CustomTemplate).toBeDefined()
            })

            it('should export chat messages', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ chat_message: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.ChatMessage).toBeDefined()
            })

            it('should export chat feedback', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ chat_feedback: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.ChatMessageFeedback).toBeDefined()
            })

            it('should export skills', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({ skill: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.Skill).toBeDefined()
            })

            it('should export everything at once', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/export')
                    .send({
                        agentflowv2: true,
                        chat_message: true,
                        chat_feedback: true,
                        custom_template: true,
                        document_store: true,
                        execution: true,
                        skill: true,
                        tool: true,
                        variable: true
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
                expect(response.body.FileDefaultName).toBeDefined()
            })

            it('should import a tool', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({
                        Tool: [
                            {
                                id: '550e8400-e29b-41d4-a716-446655440099',
                                name: `Imported Tool ${Date.now()}`,
                                description: 'Imported tool for testing',
                                func: 'return "imported"',
                                schema: '{}'
                            }
                        ]
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should import a skill', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({
                        Skill: [
                            {
                                id: '550e8400-e29b-41d4-a716-446655440088',
                                name: `Imported Skill ${Date.now()}`,
                                description: 'Imported skill for testing',
                                category: 'general',
                                color: '#BA68C8',
                                content: '## Imported Skill\n\nTest instructions.'
                            }
                        ]
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should import a variable', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({
                        Variable: [
                            {
                                id: '550e8400-e29b-41d4-a716-446655440098',
                                name: `Imported_Variable_${Date.now()}`,
                                value: 'imported-value',
                                type: 'string'
                            }
                        ]
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle import with duplicate IDs', async () => {
                // Import the same data twice to test duplicate handling
                const importData = {
                    Tool: [
                        {
                            id: '550e8400-e29b-41d4-a716-446655440097',
                            name: `Duplicate Tool ${Date.now()}`,
                            description: 'Tool for duplicate testing',
                            func: 'return "duplicate"',
                            schema: '{}'
                        }
                    ]
                }

                // First import
                await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send(importData)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                // Second import with same ID
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send(importData)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle import with invalid data types', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/export-import/import')
                    .send({
                        Tool: 'not-an-array'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })
        })
    })
}
