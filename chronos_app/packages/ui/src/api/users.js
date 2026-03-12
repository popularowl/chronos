import client from './client'

/**
 * Users Management API (admin only)
 */

/** @returns {Promise} All registered users */
const getAllUsers = () => client.get('/users')

/** @param {string} id - User ID */
const getUserById = (id) => client.get(`/users/${id}`)

/**
 * @param {string} id - User ID
 * @param {string} role - New role ('admin' or 'user')
 */
const updateUserRole = (id, role) => client.put(`/users/${id}/role`, { role })

/**
 * Create a new user (admin only)
 * @param {object} data - { email, password, name?, role? }
 */
const createUser = (data) => client.post('/users', data)

/** @param {string} id - User ID to deactivate */
const deactivateUser = (id) => client.delete(`/users/${id}`)

export default {
    getAllUsers,
    getUserById,
    updateUserRole,
    createUser,
    deactivateUser
}
