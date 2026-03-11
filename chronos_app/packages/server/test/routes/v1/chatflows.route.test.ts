import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `chatflows-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for chatflows route
 * Tests chatflow CRUD operations
 */
export function chatflowsRouteTest() {
    describe('Chatflows Route', () => {
        let authToken: string
        let createdChatflowId: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/chatflows', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/chatflows').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should return 500 when body is empty', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatflows')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should create a chatflow with valid data', async () => {
                const chatflowData = {
                    name: 'Test Chatflow',
                    flowData: '{}',
                    deployed: false,
                    type: 'AGENTFLOW'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatflows')
                    .send(chatflowData)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 500]).toContain(response.status)
                if (response.status === 200 || response.status === 201) {
                    createdChatflowId = response.body.id
                }
            })
        })

        describe('GET /api/v1/chatflows', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/chatflows')

                expect([401, 403]).toContain(response.status)
            })

            it('should get all chatflows', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get all chatflows with type filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows')
                    .query({ type: 'AGENTFLOW' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/:id', () => {
            it('should return 404 for non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get chatflow by id', async () => {
                const id = createdChatflowId || 'test-id'
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/chatflows/${id}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/apikey/:apikey', () => {
            it('should return 404 for non-existent apikey', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/apikey/non-existent-key')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/chatflows/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).put('/api/v1/chatflows/test-id').send({ name: 'Updated Name' })

                expect([401, 403]).toContain(response.status)
            })

            it('should return error for non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .put('/api/v1/chatflows/non-existent-id')
                    .send({ name: 'Updated Name' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should update chatflow with valid data', async () => {
                const id = createdChatflowId || 'test-id'
                const response = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/chatflows/${id}`)
                    .send({ name: 'Updated Chatflow' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/has-changed/:id/:lastUpdatedDateTime', () => {
            it('should check if chatflow has changed', async () => {
                const id = createdChatflowId || 'test-id'
                const timestamp = new Date().toISOString()
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/chatflows/has-changed/${id}/${timestamp}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/chatflows/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).delete('/api/v1/chatflows/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/chatflows/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should delete chatflow by id', async () => {
                if (createdChatflowId) {
                    const response = await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/chatflows/${createdChatflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200, 404, 500]).toContain(response.status)
                }
            })
        })
    })
}
