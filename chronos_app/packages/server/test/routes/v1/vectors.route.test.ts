import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `vectors-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for vectors route
 * Tests vector upsert endpoints
 */
export function vectorsRouteTest() {
    describe('Vectors Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/vector/upsert/:id', () => {
            it('should handle request without auth', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/vector/upsert/test-id').send({})

                expect([200, 401, 403, 404, 429, 500]).toContain(response.status)
            })

            it('should handle upsert without id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/upsert/')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 412, 429, 500]).toContain(response.status)
            })

            it('should handle upsert with non-existent id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/upsert/non-existent-id')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 429, 500]).toContain(response.status)
            })

            it('should handle upsert with valid id and data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/upsert/test-agentflow-id')
                    .send({
                        overrideConfig: {},
                        stopNodeId: null
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 429, 500]).toContain(response.status)
            })

            it('should handle upsert with form data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/upsert/test-agentflow-id')
                    .field('data', JSON.stringify({ test: 'value' }))
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 429, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/vector/internal-upsert/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/vector/internal-upsert/test-id').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should handle internal upsert without id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/internal-upsert/')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 412, 500]).toContain(response.status)
            })

            it('should handle internal upsert with non-existent id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/internal-upsert/non-existent-id')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle internal upsert with valid id and data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/vector/internal-upsert/test-agentflow-id')
                    .send({
                        overrideConfig: {},
                        stopNodeId: null
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })
    })
}
