/**
 * Users Management Routes (admin-only)
 */

import express, { Request, Response } from 'express'
import { authMiddleware, requireRole } from '../../middlewares/auth'
import { UsersService } from '../../services/users'
import { UserRole } from '../../database/entities/User'

const router = express.Router()

// All routes require authentication + admin role
router.use(authMiddleware)
router.use(requireRole(UserRole.ADMIN))

/**
 * POST /api/v1/users
 * Create a new user (admin only)
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        const usersService = new UsersService()
        const user = await usersService.createUser(req.body)
        res.status(201).json(user)
    } catch (error: any) {
        if (error.message === 'User with this email already exists') {
            return res.status(409).json({ error: error.message })
        }
        if (error.message === 'Password must be at least 8 characters long') {
            return res.status(400).json({ error: error.message })
        }
        res.status(500).json({ error: error.message })
    }
})

/**
 * GET /api/v1/users
 * List all registered users (admin only)
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const usersService = new UsersService()
        const users = await usersService.getAllUsers()
        res.json(users)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

/**
 * GET /api/v1/users/:id
 * Get a single user by ID (admin only)
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const usersService = new UsersService()
        const user = await usersService.getUserById(req.params.id)
        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }
        res.json(user)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

/**
 * PUT /api/v1/users/:id/role
 * Update a user's role (admin only)
 */
router.put('/:id/role', async (req: Request, res: Response) => {
    try {
        const { role } = req.body
        if (!role) {
            return res.status(400).json({ error: 'Role is required' })
        }

        const usersService = new UsersService()
        const user = await usersService.updateUserRole(req.params.id, role as UserRole)
        res.json(user)
    } catch (error: any) {
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message })
        }
        res.status(400).json({ error: error.message })
    }
})

/**
 * DELETE /api/v1/users/:id
 * Deactivate a user (admin only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const usersService = new UsersService()
        const user = await usersService.deactivateUser(req.params.id, req.userId!)
        res.json(user)
    } catch (error: any) {
        if (error.message === 'User not found') {
            return res.status(404).json({ error: error.message })
        }
        if (error.message === 'Cannot deactivate your own account') {
            return res.status(400).json({ error: error.message })
        }
        res.status(500).json({ error: error.message })
    }
})

export default router
