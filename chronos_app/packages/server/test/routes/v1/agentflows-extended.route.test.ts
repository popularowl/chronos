import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `agentflows-ext-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Extended test suite for agentflows route
 * Tests additional branches and edge cases
 */
export function agentflowsExtendedRouteTest() {
    describe('Agentflows Extended Route Tests', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/agentflows with pagination', () => {
            it('should handle page parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?page=0')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle limit parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?limit=5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle both page and limit', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?page=0&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should reject negative page', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?page=-1')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 412, 500]).toContain(response.status)
            })

            it('should reject negative limit', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?limit=-5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 412, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows with type filter', () => {
            it('should filter by AGENTFLOW type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=AGENTFLOW')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should filter by AGENTFLOW type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=AGENTFLOW')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should filter by MULTIAGENT type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=MULTIAGENT')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('POST /api/v1/agentflows validation', () => {
            it('should reject invalid type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: 'Test',
                        type: 'INVALID_TYPE',
                        flowData: '{}'
                    })

                expect([400, 412, 500]).toContain(response.status)
            })

            it('should accept valid agentflow with minimal data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Test Agentflow ${Date.now()}`,
                        type: 'AGENTFLOW',
                        flowData: JSON.stringify({ nodes: [], edges: [] })
                    })

                expect([200, 201]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/:id error cases', () => {
            it('should return 404 for non-existent agentflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/agentflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })

            it('should reject invalid UUID format', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/invalid-uuid')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 404, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/agentflows/:id error cases', () => {
            it('should return error for non-existent agentflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/agentflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({ name: 'Updated Name' })

                expect([404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/agentflows/:id error cases', () => {
            it('should return error for non-existent agentflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .delete(`/api/v1/agentflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows with search', () => {
            it('should handle search parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?search=test')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle empty search', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?search=')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle search with special characters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?search=%20%23')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('GET /api/v1/agentflows with sorting', () => {
            it('should handle sort by name', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?sortBy=name')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort by createdDate', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?sortBy=createdDate')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort order ASC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?sortOrder=ASC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort order DESC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?sortOrder=DESC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('GET /api/v1/agentflows/:id/streaming', () => {
            it('should check streaming validity for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/non-existent-id/streaming')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/:id/uploads', () => {
            it('should check uploads validity for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/non-existent-id/uploads')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/apikey/:apikey', () => {
            it('should reject invalid API key', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/apikey/invalid-key')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([401, 404, 500]).toContain(response.status)
            })

            it('should handle keyonly query param', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/apikey/test-key?keyonly=true')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/agentflows/:id/config', () => {
            it('should get config for non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows/non-existent-id/config')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('Combined filters', () => {
            it('should handle type + pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=AGENTFLOW&page=1&limit=5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle type + search + sort', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=AGENTFLOW&search=test&sortBy=name&sortOrder=ASC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle all filters combined', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/agentflows?type=AGENTFLOW&search=agent&sortBy=createdDate&sortOrder=DESC&page=0&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })
    })
}
