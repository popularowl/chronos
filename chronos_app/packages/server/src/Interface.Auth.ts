/**
 * Simplified Authentication Interfaces
 */

export interface SimpleUser {
    id: string
    email: string
    name?: string
    status: string
    role: string
    // Stub properties for compatibility with enterprise code (always undefined in open source)
    activeOrganizationId?: string
    activeWorkspaceId?: string
    activeOrganizationSubscriptionId?: string
}

export interface AuthTokenPayload {
    userId: string
    email: string
    role: string
}

export interface SignupRequest {
    email: string
    password: string
    name?: string
}

export interface LoginRequest {
    email: string
    password: string
}

export interface AuthResponse {
    user: SimpleUser
    token: string
}
