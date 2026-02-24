/**
 * useAuth Hook with Role-Based Access Control
 */

import { useSelector } from 'react-redux'

/**
 * Permissions that require the admin role.
 * All other permissions are accessible to any authenticated user.
 */
const ADMIN_PERMISSIONS = new Set(['users:manage', 'roles:manage', 'sso:manage', 'loginActivity:view'])

export const useAuth = () => {
    const currentUser = useSelector((state) => state.auth.user)
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated)

    /**
     * Check if the current user has the given permission(s).
     * @param {string} permissionStr - Comma-separated permission strings
     * @returns {boolean}
     */
    const hasPermission = (permissionStr) => {
        if (!permissionStr) return true
        if (!currentUser) return false

        const permissions = permissionStr.split(',').map((p) => p.trim())
        const requiresAdmin = permissions.some((p) => ADMIN_PERMISSIONS.has(p))

        if (requiresAdmin) {
            return currentUser.role === 'admin'
        }

        return true
    }

    /**
     * Check if a display flag should be shown.
     * Always returns true for open source (no feature gating).
     * @returns {boolean}
     */
    const hasDisplay = () => {
        return true
    }

    /**
     * Check workspace assignment. Always true for open source.
     * @returns {boolean}
     */
    const hasAssignedWorkspace = () => {
        return true
    }

    return {
        currentUser,
        isAuthenticated,
        hasPermission,
        hasDisplay,
        hasAssignedWorkspace
    }
}
