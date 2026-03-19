import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Test suite for Management Admin API routes.
 * Tests the admin endpoints at /api/v1/admin/* and the OAuth2 token endpoint.
 */
export function adminRouteTest() {
    describe('Admin Route', () => {
        const tokenRoute = '/api/v1/auth/token'
        const adminBase = '/api/v1/admin'

        describe(`POST ${tokenRoute}`, () => {
            it('should return 400 for unsupported grant type', async () => {
                const response = await supertest(getRunningExpressApp().app).post(tokenRoute).send({
                    grant_type: 'authorization_code',
                    client_id: 'test',
                    client_secret: 'test'
                })

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
                expect(response.body.error).toEqual('unsupported_grant_type')
            })

            it('should return 400 when client_id is missing', async () => {
                const response = await supertest(getRunningExpressApp().app).post(tokenRoute).send({
                    grant_type: 'client_credentials',
                    client_secret: 'test'
                })

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
                expect(response.body.error).toEqual('invalid_request')
            })

            it('should return 401 for invalid client credentials', async () => {
                const response = await supertest(getRunningExpressApp().app).post(tokenRoute).send({
                    grant_type: 'client_credentials',
                    client_id: 'nonexistent',
                    client_secret: 'wrong'
                })

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
                expect(response.body.error).toEqual('invalid_client')
            })
        })

        describe('Admin endpoints without auth', () => {
            it('should return 401 for GET /admin/agentflows without token', async () => {
                const response = await supertest(getRunningExpressApp().app).get(`${adminBase}/agentflows`)

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
                expect(response.body.success).toBe(false)
            })

            it('should return 401 for GET /admin/credentials without token', async () => {
                const response = await supertest(getRunningExpressApp().app).get(`${adminBase}/credentials`)

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })

            it('should return 401 for GET /admin/apikeys without token', async () => {
                const response = await supertest(getRunningExpressApp().app).get(`${adminBase}/apikeys`)

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })
        })

        describe('Admin endpoints with invalid token', () => {
            it('should return 401 with an expired or invalid JWT', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get(`${adminBase}/agentflows`)
                    .set('Authorization', 'Bearer invalid-jwt-token')

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
                expect(response.body.success).toBe(false)
            })
        })
    })
}
