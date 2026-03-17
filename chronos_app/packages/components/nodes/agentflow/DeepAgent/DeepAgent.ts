import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { BaseMessageLike, HumanMessage } from '@langchain/core/messages'
import { Tool } from '@langchain/core/tools'
import { DataSource } from 'typeorm'
import * as path from 'path'
import { createDeepAgent, type SubAgent } from 'deepagents'
import {
    IAgentReasoning,
    ICommonObject,
    IDatabaseEntity,
    INode,
    INodeData,
    INodeOptionsValue,
    INodeParams,
    IServerSideEventStreamer,
    IUsedTool
} from '../../../src/Interface'
import { IFlowState, ILLMMessage } from '../Interface.Agentflow'
import { AnalyticHandler } from '../../../src/handler'
import { addSingleFileToStorage } from '../../../src/storageUtils'
import { updateFlowState } from '../utils'
import logger from '../../../src/logger'

/**
 * Callback handler that tracks tool calls during deep agent execution.
 * Streams calledTools only on first tool call, then usedTools as each completes.
 * This avoids the UI flicker caused by re-sending calledTools.
 */
class DeepAgentToolStreamHandler extends BaseCallbackHandler {
    name = 'DeepAgentToolStreamHandler'
    private sseStreamer: IServerSideEventStreamer
    private chatId: string
    private pendingTools = new Map<string, { label: string; input: any }>()
    private completedTools: IUsedTool[] = []

    constructor(sseStreamer: IServerSideEventStreamer, chatId: string) {
        super()
        this.sseStreamer = sseStreamer
        this.chatId = chatId
    }

    /** Returns accumulated completed tools for final output */
    getCompletedTools(): IUsedTool[] {
        return [...this.completedTools]
    }

    async handleToolStart(
        tool: { id?: string[]; name?: string },
        input: string,
        runId: string,
        _parentRunId?: string,
        _tags?: string[],
        _metadata?: Record<string, unknown>,
        runName?: string
    ): Promise<void> {
        const toolName = runName || tool.name || (tool.id ? tool.id[tool.id.length - 1] : 'tool')
        const label = toolName === 'write_todos' ? 'write_todos' : toolName === 'task' ? `task:${this.parseTaskName(input)}` : toolName

        this.pendingTools.set(runId, { label, input: this.safeParse(input) })

        // Send only currently-pending tools as calledTools (blue spinner chips).
        // Completed tools are already shown as grey via usedTools — don't re-send them.
        const pendingLabels = Array.from(this.pendingTools.values()).map((p) => ({ tool: p.label, toolInput: {}, toolOutput: '' }))
        this.sseStreamer.streamCalledToolsEvent(this.chatId, pendingLabels)
    }

    async handleToolEnd(output: string, runId: string): Promise<void> {
        const pending = this.pendingTools.get(runId)
        if (!pending) return

        this.completedTools.push({
            tool: pending.label,
            toolInput: pending.input,
            toolOutput: output
        })
        this.pendingTools.delete(runId)

        // Send updated usedTools (grey completed chips)
        this.sseStreamer.streamUsedToolsEvent(this.chatId, [...this.completedTools])

        // Send remaining pending tools as calledTools (blue spinner chips).
        // If no more pending tools, show "Generating response" so there's no gap before the answer.
        const pendingLabels = Array.from(this.pendingTools.values()).map((p) => ({ tool: p.label, toolInput: {}, toolOutput: '' }))
        if (pendingLabels.length === 0) {
            pendingLabels.push({ tool: 'Generating response', toolInput: {}, toolOutput: '' })
        }
        this.sseStreamer.streamCalledToolsEvent(this.chatId, pendingLabels)
    }

    async handleToolError(err: Error, runId: string): Promise<void> {
        const pending = this.pendingTools.get(runId)
        if (!pending) return

        this.completedTools.push({
            tool: pending.label,
            toolInput: pending.input,
            toolOutput: '',
            error: err.message
        })
        this.pendingTools.delete(runId)

        this.sseStreamer.streamUsedToolsEvent(this.chatId, [...this.completedTools])

        const pendingLabels = Array.from(this.pendingTools.values()).map((p) => ({ tool: p.label, toolInput: {}, toolOutput: '' }))
        if (pendingLabels.length === 0) {
            pendingLabels.push({ tool: 'Generating response', toolInput: {}, toolOutput: '' })
        }
        this.sseStreamer.streamCalledToolsEvent(this.chatId, pendingLabels)
    }

    private parseTaskName(input: string): string {
        try {
            const parsed = JSON.parse(input)
            return parsed?.name || parsed?.agent || 'subagent'
        } catch {
            return 'subagent'
        }
    }

    private safeParse(input: string): any {
        try {
            return JSON.parse(input)
        } catch {
            return { input }
        }
    }
}

/**
 * Tool configuration from the UI
 */
interface ITool {
    agentSelectedTool: string
    agentSelectedToolConfig: ICommonObject
    agentSelectedToolRequiresHumanInput: boolean
}

/**
 * Subagent configuration from the UI
 */
interface ISubagentConfig {
    subagentName: string
    subagentDescription: string
    subagentSystemPrompt: string
    subagentSkills: string[]
}

/**
 * A single step extracted from the deep agent message history
 */
interface IDeepAgentStep {
    type: 'planning' | 'tool_call' | 'subagent' | 'reasoning'
    name: string
    input?: any
    output?: string
    todos?: Array<{ content: string; status: string }>
}

/**
 * Extracts structured steps from the deep agent result messages.
 * Walks the message history and pairs tool_calls with their ToolMessage responses.
 */
function extractAgentSteps(messages: any[]): IDeepAgentStep[] {
    const steps: IDeepAgentStep[] = []
    const toolResponseMap: Record<string, string> = {}

    // First pass: collect tool responses by tool_call_id
    for (const msg of messages) {
        if (msg._getType?.() === 'tool' || msg.type === 'tool') {
            const callId = msg.tool_call_id
            if (callId) {
                toolResponseMap[callId] = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
            }
        }
    }

    // Second pass: extract steps from AI messages with tool_calls
    for (const msg of messages) {
        const toolCalls = (msg as any).tool_calls
        if (!toolCalls || toolCalls.length === 0) continue

        for (const tc of toolCalls) {
            const responseText = tc.id ? toolResponseMap[tc.id] || '' : ''

            if (tc.name === 'write_todos') {
                const todos = tc.args?.todos || []
                steps.push({
                    type: 'planning',
                    name: 'Planning',
                    input: tc.args,
                    output: responseText,
                    todos
                })
            } else if (tc.name === 'task') {
                steps.push({
                    type: 'subagent',
                    name: tc.args?.name || tc.args?.agent || 'Subagent',
                    input: tc.args,
                    output: responseText
                })
            } else {
                steps.push({
                    type: 'tool_call',
                    name: tc.name,
                    input: tc.args,
                    output: responseText
                })
            }
        }

        // Also capture AI reasoning text between tool calls
        const textContent =
            typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                ? msg.content
                      .filter((b: any) => b.type === 'text')
                      .map((b: any) => b.text)
                      .join('')
                : ''
        if (textContent && toolCalls.length > 0) {
            steps.push({
                type: 'reasoning',
                name: 'Deep Agent',
                output: textContent
            })
        }
    }

    return steps
}

/**
 * Builds IAgentReasoning entries for the chat widget (compact) and
 * detailed data for the Executions panel.
 */
function buildAgentReasoning(steps: IDeepAgentStep[]): IAgentReasoning[] {
    const reasoning: IAgentReasoning[] = []

    for (const step of steps) {
        switch (step.type) {
            case 'planning': {
                const todoLines = (step.todos || []).map((t) => {
                    const icon = t.status === 'completed' ? '\u2705' : t.status === 'in_progress' ? '\u23f3' : '\u2b1c'
                    return `${icon} ${t.content}`
                })
                reasoning.push({
                    agentName: 'Planning',
                    messages: todoLines.length > 0 ? [todoLines.join('\n')] : ['Updating task list...'],
                    nodeName: 'deepAgentAgentflow',
                    state: step.input ? { todos: step.todos || [] } : undefined
                })
                break
            }
            case 'subagent': {
                const truncatedOutput = step.output ? step.output.substring(0, 500) + (step.output.length > 500 ? '...' : '') : ''
                reasoning.push({
                    agentName: `Subagent: ${step.name}`,
                    messages: truncatedOutput ? [truncatedOutput] : ['Working...'],
                    instructions: step.input?.description || step.input?.task || undefined,
                    nodeName: 'deepAgentAgentflow',
                    state: step.input ? { task_input: step.input, task_output: step.output } : undefined
                })
                break
            }
            case 'tool_call': {
                reasoning.push({
                    agentName: 'Deep Agent',
                    messages: [],
                    usedTools: [
                        {
                            tool: step.name,
                            toolInput: step.input || {},
                            toolOutput: step.output || ''
                        }
                    ],
                    nodeName: 'deepAgentAgentflow'
                })
                break
            }
            case 'reasoning': {
                if (step.output) {
                    reasoning.push({
                        agentName: 'Deep Agent',
                        messages: [step.output],
                        nodeName: 'deepAgentAgentflow'
                    })
                }
                break
            }
        }
    }

    return reasoning
}

/**
 * DeepAgent agentflow node.
 * Uses the deepagents package to create an agent with built-in planning (todos),
 * optional subagent delegation, and configurable middleware.
 */
class DeepAgent_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'Deep Agent'
        this.name = 'deepAgentAgentflow'
        this.version = 1.0
        this.type = 'DeepAgent'
        this.icon = 'deepagent.svg'
        this.category = 'Agent Flows'
        this.description = 'Autonomous agent with built-in planning, task tracking, and optional subagent delegation'
        this.color = '#AB47BC'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Model',
                name: 'deepAgentModel',
                type: 'asyncOptions',
                loadMethod: 'listModels',
                loadConfig: true
            },
            {
                label: 'Messages',
                name: 'deepAgentMessages',
                type: 'array',
                optional: true,
                acceptVariable: true,
                array: [
                    {
                        label: 'Role',
                        name: 'role',
                        type: 'options',
                        options: [
                            { label: 'System', name: 'system' },
                            { label: 'Assistant', name: 'assistant' },
                            { label: 'Developer', name: 'developer' },
                            { label: 'User', name: 'user' }
                        ]
                    },
                    {
                        label: 'Content',
                        name: 'content',
                        type: 'string',
                        acceptVariable: true,
                        generateInstruction: true,
                        rows: 4
                    }
                ]
            },
            {
                label: 'System Prompt',
                name: 'deepAgentSystemPrompt',
                type: 'string',
                rows: 4,
                optional: true,
                placeholder: 'Additional instructions for the deep agent. Combined with the built-in agent prompt.',
                description: 'Custom system prompt appended to the default deep agent instructions'
            },
            {
                label: 'Skills',
                name: 'deepAgentSkills',
                type: 'asyncMultiOptions',
                loadMethod: 'listSkills',
                optional: true,
                description: 'Select skills to inject into the agent system message'
            },
            {
                label: 'Tools',
                name: 'deepAgentTools',
                type: 'array',
                optional: true,
                array: [
                    {
                        label: 'Tool',
                        name: 'agentSelectedTool',
                        type: 'asyncOptions',
                        loadMethod: 'listTools',
                        loadConfig: true
                    },
                    {
                        label: 'Require Human Input',
                        name: 'agentSelectedToolRequiresHumanInput',
                        type: 'boolean',
                        optional: true
                    }
                ]
            },
            {
                label: 'Subagents',
                name: 'deepAgentSubagents',
                type: 'array',
                optional: true,
                description: 'Define subagents that can be delegated tasks. Each subagent runs in its own context.',
                array: [
                    {
                        label: 'Name',
                        name: 'subagentName',
                        type: 'string',
                        placeholder: 'researcher'
                    },
                    {
                        label: 'Description',
                        name: 'subagentDescription',
                        type: 'string',
                        placeholder: 'Researches topics and gathers information',
                        rows: 2
                    },
                    {
                        label: 'System Prompt',
                        name: 'subagentSystemPrompt',
                        type: 'string',
                        placeholder: 'You are a research assistant. Your job is to...',
                        optional: true,
                        rows: 4
                    },
                    {
                        label: 'Skills',
                        name: 'subagentSkills',
                        type: 'asyncMultiOptions',
                        loadMethod: 'listSkills',
                        optional: true,
                        description: 'Select skills to inject into the subagent system message'
                    }
                ]
            },
            {
                label: 'Enable Memory',
                name: 'deepAgentEnableMemory',
                type: 'boolean',
                description: 'Enable conversation memory for the agent',
                default: true,
                optional: true
            },
            {
                label: 'Max Iterations',
                name: 'deepAgentMaxIterations',
                type: 'number',
                optional: true,
                default: 25,
                description: 'Maximum number of tool-call iterations before the agent stops'
            },
            {
                label: 'Update Flow State',
                name: 'deepAgentUpdateState',
                type: 'array',
                optional: true,
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'asyncOptions',
                        loadMethod: 'listRuntimeStateKeys'
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        acceptVariable: true
                    }
                ]
            }
        ]
    }

    loadMethods = {
        /**
         * Lists available chat models for the model selector
         */
        async listModels(_: INodeData, options?: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = (options?.componentNodes || {}) as { [key: string]: INode }
            const returnOptions: INodeOptionsValue[] = []
            for (const nodeName in componentNodes) {
                const componentNode = componentNodes[nodeName]
                if (componentNode.category === 'Chat Models') {
                    if (componentNode.tags?.includes('LlamaIndex')) continue
                    returnOptions.push({
                        label: componentNode.label,
                        name: nodeName,
                        imageSrc: componentNode.icon
                    })
                }
            }
            return returnOptions
        },
        /**
         * Lists available skills from the database
         */
        async listSkills(_: INodeData, options?: ICommonObject): Promise<INodeOptionsValue[]> {
            const appDataSource = options?.appDataSource as DataSource
            const databaseEntities = options?.databaseEntities as IDatabaseEntity
            if (!appDataSource) return []
            const skills = await appDataSource.getRepository(databaseEntities['Skill']).find()
            return skills.map((skill: any) => ({
                label: skill.name,
                name: skill.id,
                description: skill.description
            }))
        },
        /**
         * Lists available tools for the tool selector
         */
        async listTools(_: INodeData, options?: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = (options?.componentNodes || {}) as { [key: string]: INode }
            const removeTools = ['chainTool', 'retrieverTool', 'webBrowser']
            const returnOptions: INodeOptionsValue[] = []
            for (const nodeName in componentNodes) {
                const componentNode = componentNodes[nodeName]
                if (componentNode.category === 'Tools' || componentNode.category === 'Tools (MCP)') {
                    if (componentNode.tags?.includes('LlamaIndex')) continue
                    if (removeTools.includes(nodeName)) continue
                    returnOptions.push({
                        label: componentNode.label,
                        name: nodeName,
                        imageSrc: componentNode.icon
                    })
                }
            }
            return returnOptions
        },
        /**
         * Lists runtime state keys for state update configuration
         */
        async listRuntimeStateKeys(_: INodeData, options?: ICommonObject): Promise<INodeOptionsValue[]> {
            const previousNodes = options?.previousNodes as ICommonObject[]
            const startAgentflowNode = previousNodes?.find((node) => node.name === 'startAgentflow')
            const state = startAgentflowNode?.inputs?.startState as ICommonObject[]
            return state ? state.map((item) => ({ label: item.key, name: item.key })) : []
        }
    }

    /**
     * Executes the DeepAgent node
     */
    async run(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        let llmIds: ICommonObject | undefined
        const analyticHandlers = options.analyticHandlers as AnalyticHandler

        try {
            const abortController = options.abortController as AbortController

            // ── Model instantiation ──
            const model = nodeData.inputs?.deepAgentModel as string
            const modelConfig = nodeData.inputs?.deepAgentModelConfig as ICommonObject
            if (!model) throw new Error('Model is required')

            const nodeInstanceFilePath = options.componentNodes[model].filePath as string
            const nodeModule = await import(nodeInstanceFilePath)
            const newLLMNodeInstance = new nodeModule.nodeClass()
            const newNodeData = {
                ...nodeData,
                credential: modelConfig?.['CHRONOS_CREDENTIAL_ID'],
                inputs: { ...nodeData.inputs, ...modelConfig }
            }
            const llmNodeInstance = (await newLLMNodeInstance.init(newNodeData, '', options)) as BaseChatModel

            // ── Analytics ──
            if (analyticHandlers) {
                llmIds = await analyticHandlers.onLLMStart(model, input as string, {})
            }

            // ── Tool instantiation ──
            const tools = (nodeData.inputs?.deepAgentTools as ITool[]) || []
            const toolsInstance: Tool[] = []
            for (const tool of tools) {
                const toolConfig = tool.agentSelectedToolConfig
                const toolFilePath = options.componentNodes[tool.agentSelectedTool].filePath as string
                const toolModule = await import(toolFilePath)
                const newToolNodeInstance = new toolModule.nodeClass()
                const toolNodeData = {
                    ...nodeData,
                    credential: toolConfig?.['CHRONOS_CREDENTIAL_ID'],
                    inputs: { ...nodeData.inputs, ...toolConfig }
                }
                const toolInstance = await newToolNodeInstance.init(toolNodeData, '', options)
                if (Array.isArray(toolInstance)) {
                    for (const subTool of toolInstance) {
                        if (tool.agentSelectedToolRequiresHumanInput) {
                            ;(subTool as any).requiresHumanInput = true
                        }
                        toolsInstance.push(subTool as Tool)
                    }
                } else {
                    if (tool.agentSelectedToolRequiresHumanInput) {
                        ;(toolInstance as any).requiresHumanInput = true
                    }
                    toolsInstance.push(toolInstance as Tool)
                }
            }

            // ── Load all skills from DB once (used by main agent and subagents) ──
            const appDataSource = options.appDataSource as DataSource
            const databaseEntities = options.databaseEntities as IDatabaseEntity
            let allSkills: any[] = []
            const selectedSkills = nodeData.inputs?.deepAgentSkills as string[]
            const subagentConfigs = (nodeData.inputs?.deepAgentSubagents as ISubagentConfig[]) || []
            const needsSkills =
                (selectedSkills && selectedSkills.length > 0) ||
                subagentConfigs.some((s) => s.subagentSkills && s.subagentSkills.length > 0)
            if (needsSkills && appDataSource) {
                allSkills = await appDataSource.getRepository(databaseEntities['Skill']).find()
            }

            const buildSkillsText = (skillIds: string[]): string => {
                const matched = allSkills.filter((skill: any) => skillIds.includes(skill.id))
                if (matched.length === 0) return ''
                return matched.map((s: any) => `## Skill: ${s.name}\n${s.description}\n\n${s.instruction}`).join('\n\n')
            }

            // ── Subagents ──
            const subagents: SubAgent[] = subagentConfigs
                .filter((s) => s.subagentName && s.subagentDescription)
                .map((s) => {
                    let prompt = s.subagentSystemPrompt || ''
                    if (s.subagentSkills && s.subagentSkills.length > 0) {
                        const skillsText = buildSkillsText(s.subagentSkills)
                        if (skillsText) {
                            prompt = prompt ? `${prompt}\n\n${skillsText}` : skillsText
                        }
                    }
                    return {
                        name: s.subagentName,
                        description: s.subagentDescription,
                        systemPrompt: prompt
                    }
                })

            // ── System prompt with skills ──
            let systemPrompt = (nodeData.inputs?.deepAgentSystemPrompt as string) || ''

            if (selectedSkills && selectedSkills.length > 0) {
                if (appDataSource) {
                    const matchedSkills = allSkills.filter((skill: any) => selectedSkills.includes(skill.id))
                    if (matchedSkills.length > 0) {
                        const skillsText = matchedSkills
                            .map((s: any) => `## Skill: ${s.name}\n${s.description}\n\n${s.instruction}`)
                            .join('\n\n')
                        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${skillsText}` : skillsText
                    }
                }
            }

            // ── Build messages ──
            const configuredMessages = nodeData.inputs?.deepAgentMessages as ILLMMessage[]
            const pastChatHistory = (options.pastChatHistory as BaseMessageLike[]) || []
            const runtimeChatHistory = (options.agentflowRuntime?.chatHistory as BaseMessageLike[]) || []
            const enableMemory = nodeData.inputs?.deepAgentEnableMemory !== false

            const inputMessages: BaseMessageLike[] = []

            // Add configured messages
            if (configuredMessages && configuredMessages.length > 0) {
                for (const msg of configuredMessages) {
                    if (msg.content) {
                        inputMessages.push({ role: msg.role as 'system' | 'user' | 'assistant', content: String(msg.content) })
                    }
                }
            }

            // Add memory messages
            if (enableMemory) {
                inputMessages.push(...runtimeChatHistory, ...pastChatHistory)
            }

            // Add the user input
            const userInput = typeof input === 'string' ? input : (input as any)?.content || JSON.stringify(input)
            inputMessages.push(new HumanMessage(userInput))

            // ── Create and invoke the deep agent ──
            logger.debug(`[DeepAgent Node] Creating agent with ${toolsInstance.length} tool(s) and ${subagents.length} subagent(s)`)

            const maxIterations = (nodeData.inputs?.deepAgentMaxIterations as number) || 25
            const chatId = options.chatId as string
            const isLastNode = options.isLastNode as boolean
            const sseStreamer: IServerSideEventStreamer | undefined = isLastNode ? options.sseStreamer : undefined

            const agent = createDeepAgent({
                model: llmNodeInstance as any,
                tools: toolsInstance,
                systemPrompt: systemPrompt || undefined,
                subagents: subagents.length > 0 ? subagents : undefined
            })

            // Set up callback handler for real-time tool call/complete streaming
            const toolStreamHandler = sseStreamer ? new DeepAgentToolStreamHandler(sseStreamer, chatId) : undefined
            const callbacks = toolStreamHandler ? [toolStreamHandler] : undefined

            const result = await agent.invoke(
                { messages: inputMessages },
                {
                    recursionLimit: maxIterations * 2,
                    signal: abortController?.signal,
                    callbacks
                }
            )

            // ── Extract response ──
            const responseMessages = result.messages || []
            const lastMessage = responseMessages[responseMessages.length - 1]
            const responseContent =
                typeof lastMessage?.content === 'string'
                    ? lastMessage.content
                    : Array.isArray(lastMessage?.content)
                    ? lastMessage.content
                          .filter((block: any) => block.type === 'text')
                          .map((block: any) => block.text)
                          .join('')
                    : ''

            // ── Extract structured steps and reasoning from message history ──
            const agentSteps = extractAgentSteps(responseMessages)
            const agentReasoning = buildAgentReasoning(agentSteps)

            // Use callback handler's completed tools if available (has real-time data),
            // otherwise fall back to extracting from message history
            const usedTools: IUsedTool[] = toolStreamHandler
                ? toolStreamHandler.getCompletedTools()
                : agentSteps
                      .filter((s) => s.type === 'tool_call' || s.type === 'planning' || s.type === 'subagent')
                      .map((s) => ({
                          tool: s.type === 'planning' ? 'write_todos' : s.type === 'subagent' ? `task:${s.name}` : s.name,
                          toolInput: s.input || {},
                          toolOutput: s.output || ''
                      }))

            // Extract final todos state
            const finalTodos =
                agentSteps
                    .filter((s) => s.type === 'planning' && s.todos)
                    .pop()
                    ?.todos?.map((t) => ({ content: t.content, status: t.status })) || []

            // ── Extract and persist files created by the agent ──
            const chatflowId = options.chatflowid as string
            const agentFiles = (result as any).files || {}
            const artifacts: Array<{ type: string; data: string }> = []

            for (const [filePath, fileData] of Object.entries(agentFiles)) {
                try {
                    const fd = fileData as { content?: string[]; created_at?: string; modified_at?: string }
                    if (!fd.content || fd.content.length === 0) continue

                    const fileContent = fd.content.join('\n')
                    const fileName = path.basename(filePath)
                    const ext = path.extname(fileName).toLowerCase().slice(1)
                    const mimeMap: Record<string, string> = {
                        txt: 'text/plain',
                        md: 'text/markdown',
                        json: 'application/json',
                        csv: 'text/csv',
                        html: 'text/html',
                        js: 'application/javascript',
                        ts: 'application/typescript',
                        py: 'text/x-python',
                        xml: 'application/xml',
                        yaml: 'application/x-yaml',
                        yml: 'application/x-yaml',
                        pdf: 'application/pdf',
                        png: 'image/png',
                        jpg: 'image/jpeg',
                        jpeg: 'image/jpeg',
                        svg: 'image/svg+xml'
                    }
                    const mime = mimeMap[ext] || 'application/octet-stream'
                    const buffer = Buffer.from(fileContent, ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? 'base64' : 'utf-8')

                    const storedFile = await addSingleFileToStorage(mime, buffer, fileName, chatflowId, chatId)
                    const storedPath = storedFile.path // FILE-STORAGE::<filename>

                    // Determine artifact type for the UI
                    const imageExts = ['png', 'jpg', 'jpeg']
                    if (imageExts.includes(ext)) {
                        artifacts.push({ type: ext === 'jpg' ? 'jpeg' : ext, data: storedPath })
                    } else {
                        artifacts.push({ type: ext || 'text', data: storedPath })
                    }

                    logger.debug(`[DeepAgent Node] Saved file: ${fileName} → ${storedPath}`)
                } catch (err) {
                    logger.error(`[DeepAgent Node] Failed to save file ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
                }
            }

            // ── Stream final events to chat widget ──
            const state = options.agentflowRuntime?.state as ICommonObject

            if (sseStreamer) {
                // Ensure all completed tools are shown as grey chips
                if (usedTools.length > 0) {
                    sseStreamer.streamUsedToolsEvent(chatId, usedTools)
                }

                // Stream the final answer in chunks for a typing effect
                const CHUNK_SIZE = 12
                for (let i = 0; i < responseContent.length; i += CHUNK_SIZE) {
                    sseStreamer.streamTokenEvent(chatId, responseContent.substring(i, i + CHUNK_SIZE))
                }

                // Clear the "Generating response" spinner only after text has been streamed
                sseStreamer.streamCalledToolsEvent(chatId, [])
                if (artifacts.length > 0) {
                    sseStreamer.streamArtifactsEvent(chatId, artifacts)
                }
                sseStreamer.streamEndEvent(chatId)
            }

            // ── Analytics ──
            if (analyticHandlers && llmIds) {
                await analyticHandlers.onLLMEnd(llmIds, responseContent)
            }

            // ── Update flow state ──
            const updateState = nodeData.inputs?.deepAgentUpdateState as IFlowState[]
            let newState = state
            if (updateState && updateState.length > 0) {
                newState = updateFlowState(state, updateState)
            }

            // ── Serialize full message history for Executions panel ──
            // The UI renders data.input.messages with role, content, tool_calls, tool_call_id, name
            const executionMessages = responseMessages.map((msg: any) => {
                const msgType = msg._getType?.() || msg.type || 'unknown'
                const serialized: ICommonObject = {}

                if (msgType === 'human') {
                    serialized.role = 'user'
                    serialized.content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                } else if (msgType === 'ai') {
                    serialized.role = 'assistant'
                    serialized.content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                        serialized.tool_calls = msg.tool_calls.map((tc: any) => ({
                            id: tc.id,
                            name: tc.name,
                            args: tc.args
                        }))
                    }
                } else if (msgType === 'tool') {
                    serialized.role = 'tool'
                    serialized.name = msg.name
                    serialized.tool_call_id = msg.tool_call_id
                    serialized.content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                } else if (msgType === 'system') {
                    serialized.role = 'system'
                    serialized.content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                } else {
                    serialized.role = msgType
                    serialized.content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                }

                return serialized
            })

            // ── Build output with full detail for Executions panel ──
            const output: ICommonObject = {
                content: responseContent,
                agentReasoning,
                todos: finalTodos,
                steps: agentSteps.map((s) => ({
                    type: s.type,
                    name: s.name,
                    input: s.input,
                    output: s.output,
                    ...(s.todos && { todos: s.todos })
                }))
            }
            if (usedTools.length > 0) output.usedTools = usedTools
            if (artifacts.length > 0) output.artifacts = artifacts

            return {
                id: nodeData.id,
                name: this.name,
                input: {
                    messages: executionMessages,
                    ...nodeData.inputs
                },
                output,
                state: newState,
                chatHistory: [
                    ...inputMessages,
                    {
                        role: 'assistant',
                        content: responseContent,
                        name: nodeData?.label ? nodeData.label.toLowerCase().replace(/\s/g, '_').trim() : nodeData?.id,
                        ...(usedTools.length > 0 && {
                            additional_kwargs: { usedTools }
                        })
                    }
                ]
            }
        } catch (error) {
            if (analyticHandlers && llmIds) {
                await analyticHandlers.onLLMError(llmIds, error instanceof Error ? error.message : String(error))
            }
            if (error instanceof Error && error.message === 'Aborted') {
                throw error
            }
            throw new Error(`Error in DeepAgent node: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
        }
    }
}

module.exports = { nodeClass: DeepAgent_Agentflow }
