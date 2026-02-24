/**
 * Users Service
 * Handles user management operations (admin-only).
 */

import { User, UserRole, UserStatus } from '../../database/entities/User'
import { getDataSource } from '../../DataSource'

export class UsersService {
    /**
     * Get all users. Excludes password field from results.
     * @returns Array of users without password
     */
    async getAllUsers(): Promise<Omit<User, 'password'>[]> {
        const userRepo = getDataSource().getRepository(User)
        const users = await userRepo.find({
            order: { createdDate: 'DESC' }
        })
        return users.map((user) => {
            const { password: _, ...userWithoutPassword } = user as User & { password: string }
            return userWithoutPassword
        }) as Omit<User, 'password'>[]
    }

    /**
     * Get a single user by ID. Excludes password.
     * @param userId - The user ID to look up
     * @returns User without password, or null
     */
    async getUserById(userId: string): Promise<Omit<User, 'password'> | null> {
        const userRepo = getDataSource().getRepository(User)
        const user = await userRepo.findOne({ where: { id: userId } })
        if (!user) return null
        const { password: _, ...userWithoutPassword } = user as User & { password: string }
        return userWithoutPassword as Omit<User, 'password'>
    }

    /**
     * Update a user's role.
     * @param userId - The user ID to update
     * @param role - The new role to assign
     * @returns Updated user without password
     */
    async updateUserRole(userId: string, role: UserRole): Promise<Omit<User, 'password'>> {
        const userRepo = getDataSource().getRepository(User)
        const user = await userRepo.findOne({ where: { id: userId } })

        if (!user) {
            throw new Error('User not found')
        }

        if (!Object.values(UserRole).includes(role)) {
            throw new Error(`Invalid role. Must be one of: ${Object.values(UserRole).join(', ')}`)
        }

        user.role = role
        await userRepo.save(user)

        const { password: _, ...userWithoutPassword } = user as User & { password: string }
        return userWithoutPassword as Omit<User, 'password'>
    }

    /**
     * Deactivate a user by setting their status to DELETED.
     * @param userId - The user ID to deactivate
     * @param requestingUserId - The ID of the user making the request
     * @returns Updated user without password
     */
    async deactivateUser(userId: string, requestingUserId: string): Promise<Omit<User, 'password'>> {
        if (userId === requestingUserId) {
            throw new Error('Cannot deactivate your own account')
        }

        const userRepo = getDataSource().getRepository(User)
        const user = await userRepo.findOne({ where: { id: userId } })

        if (!user) {
            throw new Error('User not found')
        }

        user.status = UserStatus.DELETED
        await userRepo.save(user)

        const { password: _, ...userWithoutPassword } = user as User & { password: string }
        return userWithoutPassword as Omit<User, 'password'>
    }
}
