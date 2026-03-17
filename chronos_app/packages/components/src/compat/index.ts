/**
 * Compatibility module for types and classes removed in LangChain 1.x migration.
 * Re-exports shims for: BaseChain, agent types, BufferMemory, document loaders,
 * CacheBackedEmbeddings, MemoryVectorStore.
 */

export { BaseChain, SerializedLLMChain, type ChainInputs } from './chains'
export {
    type StoppingMethod,
    AgentActionOutputParser,
    BaseAgent,
    BaseSingleActionAgent,
    BaseMultiActionAgent,
    RunnableMultiActionAgent,
    RunnableAgent,
    type AgentExecutorInput,
    type CreateReactAgentParams,
    formatLogToString
} from './agents'
export { BufferMemory } from './memory'
export { TextLoader, BufferLoader, JSONLoader, JSONLinesLoader, DirectoryLoader, type LoadersMapping } from './loaders'
export { CacheBackedEmbeddings, type CacheBackedEmbeddingsFields } from './embeddings'
export { MemoryVectorStore } from './vectorstores'

/**
 * StringWithAutocomplete type - was in langchain/dist/util/types
 */
export type StringWithAutocomplete<T extends string> = T | (string & Record<never, never>)
