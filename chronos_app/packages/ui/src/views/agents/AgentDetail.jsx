import { useEffect, useMemo, useState } from 'react'
import moment from 'moment'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'

import {
    Alert,
    Box,
    Button,
    Chip,
    IconButton,
    Paper,
    Popover,
    Skeleton,
    Stack,
    Switch,
    Tab,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    Tabs,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import {
    IconArrowLeft,
    IconCopy,
    IconEdit,
    IconEye,
    IconEyeOff,
    IconRefresh,
    IconRobot,
    IconSend,
    IconTrash,
    IconX
} from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import AgentDialog from './AgentDialog'
import AgentExecutionsTab from './AgentExecutionsTab'
import AgentMetricsTab from './AgentMetricsTab'

import agentsApi from '@/api/agents'
import useApi from '@/hooks/useApi'
import useConfirm from '@/hooks/useConfirm'
import { useError } from '@/store/context/ErrorContext'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

const STATUS_CHIP_COLOR = {
    HEALTHY: 'success',
    UNHEALTHY: 'error',
    UNKNOWN: 'default',
    DISABLED: 'default'
}

const RUNTIME_LABEL = {
    HTTP: 'HTTP',
    BUILT_IN: 'Built-in'
}

/**
 * Agent detail page (`/agents/:id`).
 *
 * Layout mirrors the MCP Server detail page (which in turn mirrors the
 * `/apikey` Client Credentials pattern): a page-level `MainCard` carrying a
 * header bar + one-row apikey-style summary tables (Identity, Connection
 * for HTTP / Backing Agentflow for built-in) plus the MCP Gateway Token
 * control. Heavier sub-views (Executions, Metrics) live behind tabs in a
 * sibling `MainCard`.
 *
 * Page-level actions (Test Connection, Edit, Delete) sit in the header bar;
 * the Enabled toggle lives in the Identity table's Enabled column.
 */
const AgentDetail = () => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const { id } = useParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const { error, setError } = useError()
    const { confirm } = useConfirm()
    const getApi = useApi(agentsApi.getAgentById)

    const [agent, setAgent] = useState(null)
    const [tab, setTab] = useState(0)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [tokenVisible, setTokenVisible] = useState(false)
    const [testLoading, setTestLoading] = useState(false)
    const [rotateLoading, setRotateLoading] = useState(false)
    const [toggleLoading, setToggleLoading] = useState(false)
    // Anchor for the "Copied!" Popover, mirroring the /apikey API Key cell
    // pattern. The Popover dismisses itself after a short delay so the cell
    // stays clean.
    const [copyAnchorEl, setCopyAnchorEl] = useState(null)

    const showSuccess = (message) =>
        enqueueSnackbar({
            message,
            options: {
                key: new Date().getTime() + Math.random(),
                variant: 'success',
                action: (key) => (
                    <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                        <IconX />
                    </Button>
                )
            }
        })

    const showError = (message, persist = false) =>
        enqueueSnackbar({
            message,
            options: {
                key: new Date().getTime() + Math.random(),
                variant: 'error',
                persist,
                action: (key) => (
                    <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                        <IconX />
                    </Button>
                )
            }
        })

    useEffect(() => {
        if (id) getApi.request(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    useEffect(() => {
        if (getApi.data) setAgent(getApi.data)
    }, [getApi.data])

    useEffect(() => {
        if (getApi.error && setError) setError(getApi.error)
    }, [getApi.error, setError])

    const refresh = () => id && getApi.request(id)

    const onEdit = () => {
        setDialogProps({
            title: 'Edit Agent',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: agent
        })
        setShowDialog(true)
    }

    const onCopyToken = (event) => {
        if (!agent?.mcpGatewayToken) return
        navigator.clipboard.writeText(agent.mcpGatewayToken)
        setCopyAnchorEl(event.currentTarget)
        setTimeout(() => setCopyAnchorEl(null), 1500)
    }

    const onRotateToken = async () => {
        if (!agent?.id) return
        const confirmed = await confirm({
            title: 'Rotate MCP gateway token',
            description:
                'Rotating revokes the existing token immediately. Any agent process still using the old value will start failing with 401 until updated.',
            confirmButtonName: 'Rotate',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        setRotateLoading(true)
        try {
            const res = await agentsApi.regenerateMcpGatewayToken(agent.id)
            if (res.data) {
                setAgent(res.data)
                setTokenVisible(true)
                showSuccess('MCP gateway token rotated — copy the new value now')
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to rotate MCP gateway token', true)
        } finally {
            setRotateLoading(false)
        }
    }

    const onTestConnection = async () => {
        if (!agent?.id) return
        setTestLoading(true)
        try {
            const res = await agentsApi.testAgentConnection(agent.id)
            const result = res.data
            if (result?.success) showSuccess(result.message || 'Connection OK')
            else showError(result?.message || 'Connection failed', true)
        } catch (err) {
            showError(err?.response?.data?.message || 'Connection test failed', true)
        } finally {
            setTestLoading(false)
        }
    }

    const onToggle = async (next) => {
        if (!agent?.id) return
        setToggleLoading(true)
        try {
            await agentsApi.toggleAgent(agent.id, next)
            refresh()
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to toggle agent', true)
        } finally {
            setToggleLoading(false)
        }
    }

    const onDelete = async () => {
        if (!agent?.id) return
        const confirmed = await confirm({
            title: 'Delete Agent',
            description: `Delete "${agent.name}"? Any clients calling this agent's slug will start failing immediately.`,
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        try {
            await agentsApi.deleteAgent(agent.id)
            showSuccess('Agent deleted')
            navigate('/agents')
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to delete agent', true)
        }
    }

    const allowedTools = useMemo(() => toStringArray(agent?.allowedTools), [agent?.allowedTools])

    if (!agent && !error) {
        return (
            <MainCard>
                <Skeleton variant='rounded' height={300} />
            </MainCard>
        )
    }

    if (error) {
        return (
            <MainCard>
                <ErrorBoundary error={error} />
            </MainCard>
        )
    }

    const isHttp = agent.runtimeType === 'HTTP'
    const tableHeaderSx = {
        backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
        height: 56
    }
    const tableContainerSx = { border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }

    return (
        <>
            <MainCard>
                <Stack flexDirection='column' sx={{ gap: 3 }}>
                    {/* Header bar — back, identity title, page-level actions */}
                    <Stack direction='row' alignItems='center' spacing={1} flexWrap='wrap' useFlexGap>
                        <Tooltip title='Back to agents'>
                            <IconButton onClick={() => navigate('/agents')}>
                                <IconArrowLeft size={20} />
                            </IconButton>
                        </Tooltip>
                        <Box
                            sx={{
                                width: 35,
                                height: 35,
                                borderRadius: '50%',
                                backgroundColor: customization.isDarkMode ? theme.palette.common.white : theme.palette.grey[300] + 75,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <IconRobot size={20} color={theme.palette.grey[700]} />
                        </Box>
                        <Typography variant='h3' sx={{ flexGrow: 1 }}>
                            Agent: {agent.name}
                        </Typography>
                        {isHttp && (
                            <Tooltip title='HTTP GET reachability probe'>
                                <span>
                                    <StyledButton
                                        variant='outlined'
                                        onClick={onTestConnection}
                                        disabled={testLoading}
                                        startIcon={<IconSend size={16} />}
                                    >
                                        {testLoading ? 'Testing…' : 'Test Connection'}
                                    </StyledButton>
                                </span>
                            </Tooltip>
                        )}
                        <StyledPermissionButton
                            permissionId={'agents:update'}
                            variant='outlined'
                            startIcon={<IconEdit size={16} />}
                            onClick={onEdit}
                        >
                            Edit
                        </StyledPermissionButton>
                        <StyledPermissionButton
                            permissionId={'agents:delete'}
                            variant='outlined'
                            color='error'
                            startIcon={<IconTrash size={16} />}
                            onClick={onDelete}
                        >
                            Delete
                        </StyledPermissionButton>
                    </Stack>

                    {/* Identity — one-row apikey-style table */}
                    <TableContainer sx={tableContainerSx} component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label='agent identity'>
                            <TableHead sx={tableHeaderSx}>
                                <StyledTableRow>
                                    <StyledTableCell>Slug</StyledTableCell>
                                    <StyledTableCell>Runtime</StyledTableCell>
                                    <StyledTableCell>Status</StyledTableCell>
                                    <StyledTableCell sx={{ minWidth: 220 }}>Tools</StyledTableCell>
                                    <StyledTableCell>Created</StyledTableCell>
                                    <StyledTableCell>Enabled</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                <StyledTableRow>
                                    <StyledTableCell sx={{ fontFamily: 'monospace' }}>{agent.slug}</StyledTableCell>
                                    <StyledTableCell>
                                        <Chip
                                            size='small'
                                            label={RUNTIME_LABEL[agent.runtimeType] || agent.runtimeType}
                                            variant='outlined'
                                        />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Chip
                                            size='small'
                                            label={(agent.status || '').toLowerCase()}
                                            color={agent.status === 'HEALTHY' ? undefined : STATUS_CHIP_COLOR[agent.status] || 'default'}
                                            sx={{
                                                ...(agent.status === 'HEALTHY' && {
                                                    backgroundColor: theme.palette.success.dark,
                                                    color: theme.palette.common.white
                                                }),
                                                ...(agent.status === 'DISABLED' && { opacity: 0.6 })
                                            }}
                                        />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        {allowedTools.length === 0 ? (
                                            <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                                none
                                            </Typography>
                                        ) : (
                                            <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
                                                {allowedTools.map((t) => (
                                                    <Chip key={t} label={t} size='small' variant='outlined' />
                                                ))}
                                            </Stack>
                                        )}
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        {agent.createdDate ? moment(agent.createdDate).format('MMMM Do, YYYY HH:mm:ss') : '—'}
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Tooltip
                                            title={
                                                agent.enabled
                                                    ? 'Disable: clients calling this agent will receive 503 until re-enabled.'
                                                    : 'Enable: makes the agent invokable through /api/v1/agents again.'
                                            }
                                        >
                                            <span>
                                                <Switch
                                                    checked={Boolean(agent.enabled)}
                                                    onChange={(e) => onToggle(e.target.checked)}
                                                    disabled={toggleLoading}
                                                    size='small'
                                                />
                                            </span>
                                        </Tooltip>
                                    </StyledTableCell>
                                </StyledTableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Runtime details — Connection table for HTTP, Backing Agentflow row for BUILT_IN */}
                    {isHttp ? (
                        <TableContainer sx={tableContainerSx} component={Paper}>
                            <Table sx={{ minWidth: 650 }} aria-label='agent connection'>
                                <TableHead sx={tableHeaderSx}>
                                    <StyledTableRow>
                                        <StyledTableCell sx={{ width: '25%' }}>Service Endpoint</StyledTableCell>
                                        <StyledTableCell sx={{ width: '55%' }}>Token</StyledTableCell>
                                        <StyledTableCell>Last Health Check</StyledTableCell>
                                    </StyledTableRow>
                                </TableHead>
                                <TableBody>
                                    <StyledTableRow>
                                        <StyledTableCell sx={{ fontFamily: 'monospace', maxWidth: 240 }}>
                                            <Box
                                                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                title={agent.serviceEndpoint || ''}
                                            >
                                                {agent.serviceEndpoint || '—'}
                                            </Box>
                                        </StyledTableCell>
                                        <StyledTableCell>
                                            {agent.mcpGatewayToken ? (
                                                <>
                                                    <Box
                                                        component='span'
                                                        sx={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.85rem',
                                                            verticalAlign: 'middle'
                                                        }}
                                                    >
                                                        {tokenVisible
                                                            ? agent.mcpGatewayToken
                                                            : `${agent.mcpGatewayToken.substring(0, 2)}${'•'.repeat(
                                                                  18
                                                              )}${agent.mcpGatewayToken.substring(agent.mcpGatewayToken.length - 5)}`}
                                                    </Box>
                                                    <IconButton title='Copy' color='success' onClick={onCopyToken}>
                                                        <IconCopy />
                                                    </IconButton>
                                                    <IconButton
                                                        title={tokenVisible ? 'Hide' : 'Show'}
                                                        color='inherit'
                                                        onClick={() => setTokenVisible((v) => !v)}
                                                    >
                                                        {tokenVisible ? <IconEyeOff /> : <IconEye />}
                                                    </IconButton>
                                                    <IconButton
                                                        title='Rotate (invalidates the current token)'
                                                        color='primary'
                                                        onClick={onRotateToken}
                                                        disabled={rotateLoading}
                                                    >
                                                        <IconRefresh />
                                                    </IconButton>
                                                    <Popover
                                                        open={Boolean(copyAnchorEl)}
                                                        anchorEl={copyAnchorEl}
                                                        onClose={() => setCopyAnchorEl(null)}
                                                        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                                                        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                                                    >
                                                        <Typography
                                                            variant='h6'
                                                            sx={{ pl: 1, pr: 1, color: 'white', background: theme.palette.success.dark }}
                                                        >
                                                            Copied!
                                                        </Typography>
                                                    </Popover>
                                                </>
                                            ) : (
                                                <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                                    not issued
                                                </Typography>
                                            )}
                                        </StyledTableCell>
                                        <StyledTableCell>
                                            {agent.lastHealthCheckAt ? moment(agent.lastHealthCheckAt).format('MMM D, YYYY h:mm A') : '—'}
                                        </StyledTableCell>
                                    </StyledTableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <TableContainer sx={tableContainerSx} component={Paper}>
                            <Table sx={{ minWidth: 650 }} aria-label='backing agentflow'>
                                <TableHead sx={tableHeaderSx}>
                                    <StyledTableRow>
                                        <StyledTableCell>Backing Agentflow ID</StyledTableCell>
                                        <StyledTableCell>Canvas</StyledTableCell>
                                    </StyledTableRow>
                                </TableHead>
                                <TableBody>
                                    <StyledTableRow>
                                        <StyledTableCell sx={{ fontFamily: 'monospace' }}>
                                            {agent.builtinAgentflowId || '—'}
                                        </StyledTableCell>
                                        <StyledTableCell>
                                            <Button
                                                size='small'
                                                variant='outlined'
                                                disabled={!agent.builtinAgentflowId}
                                                onClick={() => navigate(`/canvas/${agent.builtinAgentflowId}`)}
                                            >
                                                Open in canvas
                                            </Button>
                                        </StyledTableCell>
                                    </StyledTableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Last health error — only when failing */}
                    {agent.lastHealthError && (
                        <Alert severity='error' variant='outlined' sx={{ alignItems: 'center' }}>
                            <strong>Last health error:</strong> {agent.lastHealthError}
                        </Alert>
                    )}

                    {/* Description — only when set */}
                    {agent.description && (
                        <Box>
                            <Typography variant='overline'>Description</Typography>
                            <Typography variant='body2' sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                {agent.description}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </MainCard>

            {/* Heavy content behind tabs in a sibling card */}
            <Box sx={{ mt: 3 }}>
                <MainCard>
                    <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 3 }}>
                        <Tab label='Executions' />
                        <Tab label='Metrics' />
                    </Tabs>
                    {tab === 0 && <AgentExecutionsTab agent={agent} />}
                    {tab === 1 && <AgentMetricsTab agent={agent} />}
                </MainCard>
            </Box>

            <AgentDialog
                show={showDialog}
                dialogProps={dialogProps}
                onCancel={() => setShowDialog(false)}
                onConfirm={() => {
                    setShowDialog(false)
                    refresh()
                }}
            />
            <ConfirmDialog />
        </>
    )
}

const parseJson = (raw) => {
    if (raw === undefined || raw === null || raw === '') return undefined
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
        return undefined
    }
}

const toStringArray = (raw) => {
    const parsed = parseJson(raw)
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
    return []
}

export default AgentDetail
