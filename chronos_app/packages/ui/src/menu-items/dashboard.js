// assets
import {
    IconList,
    IconUsersGroup,
    IconHierarchy,
    IconTemplate,
    IconKey,
    IconTool,
    IconLock,
    IconRobot,
    IconSettings,
    IconVariable,
    IconFiles,
    IconTestPipe,
    IconMicroscope,
    IconDatabase,
    IconChartHistogram,
    IconChartBar,
    IconUserEdit,
    IconFileUpload,
    IconClipboardList,
    IconStack2,
    IconUsers,
    IconLockCheck,
    IconFileDatabase,
    IconShieldLock,
    IconListCheck,
    IconSparkles,
    IconCalendarTime,
    IconWebhook,
    IconPlug,
    IconHistory
} from '@tabler/icons-react'

// constant
const icons = {
    IconHierarchy,
    IconUsersGroup,
    IconTemplate,
    IconList,
    IconKey,
    IconTool,
    IconLock,
    IconRobot,
    IconSettings,
    IconVariable,
    IconFiles,
    IconTestPipe,
    IconMicroscope,
    IconDatabase,
    IconUserEdit,
    IconChartHistogram,
    IconChartBar,
    IconFileUpload,
    IconClipboardList,
    IconStack2,
    IconUsers,
    IconLockCheck,
    IconFileDatabase,
    IconShieldLock,
    IconListCheck,
    IconSparkles,
    IconCalendarTime,
    IconWebhook,
    IconPlug,
    IconHistory
}

// ==============================|| DASHBOARD MENU ITEMS ||============================== //

const dashboard = {
    id: 'dashboard',
    title: '',
    type: 'group',
    children: [
        {
            id: 'primary',
            title: '',
            type: 'group',
            children: [
                {
                    id: 'agents',
                    title: 'Agents',
                    type: 'item',
                    url: '/agents',
                    icon: icons.IconRobot,
                    breadcrumbs: true,
                    permission: 'agents:view'
                },
                {
                    id: 'mcp-servers',
                    title: 'MCP Servers',
                    type: 'item',
                    url: '/mcp-servers',
                    icon: icons.IconPlug,
                    breadcrumbs: true,
                    permission: 'mcp-servers:view'
                },
                {
                    id: 'agentflows',
                    title: 'Agentflows',
                    type: 'collapse',
                    icon: icons.IconUsersGroup,
                    children: [
                        {
                            id: 'agentflows-all',
                            title: 'All Agentflows',
                            type: 'item',
                            url: '/agentflows',
                            icon: icons.IconList,
                            breadcrumbs: true,
                            permission: 'agentflows:view'
                        },
                        {
                            id: 'skills',
                            title: 'Skills',
                            type: 'item',
                            url: '/skills',
                            icon: icons.IconSparkles,
                            breadcrumbs: true,
                            permission: 'skills:view'
                        },
                        {
                            id: 'tools',
                            title: 'Tools',
                            type: 'item',
                            url: '/tools',
                            icon: icons.IconTool,
                            breadcrumbs: true,
                            permission: 'tools:view'
                        },
                        {
                            id: 'templates',
                            title: 'Templates',
                            type: 'item',
                            url: '/templates',
                            icon: icons.IconTemplate,
                            breadcrumbs: true,
                            permission: 'templates:marketplace,templates:custom'
                        },
                        {
                            id: 'variables',
                            title: 'Variables',
                            type: 'item',
                            url: '/variables',
                            icon: icons.IconVariable,
                            breadcrumbs: true,
                            permission: 'variables:view'
                        },
                        {
                            id: 'document-stores',
                            title: 'Document Stores',
                            type: 'item',
                            url: '/document-stores',
                            icon: icons.IconFiles,
                            breadcrumbs: true,
                            permission: 'documentStores:view'
                        },
                        {
                            id: 'schedules',
                            title: 'Schedules',
                            type: 'item',
                            url: '/schedules',
                            icon: icons.IconCalendarTime,
                            breadcrumbs: true,
                            permission: 'schedules:view'
                        },
                        {
                            id: 'webhooks',
                            title: 'Webhooks',
                            type: 'item',
                            url: '/webhooks',
                            icon: icons.IconWebhook,
                            breadcrumbs: true,
                            permission: 'webhooks:view',
                            display: 'feat:webhooks'
                        }
                    ]
                },
                {
                    id: 'executions',
                    title: 'Executions',
                    type: 'item',
                    url: '/executions',
                    icon: icons.IconListCheck,
                    breadcrumbs: true,
                    permission: 'executions:view'
                },
                {
                    id: 'audit-log',
                    title: 'Audit Log',
                    type: 'item',
                    url: '/audit-log',
                    icon: icons.IconHistory,
                    breadcrumbs: true,
                    permission: 'mcp-servers:view'
                },
                {
                    id: 'management',
                    title: 'Management',
                    type: 'collapse',
                    icon: icons.IconStack2,
                    children: [
                        {
                            id: 'apikey',
                            title: 'API Credentials',
                            type: 'item',
                            url: '/apikey',
                            icon: icons.IconKey,
                            breadcrumbs: true,
                            permission: 'apikeys:view'
                        },
                        {
                            id: 'credentials',
                            title: 'Credentials',
                            type: 'item',
                            url: '/credentials',
                            icon: icons.IconLock,
                            breadcrumbs: true,
                            permission: 'credentials:view'
                        },
                        {
                            id: 'cost-dashboard',
                            title: 'Cost Dashboard',
                            type: 'item',
                            url: '/dashboard',
                            icon: icons.IconChartBar,
                            breadcrumbs: true,
                            permission: 'dashboard:view',
                            display: 'feat:dashboard'
                        },
                        {
                            id: 'users',
                            title: 'Users',
                            type: 'item',
                            url: '/users',
                            icon: icons.IconUsers,
                            breadcrumbs: true,
                            permission: 'users:manage'
                        },
                        {
                            id: 'logs',
                            title: 'Logs',
                            type: 'item',
                            url: '/logs',
                            icon: icons.IconList,
                            breadcrumbs: true,
                            display: 'feat:logs',
                            permission: 'logs:view'
                        }
                    ]
                },
                {
                    id: 'account',
                    title: 'Account Settings',
                    type: 'item',
                    url: '/account',
                    icon: icons.IconSettings,
                    breadcrumbs: true,
                    display: 'feat:account'
                }
            ]
        },
        {
            id: 'evaluations',
            title: 'Evaluations',
            type: 'group',
            children: [
                {
                    id: 'datasets',
                    title: 'Datasets',
                    type: 'item',
                    url: '/datasets',
                    icon: icons.IconDatabase,
                    breadcrumbs: true,
                    display: 'feat:datasets',
                    permission: 'datasets:view'
                },
                {
                    id: 'evaluators',
                    title: 'Evaluators',
                    type: 'item',
                    url: '/evaluators',
                    icon: icons.IconTestPipe,
                    breadcrumbs: true,
                    display: 'feat:evaluators',
                    permission: 'evaluators:view'
                },
                {
                    id: 'evaluations',
                    title: 'Evaluations',
                    type: 'item',
                    url: '/evaluations',
                    icon: icons.IconChartHistogram,
                    breadcrumbs: true,
                    display: 'feat:evaluations',
                    permission: 'evaluations:view'
                }
            ]
        }
    ]
}

export default dashboard
