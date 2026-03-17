/**
 * Compatibility shim for langchain/vectorstores/memory removed in langchain 1.x
 * Provides MemoryVectorStore - a simple in-memory vector store using cosine similarity
 */
import { VectorStore } from '@langchain/core/vectorstores'
import { Document } from '@langchain/core/documents'
import { type EmbeddingsInterface } from '@langchain/core/embeddings'

/**
 * In-memory vector store using cosine similarity.
 */
export class MemoryVectorStore extends VectorStore {
    declare FilterType: (doc: Document) => boolean

    memoryVectors: Array<{ content: string; embedding: number[]; metadata: Record<string, any> }> = []

    _vectorstoreType(): string {
        return 'memory'
    }

    constructor(embeddings: EmbeddingsInterface) {
        super(embeddings, {})
    }

    async addDocuments(documents: Document[]): Promise<void> {
        const texts = documents.map((doc) => doc.pageContent)
        const vectors = await this.embeddings.embedDocuments(texts)
        for (let i = 0; i < documents.length; i++) {
            this.memoryVectors.push({
                content: documents[i].pageContent,
                embedding: vectors[i],
                metadata: documents[i].metadata
            })
        }
    }

    async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
        for (let i = 0; i < documents.length; i++) {
            this.memoryVectors.push({
                content: documents[i].pageContent,
                embedding: vectors[i],
                metadata: documents[i].metadata
            })
        }
    }

    async similaritySearchVectorWithScore(query: number[], k: number, filter?: this['FilterType']): Promise<[Document, number][]> {
        const results: Array<{ doc: Document; score: number }> = []

        for (const memVec of this.memoryVectors) {
            const doc = new Document({ pageContent: memVec.content, metadata: memVec.metadata })
            if (filter && !filter(doc)) continue
            const score = this.cosineSimilarity(query, memVec.embedding)
            results.push({ doc, score })
        }

        results.sort((a, b) => b.score - a.score)
        return results.slice(0, k).map((r) => [r.doc, r.score])
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }

    static async fromDocuments(docs: Document[], embeddings: EmbeddingsInterface): Promise<MemoryVectorStore> {
        const store = new MemoryVectorStore(embeddings)
        await store.addDocuments(docs)
        return store
    }

    static async fromTexts(texts: string[], metadatas: Record<string, any>[], embeddings: EmbeddingsInterface): Promise<MemoryVectorStore> {
        const docs = texts.map((text, i) => new Document({ pageContent: text, metadata: metadatas[i] || {} }))
        return MemoryVectorStore.fromDocuments(docs, embeddings)
    }
}
