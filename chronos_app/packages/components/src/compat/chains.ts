/**
 * Compatibility shim for langchain/chains removed in langchain 1.x
 * Provides BaseChain extending BaseLangChain from @langchain/core
 */
import { RUN_KEY } from '@langchain/core/outputs'
import { CallbackManager, Callbacks } from '@langchain/core/callbacks/manager'
import { ensureConfig, type RunnableConfig } from '@langchain/core/runnables'
import { BaseLangChain, type BaseLangChainParams } from '@langchain/core/language_models/base'
import { BaseMemory } from '@langchain/core/memory'
import { ChainValues } from '@langchain/core/utils/types'
import { CallbackManagerForChainRun } from '@langchain/core/callbacks/manager'

/**
 * Serialized LLM chain type for backward compatibility
 */
export type SerializedLLMChain = {
    _type: 'llm_chain'
    llm?: any
    prompt?: any
}

/**
 * Chain input configuration
 */
export interface ChainInputs extends BaseLangChainParams {
    memory?: BaseMemory
    callbackManager?: CallbackManager
}

/**
 * Base chain class - compatibility shim for removed langchain/chains BaseChain.
 * Extends BaseLangChain (which extends Runnable) and provides the chain execution pattern.
 */
export abstract class BaseChain<
    RunInput extends ChainValues = ChainValues,
    RunOutput extends ChainValues = ChainValues
> extends BaseLangChain<RunInput, RunOutput> {
    memory?: BaseMemory

    get lc_namespace(): string[] {
        return ['langchain', 'chains', this._chainType()]
    }

    constructor(fields?: BaseMemory | ChainInputs, verbose?: boolean, callbacks?: Callbacks) {
        if (arguments.length === 1 && typeof fields === 'object' && !('saveContext' in fields)) {
            const { memory, callbackManager, ...rest } = fields as ChainInputs
            super({ ...rest, callbacks: callbackManager ?? rest.callbacks })
            this.memory = memory
        } else {
            super({ verbose, callbacks })
            this.memory = fields as BaseMemory | undefined
        }
    }

    /**
     * Invoke the chain with the provided input and returns the output.
     */
    async invoke(input: RunInput, options?: RunnableConfig): Promise<RunOutput> {
        const config = ensureConfig(options)
        const callbackManager_ = await CallbackManager.configure(
            config?.callbacks,
            this.callbacks,
            config?.tags,
            this.tags,
            config?.metadata,
            this.metadata,
            { verbose: this.verbose }
        )
        const runManager = await callbackManager_?.handleChainStart(
            this.toJSON(),
            input as Record<string, unknown>,
            undefined,
            undefined,
            undefined,
            undefined,
            config?.runName
        )
        let outputValues: RunOutput
        try {
            outputValues = await this._call(input, runManager, config)
        } catch (e) {
            await runManager?.handleChainError(e)
            throw e
        }
        if (this.memory != null) {
            await this.memory.saveContext(input as Record<string, unknown>, outputValues as Record<string, unknown>)
        }
        await runManager?.handleChainEnd(outputValues as Record<string, unknown>)
        Object.defineProperty(outputValues, RUN_KEY, {
            value: runManager ? { runId: runManager?.runId } : undefined,
            configurable: true
        })
        return outputValues
    }

    /**
     * Prepare outputs, optionally saving to memory
     */
    async prepOutputs(
        inputs: Record<string, unknown>,
        outputs: Record<string, unknown>,
        returnOnlyOutputs = false
    ): Promise<Record<string, unknown>> {
        if (this.memory) {
            await this.memory.saveContext(inputs, outputs)
        }
        if (returnOnlyOutputs) {
            return outputs
        }
        return { ...inputs, ...outputs }
    }

    /**
     * Run the core logic of this chain and return the output
     */
    abstract _call(values: RunInput, runManager?: CallbackManagerForChainRun, config?: RunnableConfig): Promise<RunOutput>

    /**
     * Return the string type key uniquely identifying this class of chain.
     */
    abstract _chainType(): string

    /**
     * Return a json-like object representing this chain.
     */
    serialize(): SerializedLLMChain {
        throw new Error('Cannot serialize chain')
    }

    abstract get inputKeys(): string[]
    abstract get outputKeys(): string[]
}
