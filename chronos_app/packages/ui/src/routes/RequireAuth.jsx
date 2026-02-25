/**
 * RequireAuth Component with Role-Based Access Control
 */

import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { Navigate } from 'react-router'
import { useLocation } from 'react-router-dom'

/**
 * Maps permission strings to the roles that are allowed access.
 * Permissions not listed here are accessible to all authenticated users.
 */
const ADMIN_PERMISSIONS = new Set(['users:manage', 'roles:manage', 'sso:manage', 'loginActivity:view'])

export const RequireAuth = ({ children, permission }) => {
    const location = useLocation()
    const currentUser = useSelector((state) => state.auth.user)
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated)

    // Redirect to login if user is not authenticated
    if (!isAuthenticated || !currentUser) {
        return <Navigate to='/login' replace state={{ path: location.pathname }} />
    }

    // Check role-based permission if a permission prop is provided
    if (permission) {
        const permissions = permission.split(',').map((p) => p.trim())
        const requiresAdmin = permissions.some((p) => ADMIN_PERMISSIONS.has(p))

        if (requiresAdmin && currentUser.role !== 'admin') {
            return <Navigate to='/unauthorized' replace />
        }
    }

    // User is authenticated and authorized, render children
    return children
}

RequireAuth.propTypes = {
    children: PropTypes.element,
    permission: PropTypes.string
}
