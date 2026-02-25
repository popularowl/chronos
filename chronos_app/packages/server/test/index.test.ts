import * as Server from '../src'
import { getRunningExpressApp } from '../src/utils/getRunningExpressApp'
import { authRouteTest } from './routes/v1/auth.route.test'
import { pingRouteTest } from './routes/v1/ping.route.test'
import { predictionsRouteTest } from './routes/v1/predictions.route.test'
import { agentflowv2GeneratorRouteTest } from './routes/v1/agentflowv2-generator.route.test'
import { settingsRouteTest } from './routes/v1/settings.route.test'
import { versionsRouteTest } from './routes/v1/versions.route.test'
import { statsRouteTest } from './routes/v1/stats.route.test'
import { promptsListsRouteTest } from './routes/v1/prompts-lists.route.test'
import { nodesRouteTest } from './routes/v1/nodes.route.test'
import { toolsRouteTest } from './routes/v1/tools.route.test'
import { variablesRouteTest } from './routes/v1/variables.route.test'
import { credentialsRouteTest } from './routes/v1/credentials.route.test'
import { apikeyRouteTest } from './routes/v1/apikey.route.test'
import { feedbackRouteTest } from './routes/v1/feedback.route.test'
import { executionsRouteTest } from './routes/v1/executions.route.test'
import { chatMessagesRouteTest } from './routes/v1/chat-messages.route.test'
import { documentstoreRouteTest } from './routes/v1/documentstore.route.test'
import { upsertHistoryRouteTest } from './routes/v1/upsert-history.route.test'
import { marketplacesRouteTest } from './routes/v1/marketplaces.route.test'
import { chatflowsExtendedRouteTest } from './routes/v1/chatflows-extended.route.test'
import { assistantsRouteTest } from './routes/v1/assistants.route.test'
import { flowConfigRouteTest } from './routes/v1/flow-config.route.test'
import { internalPredictionsRouteTest } from './routes/v1/internal-predictions.route.test'
import { datasetRouteTest } from './routes/v1/dataset.route.test'
import { leadsRouteTest } from './routes/v1/leads.route.test'
import { exportImportRouteTest } from './routes/v1/export-import.route.test'
import { logRouteTest } from './routes/v1/log.route.test'
import { chatflowsStreamingRouteTest } from './routes/v1/chatflows-streaming.route.test'
import { chatflowsUploadsRouteTest } from './routes/v1/chatflows-uploads.route.test'
import { publicChatflowsRouteTest } from './routes/v1/public-chatflows.route.test'
import { verifyRouteTest } from './routes/v1/verify.route.test'
import { loadPromptsRouteTest } from './routes/v1/load-prompts.route.test'
import { vectorsRouteTest } from './routes/v1/vectors.route.test'
import { nodeConfigsRouteTest } from './routes/v1/node-configs.route.test'
import { evaluationsRouteTest } from './routes/v1/evaluations.route.test'
import { fetchLinksRouteTest } from './routes/v1/fetch-links.route.test'
import { openaiAssistantsRouteTest } from './routes/v1/openai-assistants.route.test'
import { pricingRouteTest } from './routes/v1/pricing.route.test'
import { componentsCredentialsRouteTest } from './routes/v1/components-credentials.route.test'
import { getUploadFileRouteTest } from './routes/v1/get-upload-file.route.test'
import { nodeIconsRouteTest } from './routes/v1/node-icons.route.test'
import { attachmentsRouteTest } from './routes/v1/attachments.route.test'
import { evaluatorRouteTest } from './routes/v1/evaluator.route.test'
import { publicChatbotsRouteTest } from './routes/v1/public-chatbots.route.test'
import { publicExecutionsRouteTest } from './routes/v1/public-executions.route.test'
import { nodeLoadMethodsRouteTest } from './routes/v1/node-load-methods.route.test'
import { nodeCustomFunctionsRouteTest } from './routes/v1/node-custom-functions.route.test'
import { getUploadPathRouteTest } from './routes/v1/get-upload-path.route.test'
import { componentsCredentialsIconRouteTest } from './routes/v1/components-credentials-icon.route.test'
import { filesRouteTest } from './routes/v1/files.route.test'
import { validationRouteTest } from './routes/v1/validation.route.test'
import { openaiAssistantsVectorStoreRouteTest } from './routes/v1/openai-assistants-vector-store.route.test'
import { openaiAssistantsFilesRouteTest } from './routes/v1/openai-assistants-files.route.test'
import { textToSpeechRouteTest } from './routes/v1/text-to-speech.route.test'
import { chatflowsRouteTest } from './routes/v1/chatflows.route.test'
import { internalChatMessagesRouteTest } from './routes/v1/internal-chat-messages.route.test'
import { nvidiaNimRouteTest } from './routes/v1/nvidia-nim.route.test'
import { oauth2RouteTest } from './routes/v1/oauth2.route.test'
import { openaiRealtimeRouteTest } from './routes/v1/openai-realtime.route.test'
import { usersRouteTest } from './routes/v1/users.route.test'
import { chatflowsServiceTest } from './services/chatflows.service.test'
import { agentflowv2GeneratorServiceTest } from './services/agentflowv2-generator.service.test'
import { toolsServiceTest } from './services/tools.service.test'
import { credentialsServiceTest } from './services/credentials.service.test'
import { executionsServiceTest } from './services/executions.service.test'
import { feedbackServiceTest } from './services/feedback.service.test'
import { nodesServiceTest } from './services/nodes.service.test'
import { validationServiceTest } from './services/validation.service.test'
import { feedbackValidationServiceTest } from './services/feedback-validation.service.test'
import { chatMessagesServiceTest } from './services/chat-messages.service.test'
import { marketplacesServiceTest } from './services/marketplaces.service.test'
import { usersServiceTest } from './services/users.service.test'
import { apikeyServiceTest } from './services/apikey.service.test'
import { variablesServiceTest } from './services/variables.service.test'
import { leadsServiceTest } from './services/leads.service.test'
import { flowConfigsServiceTest } from './services/flow-configs.service.test'
import { settingsServiceTest } from './services/settings.service.test'
import { promptsListsServiceTest } from './services/prompts-lists.service.test'
// versions.service.test.ts cannot be included here because Node.js v24 does not allow
// mocking fs.existsSync at runtime (non-configurable property). It needs its own jest.mock().
// import { versionsServiceTest } from './services/versions.service.test'
import { vectorsServiceTest } from './services/vectors.service.test'
import { statsServiceTest } from './services/stats.service.test'
import { componentsCredentialsServiceTest } from './services/components-credentials.service.test'
import { upsertHistoryServiceTest } from './services/upsert-history.service.test'
import { loadPromptsServiceTest } from './services/load-prompts.service.test'
import { textToSpeechServiceTest } from './services/text-to-speech.service.test'
import { datasetServiceTest } from './services/dataset.service.test'
import { logServiceTest } from './services/log.service.test'
import { predictionsServiceTest } from './services/predictions.service.test'
import { evaluatorServiceTest } from './services/evaluator.service.test'
import { apiKeyTest } from './utils/api-key.util.test'
import { sanitizeUtilTest } from './utils/sanitize.util.test'
import { domainValidationUtilTest } from './utils/domain-validation.util.test'
import { indexUtilTest } from './utils/index.util.test'
import { xssUtilTest } from './utils/XSS.util.test'
import { buildAgentflowUtilTest } from './utils/buildAgentflow.util.test'
import { paginationUtilTest } from './utils/pagination.util.test'
import { telemetryUtilTest } from './utils/telemetry.util.test'
import { fileValidationUtilTest } from './utils/fileValidation.util.test'
import { loggerUtilTest } from './utils/logger.util.test'
import { validateKeyUtilTest } from './utils/validateKey.util.test'
import { rateLimitUtilTest } from './utils/rateLimit.util.test'
import { sseStreamerUtilTest } from './utils/SSEStreamer.util.test'
import { quotaUsageUtilTest } from './utils/quotaUsage.util.test'
import { hubUtilTest } from './utils/hub.util.test'
import { fileRepositoryUtilTest } from './utils/fileRepository.util.test'
import { addChatMessageUtilTest } from './utils/addChatMessage.util.test'
import { getChatMessageFeedbackUtilTest } from './utils/getChatMessageFeedback.util.test'
import { updateChatMessageFeedbackUtilTest } from './utils/updateChatMessageFeedback.util.test'
import { getUploadsConfigUtilTest } from './utils/getUploadsConfig.util.test'
import { initializeUserUtilTest } from './utils/initializeUser.util.test'
import { getChatMessageUtilTest } from './utils/getChatMessage.util.test'
import { addChatflowsCountUtilTest } from './utils/addChatflowsCount.util.test'
import { validateKeyExtraUtilTest } from './utils/validateKeyExtra.util.test'
import { addChatMessageFeedbackUtilTest } from './utils/addChatMessageFeedback.util.test'
import { errorUtilsTest } from './errors/utils.test'
import { internalChronosErrorTest } from './errors/internalChronosError.test'
import { cachePoolTest } from './CachePool.test'
import { abortControllerPoolTest } from './AbortControllerPool.test'
import { simpleIdentityManagerTest } from './SimpleIdentityManager.test'

// extend test timeout to 6 minutes for long setups (increase as tests grow)
jest.setTimeout(360000)

beforeAll(async () => {
    await Server.start()

    // wait 20 seconds for full server and database init (esp. on lower end hardware)
    await new Promise((resolve) => setTimeout(resolve, 1 * 20 * 1000))
})

afterAll(async () => {
    await getRunningExpressApp().stopApp()
})

describe('Routes Test', () => {
    pingRouteTest()
    authRouteTest()
    predictionsRouteTest()
    agentflowv2GeneratorRouteTest()
    settingsRouteTest()
    versionsRouteTest()
    statsRouteTest()
    promptsListsRouteTest()
    nodesRouteTest()
    toolsRouteTest()
    variablesRouteTest()
    credentialsRouteTest()
    apikeyRouteTest()
    feedbackRouteTest()
    executionsRouteTest()
    chatMessagesRouteTest()
    documentstoreRouteTest()
    upsertHistoryRouteTest()
    marketplacesRouteTest()
    chatflowsExtendedRouteTest()
    assistantsRouteTest()
    flowConfigRouteTest()
    internalPredictionsRouteTest()
    datasetRouteTest()
    leadsRouteTest()
    exportImportRouteTest()
    logRouteTest()
    chatflowsStreamingRouteTest()
    chatflowsUploadsRouteTest()
    publicChatflowsRouteTest()
    verifyRouteTest()
    loadPromptsRouteTest()
    vectorsRouteTest()
    nodeConfigsRouteTest()
    evaluationsRouteTest()
    fetchLinksRouteTest()
    openaiAssistantsRouteTest()
    pricingRouteTest()
    componentsCredentialsRouteTest()
    getUploadFileRouteTest()
    nodeIconsRouteTest()
    attachmentsRouteTest()
    evaluatorRouteTest()
    publicChatbotsRouteTest()
    publicExecutionsRouteTest()
    nodeLoadMethodsRouteTest()
    nodeCustomFunctionsRouteTest()
    getUploadPathRouteTest()
    componentsCredentialsIconRouteTest()
    filesRouteTest()
    validationRouteTest()
    openaiAssistantsVectorStoreRouteTest()
    openaiAssistantsFilesRouteTest()
    textToSpeechRouteTest()
    chatflowsRouteTest()
    internalChatMessagesRouteTest()
    nvidiaNimRouteTest()
    oauth2RouteTest()
    openaiRealtimeRouteTest()
    usersRouteTest()
})

describe('Services Test', () => {
    chatflowsServiceTest()
    agentflowv2GeneratorServiceTest()
    toolsServiceTest()
    credentialsServiceTest()
    executionsServiceTest()
    feedbackServiceTest()
    feedbackValidationServiceTest()
    nodesServiceTest()
    validationServiceTest()
    chatMessagesServiceTest()
    marketplacesServiceTest()
    usersServiceTest()
    apikeyServiceTest()
    variablesServiceTest()
    leadsServiceTest()
    flowConfigsServiceTest()
    settingsServiceTest()
    promptsListsServiceTest()
    // versionsServiceTest()
    vectorsServiceTest()
    statsServiceTest()
    componentsCredentialsServiceTest()
    upsertHistoryServiceTest()
    loadPromptsServiceTest()
    textToSpeechServiceTest()
    datasetServiceTest()
    logServiceTest()
    predictionsServiceTest()
    evaluatorServiceTest()
})

describe('Utils Test', () => {
    apiKeyTest()
    sanitizeUtilTest()
    domainValidationUtilTest()
    indexUtilTest()
    xssUtilTest()
    buildAgentflowUtilTest()
    paginationUtilTest()
    telemetryUtilTest()
    fileValidationUtilTest()
    loggerUtilTest()
    validateKeyUtilTest()
    rateLimitUtilTest()
    sseStreamerUtilTest()
    quotaUsageUtilTest()
    hubUtilTest()
    fileRepositoryUtilTest()
    addChatMessageUtilTest()
    getChatMessageFeedbackUtilTest()
    updateChatMessageFeedbackUtilTest()
    getUploadsConfigUtilTest()
    initializeUserUtilTest()
    getChatMessageUtilTest()
    addChatflowsCountUtilTest()
    validateKeyExtraUtilTest()
    addChatMessageFeedbackUtilTest()
})

describe('Errors Test', () => {
    errorUtilsTest()
    internalChronosErrorTest()
})

describe('Cache Test', () => {
    cachePoolTest()
})

describe('Pool Test', () => {
    abortControllerPoolTest()
})

describe('Identity Test', () => {
    simpleIdentityManagerTest()
})
