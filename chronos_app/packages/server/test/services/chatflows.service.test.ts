import { StatusCodes } from 'http-status-codes'
import supertest from 'supertest'
import { getRunningExpressApp } from '../../src/utils/getRunningExpressApp'
import { ChatflowErrorMessage, validateChatflowType } from '../../src/services/chatflows'
import { EnumChatflowType } from '../../src/database/entities/ChatFlow'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `chatflow-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Helper function to create a test chatflow
 */
async function createTestChatflow(authToken: string): Promise<string> {
    const newChatflow = {
        name: 'Test Chatflow ' + Date.now(),
        type: 'AGENTFLOW',
        flowData: JSON.stringify({ nodes: [], edges: [] })
    }

    const response = await supertest(getRunningExpressApp().app)
        .post('/api/v1/chatflows')
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
        .send(newChatflow)

    return response.body.id
}

/**
 * Helper function to delete a test chatflow
 */
async function deleteTestChatflow(authToken: string, chatflowId: string): Promise<void> {
    await supertest(getRunningExpressApp().app)
        .delete(`/api/v1/chatflows/${chatflowId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')
}

/**
 * Test suite for chatflows service and routes
 * Tests the chatflow CRUD operations at /api/v1/chatflows/*
 */
export function chatflowsServiceTest() {
    describe('Chatflows Service', () => {
        const baseRoute = '/api/v1/chatflows'

        describe('validateChatflowType', () => {
            it('should not throw error for valid AGENTFLOW type', () => {
                expect(() => validateChatflowType(EnumChatflowType.AGENTFLOW)).not.toThrow()
            })

            it('should not throw error for valid ASSISTANT type', () => {
                expect(() => validateChatflowType(EnumChatflowType.ASSISTANT)).not.toThrow()
            })

            it('should throw error for invalid chatflow type', () => {
                expect(() => validateChatflowType('INVALID_TYPE' as any)).toThrow(ChatflowErrorMessage.INVALID_CHATFLOW_TYPE)
            })

            it('should throw error for undefined chatflow type', () => {
                expect(() => validateChatflowType(undefined)).toThrow(ChatflowErrorMessage.INVALID_CHATFLOW_TYPE)
            })
        })

        describe('Chatflow CRUD Operations', () => {
            it('should create a new chatflow', async () => {
                const authToken = await getAuthToken()
                const newChatflow = {
                    name: 'Test Chatflow Create',
                    type: 'AGENTFLOW',
                    flowData: JSON.stringify({ nodes: [], edges: [] })
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(newChatflow)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.id).toBeDefined()
                expect(response.body.name).toEqual(newChatflow.name)
                expect(response.body.type).toEqual(newChatflow.type)

                // Cleanup
                await deleteTestChatflow(authToken, response.body.id)
            })

            it('should reject chatflow with invalid type', async () => {
                const authToken = await getAuthToken()
                const invalidChatflow = {
                    name: 'Invalid Chatflow',
                    type: 'INVALID_TYPE',
                    flowData: JSON.stringify({ nodes: [], edges: [] })
                }

                const response = await supertest(getRunningExpressApp().app)
                    .post(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(invalidChatflow)

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)
            })

            it('should return all chatflows', async () => {
                const authToken = await getAuthToken()

                const response = await supertest(getRunningExpressApp().app)
                    .get(baseRoute)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                expect(Array.isArray(response.body)).toBe(true)
            })

            it('should filter chatflows by type', async () => {
                const authToken = await getAuthToken()

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}?type=AGENTFLOW`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                if (Array.isArray(response.body)) {
                    response.body.forEach((chatflow: any) => {
                        expect(chatflow.type).toEqual('AGENTFLOW')
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

            it('should return a chatflow by id', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${chatflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.id).toEqual(chatflowId)

                // Cleanup
                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should return error for non-existent chatflow', async () => {
                const authToken = await getAuthToken()
                const fakeId = '00000000-0000-0000-0000-000000000000'

                const response = await supertest(getRunningExpressApp().app)
                    .get(`${baseRoute}/${fakeId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                // API returns NOT_FOUND or INTERNAL_SERVER_ERROR depending on error handling
                expect([StatusCodes.NOT_FOUND, StatusCodes.INTERNAL_SERVER_ERROR]).toContain(response.status)
            })

            it('should update an existing chatflow', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const updateData = {
                    name: 'Updated Chatflow Name'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .put(`${baseRoute}/${chatflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(updateData)

                expect(response.status).toEqual(StatusCodes.OK)
                expect(response.body.name).toEqual(updateData.name)

                // Cleanup
                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should reject update with invalid type', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const updateData = {
                    type: 'INVALID_TYPE'
                }

                const response = await supertest(getRunningExpressApp().app)
                    .put(`${baseRoute}/${chatflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')
                    .send(updateData)

                expect(response.status).toEqual(StatusCodes.BAD_REQUEST)

                // Cleanup
                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should check if chatflow is valid for streaming', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                // chatflows-streaming is whitelisted, no internal header needed
                const response = await supertest(getRunningExpressApp().app).get(`/api/v1/chatflows-streaming/${chatflowId}`)

                // Empty chatflows may return error during streaming check or valid response
                if (response.status === StatusCodes.OK) {
                    expect(response.body).toHaveProperty('isStreaming')
                    expect(typeof response.body.isStreaming).toBe('boolean')
                } else {
                    expect(response.status).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
                }

                // Cleanup
                await deleteTestChatflow(authToken, chatflowId)
            })

            it('should return error for non-existent chatflow streaming check', async () => {
                const fakeId = '00000000-0000-0000-0000-000000000000'

                // chatflows-streaming is whitelisted, no auth needed
                const response = await supertest(getRunningExpressApp().app).get(`/api/v1/chatflows-streaming/${fakeId}`)

                expect(response.status).toEqual(StatusCodes.INTERNAL_SERVER_ERROR)
            })

            it('should delete an existing chatflow', async () => {
                const authToken = await getAuthToken()
                const chatflowId = await createTestChatflow(authToken)

                const response = await supertest(getRunningExpressApp().app)
                    .delete(`${baseRoute}/${chatflowId}`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect(response.status).toEqual(StatusCodes.OK)
            })

            it('should return error when trying to delete non-existent chatflow', async () => {
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
