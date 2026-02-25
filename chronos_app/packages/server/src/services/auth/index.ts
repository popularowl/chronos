/**
 * Simple Authentication Service
 */

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { User, UserStatus, UserRole } from '../../database/entities/User'
import { getDataSource } from '../../DataSource'
import { SignupRequest, LoginRequest, AuthResponse, SimpleUser } from '../../Interface.Auth'

export class AuthService {
    private static readonly SALT_ROUNDS = 10
    private static readonly JWT_SECRET = process.env.JWT_AUTH_TOKEN_SECRET || 'chronos-auth-secret-key'
    private static readonly JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d'

    async signup(data: SignupRequest): Promise<AuthResponse> {
        const { email, password, name } = data

        if (!email || !password) {
            throw new Error('Email and password are required')
        }

        const userRepo = getDataSource().getRepository(User)

        // Check if user exists
        const existingUser = await userRepo.findOne({ where: { email: email.toLowerCase() } })
        if (existingUser) {
            throw new Error('User with this email already exists')
        }

        // Validate password strength
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long')
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, AuthService.SALT_ROUNDS)

        // Assign admin role if this is the first user, otherwise user role
        const userCount = await userRepo.count()
        const assignedRole = userCount === 0 ? UserRole.ADMIN : UserRole.USER

        // Create user
        const user = new User()
        user.id = uuidv4()
        user.email = email.toLowerCase()
        user.password = hashedPassword
        user.name = name || ''
        user.status = UserStatus.ACTIVE
        user.role = assignedRole

        await userRepo.save(user)

        // Generate token
        const token = this.generateToken(user)

        return {
            user: this.toSimpleUser(user),
            token
        }
    }

    async login(data: LoginRequest): Promise<AuthResponse> {
        const { email, password } = data

        if (!email || !password) {
            throw new Error('Email and password are required')
        }

        const userRepo = getDataSource().getRepository(User)

        const user = await userRepo.findOne({ where: { email: email.toLowerCase() } })
        if (!user) {
            throw new Error('Invalid email or password')
        }

        if (user.status !== UserStatus.ACTIVE) {
            throw new Error('Account is not active')
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) {
            throw new Error('Invalid email or password')
        }

        // Generate token
        const token = this.generateToken(user)

        return {
            user: this.toSimpleUser(user),
            token
        }
    }

    async getCurrentUser(userId: string): Promise<SimpleUser | null> {
        const userRepo = getDataSource().getRepository(User)
        const user = await userRepo.findOne({ where: { id: userId } })
        return user ? this.toSimpleUser(user) : null
    }

    verifyToken(token: string): { userId: string; email: string; role: string } | null {
        try {
            const payload = jwt.verify(token, AuthService.JWT_SECRET) as { userId: string; email: string; role: string }
            return { userId: payload.userId, email: payload.email, role: payload.role }
        } catch {
            return null
        }
    }

    private generateToken(user: User): string {
        return jwt.sign({ userId: user.id, email: user.email, role: user.role }, AuthService.JWT_SECRET, {
            expiresIn: AuthService.JWT_EXPIRES_IN
        } as jwt.SignOptions)
    }

    private toSimpleUser(user: User): SimpleUser {
        return {
            id: user.id,
            email: user.email,
            name: user.name || undefined,
            status: user.status,
            role: user.role
        }
    }
}
