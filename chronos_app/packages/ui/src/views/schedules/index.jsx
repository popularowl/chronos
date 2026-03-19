import { useEffect, useState } from 'react'

import {
    Box,
    Stack,
    ButtonGroup,
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Switch,
    IconButton,
    Tooltip
} from '@mui/material'
import MainCard from '@/ui-component/cards/MainCard'
import ScheduleDialog from './ScheduleDialog'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'

import schedulesApi from '@/api/schedules'

import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

import { IconPlus, IconEdit, IconX } from '@tabler/icons-react'
import ToolEmptySVG from '@/assets/images/tools_empty.svg'
import { Button } from '@mui/material'

const Schedules = () => {
    const getAllSchedulesApi = useApi(schedulesApi.getAllSchedules)
    const { error, setError } = useError()
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [isLoading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})

    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)

    const onChange = (page, pageLimit) => {
        setCurrentPage(page)
        setPageLimit(pageLimit)
        refresh(page, pageLimit)
    }

    const refresh = (page, limit) => {
        getAllSchedulesApi.request(page || currentPage, limit || pageLimit)
    }

    const addNew = () => {
        const dialogProp = {
            title: 'Add New Schedule',
            type: 'ADD',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Add'
        }
        setDialogProps(dialogProp)
        setShowDialog(true)
    }

    const edit = (schedule) => {
        const dialogProp = {
            title: 'Edit Schedule',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: schedule
        }
        setDialogProps(dialogProp)
        setShowDialog(true)
    }

    const onConfirm = () => {
        setShowDialog(false)
        refresh(currentPage, pageLimit)
    }

    const handleToggle = async (schedule) => {
        try {
            await schedulesApi.toggleSchedule(schedule.id, !schedule.enabled)
            refresh(currentPage, pageLimit)
        } catch (err) {
            if (setError) setError(err)
            enqueueSnackbar({
                message: 'Failed to toggle schedule',
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
    }

    const [search, setSearch] = useState('')
    const onSearchChange = (event) => {
        setSearch(event.target.value)
    }

    function filterSchedules(data) {
        return data.name.toLowerCase().indexOf(search.toLowerCase()) > -1 || data.cronExpression.indexOf(search) > -1
    }

    useEffect(() => {
        refresh(currentPage, pageLimit)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        setLoading(getAllSchedulesApi.loading)
    }, [getAllSchedulesApi.loading])

    useEffect(() => {
        if (getAllSchedulesApi.data) {
            setTotal(getAllSchedulesApi.data.total)
        }
    }, [getAllSchedulesApi.data])

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString()
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
                            searchPlaceholder='Search Schedules'
                            title='Schedules'
                            description='Cron-based scheduled execution of agentflows'
                        >
                            <ButtonGroup disableElevation aria-label='outlined primary button group'>
                                <StyledPermissionButton
                                    permissionId={'schedules:create'}
                                    variant='contained'
                                    onClick={addNew}
                                    startIcon={<IconPlus />}
                                    sx={{ borderRadius: 2, height: 40 }}
                                >
                                    Create
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
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Cron</TableCell>
                                                <TableCell>Timezone</TableCell>
                                                <TableCell>Enabled</TableCell>
                                                <TableCell>Last Run</TableCell>
                                                <TableCell>Next Run</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align='right'>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {getAllSchedulesApi.data?.data?.filter(filterSchedules).map((schedule) => (
                                                <TableRow key={schedule.id}>
                                                    <TableCell>{schedule.name}</TableCell>
                                                    <TableCell>
                                                        <code>{schedule.cronExpression}</code>
                                                    </TableCell>
                                                    <TableCell>{schedule.timezone}</TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={schedule.enabled}
                                                            onChange={() => handleToggle(schedule)}
                                                            size='small'
                                                        />
                                                    </TableCell>
                                                    <TableCell>{formatDate(schedule.lastRunDate)}</TableCell>
                                                    <TableCell>{formatDate(schedule.nextRunDate)}</TableCell>
                                                    <TableCell>
                                                        {schedule.lastRunStatus ? (
                                                            <Chip
                                                                label={schedule.lastRunStatus}
                                                                size='small'
                                                                color={schedule.lastRunStatus === 'FINISHED' ? 'success' : 'error'}
                                                            />
                                                        ) : (
                                                            '-'
                                                        )}
                                                    </TableCell>
                                                    <TableCell align='right'>
                                                        <Tooltip title='Edit'>
                                                            <IconButton size='small' onClick={() => edit(schedule)}>
                                                                <IconEdit size={18} />
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
                                        alt='SchedulesEmptySVG'
                                    />
                                </Box>
                                <div>No Schedules Created Yet</div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <ScheduleDialog
                show={showDialog}
                dialogProps={dialogProps}
                onCancel={() => setShowDialog(false)}
                onConfirm={onConfirm}
                setError={setError}
            />
        </>
    )
}

export default Schedules
