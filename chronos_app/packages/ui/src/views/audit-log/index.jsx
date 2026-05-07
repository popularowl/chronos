import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

import {
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
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    useTheme
} from '@mui/material'
import { IconDownload } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'

import auditApi from '@/api/audit'
import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'

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

    const fetchApi = useApi(auditApi.fetchToolInvocations)
    const { error, setError } = useError()

    const [isLoading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)
    const [rows, setRows] = useState([])

    const [filters, setFilters] = useState({
        success: '',
        startDate: null,
        endDate: null,
        namespacedTool: '',
        callId: ''
    })

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
        if (filters.namespacedTool.trim()) params.namespacedTool = filters.namespacedTool.trim()
        if (filters.callId.trim()) params.callId = filters.callId.trim()

        // Same TZ-stable date formatting as Executions: anchor the start date
        // at 00:00:00.000Z and the end date at 23:59:59.999Z so the server
        // sees the dates the operator selected regardless of local timezone.
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
        setFilters({ success: '', startDate: null, endDate: null, namespacedTool: '', callId: '' })
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
            if (filters.namespacedTool.trim()) csvParams.namespacedTool = filters.namespacedTool.trim()
            if (filters.callId.trim()) csvParams.callId = filters.callId.trim()
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        setLoading(fetchApi.loading)
    }, [fetchApi.loading])

    useEffect(() => {
        if (fetchApi.data) {
            setRows(fetchApi.data.rows || [])
            setTotal(typeof fetchApi.data.total === 'number' ? fetchApi.data.total : (fetchApi.data.rows || []).length)
        }
    }, [fetchApi.data])

    const formatTimestamp = (iso) => {
        try {
            return new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
        } catch {
            return iso
        }
    }

    return (
        <MainCard>
            {error ? (
                <ErrorBoundary error={error} />
            ) : (
                <Stack flexDirection='column' sx={{ gap: 3 }}>
                    <ViewHeader
                        title='Audit Log'
                        description='Persistent record of every MCP tool invocation brokered through the Chronos gateway'
                    />

                    {/* Filter Section */}
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
                            <Grid sx={{ ml: -1 }} item xs={12} md={2}>
                                <TextField
                                    fullWidth
                                    label='Call ID'
                                    value={filters.callId}
                                    onChange={(e) => handleFilterChange('callId', e.target.value)}
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
                    </Box>

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
                                            <TableCell>Timestamp (UTC)</TableCell>
                                            <TableCell>Agent</TableCell>
                                            <TableCell>Tool</TableCell>
                                            <TableCell>Outcome</TableCell>
                                            <TableCell align='right'>Duration</TableCell>
                                            <TableCell>Call ID</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map((row) => (
                                            <TableRow key={row.id} hover>
                                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                                                    {formatTimestamp(row.createdDate)}
                                                </TableCell>
                                                <TableCell>
                                                    <code style={{ fontSize: '0.85em' }}>{row.agentSlug}</code>
                                                </TableCell>
                                                <TableCell>
                                                    <code style={{ fontSize: '0.85em' }}>{row.namespacedTool}</code>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        size='small'
                                                        label={row.success ? 'success' : 'failure'}
                                                        color={row.success ? 'success' : 'error'}
                                                    />
                                                    {!row.success && row.errorMessage && (
                                                        <Tooltip title={row.errorMessage}>
                                                            <Box component='span' sx={{ ml: 1, color: 'text.secondary', cursor: 'help' }}>
                                                                ⓘ
                                                            </Box>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                                <TableCell align='right'>{row.durationMs}ms</TableCell>
                                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                                                    {row.callId || '—'}
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
                        <Stack sx={{ alignItems: 'center', justifyContent: 'center', py: 6 }}>
                            <Box sx={{ color: 'text.secondary' }}>No tool invocations match the current filters.</Box>
                        </Stack>
                    )}
                </Stack>
            )}
        </MainCard>
    )
}

export default AuditLog
