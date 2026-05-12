import client from './client'

const getAllMCPServers = (page, limit, filters = {}) =>
    client.get('/mcp-servers', {
        params: {
            // Omit page/limit when caller doesn't want pagination. Sending
            // negative sentinels trips the server's `page cannot be negative`
            // validator (see packages/server/src/utils/pagination.ts) — the
            // server defaults to "no pagination" when the params are absent.
            ...(typeof page === 'number' && page > 0 ? { page } : {}),
            ...(typeof limit === 'number' && limit > 0 ? { limit } : {}),
            ...(filters.transport ? { transport: filters.transport } : {}),
            ...(filters.status ? { status: filters.status } : {})
        }
    })

const getMCPServerById = (id) => client.get(`/mcp-servers/${id}`)

const createMCPServer = (body) => client.post('/mcp-servers', body)

const updateMCPServer = (id, body) => client.put(`/mcp-servers/${id}`, body)

const deleteMCPServer = (id) => client.delete(`/mcp-servers/${id}`)

const toggleMCPServer = (id, enabled) => client.patch(`/mcp-servers/${id}/toggle`, { enabled })

const testMCPServerConnection = (id) => client.post(`/mcp-servers/${id}/test-connection`)

const listMCPServerTools = (id) => client.get(`/mcp-servers/${id}/tools`)

const previewMCPServerTools = (body) => client.post('/mcp-servers/preview-tools', body)

const getMCPServerChangeLog = (id, params = {}) =>
    client.get(`/mcp-servers/${id}/change-log`, {
        params: {
            ...(typeof params.page === 'number' && params.page > 0 ? { page: params.page } : {}),
            ...(typeof params.limit === 'number' && params.limit > 0 ? { limit: params.limit } : {})
        }
    })

export default {
    getAllMCPServers,
    getMCPServerById,
    createMCPServer,
    updateMCPServer,
    deleteMCPServer,
    toggleMCPServer,
    testMCPServerConnection,
    listMCPServerTools,
    previewMCPServerTools,
    getMCPServerChangeLog
}
