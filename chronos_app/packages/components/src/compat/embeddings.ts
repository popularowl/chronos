/**
 * Compatibility shim for langchain/embeddings/cache_backed removed in langchain 1.x
 * Provides CacheBackedEmbeddings
 */
import { type EmbeddingsInterface, Embeddings } from '@langchain/core/embeddings'
import { BaseStore } from '@langchain/core/stores'
import { AsyncCallerParams } from '@langchain/core/utils/async_caller'
import { createHash } from 'node:crypto'

/**
 * Interface for CacheBackedEmbeddings constructor fields
 */
export interface CacheBackedEmbeddingsFields extends AsyncCallerParams {
    underlyingEmbeddings: EmbeddingsInterface
    documentEmbeddingStore: BaseStore<string, number[]>
}

/**
 * Embeddings wrapper that caches results in a key-value store.
 */
export class CacheBackedEmbeddings extends Embeddings {
    protected underlyingEmbeddings: EmbeddingsInterface
    protected documentEmbeddingStore: BaseStore<string, number[]>

    constructor(fields: CacheBackedEmbeddingsFields) {
        super(fields)
        this.underlyingEmbeddings = fields.underlyingEmbeddings
        this.documentEmbeddingStore = fields.documentEmbeddingStore
    }

    async embedQuery(document: string): Promise<number[]> {
        return this.underlyingEmbeddings.embedQuery(document)
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        const keys = documents.map((doc) => this.hashDocument(doc))
        const existingEntries = await this.documentEmbeddingStore.mget(keys)

        const missingIndices: number[] = []
        const missingDocs: string[] = []
        for (let i = 0; i < existingEntries.length; i++) {
            if (existingEntries[i] === undefined) {
                missingIndices.push(i)
                missingDocs.push(documents[i])
            }
        }

        if (missingDocs.length > 0) {
            const newEmbeddings = await this.underlyingEmbeddings.embedDocuments(missingDocs)
            const keyValuePairs: [string, number[]][] = missingIndices.map((idx, i) => [keys[idx], newEmbeddings[i]])
            await this.documentEmbeddingStore.mset(keyValuePairs)
            for (let i = 0; i < missingIndices.length; i++) {
                existingEntries[missingIndices[i]] = newEmbeddings[i]
            }
        }

        return existingEntries as number[][]
    }

    private hashDocument(document: string): string {
        return createHash('sha256').update(document).digest('hex')
    }

    /**
     * Create a CacheBackedEmbeddings instance from a bytes-based store
     */
    static fromBytesStore(
        underlyingEmbeddings: EmbeddingsInterface,
        documentEmbeddingStore: BaseStore<string, Uint8Array>,
        options?: { namespace?: string }
    ): CacheBackedEmbeddings {
        const namespace = options?.namespace ?? ''
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        const wrappedStore: BaseStore<string, number[]> = {
            mget: async (keys: string[]) => {
                const namespacedKeys = keys.map((k) => `${namespace}${k}`)
                const values = await documentEmbeddingStore.mget(namespacedKeys)
                return values.map((v) => {
                    if (v === undefined) return undefined
                    return JSON.parse(decoder.decode(v))
                })
            },
            mset: async (keyValuePairs: [string, number[]][]) => {
                const namespacedPairs: [string, Uint8Array][] = keyValuePairs.map(([k, v]) => [
                    `${namespace}${k}`,
                    encoder.encode(JSON.stringify(v))
                ])
                await documentEmbeddingStore.mset(namespacedPairs)
            },
            mdelete: async (keys: string[]) => {
                const namespacedKeys = keys.map((k) => `${namespace}${k}`)
                await documentEmbeddingStore.mdelete(namespacedKeys)
            },
            yieldKeys: async function* (prefix?: string) {
                yield* documentEmbeddingStore.yieldKeys(prefix ? `${namespace}${prefix}` : namespace)
            }
        } as BaseStore<string, number[]>

        return new CacheBackedEmbeddings({
            underlyingEmbeddings,
            documentEmbeddingStore: wrappedStore
        })
    }
}
