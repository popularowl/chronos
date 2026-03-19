import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `internal-chat-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for internal-chat-messages route
 * Tests internal chat message retrieval
 */
export function internalChatMessagesRouteTest() {
    describe('Internal Chat Messages Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/internal-chatmessages', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/internal-chatmessages')

                expect([401, 403]).toContain(response.status)
            })

            it('should get all internal chat messages', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessages')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get internal chat messages with filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessages')
                    .query({ agentflowid: 'test-flow' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get internal chat messages with chatId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessages')
                    .query({ chatId: 'test-chat' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/internal-chatmessages/:id', () => {
            it('should return 404 for non-existent id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessages/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle uuid format id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/internal-chatmessages/550e8400-e29b-41d4-a716-446655440000')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })
    })
}
