import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `schedules-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for schedules route
 * Tests schedule CRUD endpoints
 */
export function schedulesRouteTest() {
    describe('Schedules Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/schedules', () => {
            it('should return all schedules with 200 status', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should return schedules as array', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
                expect(Array.isArray(response.body)).toBe(true)
            })
        })

        describe('GET /api/v1/schedules/:id', () => {
            it('should return 404 or 500 for non-existent schedule', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules/non-existent-schedule-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/schedules', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/schedules').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should reject creation with missing required fields', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/schedules')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({})

                expect([400, 412, 500]).toContain(response.status)
            })

            it('should reject invalid cron expression', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/schedules')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: 'Bad Schedule',
                        cronExpression: 'not-a-cron',
                        agentflowId: '550e8400-e29b-41d4-a716-446655440000'
                    })

                expect([400, 412, 500]).toContain(response.status)
            })
        })

        describe('PATCH /api/v1/schedules/:id/toggle', () => {
            it('should reject toggle without enabled field', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .patch('/api/v1/schedules/some-id/toggle')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({})

                expect([400, 412, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/schedules/:id', () => {
            it('should handle delete of non-existent schedule', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/schedules/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/schedules with filters', () => {
            it('should handle pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules?page=1&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
            })

            it('should handle agentflowId filter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules?agentflowId=550e8400-e29b-41d4-a716-446655440000')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
            })
        })

        describe('GET /api/v1/schedules/:id/executions', () => {
            it('should return executions for a schedule', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/schedules/some-schedule-id/executions')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
            })
        })
    })
}
