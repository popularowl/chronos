import client from './client'

const getInternalChatmessageFromAgentflow = (id, params = {}) =>
    client.get(`/internal-chatmessage/${id}`, { params: { feedback: true, ...params } })
const getAllChatmessageFromAgentflow = (id, params = {}) =>
    client.get(`/chatmessage/${id}`, { params: { order: 'DESC', feedback: true, ...params } })
const getChatmessageFromPK = (id, params = {}) => client.get(`/chatmessage/${id}`, { params: { order: 'ASC', feedback: true, ...params } })
const deleteChatmessage = (id, params = {}) => client.delete(`/chatmessage/${id}`, { params: { ...params } })
const getStoragePath = () => client.get(`/get-upload-path`)
const abortMessage = (agentflowid, chatid) => client.put(`/chatmessage/abort/${agentflowid}/${chatid}`)

export default {
    getInternalChatmessageFromAgentflow,
    getAllChatmessageFromAgentflow,
    getChatmessageFromPK,
    deleteChatmessage,
    getStoragePath,
    abortMessage
}
