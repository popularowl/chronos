import { AgentFlow } from './AgentFlow'
import { ChatMessage } from './ChatMessage'
import { ChatMessageFeedback } from './ChatMessageFeedback'
import { Credential } from './Credential'
import { Tool } from './Tool'
import { Assistant } from './Assistant'
import { Variable } from './Variable'
import { DocumentStore } from './DocumentStore'
import { DocumentStoreFileChunk } from './DocumentStoreFileChunk'
import { Lead } from './Lead'
import { UpsertHistory } from './UpsertHistory'
import { Dataset } from './Dataset'
import { DatasetRow } from './DatasetRow'
import { EvaluationRun } from './EvaluationRun'
import { Evaluation } from './Evaluation'
import { Evaluator } from './Evaluator'
import { ApiKey } from './ApiKey'
import { CustomTemplate } from './CustomTemplate'
import { Execution } from './Execution'
import { User } from './User'
import { OAuthClient } from './OAuthClient'
import { Skill } from './Skill'
import { Schedule } from './Schedule'
import { ExecutionMetrics } from './ExecutionMetrics'
import { DailyMetrics } from './DailyMetrics'
import { Webhook } from './Webhook'
import { WebhookDelivery } from './WebhookDelivery'
import { AgentflowVersion } from './AgentflowVersion'
import { Agent } from './Agent'

export const entities = {
    AgentFlow,
    ChatMessage,
    ChatMessageFeedback,
    Credential,
    Tool,
    Assistant,
    Variable,
    UpsertHistory,
    DocumentStore,
    DocumentStoreFileChunk,
    Lead,
    Dataset,
    DatasetRow,
    Evaluation,
    EvaluationRun,
    Evaluator,
    ApiKey,
    CustomTemplate,
    Execution,
    User,
    OAuthClient,
    Skill,
    Schedule,
    ExecutionMetrics,
    DailyMetrics,
    Webhook,
    WebhookDelivery,
    AgentflowVersion,
    Agent
}
