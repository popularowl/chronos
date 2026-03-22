import { ConsolidatedBaseline1800000000000 } from './1800000000000-ConsolidatedBaseline'
import { AddSchedule1800000000001 } from './1800000000001-AddSchedule'
import { AddDashboardMetrics1800000000002 } from './1800000000002-AddDashboardMetrics'
import { AddWebhooks1800000000003 } from './1800000000003-AddWebhooks'

export const sqliteMigrations = [
    ConsolidatedBaseline1800000000000,
    AddSchedule1800000000001,
    AddDashboardMetrics1800000000002,
    AddWebhooks1800000000003
]
