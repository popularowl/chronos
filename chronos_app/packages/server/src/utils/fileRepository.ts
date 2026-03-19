import { AgentFlow } from '../database/entities/AgentFlow'
import { IReactFlowObject } from '../Interface'
import { addBase64FilesToStorage } from 'chronos-components'

export const containsBase64File = (agentflow: AgentFlow) => {
    const parsedFlowData: IReactFlowObject = JSON.parse(agentflow.flowData)
    const re = new RegExp('^data.*;base64', 'i')
    let found = false
    const nodes = parsedFlowData.nodes
    for (const node of nodes) {
        if (node.data.category !== 'Document Loaders') {
            continue
        }
        const inputs = node.data.inputs
        if (inputs) {
            const keys = Object.getOwnPropertyNames(inputs)
            for (let i = 0; i < keys.length; i++) {
                const input = inputs[keys[i]]
                if (!input) {
                    continue
                }
                if (typeof input !== 'string') {
                    continue
                }
                if (input.startsWith('[')) {
                    try {
                        const files = JSON.parse(input)
                        for (let j = 0; j < files.length; j++) {
                            const file = files[j]
                            if (re.test(file)) {
                                found = true
                                break
                            }
                        }
                    } catch (e) {
                        continue
                    }
                }
                if (re.test(input)) {
                    found = true
                    break
                }
            }
        }
    }
    return found
}

export const updateFlowDataWithFilePaths = async (agentflowid: string, flowData: string) => {
    try {
        const parsedFlowData: IReactFlowObject = JSON.parse(flowData)
        const re = new RegExp('^data.*;base64', 'i')
        const nodes = parsedFlowData.nodes
        const orgId = ''

        for (let j = 0; j < nodes.length; j++) {
            const node = nodes[j]
            if (node.data.category !== 'Document Loaders') {
                continue
            }
            if (node.data.inputs) {
                const inputs = node.data.inputs
                const keys = Object.getOwnPropertyNames(inputs)
                for (let i = 0; i < keys.length; i++) {
                    const fileNames: string[] = []
                    const key = keys[i]
                    const input = inputs?.[key]
                    if (!input) {
                        continue
                    }
                    if (typeof input !== 'string') {
                        continue
                    }
                    if (input.startsWith('[')) {
                        try {
                            const files = JSON.parse(input)
                            for (let j = 0; j < files.length; j++) {
                                const file = files[j]
                                if (re.test(file)) {
                                    const { path } = await addBase64FilesToStorage(file, agentflowid, fileNames, orgId)
                                    node.data.inputs[key] = path
                                }
                            }
                        } catch (e) {
                            continue
                        }
                    } else if (re.test(input)) {
                        const { path } = await addBase64FilesToStorage(input, agentflowid, fileNames, orgId)
                        node.data.inputs[key] = path
                    }
                }
            }
        }
        return JSON.stringify(parsedFlowData)
    } catch (e: any) {
        throw new Error(`Error updating flow data with file paths: ${e.message}`)
    }
}
