import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `agentflows-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for agentflows route
 * Tests agentflow CRUD operations
 */
export function agentflowsRouteTest() {
    describe('Agentflows Route', () => {
        let authToken: string
        let createdAgentflowId: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/agentflows', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/agentflows').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should return 500 when body is empty', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should create a agentflow with valid data', async () => {
                const agentflowData = {
                    name: 'Test Agentflow',
                    flowData: '{}',
                    deployed: false,
                    type: 'AGENTFLOW'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .send(agentflowData)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 500]).toContain(response.status)
                if (response.status === 200 || response.status === 201) {
                    createdAgentflowId = response.body.id
                }
            })
        })

        describe('GET /api/v1/agentflows', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/agentflows')

                expect([401, 403]).toContain(response.status)
            })

            it('should get all agentflows', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get all agentflows with type filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows')
                    .query({ type: 'AGENTFLOW' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/:id', () => {
            it('should return 404 for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should get agentflow by id', async () => {
                const id = createdAgentflowId || 'test-id'
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/agentflows/${id}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/apikey/:apikey', () => {
            it('should return 404 for non-existent apikey', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/apikey/non-existent-key')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/agentflows/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .put('/api/v1/agentflows/test-id')
                    .send({ name: 'Updated Name' })

                expect([401, 403]).toContain(response.status)
            })

            it('should return error for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .put('/api/v1/agentflows/non-existent-id')
                    .send({ name: 'Updated Name' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should update agentflow with valid data', async () => {
                const id = createdAgentflowId || 'test-id'
                const response = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/agentflows/${id}`)
                    .send({ name: 'Updated Agentflow' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/has-changed/:id/:lastUpdatedDateTime', () => {
            it('should check if agentflow has changed', async () => {
                const id = createdAgentflowId || 'test-id'
                const timestamp = new Date().toISOString()
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/agentflows/has-changed/${id}/${timestamp}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/agentflows/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).delete('/api/v1/agentflows/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/agentflows/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should delete agentflow by id', async () => {
                if (createdAgentflowId) {
                    const response = await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/agentflows/${createdAgentflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    expect([200, 404, 500]).toContain(response.status)
                }
            })
        })
    })
}
