/**
 * Compatibility shim for langchain/memory removed in langchain 1.x
 * Provides BufferMemory extending BaseMemory from @langchain/core
 */
import { BaseMemory } from '@langchain/core/memory'
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages'

/**
 * Interface for chat message history
 */
export interface BaseChatMessageHistory {
    getMessages(): Promise<BaseMessage[]>
    addUserMessage(message: string): Promise<void>
    addAIChatMessage(message: string): Promise<void>
    clear(): Promise<void>
}

/**
 * Simple in-memory chat message history
 */
export class ChatMessageHistory implements BaseChatMessageHistory {
    private messages: BaseMessage[] = []

    async getMessages(): Promise<BaseMessage[]> {
        return this.messages
    }

    async addUserMessage(message: string): Promise<void> {
        this.messages.push(new HumanMessage(message))
    }

    async addAIChatMessage(message: string): Promise<void> {
        this.messages.push(new AIMessage(message))
    }

    async clear(): Promise<void> {
        this.messages = []
    }
}

/**
 * BufferMemory compatibility shim.
 * Stores conversation history in memory.
 */
export class BufferMemory extends BaseMemory {
    humanPrefix = 'Human'
    aiPrefix = 'AI'
    memoryKey = 'history'
    inputKey?: string
    outputKey?: string
    returnMessages = false
    chatHistory: BaseChatMessageHistory

    constructor(
        fields?: Partial<{
            humanPrefix: string
            aiPrefix: string
            memoryKey: string
            inputKey: string
            outputKey: string
            returnMessages: boolean
            chatHistory: BaseChatMessageHistory
        }>
    ) {
        super()
        this.humanPrefix = fields?.humanPrefix ?? this.humanPrefix
        this.aiPrefix = fields?.aiPrefix ?? this.aiPrefix
        this.memoryKey = fields?.memoryKey ?? this.memoryKey
        this.inputKey = fields?.inputKey
        this.outputKey = fields?.outputKey
        this.returnMessages = fields?.returnMessages ?? this.returnMessages
        this.chatHistory = fields?.chatHistory ?? new ChatMessageHistory()
    }

    get memoryKeys(): string[] {
        return [this.memoryKey]
    }

    async loadMemoryVariables(_values: Record<string, any>): Promise<Record<string, any>> {
        const messages = await this.chatHistory.getMessages()
        if (this.returnMessages) {
            return { [this.memoryKey]: messages }
        }
        const buffer = messages.map((m) => `${m._getType() === 'human' ? this.humanPrefix : this.aiPrefix}: ${m.content}`).join('\n')
        return { [this.memoryKey]: buffer }
    }

    async saveContext(inputValues: Record<string, any>, outputValues: Record<string, any>): Promise<void> {
        const inputKey = this.inputKey ?? Object.keys(inputValues).find((k) => !this.memoryKeys.includes(k)) ?? Object.keys(inputValues)[0]
        const outputKey = this.outputKey ?? Object.keys(outputValues)[0]
        await this.chatHistory.addUserMessage(inputValues[inputKey])
        await this.chatHistory.addAIChatMessage(outputValues[outputKey])
    }

    async clear(): Promise<void> {
        await this.chatHistory.clear()
    }
}
