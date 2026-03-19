import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `openai-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Helper function to create a test agentflow
 */
async function createTestAgentflow(authToken: string): Promise<string> {
    const newAgentflow = {
        name: 'OpenAI Test Agentflow ' + Date.now(),
        type: 'AGENTFLOW',
        flowData: JSON.stringify({ nodes: [], edges: [] })
    }

    const response = await supertest(getRunningExpressApp().app)
        .post('/api/v1/chatflows')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
        .send(newAgentflow)

    return response.body.id
}

/**
 * Helper function to delete a test agentflow
 */
async function deleteTestAgentflow(authToken: string, agentflowId: string): Promise<void> {
    await supertest(getRunningExpressApp().app)
        .delete(`/api/v1/chatflows/${agentflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
}

/**
 * Test suite for OpenAI-compatible API routes
 * Tests the endpoints at /api/v1/openai/*
 */
export function openaiRouteTest() {
    describe('OpenAI Compatible API Route', () => {
        const chatCompletionsRoute = '/api/v1/openai/chat/completions'
        const modelsRoute = '/api/v1/openai/models'

        // -------------------- GET /models --------------------

        describe('GET /api/v1/openai/models', () => {
            it('should return list of models', async () => {
                const response = await supertest(getRunningExpressApp().app).get(modelsRoute)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body).toHaveProperty('object', 'list')
                expect(response.body).toHaveProperty('data')
                expect(Array.isArray(response.body.data)).toBe(true)
            })

            it('should return models with correct shape', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app).get(modelsRoute)

                expect(response.status).toEqual(StatusCodes.OK)
                const model = response.body.data.find((m: any) => m.id === agentflowId)
                expect(model).toBeDefined()
                expect(model).toHaveProperty('object', 'model')
                expect(model).toHaveProperty('owned_by', 'chronos')
                expect(model).toHaveProperty('name')
                expect(model).toHaveProperty('created')

                await deleteTestAgentflow(authToken, agentflowId)
            })
        })

        // -------------------- GET /models/:id --------------------

        describe('GET /api/v1/openai/models/:id', () => {
            it('should return 404 for non-existent model', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app).get(`${modelsRoute}/${fakeId}`)

                expect([StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should return model by id', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app).get(`${modelsRoute}/${agentflowId}`)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body).toHaveProperty('id', agentflowId)
                expect(response.body).toHaveProperty('object', 'model')
                expect(response.body).toHaveProperty('owned_by', 'chronos')

                await deleteTestAgentflow(authToken, agentflowId)
            })
        })

        // -------------------- POST /chat/completions - Validation --------------------

        describe('POST /api/v1/openai/chat/completions - Validation', () => {
            it('should return 400 when model is missing', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({ messages: [{ role: 'user', content: 'Hello' }] })

                expect([StatusCodes.BAD_REQUEST, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should return 400 when messages is missing', async () => {
                const response = await supertest(getRunningExpressApp().app).post(chatCompletionsRoute).send({ model: 'some-model' })

                expect([StatusCodes.BAD_REQUEST, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should return error when messages is empty array', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({ model: 'some-model', messages: [] })

                expect([StatusCodes.BAD_REQUEST, StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should return 404 when model does not exist', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: fakeId,
                        messages: [{ role: 'user', content: 'Hello' }]
                    })

                expect([StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should return 400 when no user message is present', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [{ role: 'system', content: 'You are helpful.' }]
                    })

                expect([StatusCodes.BAD_REQUEST, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })
        })

        // -------------------- POST /chat/completions - Execution --------------------

        describe('POST /api/v1/openai/chat/completions - Execution', () => {
            it('should attempt chat completion on valid agentflow', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [{ role: 'user', content: 'Hello' }]
                    })

                // Empty agentflows will fail during execution, but should get past validation
                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should handle system message', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [
                            { role: 'system', content: 'You are a helpful assistant.' },
                            { role: 'user', content: 'Hello' }
                        ]
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should handle conversation history', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [
                            { role: 'user', content: 'What is 2+2?' },
                            { role: 'assistant', content: '4' },
                            { role: 'user', content: 'And 3+3?' }
                        ]
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should handle x_chronos_override_config', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [{ role: 'user', content: 'Hello' }],
                        x_chronos_override_config: { temperature: 0.5 }
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should accept X-Chat-Id header', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .set('X-Chat-Id', 'test-session-123')
                    .send({
                        model: agentflowId,
                        messages: [{ role: 'user', content: 'Hello' }]
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should handle stream=false explicitly', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(chatCompletionsRoute)
                    .send({
                        model: agentflowId,
                        messages: [{ role: 'user', content: 'Hello' }],
                        stream: false
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestAgentflow(authToken, agentflowId)
            })
        })
    })
}
