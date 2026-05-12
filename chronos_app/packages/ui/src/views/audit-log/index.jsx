import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import moment from 'moment'

import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    TextField,
    Tooltip,
    useTheme
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { IconDownload, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import AuditRowDetails from './AuditRowDetails'
import { PolicyOutcomeCell } from './PolicyOutcome'

import auditApi from '@/api/audit'
import mcpServersApi from '@/api/mcp-servers'
import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'
import execution_empty from '@/assets/images/executions_empty.svg'

/**
 * v1.7 § 3c — Audit Log viewer.
 *
 * Lists rows from `tool_invocation_audit` (3a/3b). Layout, filter shapes, and
 * date-picker pattern mirror `views/agentexecutions/` for visual consistency
 * across Chronos list pages. Outcome / namespacedTool / callId filters,
 * date-range pickers, plus a CSV export button hitting the `?format=csv`
 * backend path. UUID-based filters and the credential-access tab are
 * deferred — see v1.7 plan § 3c.
 */
const AuditLog = () => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const borderColor = theme.palette.grey[900] + 25

    const [searchParams, setSearchParams] = useSearchParams()
    // Pre-set scope from `?mcpServerId=<id>` query param. Set by the
    // MCPServerDetail page's "View in Audit Log" / "Open in Audit Log" links so
    // Chronos users can deep-link into a per-server view of the audit table.
    const scopedMcpServerId = searchParams.get('mcpServerId') || ''
    // Pre-fill the callId filter from `?callId=<id>` so the AuditRowDetails
    // drawer's "Find related rows" jump lands with the filter already applied.
    const initialCallId = searchParams.get('callId') || ''

    const fetchApi = useApi(auditApi.fetchToolInvocations)
    const getMcpServerApi = useApi(mcpServersApi.getMCPServerById)
    const { error, setError } = useError()

    // Human-readable name for the scoped MCP server. Resolved when the URL
    // carries `?mcpServerId=<id>` so the scope banner reads "Filtered to MCP
    // Server: <name>" instead of leaking the raw UUID. Falls back to the ID
    // if the lookup fails (e.g. server was deleted between page open and
    // fetch).
    const [scopedMcpServerName, setScopedMcpServerName] = useState('')

    const [isLoading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)
    const [rows, setRows] = useState([])

    const [filters, setFilters] = useState({
        success: '',
        policyOutcome: '',
        startDate: null,
        endDate: null,
        namespacedTool: '',
        callId: initialCallId
    })

    const [selectedRow, setSelectedRow] = useState(null)
    const [drawerOpen, setDrawerOpen] = useState(false)

    const onRowClick = (row) => {
        setSelectedRow(row)
        setDrawerOpen(true)
    }

    const handleFilterChange = (field, value) => {
        setFilters((prev) => ({ ...prev, [field]: value }))
    }

    const onDateChange = (field, date) => {
        setFilters((prev) => ({ ...prev, [field]: date }))
    }

    const applyFilters = (page, limit) => {
        setLoading(true)
        const pageNum = typeof page === 'number' ? page : currentPage
        const limitNum = typeof limit === 'number' ? limit : pageLimit

        const params = { page: pageNum, limit: limitNum }
        if (filters.success) params.success = filters.success
        if (filters.policyOutcome) params.policyOutcome = filters.policyOutcome
        if (filters.namespacedTool.trim()) params.namespacedTool = filters.namespacedTool.trim()
        if (filters.callId.trim()) params.callId = filters.callId.trim()
        if (scopedMcpServerId) params.mcpServerId = scopedMcpServerId

        // Same TZ-stable date formatting as Executions: anchor the start date
        // at 00:00:00.000Z and the end date at 23:59:59.999Z so the server
        // sees the dates the user selected regardless of local timezone.
        if (filters.startDate) {
            const d = new Date(filters.startDate)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            params.startDate = `${y}-${m}-${day}T00:00:00.000Z`
        }
        if (filters.endDate) {
            const d = new Date(filters.endDate)
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            params.endDate = `${y}-${m}-${day}T23:59:59.999Z`
        }

        fetchApi.request(params)
    }

    const resetFilters = () => {
        setFilters({ success: '', policyOutcome: '', startDate: null, endDate: null, namespacedTool: '', callId: '' })
        setCurrentPage(1)
        // Re-fetch with cleared filters at next tick — applyFilters reads from
        // current state so we wait one render before triggering it.
        setTimeout(() => applyFilters(1, pageLimit), 0)
    }

    const onChange = (page, limit) => {
        setCurrentPage(page)
        setPageLimit(limit)
        applyFilters(page, limit)
    }

    const downloadCsv = async () => {
        try {
            const csvParams = {}
            if (filters.success) csvParams.success = filters.success
            if (filters.policyOutcome) csvParams.policyOutcome = filters.policyOutcome
            if (filters.namespacedTool.trim()) csvParams.namespacedTool = filters.namespacedTool.trim()
            if (filters.callId.trim()) csvParams.callId = filters.callId.trim()
            if (scopedMcpServerId) csvParams.mcpServerId = scopedMcpServerId
            if (filters.startDate) {
                const d = new Date(filters.startDate)
                csvParams.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
                    2,
                    '0'
                )}T00:00:00.000Z`
            }
            if (filters.endDate) {
                const d = new Date(filters.endDate)
                csvParams.endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
                    2,
                    '0'
                )}T23:59:59.999Z`
            }
            const res = await auditApi.exportToolInvocationsCsv(csvParams)
            const blob = new Blob([res.data], { type: 'text/csv' })
            const href = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = href
            a.download = `tool_invocations_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(href)
        } catch (err) {
            if (setError) setError(err)
        }
    }

    useEffect(() => {
        applyFilters(1, DEFAULT_ITEMS_PER_PAGE)
        if (scopedMcpServerId) {
            getMcpServerApi.request(scopedMcpServerId)
        } else {
            setScopedMcpServerName('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopedMcpServerId])

    useEffect(() => {
        if (getMcpServerApi.data?.name) setScopedMcpServerName(getMcpServerApi.data.name)
    }, [getMcpServerApi.data])

    const clearMcpServerScope = () => {
        const next = new URLSearchParams(searchParams)
        next.delete('mcpServerId')
        setSearchParams(next, { replace: true })
    }

    useEffect(() => {
        setLoading(fetchApi.loading)
    }, [fetchApi.loading])

    useEffect(() => {
        if (fetchApi.data) {
            setRows(fetchApi.data.rows || [])
            setTotal(typeof fetchApi.data.total === 'number' ? fetchApi.data.total : (fetchApi.data.rows || []).length)
        }
    }, [fetchApi.data])

    // Match Agent Executions style: moment-formatted timestamps in plain text,
    // icon-based status, no monospace overrides on identifier cells. See
    // ui-component/table/ExecutionsListTable.jsx for the canonical pattern.
    const formatTimestamp = (value) => moment(value).format('MMM D, YYYY h:mm A')

    return (
        <MainCard>
            {error ? (
                <ErrorBoundary error={error} />
            ) : (
                <Stack flexDirection='column' sx={{ gap: 3 }}>
                    <ViewHeader
                        title='Audit Log'
                        description='Audit logs all MCP tool invocations in Intelligex Chronos gateway'
                    />

                    {scopedMcpServerId && (
                        <Alert
                            severity='info'
                            // MUI's default Alert places the action at flex-start, which puts the
                            // Clear chip at the top of the banner with extra space below. Centering
                            // the root flex axis aligns the chip vertically with the message text.
                            sx={{ alignItems: 'center', '& .MuiAlert-action': { alignItems: 'center', py: 0, mt: 0, mb: 0 } }}
                            action={
                                <Tooltip title='Clear MCP server scope'>
                                    <Chip
                                        size='small'
                                        label='Clear'
                                        icon={<IconX size={14} />}
                                        onClick={clearMcpServerScope}
                                        sx={{ cursor: 'pointer' }}
                                    />
                                </Tooltip>
                            }
                        >
                            Filtered to MCP Server: <strong>{scopedMcpServerName || scopedMcpServerId}</strong>. The below filters and CSV
                            export will only show entries for this specific server.
                        </Alert>
                    )}

                    {/* Filter Section — six filter inputs in one Grid row, action
                        buttons in a Stack below. Adding the Policy filter pushed the
                        original 6-item single-row layout past 12 columns of grid; the
                        cleanest fix was lifting the action buttons out of the Grid
                        rather than compressing date pickers. */}
                    <Box sx={{ mb: 2, width: '100%' }}>
                        <Grid container spacing={2} alignItems='center'>
                            <Grid item xs={12} md={2}>
                                <FormControl fullWidth size='small'>
                                    <InputLabel id='outcome-select-label'>Outcome</InputLabel>
                                    <Select
                                        labelId='outcome-select-label'
                                        value={filters.success}
                                        label='Outcome'
                                        onChange={(e) => handleFilterChange('success', e.target.value)}
                                        size='small'
                                        sx={{
                                            '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor },
                                            '& .MuiSvgIcon-root': { color: customization.isDarkMode ? '#fff' : 'inherit' }
                                        }}
                                    >
                                        <MenuItem value=''>All</MenuItem>
                                        <MenuItem value='true'>Success</MenuItem>
                                        <MenuItem value='false'>Failure</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <FormControl fullWidth size='small'>
                                    <InputLabel id='policy-select-label'>Policy</InputLabel>
                                    <Select
                                        labelId='policy-select-label'
                                        value={filters.policyOutcome}
                                        label='Policy'
                                        onChange={(e) => handleFilterChange('policyOutcome', e.target.value)}
                                        size='small'
                                        sx={{
                                            '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor },
                                            '& .MuiSvgIcon-root': { color: customization.isDarkMode ? '#fff' : 'inherit' }
                                        }}
                                    >
                                        <MenuItem value=''>All</MenuItem>
                                        <MenuItem value='PASSED'>Passed</MenuItem>
                                        <MenuItem value='RETRIED'>Retried</MenuItem>
                                        <MenuItem value='RATE_LIMITED'>Rate-limited</MenuItem>
                                        <MenuItem value='CIRCUIT_OPEN'>Circuit-open</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <DatePicker
                                    selected={filters.startDate}
                                    onChange={(date) => onDateChange('startDate', date)}
                                    selectsStart
                                    startDate={filters.startDate}
                                    endDate={filters.endDate}
                                    className='form-control'
                                    wrapperClassName='datePicker'
                                    maxDate={new Date()}
                                    customInput={
                                        <TextField
                                            size='small'
                                            label='Start date'
                                            fullWidth
                                            sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor } }}
                                        />
                                    }
                                />
                            </Grid>
                            <Grid sx={{ ml: -1 }} item xs={12} md={2}>
                                <DatePicker
                                    selected={filters.endDate}
                                    onChange={(date) => onDateChange('endDate', date)}
                                    selectsEnd
                                    startDate={filters.startDate}
                                    endDate={filters.endDate}
                                    className='form-control'
                                    wrapperClassName='datePicker'
                                    minDate={filters.startDate}
                                    maxDate={new Date()}
                                    customInput={
                                        <TextField
                                            size='small'
                                            label='End date'
                                            fullWidth
                                            sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor } }}
                                        />
                                    }
                                />
                            </Grid>
                            <Grid sx={{ ml: -1 }} item xs={12} md={2}>
                                <TextField
                                    fullWidth
                                    label='Tool'
                                    placeholder='postgres.query'
                                    value={filters.namespacedTool}
                                    onChange={(e) => handleFilterChange('namespacedTool', e.target.value)}
                                    size='small'
                                    sx={{ '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor } }}
                                />
                            </Grid>
                            <Grid item xs={12} md={2}>
                                <Stack direction='row' spacing={1}>
                                    <Button variant='contained' color='primary' size='small' onClick={() => applyFilters(1, pageLimit)}>
                                        Apply
                                    </Button>
                                    <Button variant='outlined' size='small' onClick={resetFilters}>
                                        Reset
                                    </Button>
                                    <Tooltip title='Export CSV'>
                                        <Button
                                            variant='outlined'
                                            size='small'
                                            onClick={downloadCsv}
                                            startIcon={<IconDownload size={16} />}
                                        >
                                            CSV
                                        </Button>
                                    </Tooltip>
                                </Stack>
                            </Grid>
                        </Grid>
                        {/* Call ID isn't a row-level filter input — the ?callId=
                            deep-link from AuditRowDetails still seeds filters.callId
                            and is sent to the backend, but Chronos users navigate
                            related-by-callId via the drawer chip rather than typing it. */}
                    </Box>

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
                                <Table sx={{ minWidth: 650 }} size='small' aria-label='audit log entries'>
                                    <TableHead
                                        sx={{
                                            backgroundColor: customization.isDarkMode
                                                ? theme.palette.common.black
                                                : theme.palette.grey[100],
                                            height: 56
                                        }}
                                    >
                                        <StyledTableRow>
                                            <StyledTableCell>Outcome</StyledTableCell>
                                            <StyledTableCell>Policy</StyledTableCell>
                                            <StyledTableCell>Timestamp</StyledTableCell>
                                            <StyledTableCell>Agent</StyledTableCell>
                                            <StyledTableCell>Tool</StyledTableCell>
                                            <StyledTableCell align='right'>Duration</StyledTableCell>
                                            <StyledTableCell>Call ID</StyledTableCell>
                                        </StyledTableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map((row) => (
                                            <StyledTableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => onRowClick(row)}>
                                                <StyledTableCell>
                                                    {row.success ? (
                                                        <Box component={CheckCircleIcon} className='labelIcon' color='success.dark' />
                                                    ) : (
                                                        <Tooltip title={row.errorMessage || 'tool invocation failed'}>
                                                            <Box component={ErrorIcon} className='labelIcon' color='error.main' />
                                                        </Tooltip>
                                                    )}
                                                </StyledTableCell>
                                                <StyledTableCell>
                                                    <PolicyOutcomeCell value={row.policyOutcome} />
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

                    {!isLoading && total === 0 && (
                        <Stack sx={{ alignItems: 'center', justifyContent: 'center' }} flexDirection='column'>
                            <Box sx={{ p: 2, height: 'auto' }}>
                                <img
                                    style={{ objectFit: 'cover', height: '20vh', width: 'auto' }}
                                    src={execution_empty}
                                    alt='audit_log_empty'
                                />
                            </Box>
                            <div>No Audit Logs Yet</div>
                        </Stack>
                    )}
                </Stack>
            )}
            <AuditRowDetails open={drawerOpen} row={selectedRow} onClose={() => setDrawerOpen(false)} />
        </MainCard>
    )
}

export default AuditLog
