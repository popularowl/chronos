import client from './client'

// Existing login-activity endpoints (separate v1.7 enterprise feature)
const fetchLoginActivity = (body) => client.post(`/audit/login-activity`, body)
const deleteLoginActivity = (body) => client.post(`/audit/login-activity/delete`, body)

// v1.7 § 3a/3b — tool-invocation audit
const fetchToolInvocations = (params) => client.get(`/audit/tool-invocations`, { params })
const exportToolInvocationsCsv = (params) =>
    client.get(`/audit/tool-invocations`, { params: { ...params, format: 'csv' }, responseType: 'blob' })

// v1.7 § 3d — credential-access audit (credentialId-scoped read; full filter API TBD)
const fetchCredentialAccess = (credentialId) => client.get(`/audit/credential-access`, { params: { credentialId } })

export default {
    fetchLoginActivity,
    deleteLoginActivity,
    fetchToolInvocations,
    exportToolInvocationsCsv,
    fetchCredentialAccess
}
