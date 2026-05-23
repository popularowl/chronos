import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'

import {
    Box,
    Button,
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
    useTheme
} from '@mui/material'
import { IconEdit, IconExternalLink, IconLoader, IconPlug, IconPlus, IconTrash, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { PermissionIconButton, StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import MCPServerDialog from './MCPServerDialog'
import PresetPickerDialog from './PresetPickerDialog'

import mcpServersApi from '@/api/mcp-servers'
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

const TRANSPORT_LABEL = {
    'streamable-http': 'streamable-http',
    sse: 'sse',
    stdio: 'stdio'
}

/**
 * MCP Servers list page. Mirrors the Webhooks list pattern: paginated table,
 * search, sort, chip-based status, toggle, edit-in-modal, delete-with-confirm.
 * Hidden behind `mcp-servers:view` permission.
 */
const MCPServers = () => {
    const theme = useTheme()
    const navigate = useNavigate()
    const customization = useSelector((state) => state.customization)
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const { error, setError } = useError()
    const { confirm } = useConfirm()
    const getAllApi = useApi(mcpServersApi.getAllMCPServers)

    const [isLoading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [showPresetPicker, setShowPresetPicker] = useState(false)

    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)

    const [order, setOrder] = useState(localStorage.getItem('mcpServers_order') || 'asc')
    const [orderBy, setOrderBy] = useState(localStorage.getItem('mcpServers_orderBy') || 'name')
    const [search, setSearch] = useState('')

    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc'
        const newOrder = isAsc ? 'desc' : 'asc'
        setOrder(newOrder)
        setOrderBy(property)
        localStorage.setItem('mcpServers_order', newOrder)
        localStorage.setItem('mcpServers_orderBy', property)
    }

    const sortServers = (data) =>
        [...data].sort((a, b) => {
            const av = (a[orderBy] || '').toLowerCase?.() || ''
            const bv = (b[orderBy] || '').toLowerCase?.() || ''
            return order === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        })

    const filterServers = (server) => {
        const term = search.toLowerCase()
        if (!term) return true
        return (
            (server.name || '').toLowerCase().includes(term) ||
            (server.slug || '').toLowerCase().includes(term) ||
            (server.url || '').toLowerCase().includes(term)
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
            title: 'Register MCP Server',
            type: 'ADD',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Register'
        })
        setShowDialog(true)
    }

    const openPresetPicker = () => {
        setShowPresetPicker(true)
    }

    const onPickCustom = () => {
        setShowPresetPicker(false)
        addNew()
    }

    const onPresetPick = (preset) => {
        setShowPresetPicker(false)
        setDialogProps({
            title: `Register ${preset.displayName}`,
            type: 'ADD',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Register',
            presetData: preset
        })
        setShowDialog(true)
    }

    const edit = (server) => {
        setDialogProps({
            title: 'Edit MCP Server',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: server
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

    const handleToggle = async (server) => {
        try {
            await mcpServersApi.toggleMCPServer(server.id, !server.enabled)
            refresh(currentPage, pageLimit)
        } catch (err) {
            if (setError) setError(err)
            showErrorSnackbar('Failed to toggle MCP server')
        }
    }

    const handleDelete = async (server) => {
        const confirmed = await confirm({
            title: `Delete MCP Server`,
            description: `Delete "${server.name}"? Agents that reference this server's tools will lose access immediately.`,
            confirmButtonName: 'Delete',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        try {
            await mcpServersApi.deleteMCPServer(server.id)
            enqueueSnackbar({
                message: 'MCP server deleted',
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
            showErrorSnackbar(err?.response?.data?.message || 'Failed to delete MCP server')
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
        return sortServers(raw.filter(filterServers))
    })()

    // Auto-poll while at least one row sits in `UNKNOWN` — newly-registered
    // stdio servers carry that status until the gateway's first probe
    // resolves (cold-start + tools/list, typically a few seconds). The
    // interval self-cancels once every row has flipped to HEALTHY /
    // UNHEALTHY / DISABLED so steady-state pages don't poll the server.
    useEffect(() => {
        const anyProbing = rows.some((row) => row.status === 'UNKNOWN')
        if (!anyProbing) return undefined
        const handle = setInterval(() => refresh(currentPage, pageLimit), 3000)
        return () => clearInterval(handle)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, currentPage, pageLimit])

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
                            title='MCP Servers'
                            description='MCP registry - lists all MCP servers registered in Chronos'
                        >
                            <StyledPermissionButton
                                permissionId={'mcp-servers:create'}
                                variant='contained'
                                onClick={openPresetPicker}
                                startIcon={<IconPlus />}
                                sx={{ borderRadius: 2, height: 40 }}
                            >
                                Register MCP Server
                            </StyledPermissionButton>
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
                                    <Table sx={{ minWidth: 650 }} aria-label='mcp servers table'>
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
                                                <StyledTableCell>
                                                    <TableSortLabel
                                                        active={orderBy === 'slug'}
                                                        direction={order}
                                                        onClick={() => handleRequestSort('slug')}
                                                    >
                                                        Slug
                                                    </TableSortLabel>
                                                </StyledTableCell>
                                                <StyledTableCell>Transport</StyledTableCell>
                                                <StyledTableCell>Status</StyledTableCell>
                                                <StyledTableCell>URL</StyledTableCell>
                                                <StyledTableCell align='right'>Enabled</StyledTableCell>
                                                <StyledTableCell align='center'>Actions</StyledTableCell>
                                            </StyledTableRow>
                                        </TableHead>
                                        <TableBody>
                                            {rows.map((server) => (
                                                <StyledTableRow key={server.id} hover>
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
                                                                <IconPlug size={20} color={theme.palette.grey[700]} />
                                                            </Box>
                                                            <Box
                                                                component={Link}
                                                                to={`/mcp-servers/${server.id}`}
                                                                sx={{
                                                                    color: theme.palette.primary.main,
                                                                    textDecoration: 'none',
                                                                    '&:hover': { textDecoration: 'underline' }
                                                                }}
                                                            >
                                                                {server.name}
                                                            </Box>
                                                        </Box>
                                                    </StyledTableCell>
                                                    <StyledTableCell>{server.slug}</StyledTableCell>
                                                    <StyledTableCell>
                                                        <Chip
                                                            size='small'
                                                            label={TRANSPORT_LABEL[server.transport] || server.transport}
                                                            variant='outlined'
                                                        />
                                                    </StyledTableCell>
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
                                                                    server.status === 'HEALTHY'
                                                                        ? undefined
                                                                        : STATUS_CHIP_COLOR[server.status] || 'default'
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
                                                    <StyledTableCell sx={{ maxWidth: 280 }}>
                                                        <Tooltip title={server.url || ''}>
                                                            <Box
                                                                sx={{
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                {server.url || '—'}
                                                            </Box>
                                                        </Tooltip>
                                                    </StyledTableCell>
                                                    <StyledTableCell align='right'>
                                                        <Switch
                                                            checked={server.enabled}
                                                            onChange={() => handleToggle(server)}
                                                            size='small'
                                                        />
                                                    </StyledTableCell>
                                                    <StyledTableCell align='right'>
                                                        <PermissionIconButton
                                                            permissionId={'mcp-servers:view'}
                                                            title='Open detail'
                                                            color='primary'
                                                            onClick={() => navigate(`/mcp-servers/${server.id}`)}
                                                        >
                                                            <IconExternalLink />
                                                        </PermissionIconButton>
                                                        <PermissionIconButton
                                                            permissionId={'mcp-servers:update'}
                                                            title='Edit'
                                                            color='primary'
                                                            onClick={() => edit(server)}
                                                        >
                                                            <IconEdit />
                                                        </PermissionIconButton>
                                                        <PermissionIconButton
                                                            permissionId={'mcp-servers:delete'}
                                                            title='Delete'
                                                            color='error'
                                                            onClick={() => handleDelete(server)}
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
                                        alt='MCPServersEmpty'
                                    />
                                </Box>
                                <div>No MCP Servers Registered</div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <MCPServerDialog show={showDialog} dialogProps={dialogProps} onCancel={() => setShowDialog(false)} onConfirm={onConfirm} />
            <PresetPickerDialog
                show={showPresetPicker}
                onCancel={() => setShowPresetPicker(false)}
                onPick={onPresetPick}
                onCustom={onPickCustom}
            />
            <ConfirmDialog />
        </>
    )
}

export default MCPServers
