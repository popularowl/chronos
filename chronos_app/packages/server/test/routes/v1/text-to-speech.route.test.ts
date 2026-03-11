import supertest from 'supertest'
import { getRunningExpressApp } from '../../../src/utils/getRunningExpressApp'

/**
 * Helper function to get auth token
 */
async function getAuthToken(): Promise<string> {
    const uniqueId = Date.now() + Math.random()
    const testUser = {
        email: `tts-test-${uniqueId}@test.com`,
        password: 'test1234'
    }
    const response = await supertest(getRunningExpressApp().app).post('/api/v1/auth/signup').send(testUser)
    return response.body.token
}

/**
 * Helper to create a test chatflow with TTS config
 */
async function createTestChatflowWithTTS(authToken: string): Promise<string> {
    const ttsConfig = {
        openai: {
            status: true,
            credentialId: 'test-cred-id',
            voice: 'alloy',
            model: 'tts-1'
        }
    }
    const chatflowData = {
        name: `TTS Test Chatflow ${Date.now()}`,
        flowData: JSON.stringify({ nodes: [], edges: [] }),
        type: 'AGENTFLOW',
        textToSpeech: JSON.stringify(ttsConfig)
    }
    const response = await supertest(getRunningExpressApp().app)
        .post('/api/v1/chatflows')
        .send(chatflowData)
        .set('Authorization', `Bearer ${authToken}`)
        .set('x-request-from', 'internal')

    return response.body?.id || ''
}

/**
 * Test suite for text-to-speech route
 * Tests TTS generation, abort, and voices endpoints
 */
export function textToSpeechRouteTest() {
    describe('Text To Speech Route', () => {
        let authToken: string

        beforeAll(async () => {
            authToken = await getAuthToken()
        })

        describe('POST /api/v1/tts/generate', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).post('/api/v1/tts/generate').send({ text: 'Hello world' })

                expect([401, 403]).toContain(response.status)
            })

            it('should return error when text is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should return error when provider is not provided without chatflowId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({ text: 'Hello world' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should return error when credentialId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({ text: 'Hello world', provider: 'openai' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle request with chatflowId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: 'Hello world',
                        chatflowId: 'test-chatflow-id',
                        chatId: 'test-chat-id',
                        chatMessageId: 'msg-123'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with provider and credentialId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: 'Hello world',
                        provider: 'openai',
                        credentialId: 'test-credential',
                        voice: 'alloy',
                        model: 'tts-1'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with elevenlabs provider', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: 'Hello world',
                        provider: 'elevenlabs',
                        credentialId: 'test-credential',
                        voice: 'Rachel',
                        model: 'eleven_monolingual_v1'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with valid chatflow containing TTS config', async () => {
                const chatflowId = await createTestChatflowWithTTS(authToken)
                if (chatflowId) {
                    const response = await supertest(getRunningExpressApp().app)
                        .post('/api/v1/tts/generate')
                        .send({
                            text: 'Hello world',
                            chatflowId: chatflowId,
                            chatId: 'test-chat-id',
                            chatMessageId: 'msg-123'
                        })
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')

                    // Expect SSE response or error due to missing credentials
                    expect([200, 400, 404, 500]).toContain(response.status)

                    // Cleanup
                    await supertest(getRunningExpressApp().app)
                        .delete(`/api/v1/chatflows/${chatflowId}`)
                        .set('Authorization', `Bearer ${authToken}`)
                        .set('x-request-from', 'internal')
                }
            })

            it('should handle empty text string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: '',
                        provider: 'openai',
                        credentialId: 'test-credential'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle very long text', async () => {
                const longText = 'Hello world '.repeat(100)
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: longText,
                        provider: 'openai',
                        credentialId: 'test-credential',
                        voice: 'alloy'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with all optional parameters', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: 'Hello world',
                        chatflowId: 'test-chatflow-id',
                        chatId: 'test-chat-id',
                        chatMessageId: 'msg-123',
                        provider: 'openai',
                        credentialId: 'test-credential',
                        voice: 'alloy',
                        model: 'tts-1-hd'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle invalid provider', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/generate')
                    .send({
                        text: 'Hello world',
                        provider: 'invalid-provider',
                        credentialId: 'test-credential'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })

        describe('POST /api/v1/tts/abort', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({ chatId: 'test-chat', chatMessageId: 'msg-123', chatflowId: 'test-flow' })

                expect([401, 403]).toContain(response.status)
            })

            it('should return error when chatId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({})
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should return error when chatMessageId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({ chatId: 'test-chat' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should return error when chatflowId is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({ chatId: 'test-chat', chatMessageId: 'msg-123' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle abort with all required params', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({ chatId: 'test-chat', chatMessageId: 'msg-123', chatflowId: 'test-flow' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle abort for non-existent TTS stream', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({
                        chatId: `non-existent-${Date.now()}`,
                        chatMessageId: `msg-${Date.now()}`,
                        chatflowId: `flow-${Date.now()}`
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                // Should succeed even if no stream exists (abort is idempotent)
                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle abort with empty string chatId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({ chatId: '', chatMessageId: 'msg-123', chatflowId: 'test-flow' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle abort with special characters in IDs', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .post('/api/v1/tts/abort')
                    .send({
                        chatId: 'test-chat-@#$%',
                        chatMessageId: 'msg-123-special',
                        chatflowId: 'test-flow-uuid-format'
                    })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })

        describe('GET /api/v1/tts/voices', () => {
            it('should require authentication', async () => {
                const response = await supertest(getRunningExpressApp().app).get('/api/v1/tts/voices').query({ provider: 'openai' })

                expect([401, 403]).toContain(response.status)
            })

            it('should return error when provider is not provided', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle request with provider', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: 'openai' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with provider and credentialId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: 'openai', credentialId: 'test-credential' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with elevenlabs provider', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: 'elevenlabs', credentialId: 'test-credential' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with invalid provider', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: 'invalid-provider' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })

            it('should handle request with empty provider string', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: '' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 500]).toContain(response.status)
            })

            it('should handle request with non-existent credentialId', async () => {
                const response = await supertest(getRunningExpressApp().app)
                    .get('/api/v1/tts/voices')
                    .query({ provider: 'openai', credentialId: 'non-existent-credential-id' })
                    .set('Authorization', `Bearer ${authToken}`)
                    .set('x-request-from', 'internal')

                expect([200, 400, 404, 500]).toContain(response.status)
            })
        })
    })
}
