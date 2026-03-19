import client from './client'

const createAttachment = (agentflowid, chatid, formData) =>
    client.post(`/attachments/${agentflowid}/${chatid}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    })

export default {
    createAttachment
}
