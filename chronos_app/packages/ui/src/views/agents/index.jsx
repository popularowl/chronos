import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'

import {
    Box,
    Button,
    ButtonGroup,
    Chip,
    Paper,
    Skeleton,
    Stack,
    Switch,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    TableSortLabel,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import { IconEdit, IconExternalLink, IconPlus, IconRobot, IconTrash, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { PermissionIconButton, StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
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
                            searchPlaceholder='Search'
                            title='Agents'
                            description='Agent registry - lists all agents registered in Chronos'
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
                                <TableContainer
                                    sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }}
                                    component={Paper}
                                >
                                    <Table sx={{ minWidth: 650 }} aria-label='agents table'>
                                        <TableHead
                                            sx={{
                                                backgroundColor: customization.isDarkMode
                                                    ? theme.palette.common.black
                                                    : theme.palette.grey[100],
                                                height: 56
                                            }}
                                        >
                                            <StyledTableRow>
                                                <StyledTableCell sx={{ pl: 2.5 }}>
                                                    <TableSortLabel
                                                        active={orderBy === 'name'}
                                                        direction={order}
                                                        onClick={() => handleRequestSort('name')}
                                                    >
                                                        Name
                                                    </TableSortLabel>
                                                </StyledTableCell>
                                                <StyledTableCell>Runtime</StyledTableCell>
                                                <StyledTableCell>Status</StyledTableCell>
                                                <StyledTableCell sx={{ minWidth: 220 }}>Allowed MCP Tools</StyledTableCell>
                                                <StyledTableCell align='right'>Enabled</StyledTableCell>
                                                <StyledTableCell align='center'>Actions</StyledTableCell>
                                            </StyledTableRow>
                                        </TableHead>
                                        <TableBody>
                                            {rows.map((agent) => (
                                                <StyledTableRow key={agent.id} hover>
                                                    <StyledTableCell scope='row' sx={{ pl: 2.5 }}>
                                                        <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2.5 }}>
                                                            <Box
                                                                sx={{
                                                                    width: 35,
                                                                    height: 35,
                                                                    borderRadius: '50%',
                                                                    backgroundColor: customization.isDarkMode
                                                                        ? theme.palette.common.white
                                                                        : theme.palette.grey[300] + 75,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center'
                                                                }}
                                                            >
                                                                <IconRobot size={20} color={theme.palette.grey[700]} />
                                                            </Box>
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
                                                        </Box>
                                                    </StyledTableCell>
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
                                                            color={
                                                                agent.status === 'HEALTHY'
                                                                    ? undefined
                                                                    : STATUS_CHIP_COLOR[agent.status] || 'default'
                                                            }
                                                            sx={{
                                                                ...(agent.status === 'HEALTHY' && {
                                                                    backgroundColor: theme.palette.success.dark,
                                                                    color: theme.palette.common.white
                                                                }),
                                                                ...(agent.status === 'DISABLED' && { opacity: 0.6 })
                                                            }}
                                                        />
                                                    </StyledTableCell>
                                                    <StyledTableCell sx={{ maxWidth: 320 }}>
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
                                                    </StyledTableCell>
                                                    <StyledTableCell align='right'>
                                                        <Switch checked={agent.enabled} onChange={() => handleToggle(agent)} size='small' />
                                                    </StyledTableCell>
                                                    <StyledTableCell align='right'>
                                                        <PermissionIconButton
                                                            permissionId={'agents:view'}
                                                            title='Open detail'
                                                            color='primary'
                                                            onClick={() => goToDetail(agent)}
                                                        >
                                                            <IconExternalLink />
                                                        </PermissionIconButton>
                                                        <PermissionIconButton
                                                            permissionId={'agents:update'}
                                                            title='Edit'
                                                            color='primary'
                                                            onClick={() => edit(agent)}
                                                        >
                                                            <IconEdit />
                                                        </PermissionIconButton>
                                                        <PermissionIconButton
                                                            permissionId={'agents:delete'}
                                                            title='Delete'
                                                            color='error'
                                                            onClick={() => handleDelete(agent)}
                                                        >
                                                            <IconTrash />
                                                        </PermissionIconButton>
                                                    </StyledTableCell>
                                                </StyledTableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <TablePagination currentPage={currentPage} limit={pageLimit} total={total} onChange={onChange} />
                            </>
                        )}
                        {!isLoading && total === 0 && (
                            <Stack sx={{ alignItems: 'center', justifyContent: 'center' }} flexDirection='column'>
                                <Box sx={{ p: 12, height: 'auto' }}>
                                    <img
                                        style={{ objectFit: 'cover', height: '20vh', width: 'auto' }}
                                        src={ToolEmptySVG}
                                        alt='AgentsEmpty'
                                    />
                                </Box>
                                <div>No Agents Registered</div>
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
