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
    IconCalendarTime
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
    IconFileUpload,
    IconClipboardList,
    IconStack2,
    IconUsers,
    IconLockCheck,
    IconFileDatabase,
    IconShieldLock,
    IconListCheck,
    IconSparkles,
    IconCalendarTime
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
                    id: 'agentflows',
                    title: 'Agentflows',
                    type: 'item',
                    url: '/agentflows',
                    icon: icons.IconUsersGroup,
                    breadcrumbs: true,
                    permission: 'agentflows:view'
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
                    id: 'schedules',
                    title: 'Schedules',
                    type: 'item',
                    url: '/schedules',
                    icon: icons.IconCalendarTime,
                    breadcrumbs: true,
                    permission: 'schedules:view'
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
                    id: 'credentials',
                    title: 'Credentials',
                    type: 'item',
                    url: '/credentials',
                    icon: icons.IconLock,
                    breadcrumbs: true,
                    permission: 'credentials:view'
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
                    id: 'apikey',
                    title: 'API Credentials',
                    type: 'item',
                    url: '/apikey',
                    icon: icons.IconKey,
                    breadcrumbs: true,
                    permission: 'apikeys:view'
                },
                {
                    id: 'document-stores',
                    title: 'Document Stores',
                    type: 'item',
                    url: '/document-stores',
                    icon: icons.IconFiles,
                    breadcrumbs: true,
                    permission: 'documentStores:view'
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
        },
        {
            id: 'management',
            title: 'Administration',
            type: 'group',
            children: [
                {
                    id: 'users',
                    title: 'Users',
                    type: 'item',
                    url: '/users',
                    icon: icons.IconUsers,
                    breadcrumbs: true,
                    permission: 'users:manage'
                }
            ]
        },
        {
            id: 'others',
            title: 'Others',
            type: 'group',
            children: [
                {
                    id: 'logs',
                    title: 'Logs',
                    type: 'item',
                    url: '/logs',
                    icon: icons.IconList,
                    breadcrumbs: true,
                    display: 'feat:logs',
                    permission: 'logs:view'
                },
                // {
                //     id: 'files',
                //     title: 'Files',
                //     type: 'item',
                //     url: '/files',
                //     icon: icons.IconFileDatabase,
                //     breadcrumbs: true,
                //     display: 'feat:files',
                // },
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
        }
    ]
}

export default dashboard
