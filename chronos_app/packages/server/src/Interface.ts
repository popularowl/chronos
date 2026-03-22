import {
    IAction,
    ICommonObject,
    IFileUpload,
    IHumanInput,
    INode,
    INodeData as INodeDataFromComponent,
    INodeExecutionData,
    INodeParams,
    IServerSideEventStreamer
} from 'chronos-components'
import { DataSource } from 'typeorm'
import { CachePool } from './CachePool'
import { Telemetry } from './utils/telemetry'
import { UsageCacheManager } from './UsageCacheManager'

export type MessageType = 'apiMessage' | 'userMessage'

export type AgentflowType = 'ASSISTANT' | 'AGENTFLOW'

export type ExecutionState = 'INPROGRESS' | 'FINISHED' | 'ERROR' | 'TERMINATED' | 'TIMEOUT' | 'STOPPED'

export enum MODE {
    QUEUE = 'queue',
    MAIN = 'main'
}

export enum ChatType {
    INTERNAL = 'INTERNAL',
    EXTERNAL = 'EXTERNAL',
    EVALUATION = 'EVALUATION'
}

export enum ChatMessageRatingType {
    THUMBS_UP = 'THUMBS_UP',
    THUMBS_DOWN = 'THUMBS_DOWN'
}

export enum Platform {
    OPEN_SOURCE = 'open source',
    CLOUD = 'cloud',
    ENTERPRISE = 'enterprise'
}

export enum UserPlan {
    STARTER = 'STARTER',
    PRO = 'PRO',
    FREE = 'FREE'
}

/**
 * Databases
 */
export interface IAgentFlow {
    id: string
    name: string
    flowData: string
    updatedDate: Date
    createdDate: Date
    deployed?: boolean
    isPublic?: boolean
    apikeyid?: string
    analytic?: string
    speechToText?: string
    textToSpeech?: string
    chatbotConfig?: string
    followUpPrompts?: string
    apiConfig?: string
    category?: string
    type?: AgentflowType
    userId?: string
}

export interface IChatMessage {
    id: string
    role: MessageType
    content: string
    agentflowid: string
    executionId?: string
    sourceDocuments?: string
    usedTools?: string
    fileAnnotations?: string
    agentReasoning?: string
    fileUploads?: string
    artifacts?: string
    chatType: string
    chatId: string
    memoryType?: string
    sessionId?: string
    createdDate: Date
    leadEmail?: string
    action?: string | null
    followUpPrompts?: string
}

export interface IChatMessageFeedback {
    id: string
    content?: string
    agentflowid: string
    chatId: string
    messageId: string
    rating: ChatMessageRatingType
    createdDate: Date
}

export interface ITool {
    id: string
    name: string
    description: string
    color: string
    iconSrc?: string
    schema?: string
    func?: string
    updatedDate: Date
    createdDate: Date
}

export interface ISkill {
    id: string
    name: string
    description: string
    category: string
    color: string
    iconSrc?: string
    content: string
    updatedDate: Date
    createdDate: Date
}

export interface IAssistant {
    id: string
    details: string
    credential: string
    iconSrc?: string
    updatedDate: Date
    createdDate: Date
}

export interface ICredential {
    id: string
    name: string
    credentialName: string
    encryptedData: string
    updatedDate: Date
    createdDate: Date
    userId?: string
}

export interface IVariable {
    id: string
    name: string
    value: string
    type: string
    updatedDate: Date
    createdDate: Date
}

export interface ILead {
    id: string
    name?: string
    email?: string
    phone?: string
    agentflowid: string
    chatId: string
    createdDate: Date
}

export interface IUpsertHistory {
    id: string
    agentflowid: string
    result: string
    flowData: string
    date: Date
}

export interface IExecution {
    id: string
    executionData: string
    state: ExecutionState
    agentflowId: string
    sessionId: string
    isPublic?: boolean
    action?: string
    scheduleId?: string
    createdDate: Date
    updatedDate: Date
    stoppedDate: Date
}

export interface ISchedule {
    id: string
    name: string
    cronExpression: string
    timezone: string
    agentflowId: string
    inputPayload?: string
    enabled: boolean
    lastRunDate?: Date
    nextRunDate?: Date
    lastRunStatus?: ExecutionState
    userId?: string
    createdDate: Date
    updatedDate: Date
}

export type WebhookEvent = 'execution.completed' | 'execution.failed' | 'execution.timeout'

export interface IWebhook {
    id: string
    name: string
    url: string
    agentflowId: string
    events: string
    secret?: string
    enabled: boolean
    maxRetries: number
    timeoutMs: number
    userId?: string
    createdDate: Date
    updatedDate: Date
}

export interface IWebhookDelivery {
    id: string
    webhookId: string
    executionId: string
    agentflowId: string
    event: string
    payload: string
    statusCode?: number
    responseBody?: string
    attempt: number
    success: boolean
    errorMessage?: string
    deliveredAt?: Date
    createdDate: Date
}

export interface IComponentNodes {
    [key: string]: INode
}

export interface IComponentCredentials {
    [key: string]: INode
}

export interface IVariableDict {
    [key: string]: string
}

export interface INodeDependencies {
    [key: string]: number
}

export interface INodeDirectedGraph {
    [key: string]: string[]
}

export interface INodeData extends INodeDataFromComponent {
    inputAnchors: INodeParams[]
    inputParams: INodeParams[]
    outputAnchors: INodeParams[]
}

export interface IReactFlowNode {
    id: string
    position: {
        x: number
        y: number
    }
    type: string
    data: INodeData
    positionAbsolute: {
        x: number
        y: number
    }
    z: number
    handleBounds: {
        source: any
        target: any
    }
    width: number
    height: number
    selected: boolean
    dragging: boolean
    parentNode?: string
    extent?: string
}

export interface IReactFlowEdge {
    source: string
    sourceHandle: string
    target: string
    targetHandle: string
    type: string
    id: string
    data: {
        label: string
    }
}

export interface IReactFlowObject {
    nodes: IReactFlowNode[]
    edges: IReactFlowEdge[]
    viewport: {
        x: number
        y: number
        zoom: number
    }
}

export interface IExploredNode {
    [key: string]: {
        remainingLoop: number
        lastSeenDepth: number
    }
}

export interface INodeQueue {
    nodeId: string
    depth: number
}

export interface IDepthQueue {
    [key: string]: number
}

export interface IAgentflowExecutedData {
    nodeLabel: string
    nodeId: string
    data: INodeExecutionData
    previousNodeIds: string[]
    status?: ExecutionState
}

export interface IMessage {
    message: string
    type: MessageType
    role?: MessageType
    content?: string
}

export interface IncomingInput {
    question: string
    overrideConfig?: ICommonObject
    chatId?: string
    sessionId?: string
    stopNodeId?: string
    uploads?: IFileUpload[]
    leadEmail?: string
    history?: IMessage[]
    action?: IAction
    streaming?: boolean
}

export interface IncomingAgentflowInput extends Omit<IncomingInput, 'question'> {
    question?: string
    form?: Record<string, any>
    humanInput?: IHumanInput
}

export interface IActiveAgentflows {
    [key: string]: {
        startingNodes: IReactFlowNode[]
        endingNodeData?: INodeData
        inSync: boolean
        overrideConfig?: ICommonObject
        chatId?: string
    }
}

export interface IActiveCache {
    [key: string]: Map<any, any>
}

export interface IOverrideConfig {
    node: string
    nodeId: string
    label: string
    name: string
    type: string
    schema?: ICommonObject[] | Record<string, string>
}

export type ICredentialDataDecrypted = ICommonObject

// Plain credential object sent to server
export interface ICredentialReqBody {
    name: string
    credentialName: string
    plainDataObj: ICredentialDataDecrypted
}

// Decrypted credential object sent back to client
export interface ICredentialReturnResponse extends ICredential {
    plainDataObj: ICredentialDataDecrypted
}

export interface IUploadFileSizeAndTypes {
    fileTypes: string[]
    maxUploadSize: number
}

export enum AdminScope {
    AGENTFLOWS_READ = 'agentflows:read',
    AGENTFLOWS_WRITE = 'agentflows:write',
    CREDENTIALS_READ = 'credentials:read',
    CREDENTIALS_WRITE = 'credentials:write',
    APIKEYS_READ = 'apikeys:read',
    APIKEYS_WRITE = 'apikeys:write',
    SCHEDULES_READ = 'schedules:read',
    SCHEDULES_WRITE = 'schedules:write',
    WEBHOOKS_READ = 'webhooks:read',
    WEBHOOKS_WRITE = 'webhooks:write',
    ADMIN_FULL = 'admin:full'
}

export interface IOAuthClient {
    id: string
    clientId: string
    clientSecret: string
    clientName: string
    scopes: string | null
    createdDate: Date
    updatedDate: Date
}

export interface IApiKey {
    id: string
    keyName: string
    apiKey: string
    apiSecret: string
    updatedDate: Date
}

export interface ICustomTemplate {
    id: string
    name: string
    flowData: string
    updatedDate: Date
    createdDate: Date
    description?: string
    type?: string
    badge?: string
    framework?: string
    usecases?: string
}

export interface IFlowConfig {
    agentflowid: string
    agentflowId: string
    chatId: string
    sessionId: string
    chatHistory: IMessage[]
    apiMessageId: string
    overrideConfig?: ICommonObject
    state?: ICommonObject
    runtimeChatHistoryLength?: number
}

export interface IPredictionQueueAppServer {
    appDataSource: DataSource
    componentNodes: IComponentNodes
    sseStreamer: IServerSideEventStreamer
    telemetry: Telemetry
    cachePool: CachePool
    usageCacheManager: UsageCacheManager
}

export interface IExecuteFlowParams extends IPredictionQueueAppServer {
    incomingInput: IncomingInput
    agentflow: IAgentFlow
    chatId: string
    baseURL: string
    isInternal: boolean
    isEvaluation?: boolean
    evaluationRunId?: string
    signal?: AbortController
    files?: Express.Multer.File[]
    fileUploads?: IFileUpload[]
    uploadedFilesContent?: string
    isUpsert?: boolean
    isRecursive?: boolean
    parentExecutionId?: string
    iterationContext?: ICommonObject
    isTool?: boolean
}

export interface INodeOverrides {
    [key: string]: {
        label: string
        name: string
        type: string
        enabled: boolean
    }[]
}

export interface IVariableOverride {
    id: string
    name: string
    type: 'static' | 'runtime'
    enabled: boolean
}

// DocumentStore related
export * from './Interface.DocumentStore'

// Evaluations related
export * from './Interface.Evaluation'
