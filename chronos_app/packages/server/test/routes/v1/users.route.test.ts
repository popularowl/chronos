import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'
import { getDataSource } from '../../../src/DataSource'
import { User, UserRole } from '../../../src/database/entities/User'

/**
 * Helper to sign up a user and return the token and user
 */
async function signupUser(emailPrefix: string): Promise<{ token: string; user: any }> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `${emailPrefix}-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return { token: response.body.token, user: response.body.user }
}

/**
 * Promote a user to admin directly in DB and re-login to get a new token with admin role
 */
async function promoteToAdmin(userId: string, email: string): Promise<string> {
    const userRepo = getDataSource().getRepository(User)
    await userRepo.update({ id: userId }, { role: UserRole.ADMIN })

    // Re-login to get a new JWT with the admin role
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/login').send({ email, password: 'test1234' })
    return response.body.token
}

/** Shorthand for app instance */
function app() {
    return getRunningExpressApp().app
}

/**
 * Test suite for users management routes
 * Tests the admin-only endpoints at /api/v1/users/*
 */
export function usersRouteTest() {
    describe('Users Route', () => {
        const baseRoute = '/api/v1/users'
        const internal = 'internal'
        let adminToken: string
        let adminUser: any
        let regularToken: string
        let regularUser: any

        beforeAll(async () => {
            const admin = await signupUser('users-admin')
            adminUser = admin.user

            const regular = await signupUser('users-regular')
            regularToken = regular.token
            regularUser = regular.user

            // Promote first user to admin and get new token
            adminToken = await promoteToAdmin(adminUser.id, adminUser.email)
        })

        describe(`GET ${baseRoute}`, () => {
            it('should return 401 when not authenticated', async () => {
                const response = await supertest(app()).get(baseRoute).set('x-request-from', internal)

                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })

            it('should return 403 when authenticated as regular user', async () => {
                const response = await supertest(app())
                    .get(baseRoute)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${regularToken}`)

                expect(response.status).toEqual(StatusCodes.FORBIDDEN)
            })

            it('should return users list when authenticated as admin', async () => {
                const response = await supertest(app())
                    .get(baseRoute)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(Array.isArray(response.body)).toBe(true)
                expect(response.body.length).toBeGreaterThanOrEqual(2)
            })

            it('should not include password field in response', async () => {
                const response = await supertest(app())
                    .get(baseRoute)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                response.body.forEach((user: any) => {
                    expect(user.password).toBeUndefined()
                })
            })

            it('should include role field in each user', async () => {
                const response = await supertest(app())
                    .get(baseRoute)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                response.body.forEach((user: any) => {
                    expect(user.role).toBeDefined()
                    expect(['admin', 'user']).toContain(user.role)
                })
            })
        })

        describe(`GET ${baseRoute}/:id`, () => {
            it('should return 403 for regular user', async () => {
                const response = await supertest(app())
                    .get(`${baseRoute}/${adminUser.id}`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${regularToken}`)

                expect(response.status).toEqual(StatusCodes.FORBIDDEN)
            })

            it('should return user by ID for admin', async () => {
                const response = await supertest(app())
                    .get(`${baseRoute}/${regularUser.id}`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.email).toEqual(regularUser.email)
                expect(response.body.password).toBeUndefined()
            })

            it('should return 404 for non-existent user', async () => {
                const response = await supertest(app())
                    .get(`${baseRoute}/non-existent-id`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.NOT_FOUND)
            })
        })

        describe(`PUT ${baseRoute}/:id/role`, () => {
            it('should return 403 for regular user', async () => {
                const response = await supertest(app())
                    .put(`${baseRoute}/${regularUser.id}/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${regularToken}`)
                    .send({ role: 'admin' })

                expect(response.status).toEqual(StatusCodes.FORBIDDEN)
            })

            it('should return 400 when role is missing', async () => {
                const response = await supertest(app())
                    .put(`${baseRoute}/${regularUser.id}/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({})

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
            })

            it('should return 400 for invalid role', async () => {
                const response = await supertest(app())
                    .put(`${baseRoute}/${regularUser.id}/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ role: 'superadmin' })

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
            })

            it('should update user role successfully', async () => {
                const testTarget = await signupUser('role-update-target')

                const response = await supertest(app())
                    .put(`${baseRoute}/${testTarget.user.id}/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ role: 'admin' })

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.role).toEqual('admin')

                // Revert
                await supertest(app())
                    .put(`${baseRoute}/${testTarget.user.id}/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ role: 'user' })
            })

            it('should return 404 for non-existent user', async () => {
                const response = await supertest(app())
                    .put(`${baseRoute}/non-existent-id/role`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ role: 'admin' })

                expect(response.status).toEqual(StatusCodes.NOT_FOUND)
            })
        })

        describe(`DELETE ${baseRoute}/:id`, () => {
            it('should return 403 for regular user', async () => {
                const response = await supertest(app())
                    .delete(`${baseRoute}/${adminUser.id}`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${regularToken}`)

                expect(response.status).toEqual(StatusCodes.FORBIDDEN)
            })

            it('should return 400 when trying to deactivate self', async () => {
                const response = await supertest(app())
                    .delete(`${baseRoute}/${adminUser.id}`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
                expect(response.body.error).toEqual('Cannot deactivate your own account')
            })

            it('should deactivate another user', async () => {
                const toDeactivate = await signupUser('deactivate-target')

                const response = await supertest(app())
                    .delete(`${baseRoute}/${toDeactivate.user.id}`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.status).toEqual('deleted')
            })

            it('should return 404 for non-existent user', async () => {
                const response = await supertest(app())
                    .delete(`${baseRoute}/non-existent-id`)
                    .set('x-request-from', internal)
                    .set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.NOT_FOUND)
            })
        })

        describe('Auth Route - Role in response', () => {
            it('should include role in signup response', async () => {
                const uniqueId = Date.now() + Math.random()
                const response = await supertest(app())
                    .post('/api/v1/auth/signup')
                    .send({ email: `role-check-${uniqueId}@test.com`, password: 'test1234' })

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.user.role).toBeDefined()
                expect(['admin', 'user']).toContain(response.body.user.role)
            })

            it('should include role in login response', async () => {
                const uniqueId = Date.now() + Math.random()
                const email = `role-login-${uniqueId}@test.com`
                const password = 'test1234'

                await supertest(app()).post('/api/v1/auth/signup').send({ email, password })
                const response = await supertest(app()).post('/api/v1/auth/login').send({ email, password })

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.user.role).toBeDefined()
            })

            it('should include role in /me response', async () => {
                const response = await supertest(app()).get('/api/v1/auth/me').set('Authorization', `Bearer ${adminToken}`)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.user.role).toBeDefined()
            })
        })
    })
}
