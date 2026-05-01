import client from './client'

const getAllMCPServers = (page, limit, filters = {}) =>
    client.get('/mcp-servers', {
        params: {
            page,
            limit,
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

export default {
    getAllMCPServers,
    getMCPServerById,
    createMCPServer,
    updateMCPServer,
    deleteMCPServer,
    toggleMCPServer,
    testMCPServerConnection,
    listMCPServerTools
}
