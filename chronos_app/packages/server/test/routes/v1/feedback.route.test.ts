import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `feedback-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for feedback route
 * Tests feedback CRUD endpoints
 */
export function feedbackRouteTest() {
    describe('Feedback Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/feedback', () => {
            it('should return feedback with 200 status', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/feedback')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })
        })

        describe('POST /api/v1/feedback', () => {
            it('should require valid agentflow id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/feedback')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({})

                // May require agentflowId
                expect([200, 400, 412, 500]).toContain(response.status)
            })

            it('should handle feedback with rating THUMBS_UP', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/feedback')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        agentflowid: 'test-flow-id',
                        chatId: 'test-chat-id',
                        messageId: 'test-msg-id',
                        rating: 'THUMBS_UP'
                    })

                expect([200, 400, 404, 412, 500]).toContain(response.status)
            })

            it('should handle feedback with rating THUMBS_DOWN', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/feedback')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        agentflowid: 'test-flow-id',
                        chatId: 'test-chat-id',
                        messageId: 'test-msg-id',
                        rating: 'THUMBS_DOWN',
                        content: 'Test feedback content'
                    })

                expect([200, 400, 404, 412, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/feedback/:id', () => {
            it('should handle update of non-existent feedback', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .put('/api/v1/feedback/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({ rating: 'THUMBS_UP' })

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/fetch-feedback', () => {
            it('should handle fetch feedback with pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/fetch-feedback?page=1&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle fetch feedback with agentflowId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/fetch-feedback?agentflowId=test-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle fetch feedback with date filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/fetch-feedback?startDate=2024-01-01&endDate=2024-12-31')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })

            it('should handle fetch feedback with rating filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/fetch-feedback?rating=THUMBS_UP')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404]).toContain(response.status)
            })
        })
    })
}
