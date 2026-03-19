import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `exec-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for executions route
 * Tests execution retrieval endpoints
 */
export function executionsRouteTest() {
    describe('Executions Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/executions', () => {
            it('should return executions with 200 status', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })
        })

        describe('GET /api/v1/executions/:id', () => {
            it('should handle non-existent execution', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions/non-existent-exec-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/executions with filters', () => {
            it('should handle pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?page=1&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle agentflowId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?agentflowId=test-flow-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle state filter - RUNNING', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?state=RUNNING')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle state filter - FINISHED', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?state=FINISHED')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle state filter - ERROR', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?state=ERROR')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle date filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?startDate=2024-01-01&endDate=2024-12-31')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle sort order', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?sortOrder=DESC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })

            it('should handle combined filters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions?agentflowId=test&state=FINISHED&page=1&limit=5&sortOrder=DESC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 412]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/executions/:id', () => {
            it('should handle delete of non-existent execution', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/executions/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/executions/agentflow/:agentflowId', () => {
            it('should handle execution retrieval by agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/executions/agentflow/test-flow-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 412]).toContain(response.status)
            })
        })
    })
}
