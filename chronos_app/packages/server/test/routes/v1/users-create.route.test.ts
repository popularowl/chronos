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

    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/login').send({ email, password: 'test1234' })
    return response.body.token
}

/** Shorthand for app instance */
function app() {
    return getRunningExpressApp().app
}

/**
 * Test suite for POST /api/v1/users (admin user creation)
 */
export function usersCreateRouteTest() {
    describe('POST /api/v1/users - Create User', () => {
        const baseRoute = '/api/v1/users'
        const internal = 'internal'
        let adminToken: string
        let regularToken: string

        beforeAll(async () => {
            const admin = await signupUser('create-route-admin')
            adminToken = await promoteToAdmin(admin.user.id, admin.user.email)

            const regular = await signupUser('create-route-regular')
            regularToken = regular.token
        })

        it('should return 401 when not authenticated', async () => {
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .send({ email: 'test@test.com', password: 'test1234' })

            expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
        })

        it('should return 403 for regular user', async () => {
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${regularToken}`)
                .send({ email: 'test@test.com', password: 'test1234' })

            expect(response.status).toEqual(StatusCodes.FORBIDDEN)
        })

        it('should create user and return 201', async () => {
            const uniqueId = Date.now() + Math.random()
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: `route-create-${uniqueId}@test.com`, password: 'test1234', name: 'Test User' })

            expect(response.status).toEqual(StatusCodes.CREATED)
            expect(response.body.id).toBeDefined()
            expect(response.body.email).toContain('route-create-')
            expect(response.body.name).toEqual('Test User')
            expect(response.body.status).toEqual('active')
        })

        it('should return 400 when email missing', async () => {
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ password: 'test1234' })

            expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
        })

        it('should return 400 when password missing', async () => {
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: 'missing-pw@test.com' })

            expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
        })

        it('should return 400 for short password', async () => {
            const uniqueId = Date.now() + Math.random()
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: `short-pw-${uniqueId}@test.com`, password: 'short' })

            expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
        })

        it('should return 409 for duplicate email', async () => {
            const uniqueId = Date.now() + Math.random()
            const email = `dup-route-${uniqueId}@test.com`

            // Create first
            await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email, password: 'test1234' })

            // Try duplicate
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email, password: 'test1234' })

            expect(response.status).toEqual(StatusCodes.CONFLICT)
        })

        it('should not include password in response', async () => {
            const uniqueId = Date.now() + Math.random()
            const response = await supertest(app())
                .post(baseRoute)
                .set('x-request-from', internal)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ email: `nopw-resp-${uniqueId}@test.com`, password: 'test1234' })

            expect(response.status).toEqual(StatusCodes.CREATED)
            expect(response.body.password).toBeUndefined()
        })
    })
}
