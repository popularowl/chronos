const mockGetBearerTokenProvider = jest.fn().mockReturnValue(jest.fn())
const mockDefaultAzureCredential = jest.fn()

jest.mock('@azure/identity', () => ({
    DefaultAzureCredential: mockDefaultAzureCredential,
    getBearerTokenProvider: mockGetBearerTokenProvider
}))

jest.mock('../../../src/utils', () => ({
    getBaseClasses: jest.fn(() => ['BaseChatModel', 'BaseLLM']),
    getCredentialData: jest.fn(),
    getCredentialParam: jest.fn()
}))

jest.mock('../../../src/modelLoader', () => ({
    getModels: jest.fn().mockResolvedValue([
        { label: 'gpt-4o', name: 'gpt-4o' },
        { label: 'gpt-4o-mini', name: 'gpt-4o-mini' }
    ]),
    MODEL_TYPE: { CHAT: 'chat' }
}))

// Must mock after @azure/identity since ChronosAzureAIFoundry extends AzureChatOpenAI
jest.mock('@langchain/openai', () => {
    class MockAzureChatOpenAI {
        azureOpenAIEndpoint: any
        azureOpenAIApiDeploymentName: any
        azureOpenAIApiVersion: any
        azureADTokenProvider: any
        modelName: any
        model: any
        temperature: any
        maxTokens: any
        topP: any
        frequencyPenalty: any
        presencePenalty: any
        timeout: any
        streaming: any
        cache: any

        constructor(fields: any) {
            Object.assign(this, fields)
        }
    }
    return {
        AzureChatOpenAI: MockAzureChatOpenAI,
        __esModule: true
    }
})

import { INodeData, ICommonObject } from '../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../src/utils'
import { getModels } from '../../../src/modelLoader'

const { nodeClass: AzureAIFoundry_ChatModels } = require('./AzureAIFoundry')

const mockedGetCredentialData = getCredentialData as jest.MockedFunction<typeof getCredentialData>
const mockedGetCredentialParam = getCredentialParam as jest.MockedFunction<typeof getCredentialParam>

function createNodeData(overrides: Partial<INodeData['inputs']> = {}): INodeData {
    return {
        id: 'test-node-1',
        label: 'Azure AI Foundry',
        name: 'azureAIFoundry',
        type: 'AzureAIFoundry',
        icon: 'Azure.svg',
        version: 1.0,
        category: 'Chat Models',
        baseClasses: ['AzureAIFoundry', 'BaseChatModel'],
        credential: 'cred-123',
        inputs: {
            modelName: 'gpt-4o',
            temperature: '0.9',
            ...overrides
        }
    }
}

function setupCredentialMocks(creds: Record<string, any> = {}) {
    const defaults: Record<string, any> = {
        azureAIFoundryEndpoint: 'https://my-project.cognitiveservices.azure.com/',
        azureAIFoundryDeploymentName: 'gpt-4o-deployment',
        azureAIFoundryApiVersion: '2024-10-21',
        azureClientId: undefined,
        ...creds
    }
    mockedGetCredentialData.mockResolvedValue(defaults)
    mockedGetCredentialParam.mockImplementation((paramName: string) => {
        return defaults[paramName]
    })
}

const mockOptions: ICommonObject = {
    appDataSource: {},
    databaseEntities: {}
}

describe('AzureAIFoundry', () => {
    let nodeClass: any

    beforeEach(() => {
        jest.clearAllMocks()
        nodeClass = new AzureAIFoundry_ChatModels()
    })

    describe('Constructor', () => {
        it('should set correct node metadata', () => {
            expect(nodeClass.label).toBe('Azure AI Foundry')
            expect(nodeClass.name).toBe('azureAIFoundry')
            expect(nodeClass.version).toBe(1.0)
            expect(nodeClass.type).toBe('AzureAIFoundry')
            expect(nodeClass.category).toBe('Chat Models')
            expect(nodeClass.icon).toBe('Azure.svg')
        })

        it('should require azureAIFoundryApi credential', () => {
            expect(nodeClass.credential.credentialNames).toEqual(['azureAIFoundryApi'])
            expect(nodeClass.credential.type).toBe('credential')
        })

        it('should define expected input parameters', () => {
            const inputNames = nodeClass.inputs.map((i: any) => i.name)
            expect(inputNames).toEqual([
                'cache',
                'modelName',
                'temperature',
                'maxTokens',
                'topP',
                'frequencyPenalty',
                'presencePenalty',
                'timeout'
            ])
        })

        it('should have AzureAIFoundry in baseClasses', () => {
            expect(nodeClass.baseClasses).toContain('AzureAIFoundry')
        })

        it('should set modelName default to gpt-4o', () => {
            const modelInput = nodeClass.inputs.find((i: any) => i.name === 'modelName')
            expect(modelInput.default).toBe('gpt-4o')
            expect(modelInput.type).toBe('asyncOptions')
            expect(modelInput.loadMethod).toBe('listModels')
        })

        it('should set temperature default to 0.9', () => {
            const tempInput = nodeClass.inputs.find((i: any) => i.name === 'temperature')
            expect(tempInput.default).toBe(0.9)
            expect(tempInput.optional).toBe(true)
        })

        it('should mark advanced params as additionalParams', () => {
            const advancedParams = ['maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty', 'timeout']
            for (const name of advancedParams) {
                const input = nodeClass.inputs.find((i: any) => i.name === name)
                expect(input.additionalParams).toBe(true)
                expect(input.optional).toBe(true)
            }
        })
    })

    describe('loadMethods.listModels', () => {
        it('should call getModels with CHAT type and azureAIFoundry', async () => {
            const result = await nodeClass.loadMethods.listModels()
            expect(getModels).toHaveBeenCalledWith('chat', 'azureAIFoundry')
            expect(result).toEqual([
                { label: 'gpt-4o', name: 'gpt-4o' },
                { label: 'gpt-4o-mini', name: 'gpt-4o-mini' }
            ])
        })
    })

    describe('init', () => {
        it('should create model with basic configuration', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData()

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model).toBeDefined()
            expect(model.azureOpenAIApiDeploymentName).toBe('gpt-4o-deployment')
            expect(model.azureOpenAIApiVersion).toBe('2024-10-21')
            expect(model.temperature).toBe(0.9)
            expect(model.modelName).toBe('gpt-4o')
            expect(model.streaming).toBe(true)
        })

        it('should strip trailing slash from endpoint', async () => {
            setupCredentialMocks({ azureAIFoundryEndpoint: 'https://my-project.cognitiveservices.azure.com/' })
            const nodeData = createNodeData()

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.azureOpenAIEndpoint).toBe('https://my-project.cognitiveservices.azure.com')
        })

        it('should handle endpoint without trailing slash', async () => {
            setupCredentialMocks({ azureAIFoundryEndpoint: 'https://my-project.cognitiveservices.azure.com' })
            const nodeData = createNodeData()

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.azureOpenAIEndpoint).toBe('https://my-project.cognitiveservices.azure.com')
        })

        it('should use DefaultAzureCredential without client ID by default', async () => {
            setupCredentialMocks({ azureClientId: undefined })
            const nodeData = createNodeData()

            await nodeClass.init(nodeData, '', mockOptions)

            expect(mockDefaultAzureCredential).toHaveBeenCalledWith({})
            expect(mockGetBearerTokenProvider).toHaveBeenCalledWith(
                expect.any(Object),
                'https://cognitiveservices.azure.com/.default'
            )
        })

        it('should pass managedIdentityClientId when azureClientId is provided', async () => {
            setupCredentialMocks({ azureClientId: 'my-client-id-123' })
            const nodeData = createNodeData()

            await nodeClass.init(nodeData, '', mockOptions)

            expect(mockDefaultAzureCredential).toHaveBeenCalledWith({
                managedIdentityClientId: 'my-client-id-123'
            })
        })

        it('should set optional parameters when provided', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData({
                modelName: 'gpt-4o-mini',
                temperature: '0.5',
                maxTokens: '4096',
                topP: '0.8',
                frequencyPenalty: '0.3',
                presencePenalty: '0.6',
                timeout: '30000'
            })

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.temperature).toBe(0.5)
            expect(model.maxTokens).toBe(4096)
            expect(model.topP).toBe(0.8)
            expect(model.frequencyPenalty).toBe(0.3)
            expect(model.presencePenalty).toBe(0.6)
            expect(model.timeout).toBe(30000)
        })

        it('should not set optional parameters when not provided', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData({
                modelName: 'gpt-4o',
                temperature: '0.9'
            })

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.maxTokens).toBeUndefined()
            expect(model.topP).toBeUndefined()
            expect(model.frequencyPenalty).toBeUndefined()
            expect(model.presencePenalty).toBeUndefined()
            expect(model.timeout).toBeUndefined()
        })

        it('should enable streaming by default', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData()

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.streaming).toBe(true)
        })

        it('should respect explicit streaming=false', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData({ streaming: false })

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.streaming).toBe(false)
        })

        it('should set cache when provided', async () => {
            setupCredentialMocks()
            const mockCache = { lookup: jest.fn(), update: jest.fn() }
            const nodeData = createNodeData({ cache: mockCache })

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.cache).toBe(mockCache)
        })

        it('should set multiModalOption with image uploads disabled', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData()

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.multiModalOption).toEqual({
                image: { allowImageUploads: false }
            })
        })

        it('should store configuredModel from modelName', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData({ modelName: 'gpt-4o-mini' })

            const model = await nodeClass.init(nodeData, '', mockOptions)

            expect(model.configuredModel).toBe('gpt-4o-mini')
        })

        it('should call getCredentialData with credential ID', async () => {
            setupCredentialMocks()
            const nodeData = createNodeData()

            await nodeClass.init(nodeData, '', mockOptions)

            expect(mockedGetCredentialData).toHaveBeenCalledWith('cred-123', mockOptions)
        })
    })
})
