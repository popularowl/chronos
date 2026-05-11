import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import moment from 'moment'

import { Box, Paper, Skeleton, Stack, Table, TableBody, TableContainer, TableHead, Tooltip, useTheme } from '@mui/material'
import { useSelector } from 'react-redux'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'

import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import AuditRowDetails from '@/views/audit-log/AuditRowDetails'

import auditApi from '@/api/audit'
import useApi from '@/hooks/useApi'

/**
 * Recent tool invocations brokered through this MCP server. Calls
 * `GET /api/v1/audit/tool-invocations?mcpServerId=<id>` — same backing
 * table as the global Audit Log page, pre-filtered to this server.
 *
 * Row layout mirrors the global audit-log table for consistency. The full
 * filter UI (date range, outcome, callId search, CSV export) lives on
 * `/audit-log`; the Overview tab on this detail page links there with
 * `?mcpServerId=` set so Chronos users can deep-link into a scoped view.
 */
const MCPServerInvocationsTab = ({ server }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    const fetchApi = useApi(auditApi.fetchToolInvocations)

    const [rows, setRows] = useState([])
    const [total, setTotal] = useState(0)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [isLoading, setLoading] = useState(true)
    const [selectedRow, setSelectedRow] = useState(null)
    const [drawerOpen, setDrawerOpen] = useState(false)

    const refresh = (page = currentPage, limit = pageLimit) => {
        if (!server?.id) return
        fetchApi.request({ mcpServerId: server.id, page, limit })
    }

    useEffect(() => {
        refresh(1, DEFAULT_ITEMS_PER_PAGE)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server?.id])

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

    // Match Agent Executions style: moment-formatted timestamps in plain text,
    // icon-based status, no monospace overrides on identifier cells. See
    // ui-component/table/ExecutionsListTable.jsx for the canonical pattern.
    const formatTimestamp = (value) => moment(value).format('MMM D, YYYY h:mm A')

    return (
        <Stack spacing={2}>
            {isLoading && rows.length === 0 ? (
                <Skeleton variant='rounded' height={200} />
            ) : total === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>No invocations recorded for this server yet.</Box>
            ) : (
                <>
                    <TableContainer sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }} component={Paper}>
                        <Table sx={{ minWidth: 650 }} size='small' aria-label='mcp tool invocations'>
                            <TableHead
                                sx={{
                                    backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
                                    height: 56
                                }}
                            >
                                <StyledTableRow>
                                    <StyledTableCell>Outcome</StyledTableCell>
                                    <StyledTableCell>Timestamp</StyledTableCell>
                                    <StyledTableCell>Agent</StyledTableCell>
                                    <StyledTableCell>Tool</StyledTableCell>
                                    <StyledTableCell align='right'>Duration</StyledTableCell>
                                    <StyledTableCell>Call ID</StyledTableCell>
                                </StyledTableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((row) => (
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
                                            {row.success ? (
                                                <Box component={CheckCircleIcon} className='labelIcon' color='success.dark' />
                                            ) : (
                                                <Tooltip title={row.errorMessage || 'tool invocation failed'}>
                                                    <Box component={ErrorIcon} className='labelIcon' color='error.main' />
                                                </Tooltip>
                                            )}
                                        </StyledTableCell>
                                        <StyledTableCell>{formatTimestamp(row.createdDate)}</StyledTableCell>
                                        <StyledTableCell>{row.agentSlug}</StyledTableCell>
                                        <StyledTableCell>{row.namespacedTool}</StyledTableCell>
                                        <StyledTableCell align='right'>{row.durationMs}ms</StyledTableCell>
                                        <StyledTableCell>{row.callId || '—'}</StyledTableCell>
                                    </StyledTableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination currentPage={currentPage} limit={pageLimit} total={total} onChange={onChange} />
                </>
            )}
            <AuditRowDetails open={drawerOpen} row={selectedRow} onClose={() => setDrawerOpen(false)} />
        </Stack>
    )
}

MCPServerInvocationsTab.propTypes = {
    server: PropTypes.shape({
        id: PropTypes.string,
        slug: PropTypes.string
    })
}

export default MCPServerInvocationsTab
