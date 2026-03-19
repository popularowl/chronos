import express from 'express'
import apikeyRouter from './apikey'
import attachmentsRouter from './attachments'
import chatMessageRouter from './chat-messages'
import agentflowsRouter from './agentflows'
import agentflowsStreamingRouter from './agentflows-streaming'
import agentflowsUploadsRouter from './agentflows-uploads'
import componentsCredentialsRouter from './components-credentials'
import componentsCredentialsIconRouter from './components-credentials-icon'
import credentialsRouter from './credentials'
import datasetRouter from './dataset'
import documentStoreRouter from './documentstore'
import evaluationsRouter from './evaluations'
import evaluatorsRouter from './evaluator'
import exportImportRouter from './export-import'
import feedbackRouter from './feedback'
import fetchLinksRouter from './fetch-links'
import filesRouter from './files'
import flowConfigRouter from './flow-config'
import getUploadFileRouter from './get-upload-file'
import getUploadPathRouter from './get-upload-path'
import internalChatmessagesRouter from './internal-chat-messages'
import internalPredictionRouter from './internal-predictions'
import leadsRouter from './leads'
import loadPromptRouter from './load-prompts'
import logsRouter from './log'
import templatesRouter from './templates'
import nodeConfigRouter from './node-configs'
import nodeCustomFunctionRouter from './node-custom-functions'
import nodeIconRouter from './node-icons'
import nodeLoadMethodRouter from './node-load-methods'
import nodesRouter from './nodes'
import oauth2Router from './oauth2'
import openaiRealtimeRouter from './openai-realtime'
import openaiRouter from './openai'
import pingRouter from './ping'
import predictionRouter from './predictions'
import promptListsRouter from './prompts-lists'
import publicExecutionsRouter from './public-executions'
import settingsRouter from './settings'
import statsRouter from './stats'
import skillsRouter from './skills'
import toolsRouter from './tools'
import upsertHistoryRouter from './upsert-history'
import variablesRouter from './variables'
import vectorRouter from './vectors'
import verifyRouter from './verify'
import versionRouter from './versions'
import executionsRouter from './executions'
import validationRouter from './validation'
import agentflowv2GeneratorRouter from './agentflowv2-generator'
import textToSpeechRouter from './text-to-speech'

// Simple auth router (Apache 2.0 licensed)
import authRouter from './auth'
import usersRouter from './users'

// OAuth client management (UI, JWT auth)
import oauthClientsRouter from './oauth-clients'

// Management Admin API
import adminRouter from './admin'

const router = express.Router()

router.use('/ping', pingRouter)
router.use('/apikey', apikeyRouter)
router.use('/attachments', attachmentsRouter)
router.use('/agentflows', agentflowsRouter)
router.use('/agentflows-streaming', agentflowsStreamingRouter)
router.use('/chatmessage', chatMessageRouter)
router.use('/agentflows-uploads', agentflowsUploadsRouter)
router.use('/components-credentials', componentsCredentialsRouter)
router.use('/components-credentials-icon', componentsCredentialsIconRouter)
router.use('/credentials', credentialsRouter)
router.use('/datasets', datasetRouter)
router.use('/document-store', documentStoreRouter)
router.use('/evaluations', evaluationsRouter)
router.use('/evaluators', evaluatorsRouter)
router.use('/export-import', exportImportRouter)
router.use('/feedback', feedbackRouter)
router.use('/fetch-links', fetchLinksRouter)
router.use('/flow-config', flowConfigRouter)
router.use('/internal-chatmessage', internalChatmessagesRouter)
router.use('/internal-prediction', internalPredictionRouter)
router.use('/get-upload-file', getUploadFileRouter)
router.use('/get-upload-path', getUploadPathRouter)
router.use('/leads', leadsRouter)
router.use('/load-prompt', loadPromptRouter)
router.use('/templates', templatesRouter)
router.use('/node-config', nodeConfigRouter)
router.use('/node-custom-function', nodeCustomFunctionRouter)
router.use('/node-icon', nodeIconRouter)
router.use('/node-load-method', nodeLoadMethodRouter)
router.use('/nodes', nodesRouter)
router.use('/oauth2-credential', oauth2Router)
router.use('/openai-realtime', openaiRealtimeRouter)
router.use('/openai', openaiRouter)
router.use('/prediction', predictionRouter)
router.use('/prompts-list', promptListsRouter)
router.use('/public-executions', publicExecutionsRouter)
router.use('/stats', statsRouter)
router.use('/skills', skillsRouter)
router.use('/tools', toolsRouter)
router.use('/variables', variablesRouter)
router.use('/vector', vectorRouter)
router.use('/verify', verifyRouter)
router.use('/version', versionRouter)
router.use('/upsert-history', upsertHistoryRouter)
router.use('/settings', settingsRouter)
router.use('/executions', executionsRouter)
router.use('/validation', validationRouter)
router.use('/agentflowv2-generator', agentflowv2GeneratorRouter)
router.use('/text-to-speech', textToSpeechRouter)
router.use('/logs', logsRouter)
router.use('/files', filesRouter)

// Simple auth routes (signup, login, logout, me)
router.use('/auth', authRouter)

// Users management routes (admin only)
router.use('/users', usersRouter)

// OAuth client management (admin-only, UI access)
router.use('/oauth-clients', oauthClientsRouter)

// Management Admin API (OAuth2 client credentials auth)
router.use('/admin', adminRouter)

export default router
