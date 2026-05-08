import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'

import {
    Box,
    Button,
    ButtonGroup,
    Chip,
    IconButton,
    Paper,
    Skeleton,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import { IconEdit, IconExternalLink, IconPlus, IconTrash, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import AgentDialog from './AgentDialog'

import agentsApi from '@/api/agents'
import useApi from '@/hooks/useApi'
import useConfirm from '@/hooks/useConfirm'
import { useError } from '@/store/context/ErrorContext'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

import ToolEmptySVG from '@/assets/images/tools_empty.svg'

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

const ALLOWED_TOOLS_PREVIEW_CAP = 3

/**
 * Parses the JSON-stringified `allowedTools` column into a string[] of
 * `<slug>.<tool>` namespaced names. Tolerates legacy non-JSON values (just
 * shows them as a single chip) and bad shapes (returns []).
 */
const parseAllowedTools = (raw) => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw.filter((t) => typeof t === 'string' && t.length > 0)
    if (typeof raw !== 'string') return []
    try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed.filter((t) => typeof t === 'string' && t.length > 0)
    } catch {
        // legacy non-JSON value — render as a single chip rather than swallowing
        return [raw]
    }
    return []
}

/**
 * Agents list page. Mirrors the MCP Servers list. Rows link to a detail page
 * (/agents/:id) for HTTP agents — that's where callback-token rotation lives.
 * BUILT_IN rows offer an inline shortcut to the underlying canvas.
 */
const Agents = () => {
    const theme = useTheme()
    const navigate = useNavigate()
    const customization = useSelector((state) => state.customization)
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const { error, setError } = useError()
    const { confirm } = useConfirm()
    const getAllApi = useApi(agentsApi.getAllAgents)

    const [isLoading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})

    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)

    const [order, setOrder] = useState(localStorage.getItem('agents_order') || 'asc')
    const [orderBy, setOrderBy] = useState(localStorage.getItem('agents_orderBy') || 'name')
    const [search, setSearch] = useState('')

    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc'
        const newOrder = isAsc ? 'desc' : 'asc'
        setOrder(newOrder)
        setOrderBy(property)
        localStorage.setItem('agents_order', newOrder)
        localStorage.setItem('agents_orderBy', property)
    }

    const sortAgents = (data) =>
        [...data].sort((a, b) => {
            const av = (a[orderBy] || '').toLowerCase?.() || ''
            const bv = (b[orderBy] || '').toLowerCase?.() || ''
            return order === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        })

    const filterAgents = (agent) => {
        const term = search.toLowerCase()
        if (!term) return true
        return (
            (agent.name || '').toLowerCase().includes(term) ||
            (agent.slug || '').toLowerCase().includes(term) ||
            (agent.serviceEndpoint || '').toLowerCase().includes(term)
        )
    }

    const onSearchChange = (event) => setSearch(event.target.value)

    const refresh = (page, limit) => {
        getAllApi.request(page || currentPage, limit || pageLimit)
    }

    const onChange = (page, limit) => {
        setCurrentPage(page)
        setPageLimit(limit)
        refresh(page, limit)
    }

    const addNew = () => {
        setDialogProps({
            title: 'Register Agent',
            type: 'ADD',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Register'
        })
        setShowDialog(true)
    }

    const edit = (agent) => {
        setDialogProps({
            title: 'Edit Agent',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: agent
        })
        setShowDialog(true)
    }

    const onConfirm = () => {
        setShowDialog(false)
        refresh(currentPage, pageLimit)
    }

    const showErrorSnackbar = (message) => {
        enqueueSnackbar({
            message,
            options: {
                key: new Date().getTime() + Math.random(),
                variant: 'error',
                action: (key) => (
                    <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                        <IconX />
                    </Button>
                )
            }
        })
    }

    const handleToggle = async (agent) => {
        try {
            await agentsApi.toggleAgent(agent.id, !agent.enabled)
            refresh(currentPage, pageLimit)
        } catch (err) {
            if (setError) setError(err)
            showErrorSnackbar('Failed to toggle agent')
        }
    }

    const handleDelete = async (agent) => {
        const confirmed = await confirm({
            title: 'Delete Agent',
            description: `Delete "${agent.name}"? Any clients calling this agent's slug will start failing immediately.`,
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        try {
            await agentsApi.deleteAgent(agent.id)
            enqueueSnackbar({
                message: 'Agent deleted',
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
            refresh(currentPage, pageLimit)
        } catch (err) {
            if (setError) setError(err)
            showErrorSnackbar(err?.response?.data?.message || 'Failed to delete agent')
        }
    }

    useEffect(() => {
        refresh(currentPage, pageLimit)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        setLoading(getAllApi.loading)
    }, [getAllApi.loading])

    useEffect(() => {
        if (getAllApi.data) {
            setTotal(typeof getAllApi.data.total === 'number' ? getAllApi.data.total : (getAllApi.data.data || []).length)
        }
    }, [getAllApi.data])

    const rows = (() => {
        const raw = getAllApi.data?.data || (Array.isArray(getAllApi.data) ? getAllApi.data : [])
        return sortAgents(raw.filter(filterAgents))
    })()

    const goToDetail = (agent) => {
        if (agent.runtimeType === 'BUILT_IN' && agent.builtinAgentflowId) {
            navigate(`/canvas/${agent.builtinAgentflowId}`)
            return
        }
        navigate(`/agents/${agent.id}`)
    }

    return (
        <>
            <MainCard>
                {error ? (
                    <ErrorBoundary error={error} />
                ) : (
                    <Stack flexDirection='column' sx={{ gap: 3 }}>
                        <ViewHeader
                            onSearchChange={onSearchChange}
                            search={true}
                            searchPlaceholder='Search Agents'
                            title='Agents'
                            description='Registered agent invocation surfaces — HTTP runtime or canvas-built'
                        >
                            <ButtonGroup disableElevation aria-label='outlined primary button group'>
                                <StyledPermissionButton
                                    permissionId={'agents:create'}
                                    variant='contained'
                                    onClick={addNew}
                                    startIcon={<IconPlus />}
                                    sx={{ borderRadius: 2, height: 40 }}
                                >
                                    Register Agent
                                </StyledPermissionButton>
                            </ButtonGroup>
                        </ViewHeader>
                        {isLoading && (
                            <Box>
                                <Skeleton variant='rounded' height={200} />
                            </Box>
                        )}
                        {!isLoading && total > 0 && (
                            <>
                                <TableContainer component={Paper} variant='outlined'>
                                    <Table>
                                        <TableHead
                                            sx={{
                                                backgroundColor: customization.isDarkMode
                                                    ? theme.palette.common.black
                                                    : theme.palette.grey[100],
                                                height: 56
                                            }}
                                        >
                                            <TableRow>
                                                <TableCell>
                                                    <TableSortLabel
                                                        active={orderBy === 'name'}
                                                        direction={order}
                                                        onClick={() => handleRequestSort('name')}
                                                    >
                                                        Name
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell>
                                                    <TableSortLabel
                                                        active={orderBy === 'slug'}
                                                        direction={order}
                                                        onClick={() => handleRequestSort('slug')}
                                                    >
                                                        Slug
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell>Runtime</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell>Endpoint / Flow</TableCell>
                                                <TableCell sx={{ minWidth: 220 }}>Allowed MCP Tools</TableCell>
                                                <TableCell>Enabled</TableCell>
                                                <TableCell align='right'>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {rows.map((agent) => (
                                                <TableRow key={agent.id} hover>
                                                    <TableCell>
                                                        <Box
                                                            component='span'
                                                            sx={{
                                                                cursor: 'pointer',
                                                                color: theme.palette.primary.main,
                                                                '&:hover': { textDecoration: 'underline' }
                                                            }}
                                                            onClick={() => goToDetail(agent)}
                                                        >
                                                            {agent.name}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code style={{ fontSize: '0.85em' }}>{agent.slug}</code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size='small'
                                                            label={RUNTIME_LABEL[agent.runtimeType] || agent.runtimeType}
                                                            variant='outlined'
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size='small'
                                                            label={agent.status}
                                                            color={STATUS_CHIP_COLOR[agent.status] || 'default'}
                                                            sx={agent.status === 'DISABLED' ? { opacity: 0.6 } : undefined}
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{ maxWidth: 280 }}>
                                                        <Tooltip title={agent.serviceEndpoint || agent.builtinAgentflowId || ''}>
                                                            <Box
                                                                sx={{
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.85em'
                                                                }}
                                                            >
                                                                {agent.runtimeType === 'HTTP'
                                                                    ? agent.serviceEndpoint || '—'
                                                                    : agent.builtinAgentflowId
                                                                    ? `flow:${agent.builtinAgentflowId.substring(0, 8)}…`
                                                                    : '—'}
                                                            </Box>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell sx={{ maxWidth: 320 }}>
                                                        {(() => {
                                                            const tools = parseAllowedTools(agent.allowedTools)
                                                            if (tools.length === 0) {
                                                                return (
                                                                    <Typography variant='caption' color='text.secondary'>
                                                                        —
                                                                    </Typography>
                                                                )
                                                            }
                                                            const preview = tools.slice(0, ALLOWED_TOOLS_PREVIEW_CAP)
                                                            const overflow = tools.length - preview.length
                                                            return (
                                                                <Tooltip
                                                                    title={
                                                                        overflow > 0 ? (
                                                                            <Box component='span' sx={{ whiteSpace: 'pre-line' }}>
                                                                                {tools.join('\n')}
                                                                            </Box>
                                                                        ) : (
                                                                            ''
                                                                        )
                                                                    }
                                                                    placement='top'
                                                                >
                                                                    <Stack
                                                                        direction='row'
                                                                        spacing={0.5}
                                                                        useFlexGap
                                                                        flexWrap='wrap'
                                                                        sx={{ cursor: 'pointer' }}
                                                                        onClick={() => goToDetail(agent)}
                                                                    >
                                                                        {preview.map((t) => (
                                                                            <Chip key={t} size='small' variant='outlined' label={t} />
                                                                        ))}
                                                                        {overflow > 0 && (
                                                                            <Chip
                                                                                size='small'
                                                                                variant='outlined'
                                                                                label={`+${overflow} more`}
                                                                            />
                                                                        )}
                                                                    </Stack>
                                                                </Tooltip>
                                                            )
                                                        })()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch checked={agent.enabled} onChange={() => handleToggle(agent)} size='small' />
                                                    </TableCell>
                                                    <TableCell align='right'>
                                                        <Tooltip title='Open detail'>
                                                            <IconButton size='small' onClick={() => goToDetail(agent)}>
                                                                <IconExternalLink size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title='Edit'>
                                                            <IconButton size='small' onClick={() => edit(agent)}>
                                                                <IconEdit size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title='Delete'>
                                                            <IconButton size='small' onClick={() => handleDelete(agent)}>
                                                                <IconTrash size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <TablePagination currentPage={currentPage} limit={pageLimit} total={total} onChange={onChange} />
                            </>
                        )}
                        {!isLoading && total === 0 && (
                            <Stack sx={{ alignItems: 'center', justifyContent: 'center' }} flexDirection='column'>
                                <Box sx={{ p: 2, height: 'auto' }}>
                                    <img
                                        style={{ objectFit: 'cover', height: '20vh', width: 'auto' }}
                                        src={ToolEmptySVG}
                                        alt='AgentsEmpty'
                                    />
                                </Box>
                                <div>No Agents Registered Yet</div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <AgentDialog show={showDialog} dialogProps={dialogProps} onCancel={() => setShowDialog(false)} onConfirm={onConfirm} />
            <ConfirmDialog />
        </>
    )
}

export default Agents
