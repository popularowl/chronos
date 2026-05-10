import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
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
import { IconArrowLeft, IconEdit, IconExternalLink, IconPlug, IconRefresh, IconTrash, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import MCPServerDialog from './MCPServerDialog'
import MCPServerCatalogTab from './MCPServerCatalogTab'
import MCPServerInvocationsTab from './MCPServerInvocationsTab'

import mcpServersApi from '@/api/mcp-servers'
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

const TRANSPORT_LABEL = {
    'streamable-http': 'streamable-http',
    sse: 'sse',
    stdio: 'stdio'
}

/**
 * MCP Server detail page (`/mcp-servers/:id`).
 *
 * Layout mirrors the `/apikey` Client Credentials pattern: a page-level
 * `MainCard` carrying a header bar + one-row apikey-style summary tables
 * (Identity, Connection) plus an Allowed Tools chip list. The heavier
 * sub-views (live tools/list browser, paginated audit rows) live in a
 * sibling `MainCard` behind tabs.
 *
 * Page-level actions (Test Connection, Edit, Delete, Enable/Disable) sit
 * in the header bar so the data rows stay clean — no per-row action icons.
 */
const MCPServerDetail = () => {
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
    const getApi = useApi(mcpServersApi.getMCPServerById)

    const [server, setServer] = useState(null)
    const [tab, setTab] = useState(0)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [toggleLoading, setToggleLoading] = useState(false)
    // Bumping `catalogRefreshKey` re-mounts the catalog effect — lets the
    // Refresh button live in the tabs row instead of inside the tab body so
    // the visual spacing matches the agent detail page (no extra toolbar).
    const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)

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
        if (getApi.data) setServer(getApi.data)
    }, [getApi.data])

    useEffect(() => {
        if (getApi.error && setError) setError(getApi.error)
    }, [getApi.error, setError])

    const refresh = () => id && getApi.request(id)

    const onEdit = () => {
        setDialogProps({
            title: 'Edit MCP Server',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: server
        })
        setShowDialog(true)
    }

    const onToggle = async (next) => {
        if (!server?.id) return
        setToggleLoading(true)
        try {
            await mcpServersApi.toggleMCPServer(server.id, next)
            refresh()
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to toggle MCP server', true)
        } finally {
            setToggleLoading(false)
        }
    }

    const onDelete = async () => {
        if (!server?.id) return
        const confirmed = await confirm({
            title: 'Delete MCP Server',
            description: `Delete "${server.name}"? Agents that reference this server's tools will lose access immediately.`,
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        try {
            await mcpServersApi.deleteMCPServer(server.id)
            showSuccess('MCP server deleted')
            navigate('/mcp-servers')
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to delete MCP server', true)
        }
    }

    const allowedTools = useMemo(() => toStringArray(server?.allowedTools), [server?.allowedTools])
    const outboundAuth = useMemo(() => parseJson(server?.outboundAuth), [server?.outboundAuth])
    const requestHeaderKeys = useMemo(() => objectKeys(parseJson(server?.requestHeaders)), [server?.requestHeaders])

    if (!server && !error) {
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
                        <Tooltip title='Back to MCP servers'>
                            <IconButton onClick={() => navigate('/mcp-servers')}>
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
                            <IconPlug size={20} color={theme.palette.grey[700]} />
                        </Box>
                        <Typography variant='h3' sx={{ flexGrow: 1 }}>
                            MCP Server: {server.name}
                        </Typography>
                        <StyledPermissionButton
                            permissionId={'mcp-servers:update'}
                            variant='outlined'
                            startIcon={<IconEdit size={16} />}
                            onClick={onEdit}
                        >
                            Edit
                        </StyledPermissionButton>
                        <StyledPermissionButton
                            permissionId={'mcp-servers:delete'}
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
                        <Table sx={{ minWidth: 650 }} aria-label='mcp server identity'>
                            <TableHead sx={tableHeaderSx}>
                                <StyledTableRow>
                                    <StyledTableCell>Slug</StyledTableCell>
                                    <StyledTableCell>Transport</StyledTableCell>
                                    <StyledTableCell>Status</StyledTableCell>
                                    <StyledTableCell sx={{ minWidth: 220 }}>Tools</StyledTableCell>
                                    <StyledTableCell>Created</StyledTableCell>
                                    <StyledTableCell>Enabled</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                <StyledTableRow>
                                    <StyledTableCell sx={{ fontFamily: 'monospace' }}>{server.slug}</StyledTableCell>
                                    <StyledTableCell>
                                        <Chip
                                            size='small'
                                            label={TRANSPORT_LABEL[server.transport] || server.transport}
                                            variant='outlined'
                                        />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Chip
                                            size='small'
                                            label={(server.status || '').toLowerCase()}
                                            color={server.status === 'HEALTHY' ? undefined : STATUS_CHIP_COLOR[server.status] || 'default'}
                                            sx={{
                                                ...(server.status === 'HEALTHY' && {
                                                    backgroundColor: theme.palette.success.dark,
                                                    color: theme.palette.common.white
                                                }),
                                                ...(server.status === 'DISABLED' && { opacity: 0.6 })
                                            }}
                                        />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        {allowedTools.length === 0 ? (
                                            <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                                no restriction
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
                                        {server.createdDate ? moment(server.createdDate).format('MMMM Do, YYYY HH:mm:ss') : '—'}
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Tooltip
                                            title={
                                                server.enabled
                                                    ? 'Disable: existing sessions keep their cached catalog until close; new dispatches will 409.'
                                                    : 'Enable: makes the server reachable through the gateway again.'
                                            }
                                        >
                                            <span>
                                                <Switch
                                                    checked={Boolean(server.enabled)}
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

                    {/* Connection — one-row apikey-style table */}
                    <TableContainer sx={tableContainerSx} component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label='mcp server connection'>
                            <TableHead sx={tableHeaderSx}>
                                <StyledTableRow>
                                    <StyledTableCell sx={{ width: '40%' }}>URL</StyledTableCell>
                                    <StyledTableCell>Outbound Auth</StyledTableCell>
                                    <StyledTableCell>Request Headers</StyledTableCell>
                                    <StyledTableCell>Timeout</StyledTableCell>
                                    <StyledTableCell>Last Health Check</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                <StyledTableRow>
                                    <StyledTableCell sx={{ fontFamily: 'monospace', maxWidth: 360 }}>
                                        <Box
                                            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            title={server.url || ''}
                                        >
                                            {server.url || '—'}
                                        </Box>
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <OutboundAuthSummary auth={outboundAuth} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <RequestHeaderKeys keys={requestHeaderKeys} />
                                    </StyledTableCell>
                                    <StyledTableCell>{server.timeoutMs ?? 30000}ms</StyledTableCell>
                                    <StyledTableCell>
                                        {server.lastHealthCheckAt ? moment(server.lastHealthCheckAt).format('MMM D, YYYY h:mm A') : '—'}
                                    </StyledTableCell>
                                </StyledTableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Conditional — last health error gets a small inline alert */}
                    {server.lastHealthError && (
                        <Alert severity='error' variant='outlined' sx={{ alignItems: 'center' }}>
                            <strong>Last health error:</strong> {server.lastHealthError}
                        </Alert>
                    )}

                    {/* Description — only when set */}
                    {server.description && (
                        <Box>
                            <Typography variant='overline'>Description</Typography>
                            <Typography variant='body2' sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                                {server.description}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </MainCard>

            {/* Heavy content lives behind tabs in a sibling card */}
            <Box sx={{ mt: 3 }}>
                <MainCard>
                    <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 3 }}>
                        <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
                            <Tab label='Tool catalog' />
                            <Tab label='Recent invocations' />
                        </Tabs>
                        {tab === 0 && (
                            <Tooltip title='Re-run tools/list'>
                                <span>
                                    <StyledButton
                                        size='small'
                                        variant='outlined'
                                        onClick={() => setCatalogRefreshKey((k) => k + 1)}
                                        startIcon={<IconRefresh size={14} />}
                                    >
                                        Refresh
                                    </StyledButton>
                                </span>
                            </Tooltip>
                        )}
                        {tab === 1 && (
                            <Button
                                size='small'
                                variant='outlined'
                                startIcon={<IconExternalLink size={14} />}
                                onClick={() => navigate(`/audit-log?mcpServerId=${server.id}`)}
                            >
                                Open in Audit Log
                            </Button>
                        )}
                    </Stack>
                    {tab === 0 && <MCPServerCatalogTab server={server} refreshKey={catalogRefreshKey} />}
                    {tab === 1 && <MCPServerInvocationsTab server={server} />}
                </MainCard>
            </Box>

            <MCPServerDialog
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

/**
 * Renders the resolved outbound-auth shape inside a table cell — chip with
 * the auth type, plus a brief secondary line indicating credential vs inline.
 * Never displays secret values.
 */
const OutboundAuthSummary = ({ auth }) => {
    if (!auth || typeof auth !== 'object') {
        return (
            <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                None
            </Typography>
        )
    }
    if (auth.type === 'bearer') {
        return (
            <Stack direction='row' spacing={1} alignItems='center'>
                <Chip size='small' label='Bearer' />
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {auth.credentialId ? `credential ${shortId(auth.credentialId)}` : 'inline token'}
                </Typography>
            </Stack>
        )
    }
    if (auth.type === 'header') {
        return (
            <Stack direction='row' spacing={1} alignItems='center'>
                <Chip size='small' label={`Header: ${auth.name || '<unset>'}`} />
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    {auth.credentialId ? `credential ${shortId(auth.credentialId)}` : 'inline value'}
                </Typography>
            </Stack>
        )
    }
    return (
        <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
            Unknown ({auth.type || 'no type'})
        </Typography>
    )
}

OutboundAuthSummary.propTypes = { auth: PropTypes.object }

/**
 * Renders the static request-header keys (no values) as compact chips. Empty
 * state hides the cell content behind a muted en-dash.
 */
const RequestHeaderKeys = ({ keys }) => {
    if (!keys || keys.length === 0) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                —
            </Typography>
        )
    }
    return (
        <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
            {keys.map((k) => (
                <Chip key={k} label={k} size='small' variant='outlined' />
            ))}
        </Stack>
    )
}

RequestHeaderKeys.propTypes = { keys: PropTypes.arrayOf(PropTypes.string) }

const shortId = (raw) => (typeof raw === 'string' && raw.length > 8 ? `${raw.slice(0, 8)}…` : raw || '—')

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

const objectKeys = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj) ? Object.keys(obj) : [])

export default MCPServerDetail
