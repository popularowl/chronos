import { AzureChatOpenAI as LangchainAzureChatOpenAI, AzureOpenAIInput, ChatOpenAIFields } from '@langchain/openai'
import { BaseCache } from '@langchain/core/caches'
import { ICommonObject, IMultiModalOption, INode, INodeData, INodeOptionsValue, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getCredentialData, getCredentialParam } from '../../../src/utils'
import { getModels, MODEL_TYPE } from '../../../src/modelLoader'
import { AzureAIFoundryChatOpenAI } from './ChronosAzureAIFoundry'

class AzureAIFoundry_LLMs implements INode {
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
        this.label = 'Azure AI Foundry'
        this.name = 'azureAIFoundry'
        this.version = 1.0
        this.type = 'AzureAIFoundry'
        this.icon = 'Azure.svg'
        this.category = 'Chat Models'
        this.description = 'Azure AI Foundry Chat Model with private endpoint support using Managed Identity or API Key'
        this.baseClasses = [this.type, ...getBaseClasses(LangchainAzureChatOpenAI)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['azureAIFoundryApi']
        }
        this.inputs = [
            {
                label: 'Cache',
                name: 'cache',
                type: 'BaseCache',
                optional: true
            },
            {
                label: 'Model Name',
                name: 'modelName',
                type: 'asyncOptions',
                loadMethod: 'listModels',
                default: 'gpt-4o'
            },
            {
                label: 'Temperature',
                name: 'temperature',
                type: 'number',
                step: 0.1,
                default: 0.9,
                optional: true
            },
            {
                label: 'Max Tokens',
                name: 'maxTokens',
                type: 'number',
                step: 1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Top Probability',
                name: 'topP',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Frequency Penalty',
                name: 'frequencyPenalty',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Presence Penalty',
                name: 'presencePenalty',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Timeout',
                name: 'timeout',
                type: 'number',
                step: 1,
                optional: true,
                additionalParams: true
            }
        ]
    }

    //@ts-ignore
    loadMethods = {
        async listModels(): Promise<INodeOptionsValue[]> {
            return await getModels(MODEL_TYPE.CHAT, 'azureAIFoundry')
        }
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const temperature = nodeData.inputs?.temperature as string
        const modelName = nodeData.inputs?.modelName as string
        const maxTokens = nodeData.inputs?.maxTokens as string
        const topP = nodeData.inputs?.topP as string
        const frequencyPenalty = nodeData.inputs?.frequencyPenalty as string
        const presencePenalty = nodeData.inputs?.presencePenalty as string
        const timeout = nodeData.inputs?.timeout as string
        const streaming = nodeData.inputs?.streaming as boolean

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const authMethod = getCredentialParam('authMethod', credentialData, nodeData)
        const azureAIFoundryEndpoint = getCredentialParam('azureAIFoundryEndpoint', credentialData, nodeData)
        const azureAIFoundryApiKey = getCredentialParam('azureAIFoundryApiKey', credentialData, nodeData)
        const azureAIFoundryDeploymentName = getCredentialParam('azureAIFoundryDeploymentName', credentialData, nodeData)
        const azureAIFoundryApiVersion = getCredentialParam('azureAIFoundryApiVersion', credentialData, nodeData)
        const azureClientId = getCredentialParam('azureClientId', credentialData, nodeData)

        const cache = nodeData.inputs?.cache as BaseCache

        // Prepare configuration based on authentication method
        const obj: ChatOpenAIFields & Partial<AzureOpenAIInput> = {
            temperature: parseFloat(temperature),
            modelName,
            azureOpenAIApiDeploymentName: azureAIFoundryDeploymentName,
            azureOpenAIApiVersion: azureAIFoundryApiVersion,
            streaming: streaming ?? true
        }

        if (authMethod === 'managedIdentity') {
            // For Managed Identity, we use azureADTokenProvider
            // The @langchain/openai library will use DefaultAzureCredential automatically
            // when azureADTokenProvider is set and no API key is provided
            obj.azureOpenAIEndpoint = azureAIFoundryEndpoint?.replace(/\/$/, '')

            // Import and configure Azure Identity for Managed Identity
            const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity')

            // Configure credential options for User-Assigned Managed Identity if Client ID is provided
            const credentialOptions: any = {}
            if (azureClientId) {
                credentialOptions.managedIdentityClientId = azureClientId
            }

            const credential = new DefaultAzureCredential(credentialOptions)
            const scope = 'https://cognitiveservices.azure.com/.default'
            obj.azureADTokenProvider = getBearerTokenProvider(credential, scope)
        } else {
            // For API Key authentication
            obj.azureOpenAIApiKey = azureAIFoundryApiKey
            obj.azureOpenAIEndpoint = azureAIFoundryEndpoint?.replace(/\/$/, '')
        }

        if (maxTokens) obj.maxTokens = parseInt(maxTokens, 10)
        if (topP) obj.topP = parseFloat(topP)
        if (frequencyPenalty) obj.frequencyPenalty = parseFloat(frequencyPenalty)
        if (presencePenalty) obj.presencePenalty = parseFloat(presencePenalty)
        if (timeout) obj.timeout = parseInt(timeout, 10)
        if (cache) obj.cache = cache

        const multiModalOption: IMultiModalOption = {
            image: {
                allowImageUploads: false
            }
        }

        const model = new AzureAIFoundryChatOpenAI(nodeData.id, obj)
        model.setMultiModalOption(multiModalOption)
        return model
    }
}

module.exports = { nodeClass: AzureAIFoundry_LLMs }
