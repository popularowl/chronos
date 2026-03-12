/**
 * Users Service
 * Handles user management operations (admin-only).
 */

import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { User, UserRole, UserStatus } from '../../database/entities/User'
import { getDataSource } from '../../DataSource'

const SALT_ROUNDS = 10

export class UsersService {
    /**
     * Create a new user (admin-only).
     * @param data - User creation data
     * @returns Created user without password
     */
    async createUser(data: { email: string; password: string; name?: string; role?: UserRole }): Promise<Omit<User, 'password'>> {
        const { email, password, name, role } = data

        if (!email || !password) {
            throw new Error('Email and password are required')
        }

        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long')
        }

        const userRepo = getDataSource().getRepository(User)

        const existingUser = await userRepo.findOne({ where: { email: email.toLowerCase() } })
        if (existingUser) {
            throw new Error('User with this email already exists')
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)

        const user = new User()
        user.id = uuidv4()
        user.email = email.toLowerCase()
        user.password = hashedPassword
        user.name = name || ''
        user.status = UserStatus.ACTIVE
        user.role = role && Object.values(UserRole).includes(role) ? role : UserRole.USER

        await userRepo.save(user)

        const { password: _, ...userWithoutPassword } = user as User & { password: string }
        return userWithoutPassword as Omit<User, 'password'>
    }

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
