import client from './client'

const getAllWebhooks = (page, limit, agentflowId) =>
    client.get('/webhooks', { params: { page, limit, ...(agentflowId ? { agentflowId } : {}) } })

const getWebhookById = (id) => client.get(`/webhooks/${id}`)

const createWebhook = (body) => client.post('/webhooks', body)

const updateWebhook = (id, body) => client.put(`/webhooks/${id}`, body)

const deleteWebhook = (id) => client.delete(`/webhooks/${id}`)

const toggleWebhook = (id, enabled) => client.patch(`/webhooks/${id}/toggle`, { enabled })

const getWebhookDeliveries = (id, page, limit) => client.get(`/webhooks/${id}/deliveries`, { params: { page, limit } })

const regenerateSecret = (id) => client.post(`/webhooks/${id}/regenerate-secret`)

const testWebhook = (id) => client.post(`/webhooks/${id}/test`)

export default {
    getAllWebhooks,
    getWebhookById,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    toggleWebhook,
    getWebhookDeliveries,
    regenerateSecret,
    testWebhook
}
