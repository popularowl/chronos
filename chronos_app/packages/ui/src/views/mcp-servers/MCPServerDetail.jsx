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
import Menu from '@mui/material/Menu'
import { styled, alpha } from '@mui/material/styles'
import EditIcon from '@mui/icons-material/Edit'
import FileDeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import BoltIcon from '@mui/icons-material/Bolt'
import PolicyIcon from '@mui/icons-material/Policy'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { IconArrowLeft, IconExternalLink, IconLoader, IconPlug, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ErrorBoundary from '@/ErrorBoundary'
import { PermissionMenuItem } from '@/ui-component/button/RBACButtons'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import MCPServerDialog from './MCPServerDialog'
import MCPServerCatalogTab from './MCPServerCatalogTab'
import MCPServerInvocationsTab from './MCPServerInvocationsTab'
import MCPServerChangeLogTab from './MCPServerChangeLogTab'
import EditPoliciesDialog from './EditPoliciesDialog'

import mcpServersApi from '@/api/mcp-servers'
import useApi from '@/hooks/useApi'
import useConfirm from '@/hooks/useConfirm'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

/**
 * Identity-row Options dropdown styling. Mirrors `FlowListMenu`'s
 * `StyledMenu` so the visual treatment matches the `/agentflows` list —
 * right-anchored, rounded corners, soft drop shadow, secondary-coloured
 * icons. Defined inline rather than imported because the agentflows version
 * is private to its own file; pulling it out as a shared component is a
 * separate refactor.
 */
const StyledMenu = styled((props) => (
    <Menu
        elevation={0}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        {...props}
    />
))(({ theme }) => ({
    '& .MuiPaper-root': {
        borderRadius: 6,
        marginTop: theme.spacing(1),
        minWidth: 180,
        boxShadow:
            'rgb(255, 255, 255) 0px 0px 0px 0px, rgba(0, 0, 0, 0.05) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 15px -3px, rgba(0, 0, 0, 0.05) 0px 4px 6px -2px',
        '& .MuiMenu-list': {
            padding: '4px 0'
        },
        '& .MuiMenuItem-root': {
            '& .MuiSvgIcon-root': {
                fontSize: 18,
                color: theme.palette.text.secondary,
                marginRight: theme.spacing(1.5)
            },
            '&:active': {
                backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity)
            }
        }
    }
}))

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

    const { confirm } = useConfirm()
    const getApi = useApi(mcpServersApi.getMCPServerById)

    const [server, setServer] = useState(null)
    const [tab, setTab] = useState(0)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [showPoliciesDialog, setShowPoliciesDialog] = useState(false)
    const [toggleLoading, setToggleLoading] = useState(false)
    const [menuAnchorEl, setMenuAnchorEl] = useState(null)
    const menuOpen = Boolean(menuAnchorEl)
    const openMenu = (event) => setMenuAnchorEl(event.currentTarget)
    const closeMenu = () => setMenuAnchorEl(null)
    // Bumping `catalogRefreshKey` re-mounts the catalog effect — lets the
    // Refresh button live in the tabs row instead of inside the tab body so
    // the visual spacing matches the agent detail page (no extra toolbar).
    const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
    // Same trick for the change-log tab: after a policy save (or any mutation)
    // we bump this so the History tab re-fetches without losing its place.
    const [changeLogRefreshKey, setChangeLogRefreshKey] = useState(0)

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

    const refresh = () => id && getApi.request(id)

    // Auto-poll while this row is in `UNKNOWN` — same rationale as the
    // list page. Stops as soon as the gateway's first probe resolves and
    // the status flips, so steady-state detail views don't poll.
    useEffect(() => {
        if (!server || server.status !== 'UNKNOWN') return undefined
        const handle = setInterval(refresh, 3000)
        return () => clearInterval(handle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server?.status, id])

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

    /**
     * Operator-facing connection test triggered from the Options menu. Same
     * underlying API as the dialog's Test Connection — issues a live
     * `tools/list` round-trip via the pooled gateway client and surfaces the
     * outcome as a snackbar (success message includes discovered tool count;
     * failure persists so the Chronos user can copy the reason).
     */
    const onTestConnection = async () => {
        if (!server?.id) return
        try {
            const res = await mcpServersApi.testMCPServerConnection(server.id)
            const result = res.data
            if (result?.success) {
                showSuccess(result.message || 'Connection OK')
            } else {
                showError(result?.message || 'Connection failed', true)
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Connection test failed', true)
        }
    }

    const allowedTools = useMemo(() => toStringArray(server?.allowedTools), [server?.allowedTools])
    const outboundAuth = useMemo(() => parseJson(server?.outboundAuth), [server?.outboundAuth])
    const policiesSummary = useMemo(() => summarisePolicies(parseJson(server?.policies)), [server?.policies])

    // Page-level error only fires for the page-load fetch (`getMCPServerById`).
    // Sub-tabs (catalog / recent invocations / history) own their local error
    // surfaces — e.g. an unreachable upstream MCP server makes the Tool catalog
    // tab's tools/list 502, but that's a tab-level Alert, not a page-killing
    // boundary. Reading the global error context here would propagate every
    // sub-tab failure to the whole page.
    if (!server && !getApi.error) {
        return (
            <MainCard>
                <Skeleton variant='rounded' height={300} />
            </MainCard>
        )
    }

    if (getApi.error && !server) {
        return (
            <MainCard>
                <ErrorBoundary error={getApi.error} />
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
                    </Stack>

                    {/* Identity — one-row apikey-style table */}
                    <TableContainer sx={tableContainerSx} component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label='mcp server identity'>
                            <TableHead sx={tableHeaderSx}>
                                <StyledTableRow>
                                    <StyledTableCell>Slug</StyledTableCell>
                                    <StyledTableCell>Status</StyledTableCell>
                                    <StyledTableCell sx={{ minWidth: 220 }}>Tools</StyledTableCell>
                                    <StyledTableCell>Created</StyledTableCell>
                                    <StyledTableCell>Enabled</StyledTableCell>
                                    <StyledTableCell align='right' sx={{ width: 120 }}>
                                        Actions
                                    </StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                <StyledTableRow>
                                    <StyledTableCell sx={{ fontFamily: 'monospace' }}>{server.slug}</StyledTableCell>
                                    <StyledTableCell>
                                        {server.status === 'UNKNOWN' ? (
                                            <Chip
                                                size='small'
                                                variant='outlined'
                                                icon={<IconLoader size={14} className='spin-animation' />}
                                                label='probing…'
                                            />
                                        ) : (
                                            <Chip
                                                size='small'
                                                label={(server.status || '').toLowerCase()}
                                                color={
                                                    server.status === 'HEALTHY' ? undefined : STATUS_CHIP_COLOR[server.status] || 'default'
                                                }
                                                sx={{
                                                    ...(server.status === 'HEALTHY' && {
                                                        backgroundColor: theme.palette.success.dark,
                                                        color: theme.palette.common.white
                                                    }),
                                                    ...(server.status === 'DISABLED' && { opacity: 0.6 })
                                                }}
                                            />
                                        )}
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
                                    <StyledTableCell align='right'>
                                        <Button
                                            size='small'
                                            aria-controls={menuOpen ? 'mcp-server-options-menu' : undefined}
                                            aria-haspopup='true'
                                            aria-expanded={menuOpen ? 'true' : undefined}
                                            disableElevation
                                            onClick={openMenu}
                                            endIcon={<KeyboardArrowDownIcon />}
                                        >
                                            Options
                                        </Button>
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
                                    <StyledTableCell>Transport</StyledTableCell>
                                    <StyledTableCell>Outbound Auth</StyledTableCell>
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
                                        <Chip
                                            size='small'
                                            label={TRANSPORT_LABEL[server.transport] || server.transport}
                                            variant='outlined'
                                        />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <OutboundAuthSummary auth={outboundAuth} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        {server.lastHealthCheckAt ? moment(server.lastHealthCheckAt).format('MMM D, YYYY h:mm A') : '—'}
                                    </StyledTableCell>
                                </StyledTableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Policies — one-row apikey-style table. The Updated column
                        anchors when the entity row was last touched; policy editing
                        is reached via the Identity row's Options dropdown rather
                        than an inline pencil to keep page-level actions in one place. */}
                    <TableContainer sx={tableContainerSx} component={Paper}>
                        <Table sx={{ minWidth: 650 }} aria-label='mcp server policies'>
                            <TableHead sx={tableHeaderSx}>
                                <StyledTableRow>
                                    <StyledTableCell>Retry Policy</StyledTableCell>
                                    <StyledTableCell>Rate limit</StyledTableCell>
                                    <StyledTableCell>Circuit breaker</StyledTableCell>
                                    <StyledTableCell>Jitter</StyledTableCell>
                                    <StyledTableCell>Policy Updated</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                <StyledTableRow>
                                    <StyledTableCell>
                                        <PolicyCell {...policiesSummary.retry} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <PolicyCell {...policiesSummary.rateLimit} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <PolicyCell {...policiesSummary.circuitBreaker} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <PolicyCell {...policiesSummary.jitter} />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        {server.updatedDate ? moment(server.updatedDate).format('MMMM Do, YYYY HH:mm:ss') : '—'}
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
                            <Tab label='Policy Edits' />
                        </Tabs>
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
                    {tab === 2 && <MCPServerChangeLogTab server={server} refreshKey={changeLogRefreshKey} />}
                </MainCard>
            </Box>

            <StyledMenu
                id='mcp-server-options-menu'
                anchorEl={menuAnchorEl}
                open={menuOpen}
                onClose={closeMenu}
                MenuListProps={{ 'aria-labelledby': 'mcp-server-options-menu' }}
            >
                <PermissionMenuItem
                    permissionId={'mcp-servers:update'}
                    onClick={() => {
                        closeMenu()
                        onEdit()
                    }}
                    disableRipple
                >
                    <EditIcon />
                    Edit
                </PermissionMenuItem>
                <PermissionMenuItem
                    permissionId={'mcp-servers:update'}
                    onClick={() => {
                        closeMenu()
                        setShowPoliciesDialog(true)
                    }}
                    disableRipple
                >
                    <PolicyIcon />
                    Edit Policies
                </PermissionMenuItem>
                <PermissionMenuItem
                    permissionId={'mcp-servers:view'}
                    onClick={() => {
                        closeMenu()
                        refresh()
                        setCatalogRefreshKey((k) => k + 1)
                        setChangeLogRefreshKey((k) => k + 1)
                    }}
                    disableRipple
                >
                    <RefreshIcon />
                    Refresh
                </PermissionMenuItem>
                <PermissionMenuItem
                    permissionId={'mcp-servers:update'}
                    onClick={() => {
                        closeMenu()
                        onTestConnection()
                    }}
                    disableRipple
                >
                    <BoltIcon />
                    Test Connection
                </PermissionMenuItem>
                <PermissionMenuItem
                    permissionId={'mcp-servers:delete'}
                    onClick={() => {
                        closeMenu()
                        onDelete()
                    }}
                    disableRipple
                    sx={{ color: 'error.main', '& .MuiSvgIcon-root': { color: 'error.main !important' } }}
                >
                    <FileDeleteIcon />
                    Delete
                </PermissionMenuItem>
            </StyledMenu>

            <MCPServerDialog
                show={showDialog}
                dialogProps={dialogProps}
                onCancel={() => setShowDialog(false)}
                onConfirm={() => {
                    setShowDialog(false)
                    refresh()
                    setChangeLogRefreshKey((k) => k + 1)
                }}
            />
            <EditPoliciesDialog
                show={showPoliciesDialog}
                server={server}
                onCancel={() => setShowPoliciesDialog(false)}
                onConfirm={() => {
                    setShowPoliciesDialog(false)
                    refresh()
                    setChangeLogRefreshKey((k) => k + 1)
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
 * Renders a single policy cell: the resolved value as the primary line plus
 * an italic "default" tag when the server isn't overriding the platform
 * default. Mirrors the secondary-line treatment in `OutboundAuthSummary` so
 * the Policies row visually nests with the other one-row tables.
 */
const PolicyCell = ({ value, isDefault }) => (
    <Stack direction='column' spacing={0.25}>
        <Typography variant='body2'>{value}</Typography>
        {isDefault && (
            <Typography variant='caption' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                default
            </Typography>
        )}
    </Stack>
)

PolicyCell.propTypes = {
    value: PropTypes.string.isRequired,
    isDefault: PropTypes.bool
}

const POLICY_DEFAULTS = {
    retry: { maxAttempts: 3, baseDelayMs: 500, jitter: true },
    rateLimit: { rps: 0, burst: 0 },
    circuitBreaker: { failureThreshold: 5, openMs: 30000 }
}

/**
 * Distills the persisted `policies` JSON into the four cells the Overview
 * row renders. Each cell carries `{ value, isDefault }` so the cell renderer
 * can show "default" italics when the server is leaning on platform defaults
 * rather than its own override. Defaults here mirror the resolver in
 * `services/mcp-gateway/policy.ts`.
 */
const summarisePolicies = (raw) => {
    const policies = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const r = policies.retry
    const rl = policies.rateLimit
    const cb = policies.circuitBreaker
    const retryAttempts = r?.maxAttempts ?? POLICY_DEFAULTS.retry.maxAttempts
    const retryDelay = r?.baseDelayMs ?? POLICY_DEFAULTS.retry.baseDelayMs
    const retryJitter = r?.jitter ?? POLICY_DEFAULTS.retry.jitter
    const rps = rl?.rps ?? POLICY_DEFAULTS.rateLimit.rps
    const burst = rl?.burst ?? POLICY_DEFAULTS.rateLimit.burst
    const threshold = cb?.failureThreshold ?? POLICY_DEFAULTS.circuitBreaker.failureThreshold
    const openMs = cb?.openMs ?? POLICY_DEFAULTS.circuitBreaker.openMs
    return {
        retry: {
            value: `${retryAttempts} attempt${retryAttempts === 1 ? '' : 's'} · ${retryDelay}ms backoff`,
            isDefault: !r
        },
        rateLimit: {
            value: rps === 0 ? 'unlimited' : `${rps} rps${burst > 0 ? ` · burst ${burst}` : ''}`,
            isDefault: !rl
        },
        circuitBreaker: {
            value: threshold === 0 ? 'disabled' : `${threshold} fail${threshold === 1 ? '' : 's'} · open ${openMs}ms`,
            isDefault: !cb
        },
        jitter: {
            value: retryJitter ? 'on (±50%)' : 'off',
            isDefault: !r
        }
    }
}

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

export default MCPServerDetail
