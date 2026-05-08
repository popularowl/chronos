import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../src/utils/getRunningExpressApp'
import { AgentflowErrorMessage, validateAgentflowType } from '../../src/services/agentflows'
import { EnumAgentflowType } from '../../src/database/entities/AgentFlow'
import { Agent } from '../../src/database/entities/Agent'
import { MCPServer } from '../../src/database/entities/MCPServer'
import { MCPServerStatus, MCPServerTransport } from '../../src/Interface'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `agentflow-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Helper function to create a test agentflow
 */
async function createTestAgentflow(authToken: string): Promise<string> {
    const newAgentflow = {
        name: 'Test Agentflow ' + Date.now(),
        type: 'AGENTFLOW',
        flowData: JSON.stringify({ nodes: [], edges: [] })
    }

    const response = await supertest(getRunningExpressApp().app)
        .post('/api/v1/agentflows')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
        .send(newAgentflow)

    return response.body.id
}

/**
 * Helper function to delete a test agentflow
 */
async function deleteTestAgentflow(authToken: string, agentflowId: string): Promise<void> {
    await supertest(getRunningExpressApp().app)
        .delete(`/api/v1/agentflows/${agentflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
}

/**
 * Test suite for agentflows service and routes
 * Tests the agentflow CRUD operations at /api/v1/agentflows/*
 */
export function agentflowsServiceTest() {
    describe('Agentflows Service', () => {
        const baseRoute = '/api/v1/agentflows'

        describe('validateAgentflowType', () => {
            it('should not throw error for valid AGENTFLOW type', () => {
                expect(() => validateAgentflowType(EnumAgentflowType.AGENTFLOW)).not.toThrow()
            })

            it('should throw error for invalid agentflow type', () => {
                expect(() => validateAgentflowType('INVALID_TYPE' as any)).toThrow(AgentflowErrorMessage.INVALID_AGENTFLOW_TYPE)
            })

            it('should throw error for undefined agentflow type', () => {
                expect(() => validateAgentflowType(undefined)).toThrow(AgentflowErrorMessage.INVALID_AGENTFLOW_TYPE)
            })
        })

        describe('Agentflow CRUD Operations', () => {
            it('should create a new agentflow', async () => {
                const authToken = await getAuthToken()
                const newAgentflow = {
                    name: 'Test Agentflow Create',
                    type: 'AGENTFLOW',
                    flowData: JSON.stringify({ nodes: [], edges: [] })
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newAgentflow)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.id).toBeDefined()
                expect(response.body.name).toEqual(newAgentflow.name)
                expect(response.body.type).toEqual(newAgentflow.type)

                // Cleanup
                await deleteTestAgentflow(authToken, response.body.id)
            })

            it('should reject agentflow with invalid type', async () => {
                const authToken = await getAuthToken()
                const invalidAgentflow = {
                    name: 'Invalid Agentflow',
                    type: 'INVALID_TYPE',
                    flowData: JSON.stringify({ nodes: [], edges: [] })
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(invalidAgentflow)

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
            })

            it('should return all agentflows', async () => {
                const authToken = await getAuthToken()

                const response = await supertest(getRunningExpressApp().app)
                    .get(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                expect(Array.isArray(response.body)).toBe(true)
            })

            it('should filter agentflows by type', async () => {
                const authToken = await getAuthToken()

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}?type=AGENTFLOW`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                if (Array.isArray(response.body)) {
                    response.body.forEach((agentflow: any) => {
                        expect(agentflow.type).toEqual('AGENTFLOW')
                    })
                }
            })

            it('should support pagination', async () => {
                const authToken = await getAuthToken()

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}?page=1&limit=5`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body).toHaveProperty('data')
                expect(response.body).toHaveProperty('total')
                expect(Array.isArray(response.body.data)).toBe(true)
            })

            it('should return an agentflow by id', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${agentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.id).toEqual(agentflowId)

                // Cleanup
                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should return error for non-existent agentflow', async () => {
                const authToken = await getAuthToken()
                const fakeId = '00000000-0000-0000-0000-000000000000'

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                // API returns NOT_FOUND or INTERNAL_SERVER_ERROR depending on error handling
                expect([StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should update an existing agentflow', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const updateData = {
                    name: 'Updated Agentflow Name'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .put(`${baseRoute}/${agentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(updateData)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.name).toEqual(updateData.name)

                // Cleanup
                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should reject update with invalid type', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const updateData = {
                    type: 'INVALID_TYPE'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .put(`${baseRoute}/${agentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(updateData)

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)

                // Cleanup
                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should check if agentflow is valid for streaming', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                // agentflows-streaming is whitelisted, no internal header needed
                const response = await supertest(getRunningExpressApp().app).get(`/api/v1/agentflows-streaming/${agentflowId}`)

                // Empty agentflows may return error during streaming check or valid response
                if (response.status === StatusCodes.OK) {
                    expect(response.body).toHaveProperty('isStreaming')
                    expect(typeof response.body.isStreaming).toBe('boolean')
                } else {
                    expect(response.status).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
                }

                // Cleanup
                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('should return error for non-existent agentflow streaming check', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'

                // agentflows-streaming is whitelisted, no auth needed
                const response = await supertest(getRunningExpressApp().app).get(`/api/v1/agentflows-streaming/${fakeId}`)

                expect(response.status).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
            })

            it('should delete an existing agentflow', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .delete(`${baseRoute}/${agentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
            })

            it('should return error when trying to delete non-existent agentflow', async () => {
                const authToken = await getAuthToken()
                const fakeId = '00000000-0000-0000-0000-000000000000'

                const response = await supertest(getRunningExpressApp().app)
                    .delete(`${baseRoute}/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
            })
        })

        describe('Built-in agent registry side-effects', () => {
            it('creates a linked BUILT_IN agent when an agentflow is saved', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })

                expect(linked).not.toBeNull()
                expect(linked?.runtimeType).toEqual('BUILT_IN')
                expect(linked?.status).toEqual('HEALTHY')
                expect(linked?.enabled).toBe(true)
                expect(linked?.slug).toBeTruthy()

                // Cleanup
                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('cascade-deletes the linked BUILT_IN agent when the agentflow is deleted', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const before = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                expect(before).not.toBeNull()

                await deleteTestAgentflow(authToken, agentflowId)

                const after = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                expect(after).toBeNull()
            })

            it('produces a unique slug when two flows share a name', async () => {
                const authToken = await getAuthToken()
                const sharedName = `Shared Name ${Date.now()}`
                const flowPayload = {
                    name: sharedName,
                    type: 'AGENTFLOW',
                    flowData: JSON.stringify({ nodes: [], edges: [] })
                }

                const r1 = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(flowPayload)
                const r2 = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(flowPayload)

                expect(r1.status).toEqual(StatusCodes.OK)
                expect(r2.status).toEqual(StatusCodes.OK)

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const a1 = await agentRepo.findOneBy({ builtinAgentflowId: r1.body.id })
                const a2 = await agentRepo.findOneBy({ builtinAgentflowId: r2.body.id })
                expect(a1?.slug).toBeTruthy()
                expect(a2?.slug).toBeTruthy()
                expect(a1?.slug).not.toEqual(a2?.slug)

                // Cleanup
                await deleteTestAgentflow(authToken, r1.body.id)
                await deleteTestAgentflow(authToken, r2.body.id)
            })
        })

        describe('MCP Registry Server allowedTools aggregation (v1.7)', () => {
            const insertMCPServer = async (slug: string, name: string): Promise<MCPServer> => {
                const repo = getRunningExpressApp().AppDataSource.getRepository(MCPServer)
                const server = repo.create({
                    name,
                    slug,
                    transport: MCPServerTransport.STREAMABLE_HTTP,
                    url: 'https://example.invalid/mcp',
                    status: MCPServerStatus.UNKNOWN,
                    enabled: true
                })
                return await repo.save(server)
            }

            const flowDataWithRegistryNodes = (nodes: { mcpServerId: string; mcpActions: string[] }[]): string =>
                JSON.stringify({
                    nodes: nodes.map((n, idx) => ({
                        id: `mcpRegistryServer_${idx}`,
                        data: {
                            name: 'mcpRegistryServer',
                            inputs: { mcpServerId: n.mcpServerId, mcpActions: n.mcpActions }
                        }
                    })),
                    edges: []
                })

            const flowDataWithAgentPrimitive = (entries: { mcpServerId: string; mcpActions: string[] }[]): string =>
                JSON.stringify({
                    nodes: [
                        {
                            id: 'agentAgentflow_0',
                            data: {
                                name: 'agentAgentflow',
                                inputs: {
                                    agentTools: entries.map((e) => ({
                                        agentSelectedTool: 'mcpRegistryServer',
                                        agentSelectedToolConfig: { mcpServerId: e.mcpServerId, mcpActions: e.mcpActions },
                                        agentSelectedToolRequiresHumanInput: false
                                    }))
                                }
                            }
                        }
                    ],
                    edges: []
                })

            const flowDataWithToolPrimitive = (mcpServerId: string, mcpActions: string[]): string =>
                JSON.stringify({
                    nodes: [
                        {
                            id: 'toolAgentflow_0',
                            data: {
                                name: 'toolAgentflow',
                                inputs: {
                                    toolAgentflowSelectedTool: 'mcpRegistryServer',
                                    toolAgentflowSelectedToolConfig: { mcpServerId, mcpActions }
                                }
                            }
                        }
                    ],
                    edges: []
                })

            it('leaves Agent.allowedTools null when the canvas has no MCP Registry Server nodes', async () => {
                const authToken = await getAuthToken()
                const agentflowId = await createTestAgentflow(authToken)

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                expect(linked).not.toBeNull()
                expect(linked?.allowedTools ?? null).toBeNull()

                await deleteTestAgentflow(authToken, agentflowId)
            })

            it('aggregates one MCP Registry Server node + 2 actions into <slug>.<tool> entries', async () => {
                const authToken = await getAuthToken()
                const server = await insertMCPServer(`agg-test-${Date.now()}`, 'Agg Test 1')

                const newAgentflow = {
                    name: `Agentflow Agg ${Date.now()}`,
                    type: 'AGENTFLOW',
                    flowData: flowDataWithRegistryNodes([{ mcpServerId: server.id, mcpActions: ['create_issue', 'search'] }])
                }
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newAgentflow)
                expect(response.status).toEqual(StatusCodes.OK)
                const agentflowId = response.body.id

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                const allowed = JSON.parse(linked?.allowedTools ?? '[]') as string[]
                expect(allowed.sort()).toEqual([`${server.slug}.create_issue`, `${server.slug}.search`].sort())

                await deleteTestAgentflow(authToken, agentflowId)
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: server.id })
            })

            it('aggregates and deduplicates entries across two MCP Registry Server nodes pointing at different servers', async () => {
                const authToken = await getAuthToken()
                const ts = Date.now()
                const serverA = await insertMCPServer(`dedup-a-${ts}`, 'Dedup A')
                const serverB = await insertMCPServer(`dedup-b-${ts}`, 'Dedup B')

                const newAgentflow = {
                    name: `Agentflow Dedup ${ts}`,
                    type: 'AGENTFLOW',
                    flowData: flowDataWithRegistryNodes([
                        { mcpServerId: serverA.id, mcpActions: ['t1', 't2'] },
                        { mcpServerId: serverB.id, mcpActions: ['t1'] },
                        // duplicate of the first node — same server, overlapping tools, plus one new
                        { mcpServerId: serverA.id, mcpActions: ['t1', 't3'] }
                    ])
                }
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newAgentflow)
                expect(response.status).toEqual(StatusCodes.OK)
                const agentflowId = response.body.id

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                const allowed = JSON.parse(linked?.allowedTools ?? '[]') as string[]
                expect(allowed.sort()).toEqual(
                    [`${serverA.slug}.t1`, `${serverA.slug}.t2`, `${serverA.slug}.t3`, `${serverB.slug}.t1`].sort()
                )

                await deleteTestAgentflow(authToken, agentflowId)
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: serverA.id })
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: serverB.id })
            })

            it('aggregates an MCP Registry Server selection embedded inside an Agent agentflow primitive', async () => {
                const authToken = await getAuthToken()
                const ts = Date.now()
                const serverA = await insertMCPServer(`agent-prim-a-${ts}`, 'Agent Prim A')
                const serverB = await insertMCPServer(`agent-prim-b-${ts}`, 'Agent Prim B')

                const newAgentflow = {
                    name: `Agent Primitive ${ts}`,
                    type: 'AGENTFLOW',
                    flowData: flowDataWithAgentPrimitive([
                        { mcpServerId: serverA.id, mcpActions: ['read_wiki_contents', 'search'] },
                        { mcpServerId: serverB.id, mcpActions: ['post_message'] }
                    ])
                }
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newAgentflow)
                expect(response.status).toEqual(StatusCodes.OK)
                const agentflowId = response.body.id

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                const allowed = JSON.parse(linked?.allowedTools ?? '[]') as string[]
                expect(allowed.sort()).toEqual(
                    [`${serverA.slug}.read_wiki_contents`, `${serverA.slug}.search`, `${serverB.slug}.post_message`].sort()
                )

                await deleteTestAgentflow(authToken, agentflowId)
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: serverA.id })
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: serverB.id })
            })

            it('aggregates an MCP Registry Server selection embedded inside a Tool agentflow primitive', async () => {
                const authToken = await getAuthToken()
                const ts = Date.now()
                const server = await insertMCPServer(`tool-prim-${ts}`, 'Tool Prim')

                const newAgentflow = {
                    name: `Tool Primitive ${ts}`,
                    type: 'AGENTFLOW',
                    flowData: flowDataWithToolPrimitive(server.id, ['fetch_url', 'render_pdf'])
                }
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/agentflows')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newAgentflow)
                expect(response.status).toEqual(StatusCodes.OK)
                const agentflowId = response.body.id

                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const linked = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                const allowed = JSON.parse(linked?.allowedTools ?? '[]') as string[]
                expect(allowed.sort()).toEqual([`${server.slug}.fetch_url`, `${server.slug}.render_pdf`].sort())

                await deleteTestAgentflow(authToken, agentflowId)
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: server.id })
            })

            it('clobbers manual Agent.allowedTools entries when the canvas is updated', async () => {
                const authToken = await getAuthToken()
                const ts = Date.now()
                const server = await insertMCPServer(`clobber-${ts}`, 'Clobber')

                // Start with an empty agentflow, then manually set allowedTools on the BUILT_IN agent.
                const agentflowId = await createTestAgentflow(authToken)
                const agentRepo = getRunningExpressApp().AppDataSource.getRepository(Agent)
                const before = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                await agentRepo.update(before!.id, { allowedTools: JSON.stringify(['manual.entry']) })

                // Update the agentflow with a Registry node — should clobber the manual entry.
                const updateBody = {
                    flowData: flowDataWithRegistryNodes([{ mcpServerId: server.id, mcpActions: ['create_issue'] }])
                }
                const updateRes = await supertest(getRunningExpressApp().app)
                    .put(`/api/v1/agentflows/${agentflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(updateBody)
                expect(updateRes.status).toEqual(StatusCodes.OK)

                const after = await agentRepo.findOneBy({ builtinAgentflowId: agentflowId })
                const allowed = JSON.parse(after?.allowedTools ?? '[]') as string[]
                expect(allowed).toEqual([`${server.slug}.create_issue`])
                expect(allowed).not.toContain('manual.entry')

                await deleteTestAgentflow(authToken, agentflowId)
                await getRunningExpressApp().AppDataSource.getRepository(MCPServer).delete({ id: server.id })
            })
        })
    })
}
