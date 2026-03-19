import { useAuth } from '@/hooks/useAuth'
import { useConfig } from '@/store/context/ConfigContext'
import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'

/**
 * Component that redirects users to the first accessible page based on their permissions
 * This prevents 403 errors when users don't have access to the default agentflows page
 */
export const DefaultRedirect = () => {
    const { hasPermission, hasDisplay } = useAuth()
    const { isOpenSource } = useConfig()
    const isGlobal = useSelector((state) => state.auth.isGlobal)
    const isAuthenticated = useSelector((state) => state.auth.isAuthenticated)

    // Define the order of routes to check (based on the menu order in dashboard.js)
    const routesToCheck = [
        { path: '/agentflows', permission: 'agentflows:view' },
        { path: '/agentflows', permission: 'agentflows:view' },
        { path: '/executions', permission: 'executions:view' },
        { path: '/templates', permission: 'templates:marketplace,templates:custom' },
        { path: '/tools', permission: 'tools:view' },
        { path: '/credentials', permission: 'credentials:view' },
        { path: '/variables', permission: 'variables:view' },
        { path: '/apikey', permission: 'apikeys:view' },
        { path: '/document-stores', permission: 'documentStores:view' },
        // Evaluation routes (with display flags)
        { path: '/datasets', permission: 'datasets:view', display: 'feat:datasets' },
        { path: '/evaluators', permission: 'evaluators:view', display: 'feat:evaluators' },
        { path: '/evaluations', permission: 'evaluations:view', display: 'feat:evaluations' },
        // Management routes (with display flags)
        { path: '/sso-config', permission: 'sso:manage', display: 'feat:sso-config' },
        { path: '/roles', permission: 'roles:manage', display: 'feat:roles' },
        { path: '/users', permission: 'users:manage', display: 'feat:users' },
        { path: '/workspaces', permission: 'workspace:view', display: 'feat:workspaces' },
        { path: '/login-activity', permission: 'loginActivity:view', display: 'feat:login-activity' },
        // Other routes
        { path: '/logs', permission: 'logs:view', display: 'feat:logs' },
        { path: '/account', display: 'feat:account' }
    ]

    // If user is not authenticated, redirect to login page
    if (!isAuthenticated) {
        return <Navigate to='/login' replace />
    }

    // For open source or global admins, show agentflows
    if (isOpenSource || isGlobal) {
        return <Navigate to='/agentflows' replace />
    }

    // Check each route in order and redirect to the first accessible one
    for (const route of routesToCheck) {
        const { path, permission, display } = route

        // Check permission if specified
        const hasRequiredPermission = !permission || hasPermission(permission)

        // Check display flag if specified
        const hasRequiredDisplay = !display || hasDisplay(display)

        // If user has both required permission and display access, redirect there
        if (hasRequiredPermission && hasRequiredDisplay) {
            return <Navigate to={path} replace />
        }
    }

    // If no accessible routes found, show unauthorized page
    return <Navigate to='/unauthorized' replace />
}
