import { ConsolidatedBaseline1800000000000 } from './1800000000000-ConsolidatedBaseline'
import { AddSchedule1800000000001 } from './1800000000001-AddSchedule'
import { AddDashboardMetrics1800000000002 } from './1800000000002-AddDashboardMetrics'
import { AddWebhooks1800000000003 } from './1800000000003-AddWebhooks'
import { AddAgentflowVersioning1800000000004 } from './1800000000004-AddAgentflowVersioning'
import { AddAgentRegistry1800000000005 } from './1800000000005-AddAgentRegistry'
import { AddMCPServerRegistry1800000000006 } from './1800000000006-AddMCPServerRegistry'
import { BuiltInAgentDefaultHealthy1800000000007 } from './1800000000007-BuiltInAgentDefaultHealthy'
import { RemoveAssistantSupport1800000000008 } from './1800000000008-RemoveAssistantSupport'
import { RenameAgentflowV2TemplateType1800000000009 } from './1800000000009-RenameAgentflowV2TemplateType'
import { AddToolInvocationAudit1800000000010 } from './1800000000010-AddToolInvocationAudit'
import { AddCredentialAccessAudit1800000000011 } from './1800000000011-AddCredentialAccessAudit'
import { RenameCallbackTokenToMcpGatewayToken1800000000012 } from './1800000000012-RenameCallbackTokenToMcpGatewayToken'
import { AddMCPServerPolicies1800000000013 } from './1800000000013-AddMCPServerPolicies'
import { CreateMCPServerChangeLog1800000000014 } from './1800000000014-CreateMCPServerChangeLog'
import { AddPolicyOutcomeToToolInvocationAudit1800000000015 } from './1800000000015-AddPolicyOutcomeToToolInvocationAudit'
import { AddStdioFieldsToMCPServer1800000000016 } from './1800000000016-AddStdioFieldsToMCPServer'

export const sqliteMigrations = [
    ConsolidatedBaseline1800000000000,
    AddSchedule1800000000001,
    AddDashboardMetrics1800000000002,
    AddWebhooks1800000000003,
    AddAgentflowVersioning1800000000004,
    AddAgentRegistry1800000000005,
    AddMCPServerRegistry1800000000006,
    BuiltInAgentDefaultHealthy1800000000007,
    RemoveAssistantSupport1800000000008,
    RenameAgentflowV2TemplateType1800000000009,
    AddToolInvocationAudit1800000000010,
    AddCredentialAccessAudit1800000000011,
    RenameCallbackTokenToMcpGatewayToken1800000000012,
    AddMCPServerPolicies1800000000013,
    CreateMCPServerChangeLog1800000000014,
    AddPolicyOutcomeToToolInvocationAudit1800000000015,
    AddStdioFieldsToMCPServer1800000000016
]
