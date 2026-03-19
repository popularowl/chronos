import { v4 as uuidv4 } from 'uuid'
import { StatusCodes } from 'http-status-codes'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { IMessage } from '../../Interface'

// OpenAI-compatible types

interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_calls?: any[]
    tool_call_id?: string
}

interface OpenAIChatCompletionRequest {
    model: string
    messages: OpenAIChatMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
    // Chronos extensions
    x_chronos_override_config?: Record<string, any>
}

interface OpenAIChatCompletionResponse {
    id: string
    object: 'chat.completion'
    created: number
    model: string
    choices: {
        index: number
        message: {
            role: 'assistant'
            content: string | null
        }
        finish_reason: 'stop' | 'tool_calls' | 'length'
    }[]
    usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

interface OpenAIModelObject {
    id: string
    object: 'model'
    created: number
    owned_by: string
    name: string
}

/**
 * Resolve an agentflow by model ID (UUID).
 */
const resolveAgentflow = async (modelId: string): Promise<ChatFlow> => {
    const appServer = getRunningExpressApp()
    const agentflow = await appServer.AppDataSource.getRepository(ChatFlow).findOneBy({ id: modelId })
    if (!agentflow) {
        throw new InternalChronosError(StatusCodes.NOT_FOUND, `Model '${modelId}' not found`)
    }
    if (agentflow.type !== 'AGENTFLOW') {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, `Model '${modelId}' is not an agentflow. Only AGENTFLOW type is supported.`)
    }
    return agentflow
}

/**
 * Convert OpenAI messages array to Chronos question + history format.
 * - Last user message becomes `question`
 * - Prior user/assistant messages become `history`
 * - System message extracted separately for override config injection
 */
const transformMessages = (messages: OpenAIChatMessage[]): { question: string; history: IMessage[]; systemMessage?: string } => {
    if (!messages || messages.length === 0) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'messages array is required and must not be empty')
    }

    let systemMessage: string | undefined
    const nonSystemMessages = messages.filter((msg) => {
        if (msg.role === 'system') {
            systemMessage = msg.content ?? undefined
            return false
        }
        return true
    })

    // Find the last user message as the question, everything before it is history
    let question = ''
    const historyMessages: OpenAIChatMessage[] = []

    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
        if (nonSystemMessages[i].role === 'user' && question === '') {
            question = nonSystemMessages[i].content ?? ''
        } else {
            historyMessages.unshift(nonSystemMessages[i])
        }
    }

    if (!question) {
        throw new InternalChronosError(StatusCodes.BAD_REQUEST, 'At least one user message is required')
    }

    const history: IMessage[] = historyMessages
        .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg) => ({
            message: msg.content ?? '',
            type: msg.role === 'user' ? 'userMessage' : ('apiMessage' as any)
        }))

    return { question, history, systemMessage }
}

/**
 * Wrap a Chronos prediction response into OpenAI ChatCompletion format.
 */
const transformResponse = (agentflowId: string, predictionResult: any): OpenAIChatCompletionResponse => {
    const content = predictionResult.text ?? predictionResult.json ?? predictionResult.output ?? ''

    return {
        id: `chatcmpl-${predictionResult.chatMessageId ?? uuidv4()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: agentflowId,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: typeof content === 'string' ? content : JSON.stringify(content)
                },
                finish_reason: 'stop'
            }
        ],
        usage: {
            prompt_tokens: predictionResult.usageMetadata?.input_tokens ?? 0,
            completion_tokens: predictionResult.usageMetadata?.output_tokens ?? 0,
            total_tokens: predictionResult.usageMetadata?.total_tokens ?? 0
        }
    }
}

/**
 * Build an OpenAI-format SSE streaming chunk.
 */
const buildStreamChunk = (
    completionId: string,
    agentflowId: string,
    delta: Record<string, any>,
    finishReason: string | null = null
): string => {
    const chunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: agentflowId,
        choices: [
            {
                index: 0,
                delta,
                finish_reason: finishReason
            }
        ]
    }
    return `data: ${JSON.stringify(chunk)}\n\n`
}

/**
 * List all agentflows as OpenAI model objects.
 */
const listModels = async (): Promise<{ object: string; data: OpenAIModelObject[] }> => {
    try {
        const appServer = getRunningExpressApp()
        const agentflows = await appServer.AppDataSource.getRepository(ChatFlow).find({
            where: { type: 'AGENTFLOW' as any },
            order: { updatedDate: 'DESC' }
        })

        const models: OpenAIModelObject[] = agentflows.map((af) => ({
            id: af.id,
            object: 'model' as const,
            created: Math.floor(new Date(af.createdDate).getTime() / 1000),
            owned_by: 'chronos',
            name: af.name
        }))

        return { object: 'list', data: models }
    } catch (error) {
        throw new InternalChronosError(StatusCodes.INTERNAL_SERVER_ERROR, `Error listing models: ${getErrorMessage(error)}`)
    }
}

/**
 * Get a single agentflow as an OpenAI model object.
 */
const getModel = async (modelId: string): Promise<OpenAIModelObject> => {
    const agentflow = await resolveAgentflow(modelId)
    return {
        id: agentflow.id,
        object: 'model',
        created: Math.floor(new Date(agentflow.createdDate).getTime() / 1000),
        owned_by: 'chronos',
        name: agentflow.name
    }
}

export default {
    resolveAgentflow,
    transformMessages,
    transformResponse,
    buildStreamChunk,
    listModels,
    getModel
}

export type { OpenAIChatCompletionRequest, OpenAIChatCompletionResponse, OpenAIChatMessage }
