import supertest from 'supertest'
import { getRunningExpressApp } from '../../src/utils/getRunningExpressApp'
import { UserRole } from '../../src/database/entities/User'
import { UsersService } from '../../src/services/users'

/**
 * Test suite for Users service
 * Uses the live database from the test server to validate service logic
 */
export function usersServiceTest() {
    describe('Users Service', () => {
        let usersService: UsersService
        let createdUserId: string

        beforeAll(async () => {
            usersService = new UsersService()

            // Create a test user directly via signup
            const uniqueId = Date.now() + Math.random()
            const response = await supertest(getRunningExpressApp().app)
                .post('/api/v1/auth/signup')
                .send({ email: `svc-test-${uniqueId}@test.com`, password: 'test1234' })
            createdUserId = response.body.user.id
        })

        describe('getAllUsers', () => {
            it('should return all users without password', async () => {
                const result = await usersService.getAllUsers()

                expect(Array.isArray(result)).toBe(true)
                expect(result.length).toBeGreaterThan(0)
                result.forEach((user: any) => {
                    expect(user.password).toBeUndefined()
                    expect(user.id).toBeDefined()
                    expect(user.email).toBeDefined()
                    expect(user.role).toBeDefined()
                })
            })
        })

        describe('getUserById', () => {
            it('should return user without password', async () => {
                const result = await usersService.getUserById(createdUserId)

                expect(result).toBeDefined()
                expect(result).not.toBeNull()
                expect((result as any).password).toBeUndefined()
                expect((result as any).id).toEqual(createdUserId)
            })

            it('should return null when user not found', async () => {
                const result = await usersService.getUserById('non-existent-id')

                expect(result).toBeNull()
            })
        })

        describe('updateUserRole', () => {
            it('should update user role successfully', async () => {
                // Create a dedicated user for this test
                const uniqueId = Date.now() + Math.random()
                const resp = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/auth/signup')
                    .send({ email: `role-svc-${uniqueId}@test.com`, password: 'test1234' })
                const userId = resp.body.user.id

                const result = await usersService.updateUserRole(userId, UserRole.ADMIN)

                expect((result as any).password).toBeUndefined()
                expect((result as any).role).toEqual(UserRole.ADMIN)

                // Revert
                await usersService.updateUserRole(userId, UserRole.USER)
            })

            it('should throw error when user not found', async () => {
                await expect(usersService.updateUserRole('non-existent', UserRole.ADMIN)).rejects.toThrow('User not found')
            })

            it('should throw error for invalid role', async () => {
                await expect(usersService.updateUserRole(createdUserId, 'superadmin' as UserRole)).rejects.toThrow('Invalid role')
            })
        })

        describe('deactivateUser', () => {
            it('should deactivate user successfully', async () => {
                // Create a dedicated user for deactivation
                const uniqueId = Date.now() + Math.random()
                const resp = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/auth/signup')
                    .send({ email: `deact-svc-${uniqueId}@test.com`, password: 'test1234' })
                const userId = resp.body.user.id

                const result = await usersService.deactivateUser(userId, 'some-other-user')

                expect((result as any).password).toBeUndefined()
                expect((result as any).status).toEqual('deleted')
            })

            it('should throw error when deactivating self', async () => {
                await expect(usersService.deactivateUser('user-1', 'user-1')).rejects.toThrow('Cannot deactivate your own account')
            })

            it('should throw error when user not found', async () => {
                await expect(usersService.deactivateUser('non-existent', 'admin-1')).rejects.toThrow('User not found')
            })
        })
    })
}
