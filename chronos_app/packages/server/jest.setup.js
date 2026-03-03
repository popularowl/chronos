/**
 * Jest setup file for server package
 * Provides Web API polyfills needed by @langchain/core, @mistralai, and other ESM dependencies
 */

const { ReadableStream, WritableStream, TransformStream } = require('stream/web')
const { Blob } = require('buffer')
const { TextEncoder, TextDecoder } = require('util')

global.ReadableStream = ReadableStream
global.WritableStream = WritableStream
global.TransformStream = TransformStream
global.Blob = Blob
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

if (typeof global.Headers === 'undefined') {
    global.Headers = class Headers {
        constructor(init = {}) {
            this._headers = new Map()
            if (init) {
                Object.entries(init).forEach(([key, value]) => {
                    this._headers.set(key.toLowerCase(), value)
                })
            }
        }
        get(name) {
            return this._headers.get(name.toLowerCase())
        }
        set(name, value) {
            this._headers.set(name.toLowerCase(), value)
        }
        has(name) {
            return this._headers.has(name.toLowerCase())
        }
    }
}

if (typeof global.Request === 'undefined') {
    global.Request = class Request {
        constructor(url, options = {}) {
            this.url = url
            this.method = options.method || 'GET'
            this.headers = new global.Headers(options.headers || {})
            this.body = options.body
        }
    }
}

if (typeof global.Response === 'undefined') {
    global.Response = class Response {
        constructor(body, options = {}) {
            this.body = body
            this.status = options.status || 200
            this.ok = this.status >= 200 && this.status < 300
            this.headers = new global.Headers(options.headers || {})
        }
        json() {
            return Promise.resolve(JSON.parse(this.body))
        }
        text() {
            return Promise.resolve(this.body)
        }
    }
}

if (typeof global.fetch === 'undefined') {
    global.fetch = jest.fn(() =>
        Promise.resolve(new global.Response('{}', { status: 200 }))
    )
}
