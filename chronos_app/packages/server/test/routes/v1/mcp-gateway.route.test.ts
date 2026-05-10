import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'
import { Agent } from '../../../src/database/entities/Agent'
import { AgentRuntimeType, AgentStatus } from '../../../src/Interface'

/**
 * Test suite for the MCP gateway route surface.
 *
 * v1.8 retired the bespoke REST endpoints (`/tools/invoke`, `/tools`, `/health`)
 * in favour of a real MCP Streamable HTTP server mounted at
 * `POST/GET/DELETE /api/v1/mcp-gateway/:agentId`. These tests focus on the
 * middleware boundary (auth) and the 503 short-circuit when the gateway is
 * not enabled.
 *
 * The live test server boots with `ENABLE_MCP_SERVERS` unset, so the gateway
 * service itself is not constructed — once auth passes, the controller
 * surfaces 503. Protocol-level conformance (initialize / tools/list /
 * tools/call) is exercised by the unit suite at
 * `test/services/mcp-gateway-server.service.test.ts`.
 */
export function mcpGatewayRouteTest() {
    describe('MCP Gateway Route', () => {
        const baseRoute = '/api/v1/mcp-gateway'
        let testAgent: Agent

        beforeAll(async () => {
            const repo = getRunningExpressApp().AppDataSource.getRepository(Agent)
            const agent = new Agent()
            agent.name = 'Gateway Route Test Agent'
            agent.slug = `gateway-test-${Date.now()}`
            agent.runtimeType = AgentRuntimeType.HTTP
            agent.status = AgentStatus.UNKNOWN
            agent.enabled = true
            agent.mcpGatewayToken = `tok-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
            agent.serviceEndpoint = 'https://upstream.example.com'
            agent.allowedTools = JSON.stringify(['postgres.query'])
            agent.version = '1.0.0'
            testAgent = await repo.save(agent)
        })

        afterAll(async () => {
            if (testAgent?.id) {
                await getRunningExpressApp().AppDataSource.getRepository(Agent).delete({ id: testAgent.id })
            }
        })

        describe(`POST ${baseRoute}/:agentId (MCP Streamable HTTP entry)`, () => {
            it('returns 401 when Authorization header is missing', async () => {
                const response = await supertest(getRunningExpressApp().app).post(`${baseRoute}/${testAgent.id}`).send({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })

            it('returns 401 for an unknown agent id (does not leak existence)', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${uuidv4()}`)
                    .set('Authorization', 'Bearer anything')
                    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })

            it('returns 401 when MCP gateway token does not match', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${testAgent.id}`)
                    .set('Authorization', 'Bearer this-is-not-the-token')
                    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })

            it('returns 503 when gateway is not enabled (ENABLE_MCP_SERVERS off)', async () => {
                // Default test boot does not set ENABLE_MCP_SERVERS, so the
                // gateway is not wired. Auth passes; the handler short-circuits
                // to 503 before any MCP traffic.
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${testAgent.id}`)
                    .set('Authorization', `Bearer ${testAgent.mcpGatewayToken}`)
                    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
                expect(response.status).toEqual(StatusCodes.SERVICE_UNAVAILABLE)
            })
        })

        describe(`GET ${baseRoute}/:agentId (MCP Streamable HTTP SSE channel)`, () => {
            it('returns 401 without Authorization header', async () => {
                const response = await supertest(getRunningExpressApp().app).get(`${baseRoute}/${testAgent.id}`)
                expect(response.status).toEqual(StatusCodes.UNAUTHORIZED)
            })
        })

        describe('Retired REST endpoints no longer dispatch tool calls', () => {
            // v1.8 release thesis: standardise on MCP protocol, no REST fallback.
            // The `tool: ..., params: ...` envelope the v1.6/v1.7 controller
            // accepted is gone. Whatever the catch-all returns (UI fallback or
            // express default), it is NOT a successful gateway response —
            // operators with legacy integrations see a clean failure and
            // consult docs/chronos-tutorials/drafts/migrating-rest-callback-to-mcp.md.
            it('POST /:agentId/tools/invoke does not return a JSON success envelope', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post(`${baseRoute}/${testAgent.id}/tools/invoke`)
                    .set('Authorization', `Bearer ${testAgent.mcpGatewayToken}`)
                    .send({ tool: 'postgres.query', params: {} })
                expect(response.body?.success).not.toBe(true)
                expect(response.body?.result).toBeUndefined()
            })

            it('GET /:agentId/tools does not return a tools array', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${testAgent.id}/tools`)
                    .set('Authorization', `Bearer ${testAgent.mcpGatewayToken}`)
                expect(Array.isArray(response.body?.tools)).toBe(false)
            })

            it('GET /:agentId/health does not return the legacy ok payload', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${testAgent.id}/health`)
                    .set('Authorization', `Bearer ${testAgent.mcpGatewayToken}`)
                expect(response.body?.ok).not.toBe(true)
                expect(response.body?.gatewayUrl).toBeUndefined()
            })
        })
    })
}
