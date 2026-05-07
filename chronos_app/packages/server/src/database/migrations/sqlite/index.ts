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
    AddCredentialAccessAudit1800000000011
]
