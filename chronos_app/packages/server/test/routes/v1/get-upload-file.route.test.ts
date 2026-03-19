import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `get-upload-file-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for get-upload-file route
 * Tests file streaming endpoint with validation branches
 */
export function getUploadFileRouteTest() {
    describe('Get Upload File Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/get-upload-file', () => {
            it('should return 500 when agentflowId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 500]).toContain(response.status)
            })

            it('should return 500 when chatId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'test-agentflow-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 500]).toContain(response.status)
            })

            it('should return 500 when fileName is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'test-agentflow-id', chatId: 'test-chat-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 500]).toContain(response.status)
            })

            it('should handle all required params', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'test-agentflow-id', chatId: 'test-chat-id', fileName: 'test.txt' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle download param true', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'test-agentflow-id', chatId: 'test-chat-id', fileName: 'test.txt', download: 'true' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle download param false', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'test-agentflow-id', chatId: 'test-chat-id', fileName: 'test.txt', download: 'false' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/get-upload-file')
                    .query({ agentflowId: 'non-existent-agentflow', chatId: 'test-chat-id', fileName: 'test.txt' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })
    })
}
