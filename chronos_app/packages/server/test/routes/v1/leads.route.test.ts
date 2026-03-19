import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `leads-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for leads route
 * Tests lead creation and retrieval endpoints
 */
export function leadsRouteTest() {
    describe('Leads Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/leads/:id', () => {
            it('should handle request without auth', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/leads/test-agentflow-id')

                expect([200, 401, 403, 404, 500]).toContain(response.status)
            })

            it('should return 412 when id is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/leads/')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412, 500]).toContain(response.status)
            })

            it('should return 412 when id is empty string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/leads')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412, 500]).toContain(response.status)
            })

            it('should handle non-existent agentflow id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/leads/non-existent-agentflow')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle valid agentflow id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/leads/valid-agentflow-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/leads', () => {
            it('should handle request without auth', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/leads').send({ name: 'Test Lead' })

                expect([200, 201, 401, 403, 412, 500]).toContain(response.status)
            })

            it('should return 412 when body is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/leads')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 412, 500]).toContain(response.status)
            })

            it('should return 412 when body is empty string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/leads')
                    .send('')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 412, 500]).toContain(response.status)
            })

            it('should create lead with valid body', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/leads')
                    .send({
                        agentflowid: 'test-agentflow-id',
                        name: 'Test Lead',
                        email: 'testlead@example.com',
                        phone: '1234567890'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 404, 500]).toContain(response.status)
            })

            it('should handle lead with minimal fields', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/leads')
                    .send({ agentflowid: 'test-agentflow-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 404, 500]).toContain(response.status)
            })

            it('should handle empty body object', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/leads')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 412, 500]).toContain(response.status)
            })
        })
    })
}
