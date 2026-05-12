import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import moment from 'moment'

import { Box, Chip, Paper, Skeleton, Stack, Table, TableBody, TableContainer, TableHead, useTheme } from '@mui/material'
import { useSelector } from 'react-redux'
import { IconCirclePlus, IconCircleMinus, IconCircleCheck, IconCircleX, IconPencil, IconHistory } from '@tabler/icons-react'

import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import MCPServerChangeLogDetails from './MCPServerChangeLogDetails'

import mcpServersApi from '@/api/mcp-servers'
import useApi from '@/hooks/useApi'

/**
 * Iconography for the change-kind discriminator. Mirrors the icon-leftmost
 * pattern from the Recent Invocations tab + Agent Executions list so the
 * History tab visually reads the same way.
 */
const CHANGE_ICON = {
    CREATED: IconCirclePlus,
    UPDATED: IconPencil,
    DELETED: IconCircleX,
    ENABLED: IconCircleCheck,
    DISABLED: IconCircleMinus
}

const CHANGE_COLOR = {
    CREATED: 'success.dark',
    UPDATED: 'text.primary',
    DELETED: 'error.main',
    ENABLED: 'success.dark',
    DISABLED: 'warning.main'
}

/**
 * Returns true if a change-log row's `changedFields` payload touches the
 * `policies` JSON column. Filters the broader `mcp_server_change_log` table
 * down to entries the **Policy Edits** tab cares about — connection /
 * allowedTools / enable-disable mutations are excluded.
 */
const isPolicyEdit = (row) => {
    if (!row?.changedFields) return false
    try {
        const parsed = typeof row.changedFields === 'string' ? JSON.parse(row.changedFields) : row.changedFields
        return Boolean(parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'policies'))
    } catch {
        return false
    }
}

/**
 * Policy edit history for one MCP server — narrow projection of
 * `mcp_server_change_log` filtered to rows whose `changedFields` touched
 * the `policies` JSON column. Other config mutations (connection edits,
 * allowedTools changes, enable/disable, delete) are recorded in the same
 * underlying table but excluded from this view to keep the tab title
 * truthful.
 *
 * Row layout matches Recent Invocations (icon-leftmost change cell + moment
 * timestamp + plain identifiers) for parity with `feedback_lists_match_executions.md`.
 * Row click opens a right-anchored drawer that renders the post-edit
 * `policies` value as a collapsable JSON tree (same component used by the
 * Agent Executions raw view).
 */
const MCPServerChangeLogTab = ({ server, refreshKey }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    const fetchApi = useApi(mcpServersApi.getMCPServerChangeLog)

    const [rows, setRows] = useState([])
    const [total, setTotal] = useState(0)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [isLoading, setLoading] = useState(true)
    const [selectedRow, setSelectedRow] = useState(null)
    const [drawerOpen, setDrawerOpen] = useState(false)

    const refresh = (page = currentPage, limit = pageLimit) => {
        if (!server?.id) return
        fetchApi.request(server.id, { page, limit })
    }

    useEffect(() => {
        refresh(1, DEFAULT_ITEMS_PER_PAGE)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server?.id, refreshKey])

    useEffect(() => {
        setLoading(fetchApi.loading)
    }, [fetchApi.loading])

    useEffect(() => {
        if (fetchApi.data) {
            setRows(fetchApi.data.rows || [])
            setTotal(typeof fetchApi.data.total === 'number' ? fetchApi.data.total : (fetchApi.data.rows || []).length)
        }
    }, [fetchApi.data])

    const onChange = (page, limit) => {
        setCurrentPage(page)
        setPageLimit(limit)
        refresh(page, limit)
    }

    // Filter is client-side for now — the backend `change-log` endpoint
    // returns every mutation regardless of which fields moved. Pagination
    // therefore reflects raw rows, not filtered rows; we surface the
    // filtered count as the visible total so empty-state messaging is
    // honest. Server-side filtering can come if the volume of non-policy
    // mutations grows enough to crowd the page.
    const visibleRows = useMemo(() => rows.filter(isPolicyEdit), [rows])
    const visibleTotal = visibleRows.length

    const formatTimestamp = (value) => moment(value).format('MMM D, YYYY h:mm A')

    return (
        <Stack spacing={2}>
            {isLoading && visibleTotal === 0 ? (
                <Skeleton variant='rounded' height={200} />
            ) : visibleTotal === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    <IconHistory size={28} style={{ opacity: 0.4, marginBottom: 6 }} />
                    <Box>No policy edits yet.</Box>
                </Box>
            ) : (
                <>
                    <TableContainer sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }} component={Paper}>
                        <Table sx={{ minWidth: 650 }} size='small' aria-label='mcp server policy edits'>
                            <TableHead
                                sx={{
                                    backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
                                    height: 56
                                }}
                            >
                                <StyledTableRow>
                                    <StyledTableCell>Change</StyledTableCell>
                                    <StyledTableCell>Timestamp</StyledTableCell>
                                    <StyledTableCell>User</StyledTableCell>
                                    <StyledTableCell>Summary</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                {visibleRows.map((row) => {
                                    const IconComp = CHANGE_ICON[row.changeKind] || IconPencil
                                    return (
                                        <StyledTableRow
                                            key={row.id}
                                            hover
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => {
                                                setSelectedRow(row)
                                                setDrawerOpen(true)
                                            }}
                                        >
                                            <StyledTableCell>
                                                <Stack direction='row' alignItems='center' spacing={1}>
                                                    <Box
                                                        component={IconComp}
                                                        sx={{ color: CHANGE_COLOR[row.changeKind] || 'text.primary' }}
                                                        size={18}
                                                    />
                                                    <Chip size='small' label={(row.changeKind || '').toLowerCase()} variant='outlined' />
                                                </Stack>
                                            </StyledTableCell>
                                            <StyledTableCell>{formatTimestamp(row.createdDate)}</StyledTableCell>
                                            <StyledTableCell>{row.userEmail || row.userId || '—'}</StyledTableCell>
                                            <StyledTableCell>{row.changeSummary}</StyledTableCell>
                                        </StyledTableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination currentPage={currentPage} limit={pageLimit} total={total} onChange={onChange} />
                </>
            )}
            <MCPServerChangeLogDetails open={drawerOpen} row={selectedRow} onClose={() => setDrawerOpen(false)} />
        </Stack>
    )
}

MCPServerChangeLogTab.propTypes = {
    server: PropTypes.shape({
        id: PropTypes.string,
        slug: PropTypes.string
    }),
    refreshKey: PropTypes.number
}

export default MCPServerChangeLogTab
