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

export type AgentflowType = 'AGENTFLOW'

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
    publishedFlowData?: string
    publishedVersionId?: string
    currentVersion?: number
}

export interface IAgentflowVersion {
    id: string
    agentflowId: string
    version: number
    flowData: string
    chatbotConfig?: string
    apiConfig?: string
    analytic?: string
    speechToText?: string
    textToSpeech?: string
    followUpPrompts?: string
    notes?: string
    publishedBy?: string
    createdDate: Date
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

export enum AgentRuntimeType {
    BUILT_IN = 'BUILT_IN',
    HTTP = 'HTTP'
}

export enum AgentStatus {
    HEALTHY = 'HEALTHY',
    UNHEALTHY = 'UNHEALTHY',
    UNKNOWN = 'UNKNOWN',
    DISABLED = 'DISABLED'
}

/**
 * Agent registry entry. Shaped as a superset of the A2A Agent Card
 * (https://a2a-protocol.org/latest/specification/) so a future A2A runtime can
 * publish `/.well-known/agent.json` from these columns without a schema change.
 * v1.6.0 implements only the OpenAI-compatible HTTP runtime; A2A-only fields
 * (`protocolVersion`, `interfaces`, `securitySchemes`, `security`) are stored
 * but not yet served.
 */
export interface IAgent {
    id: string
    name: string
    slug: string
    description?: string
    version: string
    protocolVersion?: string
    iconUrl?: string
    provider?: string
    documentationUrl?: string
    capabilities?: string
    skills?: string
    defaultInputModes?: string
    defaultOutputModes?: string
    serviceEndpoint?: string
    interfaces?: string
    securitySchemes?: string
    security?: string
    runtimeType: AgentRuntimeType
    status: AgentStatus
    enabled: boolean
    runtimeConfig?: string
    outboundAuth?: string
    mcpGatewayToken?: string
    allowedTools?: string
    builtinAgentflowId?: string
    lastHealthCheckAt?: Date
    lastHealthError?: string
    userId?: string
    createdDate: Date
    updatedDate: Date
}

export enum MCPServerTransport {
    STREAMABLE_HTTP = 'streamable-http',
    SSE = 'sse',
    STDIO = 'stdio'
}

export enum MCPServerStatus {
    HEALTHY = 'HEALTHY',
    UNHEALTHY = 'UNHEALTHY',
    UNKNOWN = 'UNKNOWN',
    DISABLED = 'DISABLED'
}

/**
 * MCPServer registry entry. Represents a registered MCP server reachable by
 * the platform's MCP gateway. Agents address tools as `<slug>.<tool>`; the
 * gateway resolves the namespace, enforces the intersection of
 * `Agent.allowedTools` and `MCPServer.allowedTools`, and proxies the call.
 * Since the v1.6.0 `streamable-http` and `sse`support; sinve v1.8.0 `stdio`
 * (spawn-and-pool child processes). For stdio rows, `command` is required
 * and `args` / `env` carry the spawn-time config.
 */
export interface IMCPServer {
    id: string
    name: string
    slug: string
    description?: string
    transport: MCPServerTransport
    url?: string
    command?: string
    /**
     * JSON-stringified array of argv strings passed to `child_process.spawn`
     * for `stdio` transport. Strings may carry `{{credentialId:field}}`
     * interpolation tokens resolved at spawn time against the credential
     * vault — see `services/mcp-gateway/stdio.ts`.
     */
    args?: string
    /**
     * JSON-stringified `Record<string, string | StdioCredentialRef>` of env
     * vars merged into the spawn-time env for `stdio` transport. Object
     * values matching `{ credentialId, field }` are resolved against the
     * credential vault at spawn time and never persisted in plaintext.
     *
     */
    env?: string
    outboundAuth?: string
    allowedTools?: string
    requestHeaders?: string
    timeoutMs?: number
    /**
     * JSON-stringified `{ retry?, rateLimit?, circuitBreaker? }` policy bag,
     * applied by the MCP gateway on each `tools/call`. Each top-level key
     * is optional; absent keys fall back to platform defaults resolved at
     * the service layer from `MCP_DEFAULT_RETRY_MAX_ATTEMPTS` /
     * `MCP_DEFAULT_RATE_LIMIT_RPS`.
     */
    policies?: string
    status: MCPServerStatus
    enabled: boolean
    lastHealthCheckAt?: Date
    lastHealthError?: string
    userId?: string
    createdDate: Date
    updatedDate: Date
}

/**
 * Credential reference in `MCPServer.env` values (Option A secret-storage
 * shape). The gateway's stdio pool resolves these at spawn time, decrypts
 * the named field from the referenced credential, and substitutes the
 * decrypted string into the spawn-time env. Plaintext secrets never land
 * in the `MCPServer` row. `args` strings carry the same reference via the
 * `{{credentialId:field}}` interpolation token syntax.
 */
export interface StdioCredentialRef {
    credentialId: string
    field: string
}

/** Single value in `MCPServer.env` — inline literal or credential ref. */
export type StdioEnvValue = string | StdioCredentialRef

/**
 * Reliability-policy verdict carried on each `tool_invocation_audit` row.
 * Set by the policy chain (`services/mcp-gateway/policy.ts`) before the audit
 * row is written. v1.8.0 Group A.
 */
export enum PolicyOutcome {
    /** Call ran without any policy intervention. */
    PASSED = 'PASSED',
    /** Rate-limit gate rejected the call before it ran. */
    RATE_LIMITED = 'RATE_LIMITED',
    /** Retry policy fired at least once before the call resolved. */
    RETRIED = 'RETRIED',
    /** Circuit-breaker rejected the call. */
    CIRCUIT_OPEN = 'CIRCUIT_OPEN'
}

/**
 * Decrypted payload shape for an `oauth2-refresh` credential (added in v1.8.0).
 *
 * Lives inside `Credential.encryptedData` — no schema change. The platform
 * keeps the `refreshToken` long-lived and rotates `accessToken` + `expiresAt`
 * via the token endpoint as expiry approaches. `tokenType` is the RFC 6749
 * § 5.1 `token_type` (typically `Bearer`); `scope` is informational and
 * not enforced at refresh time.
 */
export interface OAuth2RefreshPayload {
    type: 'oauth2-refresh'
    tokenEndpoint: string
    clientId: string
    clientSecret: string
    refreshToken: string
    accessToken: string
    expiresAt: string
    tokenType?: string
    scope?: string
}

/**
 * Credential-access audit `source` label for the OAuth2 refresh path.
 * Free-form string at the schema layer; this constant is the canonical label
 * used by `services/credentials/oauth2-refresh.ts` so the `/audit-log` filter
 * has a stable token to match on.
 */
export const CREDENTIAL_ACCESS_SOURCE_OAUTH2_REFRESH = 'oauth2-refresh'

/**
 * Discriminator for `mcp_server_change_log.changeKind`. v1.8.0 Group A.
 */
export enum MCPServerChangeKind {
    CREATED = 'CREATED',
    UPDATED = 'UPDATED',
    DELETED = 'DELETED',
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED'
}

/**
 * Persisted entry on the `mcp_server_change_log` table. One row per MCP
 * server mutation, attributed to the Chronos user who made the change.
 * `userEmail` is snapshotted at change time — the user row may be deleted
 * later but the log entry remains correct.
 */
export interface IMCPServerChangeLog {
    id: string
    mcpServerId: string
    userId: string | null
    userEmail: string | null
    changeKind: MCPServerChangeKind
    /** JSON-stringified diff `{ field: { before, after } }` — secrets redacted. */
    changedFields: string | null
    /** Human-readable one-liner, e.g. `Updated retry policy: 3 → 5 attempts`. */
    changeSummary: string
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
    AGENTS_READ = 'agents:read',
    AGENTS_WRITE = 'agents:write',
    MCP_SERVERS_READ = 'mcp-servers:read',
    MCP_SERVERS_WRITE = 'mcp-servers:write',
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
