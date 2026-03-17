/**
 * Compatibility shim for langchain/agents types removed in langchain 1.x
 * Provides agent base classes and types needed by the custom AgentExecutor.
 */
import { Serializable } from '@langchain/core/load/serializable'
import { BaseOutputParser } from '@langchain/core/output_parsers'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { Runnable, type RunnableConfig } from '@langchain/core/runnables'
import { AgentAction, AgentFinish, AgentStep } from '@langchain/core/agents'
import { BaseMessage } from '@langchain/core/messages'
import { ChainValues } from '@langchain/core/utils/types'
import { StructuredToolInterface } from '@langchain/core/tools'
import { BasePromptTemplate } from '@langchain/core/prompts'
import { BaseLanguageModelInterface } from '@langchain/core/language_models/base'
import type { ChainInputs } from './chains'

/**
 * Type representing the stopping method for an agent.
 */
export type StoppingMethod = 'force' | 'generate'

/**
 * Abstract class representing an output parser for agent actions and finishes.
 */
export abstract class AgentActionOutputParser extends BaseOutputParser<AgentAction | AgentFinish> {}

/**
 * Abstract base class for agents.
 */
export abstract class BaseAgent extends Serializable {
    ToolType!: StructuredToolInterface

    abstract get inputKeys(): string[]

    get returnValues(): string[] {
        return ['output']
    }

    get allowedTools(): string[] | undefined {
        return undefined
    }

    _agentType(): string {
        throw new Error('Not implemented')
    }

    abstract _agentActionType(): string

    async returnStoppedResponse(
        earlyStoppingMethod: StoppingMethod,
        _steps: AgentStep[],
        _inputs: ChainValues,
        _callbackManager?: CallbackManager
    ): Promise<AgentFinish> {
        if (earlyStoppingMethod === 'force') {
            return {
                returnValues: { output: 'Agent stopped due to iteration limit or time limit.' },
                log: ''
            }
        }
        throw new Error(`Got unsupported early_stopping_method: ${earlyStoppingMethod}`)
    }

    async prepareForOutput(_returnValues: AgentFinish['returnValues'], _steps: AgentStep[]): Promise<AgentFinish['returnValues']> {
        return {}
    }
}

/**
 * Abstract base class for single action agents.
 */
export abstract class BaseSingleActionAgent extends BaseAgent {
    _agentActionType(): string {
        return 'single' as const
    }

    abstract plan(
        steps: AgentStep[],
        inputs: ChainValues,
        callbackManager?: CallbackManager,
        config?: RunnableConfig
    ): Promise<AgentAction | AgentFinish>
}

/**
 * Abstract base class for multi-action agents.
 */
export abstract class BaseMultiActionAgent extends BaseAgent {
    _agentActionType(): string {
        return 'multi' as const
    }

    abstract plan(
        steps: AgentStep[],
        inputs: ChainValues,
        callbackManager?: CallbackManager,
        config?: RunnableConfig
    ): Promise<AgentAction[] | AgentFinish>
}

/**
 * Interface for creating a multi-action agent from a Runnable.
 */
export interface RunnableMultiActionAgentInput {
    runnable: Runnable<
        ChainValues & { agent_scratchpad?: string | BaseMessage[]; stop?: string[] },
        AgentAction[] | AgentAction | AgentFinish
    >
    streamRunnable?: boolean
    defaultRunName?: string
    stop?: string[]
}

/**
 * Multi-action agent powered by runnables (formerly RunnableAgent).
 */
export class RunnableMultiActionAgent extends BaseMultiActionAgent {
    lc_namespace = ['langchain', 'agents', 'runnable']

    runnable: Runnable<ChainValues & { steps: AgentStep[] }, AgentAction[] | AgentAction | AgentFinish>

    defaultRunName: string

    stop?: string[]

    streamRunnable: boolean

    get inputKeys(): string[] {
        return []
    }

    constructor(fields: RunnableMultiActionAgentInput) {
        super(fields)
        this.runnable = fields.runnable as any
        this.defaultRunName = fields.defaultRunName ?? 'RunnableAgent'
        this.stop = fields.stop
        this.streamRunnable = fields.streamRunnable ?? true
    }

    async plan(
        steps: AgentStep[],
        inputs: ChainValues,
        callbackManager?: CallbackManager,
        config?: RunnableConfig
    ): Promise<AgentAction[] | AgentFinish> {
        const result = await this.runnable.invoke({ ...inputs, steps }, { callbacks: callbackManager, ...config })
        return result as AgentAction[] | AgentFinish
    }
}

/**
 * @deprecated Renamed to RunnableMultiActionAgent.
 */
export class RunnableAgent extends RunnableMultiActionAgent {}

/**
 * Input for AgentExecutor
 */
export interface AgentExecutorInput extends ChainInputs {
    agent: BaseSingleActionAgent | BaseMultiActionAgent | Runnable
    tools: StructuredToolInterface[]
    returnIntermediateSteps?: boolean
    maxIterations?: number
    earlyStoppingMethod?: StoppingMethod
    handleParsingErrors?: boolean | string | ((e: Error) => string)
    handleToolRuntimeErrors?: (e: Error) => string
}

/**
 * Params for createReactAgent
 */
export type CreateReactAgentParams = {
    llm: BaseLanguageModelInterface
    tools: StructuredToolInterface[]
    prompt: BasePromptTemplate
    streamRunnable?: boolean
}

/**
 * Construct the scratchpad that lets the agent continue its thought process.
 */
export function formatLogToString(intermediateSteps: AgentStep[], observationPrefix = 'Observation: ', llmPrefix = 'Thought: '): string {
    const formattedSteps = intermediateSteps.reduce(
        (thoughts, { action, observation }) => thoughts + [action.log, `\n${observationPrefix}${observation}`, llmPrefix].join('\n'),
        ''
    )
    return formattedSteps
}
