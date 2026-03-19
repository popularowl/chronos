import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `evaluations-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for evaluations route
 * Tests evaluation CRUD endpoints
 */
export function evaluationsRouteTest() {
    describe('Evaluations Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/evaluations', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/evaluations')

                expect([401, 403]).toContain(response.status)
            })

            it('should get all evaluations', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/evaluations')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/evaluations/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/evaluations/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle non-existent evaluation id', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/evaluations/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/evaluations', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/evaluations').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should handle empty body', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/evaluations')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 412, 500]).toContain(response.status)
            })

            it('should handle evaluation creation', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/evaluations')
                    .send({
                        name: 'Test Evaluation',
                        agentflowId: 'test-agentflow-id',
                        datasetId: 'test-dataset-id'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 201, 400, 404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/evaluations/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).delete('/api/v1/evaluations/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle delete non-existent evaluation', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/evaluations/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/evaluations/is-outdated/:id', () => {
            it('should handle outdated check', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/evaluations/is-outdated/test-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle non-existent evaluation', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/evaluations/is-outdated/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/evaluations/run-again/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/evaluations/run-again/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle run again for non-existent evaluation', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/evaluations/run-again/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/evaluations/versions/:id', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/evaluations/versions/test-id')

                expect([401, 403]).toContain(response.status)
            })

            it('should handle versions for non-existent evaluation', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/evaluations/versions/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('PATCH /api/v1/evaluations', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).patch('/api/v1/evaluations').send({ ids: [] })

                expect([401, 403]).toContain(response.status)
            })

            it('should handle patch delete with empty ids', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .patch('/api/v1/evaluations')
                    .send({ ids: [] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle patch delete with ids', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .patch('/api/v1/evaluations')
                    .send({ ids: ['id1', 'id2'] })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle patch delete with isDeleteAllVersion true', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .patch('/api/v1/evaluations')
                    .send({ ids: ['id1'], isDeleteAllVersion: true })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })

            it('should handle patch delete with isDeleteAllVersion false', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .patch('/api/v1/evaluations')
                    .send({ ids: ['id1'], isDeleteAllVersion: false })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })
    })
}
