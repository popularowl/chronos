import client from './client'

const getAllNodes = () => client.get('/nodes')

const getSpecificNode = (name) => client.get(`/nodes/${name}`)
const getNodesByCategory = (name) => client.get(`/nodes/category/${name}`)

const executeCustomFunctionNode = (body) => client.post(`/node-custom-function`, body)

const executeNodeLoadMethod = (name, body) => client.post(`/node-load-method/${name}`, body)

const getChatModels = () => client.get('/nodes/chatmodels')

const generateInstruction = (body) => client.post('/nodes/generate/instruction', body)

export default {
    getAllNodes,
    getSpecificNode,
    executeCustomFunctionNode,
    getNodesByCategory,
    executeNodeLoadMethod,
    getChatModels,
    generateInstruction
}
