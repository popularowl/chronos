import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `stats-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for stats route
 * Tests stats retrieval endpoint
 */
export function statsRouteTest() {
    describe('Stats Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/stats', () => {
            it('should return stats with valid status when authenticated', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                // 200 for success, or 412 if no stats available
                expect([200, 412]).toContain(response.status)
            })

            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/stats')

                // Should return 401 or some auth error
                expect([401, 403]).toContain(response.status)
            })
        })

        describe('GET /api/v1/stats/:id', () => {
            it('should return stats for specific agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats/test-agentflow-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412]).toContain(response.status)
            })

            it('should handle non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412]).toContain(response.status)
            })
        })

        describe('GET /api/v1/stats with filters', () => {
            it('should handle startDate filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats?startDate=2024-01-01')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle endDate filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats?endDate=2024-12-31')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle date range filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats?startDate=2024-01-01&endDate=2024-12-31')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle chatType filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats?chatType=INTERNAL')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle combined filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/stats?startDate=2024-01-01&endDate=2024-12-31&chatType=EXTERNAL')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })
        })
    })
}
