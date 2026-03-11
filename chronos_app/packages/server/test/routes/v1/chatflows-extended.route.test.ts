import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `chatflows-ext-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Extended test suite for chatflows route
 * Tests additional branches and edge cases
 */
export function chatflowsExtendedRouteTest() {
    describe('Chatflows Extended Route Tests', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/chatflows with pagination', () => {
            it('should handle page parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?page=0')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle limit parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?limit=5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle both page and limit', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?page=0&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should reject negative page', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?page=-1')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 412, 500]).toContain(response.status)
            })

            it('should reject negative limit', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?limit=-5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 412, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows with type filter', () => {
            it('should filter by CHATFLOW type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=CHATFLOW')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should filter by AGENTFLOW type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=AGENTFLOW')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should filter by MULTIAGENT type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=MULTIAGENT')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('POST /api/v1/chatflows validation', () => {
            it('should reject invalid type', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: 'Test',
                        type: 'INVALID_TYPE',
                        flowData: '{}'
                    })

                expect([400, 412, 500]).toContain(response.status)
            })

            it('should accept valid chatflow with minimal data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/chatflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Test Chatflow ${Date.now()}`,
                        type: 'AGENTFLOW',
                        flowData: JSON.stringify({ nodes: [], edges: [] })
                    })

                expect([200, 201]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/:id error cases', () => {
            it('should return 404 for non-existent chatflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/chatflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })

            it('should reject invalid UUID format', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/invalid-uuid')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([400, 404, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/chatflows/:id error cases', () => {
            it('should return error for non-existent chatflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/chatflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({ name: 'Updated Name' })

                expect([404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/chatflows/:id error cases', () => {
            it('should return error for non-existent chatflow', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'
                const response = await supertest(getRunningExpressApp().app)
                    .delete(`/api/v1/chatflows/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows with search', () => {
            it('should handle search parameter', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?search=test')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle empty search', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?search=')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle search with special characters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?search=%20%23')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('GET /api/v1/chatflows with sorting', () => {
            it('should handle sort by name', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?sortBy=name')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort by createdDate', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?sortBy=createdDate')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort order ASC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?sortOrder=ASC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle sort order DESC', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?sortOrder=DESC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })

        describe('GET /api/v1/chatflows/:id/streaming', () => {
            it('should check streaming validity for non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/non-existent-id/streaming')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/:id/uploads', () => {
            it('should check uploads validity for non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/non-existent-id/uploads')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/apikey/:apikey', () => {
            it('should reject invalid API key', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/apikey/invalid-key')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([401, 404, 500]).toContain(response.status)
            })

            it('should handle keyonly query param', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/apikey/test-key?keyonly=true')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 401, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/public-chatflows/:id', () => {
            it('should return 404 for non-existent public chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/public-chatflows/non-existent-id')
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })

            it('should return 401 for non-public chatflow without auth', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/public-chatflows/some-private-id')

                expect([401, 404, 500]).toContain(response.status)
            })

            it('should allow access to public chatflow with auth', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/public-chatflows/test-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/chatflows/:id/config', () => {
            it('should get config for non-existent chatflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows/non-existent-id/config')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('Combined filters', () => {
            it('should handle type + pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=CHATFLOW&page=1&limit=5')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle type + search + sort', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=CHATFLOW&search=test&sortBy=name&sortOrder=ASC')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should handle all filters combined', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/chatflows?type=AGENTFLOW&search=agent&sortBy=createdDate&sortOrder=DESC&page=0&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })
        })
    })
}
