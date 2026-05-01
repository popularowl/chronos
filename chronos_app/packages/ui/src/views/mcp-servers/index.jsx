import { useEffect, useState } from 'react'
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
    useTheme
} from '@mui/material'
import { IconEdit, IconPlus, IconTrash, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import MCPServerDialog from './MCPServerDialog'

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
                            searchPlaceholder='Search MCP Servers'
                            title='MCP Servers'
                            description='Registered MCP servers reachable through the platform gateway'
                        >
                            <ButtonGroup disableElevation aria-label='outlined primary button group'>
                                <StyledPermissionButton
                                    permissionId={'mcp-servers:create'}
                                    variant='contained'
                                    onClick={addNew}
                                    startIcon={<IconPlus />}
                                    sx={{ borderRadius: 2, height: 40 }}
                                >
                                    Register MCP Server
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
                                                <TableCell>Transport</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell>URL</TableCell>
                                                <TableCell>Enabled</TableCell>
                                                <TableCell align='right'>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {rows.map((server) => (
                                                <TableRow key={server.id} hover>
                                                    <TableCell>{server.name}</TableCell>
                                                    <TableCell>
                                                        <code style={{ fontSize: '0.85em' }}>{server.slug}</code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size='small'
                                                            label={TRANSPORT_LABEL[server.transport] || server.transport}
                                                            variant='outlined'
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            size='small'
                                                            label={server.status}
                                                            color={STATUS_CHIP_COLOR[server.status] || 'default'}
                                                            sx={server.status === 'DISABLED' ? { opacity: 0.6 } : undefined}
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{ maxWidth: 280 }}>
                                                        <Tooltip title={server.url || ''}>
                                                            <Box
                                                                sx={{
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                    fontFamily: 'monospace',
                                                                    fontSize: '0.85em'
                                                                }}
                                                            >
                                                                {server.url || '—'}
                                                            </Box>
                                                        </Tooltip>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={server.enabled}
                                                            onChange={() => handleToggle(server)}
                                                            size='small'
                                                        />
                                                    </TableCell>
                                                    <TableCell align='right'>
                                                        <Tooltip title='Edit'>
                                                            <IconButton size='small' onClick={() => edit(server)}>
                                                                <IconEdit size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title='Delete'>
                                                            <IconButton size='small' onClick={() => handleDelete(server)}>
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
                                        alt='MCPServersEmpty'
                                    />
                                </Box>
                                <div>No MCP Servers Registered Yet</div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <MCPServerDialog show={showDialog} dialogProps={dialogProps} onCancel={() => setShowDialog(false)} onConfirm={onConfirm} />
            <ConfirmDialog />
        </>
    )
}

export default MCPServers
