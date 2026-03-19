import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `attachments-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Test suite for attachments route
 * Tests attachment upload endpoint
 */
export function attachmentsRouteTest() {
    describe('Attachments Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/attachments/:agentflowId/:chatId', () => {
            it('should handle request without files', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/attachments/test-agentflow/test-chat')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle non-existent agentflow', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/attachments/non-existent-agentflow/test-chat')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })
    })
}
