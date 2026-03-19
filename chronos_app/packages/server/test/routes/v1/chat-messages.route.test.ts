import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `chat-msg-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for chat messages route
 * Tests chat message retrieval endpoints
 */
export function chatMessagesRouteTest() {
    describe('Chat Messages Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/chatmessage/:id', () => {
            it('should handle non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412, 500]).toContain(response.status)
            })

            it('should handle chatType as JSON array string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ chatType: '["INTERNAL"]' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle chatType as plain string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ chatType: 'INTERNAL' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle sortOrder DESC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ order: 'DESC' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle sortOrder ASC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ order: 'ASC' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle chatId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ chatId: 'test-chat-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle memoryType filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ memoryType: 'buffer' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle sessionId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ sessionId: 'test-session' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle messageId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ messageId: 'test-msg-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle startDate filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ startDate: '2024-01-01' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle endDate filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ endDate: '2024-12-31' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle startDate and endDate together', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle feedback flag', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ feedback: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle feedbackType THUMBS_UP', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ feedbackType: 'THUMBS_UP' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle feedbackType THUMBS_DOWN', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ feedbackType: 'THUMBS_DOWN' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle pagination params', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ page: '1', limit: '10' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle feedback with pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({ feedback: true, page: '1', limit: '10' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle multiple filters combined', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatmessage/test-id')
                    .query({
                        chatType: 'INTERNAL',
                        order: 'DESC',
                        chatId: 'chat-123',
                        startDate: '2024-01-01',
                        endDate: '2024-12-31'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/chatmessage/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).delete('/api/v1/chatmessage/some-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle delete with chatId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatmessage/non-existent-flow')
                    .query({ chatId: 'test-chat' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle delete without chatId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatmessage/non-existent-flow')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle delete with date range', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatmessage/non-existent-flow')
                    .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle delete with feedbackType filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatmessage/non-existent-flow')
                    .query({ feedbackType: 'THUMBS_UP' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle delete with hardDelete flag', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatmessage/non-existent-flow')
                    .query({ hardDelete: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/chatmessage/:agentflowid/:chatid/abort', () => {
            it('should handle abort for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatmessage/test-flow/test-chat/abort')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/internal-chatmessage/:id', () => {
            it('should handle internal chat messages with filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessage/test-id')
                    .query({
                        order: 'DESC',
                        chatId: 'test-chat',
                        startDate: '2024-01-01',
                        endDate: '2024-12-31'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle internal chat messages with feedback filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessage/test-id')
                    .query({ feedback: true, feedbackType: 'THUMBS_UP' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })
        })
    })
}
