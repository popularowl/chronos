import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `prediction-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Helper function to create a test chatflow
 */
async function createTestChatflow(authToken: string): Promise<string> {
    const newChatflow = {
        name: 'Prediction Test Chatflow ' + Date.now(),
        type: 'AGENTFLOW',
        flowData: JSON.stringify({ nodes: [], edges: [] })
    }

    const response = await supertest(getRunningExpressApp().app)
        .post('/api/v1/chatflows')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
        .send(newChatflow)

    return response.body.id
}

/**
 * Helper function to delete a test chatflow
 */
async function deleteTestChatflow(authToken: string, chatflowId: string): Promise<void> {
    await supertest(getRunningExpressApp().app)
        .delete(`/api/v1/chatflows/${chatflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
}

/**
 * Test suite for predictions routes
 * Tests the prediction endpoints at /api/v1/prediction/*
 */
export function predictionsRouteTest() {
    describe('Predictions Route', () => {
        const baseRoute = '/api/v1/prediction'

        describe('Validation Tests', () => {
            it('should return error when chatflow does not exist', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                // prediction is whitelisted, no auth needed
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${fakeId}`)
                    .send({ question: 'Hello', streaming: false })

                // API returns NOT_FOUND or INTERNAL_SERVER_ERROR depending on error handling
                expect([StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })
        })

        describe('Prediction Tests with Chatflow', () => {
            it('should return 412 when body is empty', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                // prediction is whitelisted, no auth needed
                const response = await supertest(getRunningExpressApp().app).post(`${baseRoute}/${chatflowId}`)

                expect(response.status).toEqual(StatusCodes.PRECONDITION_FAILED)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should attempt prediction on valid chatflow', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                // prediction is whitelisted, no auth needed
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Hello', streaming: false })

                // Empty chatflows will fail during execution, but should get past validation
                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle streaming parameter as string', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Hello', streaming: 'false' })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should allow requests without origin header', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Hello', streaming: false })

                // Request should be processed (may fail due to empty chatflow, but not due to origin)
                expect(response.status).not.toEqual(StatusCodes.FORBIDDEN)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should process request with origin header', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .set('Origin', 'http://localhost:3000')
                    .send({ question: 'Hello', streaming: false })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should not rate limit single request', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Rate limit test', streaming: false })

                expect(response.status).not.toEqual(StatusCodes.TOO_MANY_REQUESTS)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle chatId parameter', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Hello', streaming: false, chatId: 'test-chat-123' })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle sessionId parameter', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({ question: 'Hello', streaming: false, sessionId: 'test-session-123' })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle overrideConfig parameter', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({
                        question: 'Hello',
                        streaming: false,
                        overrideConfig: { temperature: 0.5 }
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle history parameter', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${chatflowId}`)
                    .send({
                        question: 'Hello',
                        streaming: false,
                        history: [{ role: 'human', content: 'Previous message' }]
                    })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should handle uploads parameter', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app).post(`${baseRoute}/${chatflowId}`).send({
                    question: 'Hello',
                    streaming: false,
                    uploads: []
                })

                expect([StatusCodes.OK, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)

                await deleteTestChatflow(authToken, chatflowId)
            })
        })
    })
}
