import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../src/utils/getRunningExpressApp'
import { AgentflowErrorMessage, validateAgentflowType } from '../../src/services/agentflows'
import { EnumAgentflowType } from '../../src/database/entities/AgentFlow'

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

            it('should not throw error for valid ASSISTANT type', () => {
                expect(() => validateAgentflowType(EnumAgentflowType.ASSISTANT)).not.toThrow()
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
    })
}
