import { StatusCodes } from 'http-status-codes'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { InternalChronosError } from '../../errors/internalChronosError'
import { getErrorMessage } from '../../errors/utils'

/**
 * Result of mapping an `MCPGateway.invoke()` failure into the MCP-protocol
 * shape. Two flavours per the locked decision in v1.8.0-plan.md § Group G:
 *
 *  - `kind: 'jsonRpcError'` — the call could not be dispatched. Surfaced as a
 *    JSON-RPC error response from the `tools/call` handler. Throw an `McpError`
 *    in the handler to produce this shape.
 *  - `kind: 'callToolError'` — the tool was dispatched but the upstream MCP
 *    server / underlying transport reported a failure. Returned as
 *    `CallToolResult` with `isError: true` and a content block describing the
 *    failure.
 */
export type InvokeErrorMapping =
    | { kind: 'jsonRpcError'; error: McpError }
    | { kind: 'callToolError'; result: { content: Array<{ type: 'text'; text: string }>; isError: true; _meta: { cause: string } } }

/**
 * Translate an error thrown by `MCPGateway.invoke()` (an `InternalChronosError`
 * with an HTTP status code, or any other thrown value) into either a JSON-RPC
 * error or a `CallToolResult` with `isError: true`. The split follows MCP-spec
 * semantics: JSON-RPC errors mean "the call could not be made"; `isError: true`
 * means "the tool ran but failed".
 */
export const mapInvokeError = (error: unknown): InvokeErrorMapping => {
    const status = (error as InternalChronosError | undefined)?.statusCode
    const message = getErrorMessage(error)

    // "Couldn't dispatch" — JSON-RPC error responses.
    switch (status) {
        case StatusCodes.BAD_REQUEST:
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.InvalidParams, message, { cause: 'invalid-params' })
            }
        case StatusCodes.NOT_FOUND:
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.MethodNotFound, message, { cause: 'mcp-server-not-found' })
            }
        case StatusCodes.FORBIDDEN:
            // Tool not in Agent.allowedTools ∩ MCPServer.allowedTools — semantic
            // "method not found" from the agent's perspective.
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.MethodNotFound, message, { cause: 'tool-not-allowed' })
            }
        case StatusCodes.CONFLICT:
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.InternalError, message, { cause: 'mcp-server-disabled' })
            }
        case StatusCodes.NOT_IMPLEMENTED:
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.InternalError, message, { cause: 'stdio-not-supported' })
            }
        case StatusCodes.SERVICE_UNAVAILABLE:
            return {
                kind: 'jsonRpcError',
                error: new McpError(ErrorCode.InternalError, message, { cause: 'mcp-server-unhealthy' })
            }
    }

    // Upstream tool dispatched but reported a failure (502 Bad Gateway from
    // `MCPGateway.invoke()` — the underlying tools/call threw). Return as
    // CallToolResult with isError: true so the agent can surface it to the LLM.
    if (status === StatusCodes.BAD_GATEWAY) {
        return {
            kind: 'callToolError',
            result: {
                content: [{ type: 'text', text: message }],
                isError: true,
                _meta: { cause: 'mcp-transport' }
            }
        }
    }

    // Anything else is internal — JSON-RPC InternalError. Don't leak details.
    return {
        kind: 'jsonRpcError',
        error: new McpError(ErrorCode.InternalError, message, { cause: 'internal' })
    }
}
