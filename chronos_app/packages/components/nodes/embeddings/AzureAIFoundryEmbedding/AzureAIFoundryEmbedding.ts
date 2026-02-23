import { AzureOpenAIInput, AzureOpenAIEmbeddings, OpenAIEmbeddingsParams } from '@langchain/openai'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getCredentialData, getCredentialParam } from '../../../src/utils'

/**
 * Azure AI Foundry Embedding node that uses Managed Identity authentication
 * via DefaultAzureCredential. Reuses the existing azureAIFoundryApi credential.
 */
class AzureAIFoundryEmbedding_Embeddings implements INode {
    label: string
    name: string
    version: number
    type: string
    icon: string
    category: string
    description: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'Azure AI Foundry Embeddings'
        this.name = 'azureAIFoundryEmbeddings'
        this.version = 1.0
        this.type = 'AzureAIFoundryEmbeddings'
        this.icon = 'Azure.svg'
        this.category = 'Embeddings'
        this.description = 'Azure AI Foundry Embeddings with Managed Identity support'
        this.baseClasses = [this.type, ...getBaseClasses(AzureOpenAIEmbeddings)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['azureAIFoundryApi']
        }
        this.inputs = [
            {
                label: 'Batch Size',
                name: 'batchSize',
                type: 'number',
                default: '100',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Timeout',
                name: 'timeout',
                type: 'number',
                optional: true,
                additionalParams: true
            }
        ]
    }

    /**
     * Initializes AzureOpenAIEmbeddings with Managed Identity authentication
     * using DefaultAzureCredential and getBearerTokenProvider from @azure/identity.
     */
    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const batchSize = nodeData.inputs?.batchSize as string
        const timeout = nodeData.inputs?.timeout as string

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const endpoint = getCredentialParam('azureAIFoundryEndpoint', credentialData, nodeData)
        const deploymentName = getCredentialParam('azureAIFoundryDeploymentName', credentialData, nodeData)
        const apiVersion = getCredentialParam('azureAIFoundryApiVersion', credentialData, nodeData)
        const azureClientId = getCredentialParam('azureClientId', credentialData, nodeData)

        // Use Managed Identity via DefaultAzureCredential
        const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity')

        const credentialOptions: any = {}
        if (azureClientId) {
            credentialOptions.managedIdentityClientId = azureClientId
        }

        const credential = new DefaultAzureCredential(credentialOptions)
        const scope = 'https://cognitiveservices.azure.com/.default'

        const obj: Partial<OpenAIEmbeddingsParams> & Partial<AzureOpenAIInput> = {
            azureOpenAIEndpoint: endpoint?.replace(/\/$/, ''),
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiVersion: apiVersion,
            azureADTokenProvider: getBearerTokenProvider(credential, scope)
        }

        if (batchSize) obj.batchSize = parseInt(batchSize, 10)
        if (timeout) obj.timeout = parseInt(timeout, 10)

        const model = new AzureOpenAIEmbeddings(obj)
        return model
    }
}

module.exports = { nodeClass: AzureAIFoundryEmbedding_Embeddings }
