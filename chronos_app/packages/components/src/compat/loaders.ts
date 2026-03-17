/**
 * Compatibility shim for document loaders removed in langchain 1.x
 * Provides TextLoader, JSONLoader, JSONLinesLoader, DirectoryLoader, BufferLoader
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { readFile } from 'node:fs/promises'
import { Document } from '@langchain/core/documents'
import { BaseDocumentLoader } from '@langchain/core/document_loaders/base'

/**
 * Loads text files as documents.
 */
export class TextLoader extends BaseDocumentLoader {
    constructor(public filePathOrBlob: string | Blob) {
        super()
    }

    async load(): Promise<Document[]> {
        let text: string
        let metadata: Record<string, any>
        if (typeof this.filePathOrBlob === 'string') {
            text = await readFile(this.filePathOrBlob, 'utf-8')
            metadata = { source: this.filePathOrBlob }
        } else {
            text = await this.filePathOrBlob.text()
            metadata = { source: 'blob', blobType: this.filePathOrBlob.type }
        }
        return [new Document({ pageContent: text, metadata })]
    }
}

/**
 * Abstract base class for loaders that read file buffers.
 */
export abstract class BufferLoader extends BaseDocumentLoader {
    constructor(public filePathOrBlob: string | Blob) {
        super()
    }

    /**
     * Parse a buffer and its metadata into documents.
     */
    abstract parse(raw: Buffer, metadata: Record<string, any>): Promise<Document[]>

    async load(): Promise<Document[]> {
        let buffer: Buffer
        let metadata: Record<string, any>
        if (typeof this.filePathOrBlob === 'string') {
            buffer = (await readFile(this.filePathOrBlob)) as unknown as Buffer
            metadata = { source: this.filePathOrBlob }
        } else {
            const arrayBuffer = await this.filePathOrBlob.arrayBuffer()
            buffer = Buffer.from(arrayBuffer)
            metadata = { source: 'blob', blobType: this.filePathOrBlob.type }
        }
        return this.parse(buffer, metadata)
    }
}

/**
 * Loads JSON files. Extracts content from specified JSON pointer paths.
 */
export class JSONLoader extends BaseDocumentLoader {
    private pointer: string | string[]

    constructor(public filePathOrBlob: string | Blob, pointer?: string | string[]) {
        super()
        this.pointer = pointer ?? ''
    }

    async load(): Promise<Document[]> {
        let text: string
        let metadata: Record<string, any>
        if (typeof this.filePathOrBlob === 'string') {
            text = await readFile(this.filePathOrBlob, 'utf-8')
            metadata = { source: this.filePathOrBlob }
        } else {
            text = await this.filePathOrBlob.text()
            metadata = { source: 'blob', blobType: this.filePathOrBlob.type }
        }

        const data = JSON.parse(text)
        const docs: Document[] = []

        if (!this.pointer || this.pointer === '' || (Array.isArray(this.pointer) && this.pointer.length === 0)) {
            docs.push(new Document({ pageContent: JSON.stringify(data), metadata }))
        } else {
            const pointers = Array.isArray(this.pointer) ? this.pointer : [this.pointer]
            this.extractValues(data, pointers, docs, metadata)
        }

        return docs
    }

    private extractValues(data: any, pointers: string[], docs: Document[], metadata: Record<string, any>): void {
        if (Array.isArray(data)) {
            for (const item of data) {
                this.extractValues(item, pointers, docs, metadata)
            }
        } else if (typeof data === 'object' && data !== null) {
            for (const pointer of pointers) {
                const keys = pointer.replace(/^\//, '').split('/')
                let value: any = data
                for (const key of keys) {
                    if (value === undefined || value === null) break
                    value = value[key]
                }
                if (value !== undefined && value !== null) {
                    const content = typeof value === 'string' ? value : JSON.stringify(value)
                    docs.push(new Document({ pageContent: content, metadata: { ...metadata, pointer } }))
                }
            }
        }
    }
}

/**
 * Loads JSONL (JSON Lines) files. Each line is parsed as a separate JSON object.
 */
export class JSONLinesLoader extends BaseDocumentLoader {
    private pointer: string

    constructor(public filePathOrBlob: string | Blob, pointer: string) {
        super()
        this.pointer = pointer
    }

    async load(): Promise<Document[]> {
        let text: string
        let metadata: Record<string, any>
        if (typeof this.filePathOrBlob === 'string') {
            text = await readFile(this.filePathOrBlob, 'utf-8')
            metadata = { source: this.filePathOrBlob }
        } else {
            text = await this.filePathOrBlob.text()
            metadata = { source: 'blob', blobType: this.filePathOrBlob.type }
        }

        const lines = text.split('\n').filter((line) => line.trim())
        const docs: Document[] = []

        for (const line of lines) {
            const data = JSON.parse(line)
            const keys = this.pointer.replace(/^\//, '').split('/')
            let value: any = data
            for (const key of keys) {
                if (value === undefined || value === null) break
                value = value[key]
            }
            if (value !== undefined && value !== null) {
                const content = typeof value === 'string' ? value : JSON.stringify(value)
                docs.push(new Document({ pageContent: content, metadata: { ...metadata, line: lines.indexOf(line) } }))
            }
        }

        return docs
    }
}

/**
 * Type for a loader mapping - maps file extensions to loader factories.
 */
export type LoadersMapping = Record<string, (filePath: string) => BaseDocumentLoader>

/**
 * Loads all files in a directory using appropriate loaders based on file extension.
 */
export class DirectoryLoader extends BaseDocumentLoader {
    constructor(
        public directoryPath: string,
        public loaders: LoadersMapping,
        public recursive = true,
        public unknown: 'warn' | 'error' | 'ignore' = 'warn'
    ) {
        super()
    }

    async load(): Promise<Document[]> {
        const docs: Document[] = []
        const files = this.getFiles(this.directoryPath)

        for (const filePath of files) {
            const ext = path.extname(filePath).toLowerCase()
            const loaderFactory = this.loaders[ext]
            if (loaderFactory) {
                const loader = loaderFactory(filePath)
                const fileDocs = await loader.load()
                docs.push(...fileDocs)
            } else if (this.unknown === 'error') {
                throw new Error(`No loader found for extension: ${ext} (file: ${filePath})`)
            } else if (this.unknown === 'warn') {
                console.warn(`No loader found for extension: ${ext} (file: ${filePath})`)
            }
        }

        return docs
    }

    private getFiles(dirPath: string): string[] {
        const files: string[] = []
        const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name)
            if (entry.isDirectory() && this.recursive) {
                files.push(...this.getFiles(fullPath))
            } else if (entry.isFile()) {
                files.push(fullPath)
            }
        }
        return files
    }
}
