import { UsersService } from '../../src/services/users'
import { UserRole } from '../../src/database/entities/User'

/**
 * Test suite for UsersService.createUser
 * Uses the live database from the test server to validate user creation logic
 */
export function usersCreateServiceTest() {
    describe('UsersService - createUser', () => {
        let usersService: UsersService

        beforeAll(() => {
            usersService = new UsersService()
        })

        it('should create a user with valid email and password', async () => {
            const uniqueId = Date.now() + Math.random()
            const result = await usersService.createUser({
                email: `create-test-${uniqueId}@test.com`,
                password: 'test1234'
            })

            expect(result).toBeDefined()
            expect(result.id).toBeDefined()
            expect(result.email).toContain('create-test-')
            expect(result.status).toEqual('active')
        })

        it('should default role to USER when not specified', async () => {
            const uniqueId = Date.now() + Math.random()
            const result = await usersService.createUser({
                email: `default-role-${uniqueId}@test.com`,
                password: 'test1234'
            })

            expect(result.role).toEqual(UserRole.USER)
        })

        it('should assign specified role when provided', async () => {
            const uniqueId = Date.now() + Math.random()
            const result = await usersService.createUser({
                email: `admin-role-${uniqueId}@test.com`,
                password: 'test1234',
                role: UserRole.ADMIN
            })

            expect(result.role).toEqual(UserRole.ADMIN)
        })

        it('should reject duplicate email (case-insensitive)', async () => {
            const uniqueId = Date.now() + Math.random()
            const email = `dup-test-${uniqueId}@test.com`

            await usersService.createUser({ email, password: 'test1234' })

            await expect(usersService.createUser({ email: email.toUpperCase(), password: 'test1234' })).rejects.toThrow(
                'User with this email already exists'
            )
        })

        it('should reject missing email', async () => {
            await expect(usersService.createUser({ email: '', password: 'test1234' })).rejects.toThrow('Email and password are required')
        })

        it('should reject missing password', async () => {
            const uniqueId = Date.now() + Math.random()
            await expect(usersService.createUser({ email: `no-pw-${uniqueId}@test.com`, password: '' })).rejects.toThrow(
                'Email and password are required'
            )
        })

        it('should reject password shorter than 8 characters', async () => {
            const uniqueId = Date.now() + Math.random()
            await expect(usersService.createUser({ email: `short-pw-${uniqueId}@test.com`, password: 'short' })).rejects.toThrow(
                'Password must be at least 8 characters long'
            )
        })

        it('should store email as lowercase', async () => {
            const uniqueId = Date.now() + Math.random()
            const result = await usersService.createUser({
                email: `UPPER-CASE-${uniqueId}@TEST.COM`,
                password: 'test1234'
            })

            expect(result.email).toEqual(`upper-case-${uniqueId}@test.com`)
        })

        it('should not return password in result', async () => {
            const uniqueId = Date.now() + Math.random()
            const result = await usersService.createUser({
                email: `no-pw-field-${uniqueId}@test.com`,
                password: 'test1234'
            })

            expect((result as any).password).toBeUndefined()
        })
    })
}
