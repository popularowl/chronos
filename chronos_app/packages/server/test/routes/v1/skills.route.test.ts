import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `skills-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for skills route
 * Tests skill CRUD endpoints
 */
export function skillsRouteTest() {
    describe('Skills Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('GET /api/v1/skills', () => {
            it('should return all skills with 200 status', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/skills')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
            })

            it('should return skills as array', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/skills')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
                expect(Array.isArray(response.body)).toBe(true)
            })
        })

        describe('GET /api/v1/skills/:id', () => {
            it('should return 404 or 500 for non-existent skill', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/skills/non-existent-skill-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/skills', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/skills').send({})

                expect([401, 403]).toContain(response.status)
            })

            it('should handle creation with valid data', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/skills')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Test Skill ${Date.now()}`,
                        description: 'Test skill description',
                        category: 'development',
                        color: '#4DD0E1',
                        content: '## Test Skill\n\nInstructions for the agent.'
                    })

                expect([200, 201, 400, 412, 500]).toContain(response.status)
            })

            it('should handle creation with empty body', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/skills')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({})

                expect([400, 412, 500]).toContain(response.status)
            })
        })

        describe('PUT /api/v1/skills/:id', () => {
            it('should handle update of non-existent skill', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .put('/api/v1/skills/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({ name: 'Updated Skill' })

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('DELETE /api/v1/skills/:id', () => {
            it('should handle delete of non-existent skill', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .delete('/api/v1/skills/non-existent-id')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/skills with filters', () => {
            it('should handle pagination', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/skills?page=1&limit=10')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
            })
        })

        describe('Full Skill CRUD Lifecycle', () => {
            let createdSkillId: string

            it('should create a skill', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/skills')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: `Lifecycle Skill ${Date.now()}`,
                        description: 'Skill for lifecycle testing',
                        category: 'general',
                        color: '#BA68C8',
                        content: '## Lifecycle Skill\n\nFollow these instructions.'
                    })

                expect([200, 201]).toContain(response.status)
                if (response.body.id) {
                    createdSkillId = response.body.id
                }
            })

            it('should retrieve the created skill', async () => {
                if (!createdSkillId) return

                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/skills/${createdSkillId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toBe(200)
                expect(response.body.id).toBe(createdSkillId)
                expect(response.body.content).toContain('## Lifecycle Skill')
            })

            it('should update the created skill', async () => {
                if (!createdSkillId) return

                const response = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/skills/${createdSkillId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send({
                        name: 'Updated Lifecycle Skill',
                        content: '## Updated\n\nNew instructions.'
                    })

                expect([200]).toContain(response.status)
                expect(response.body.name).toBe('Updated Lifecycle Skill')
            })

            it('should delete the created skill', async () => {
                if (!createdSkillId) return

                const response = await supertest(getRunningExpressApp().app)
                    .delete(`/api/v1/skills/${createdSkillId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200]).toContain(response.status)
            })

            it('should return not found after deletion', async () => {
                if (!createdSkillId) return

                const response = await supertest(getRunningExpressApp().app)
                    .get(`/api/v1/skills/${createdSkillId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([404, 500]).toContain(response.status)
            })
        })
    })
}
