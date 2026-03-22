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
import WebhookDialog from './WebhookDialog'
import WebhookDeliveryLog from './WebhookDeliveryLog'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'

import webhooksApi from '@/api/webhooks'

import useApi from '@/hooks/useApi'
import { useError } from '@/store/context/ErrorContext'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

import { IconPlus, IconEdit, IconX, IconHistory } from '@tabler/icons-react'
import ToolEmptySVG from '@/assets/images/tools_empty.svg'
import { Button } from '@mui/material'

const Webhooks = () => {
    const getAllWebhooksApi = useApi(webhooksApi.getAllWebhooks)
    const { error, setError } = useError()
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [isLoading, setLoading] = useState(true)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [showDeliveryLog, setShowDeliveryLog] = useState(false)
    const [deliveryLogWebhook, setDeliveryLogWebhook] = useState(null)

    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)
    const [total, setTotal] = useState(0)

    const onChange = (page, pageLimit) => {
        setCurrentPage(page)
        setPageLimit(pageLimit)
        refresh(page, pageLimit)
    }

    const refresh = (page, limit) => {
        getAllWebhooksApi.request(page || currentPage, limit || pageLimit)
    }

    const addNew = () => {
        const dialogProp = {
            title: 'Add New Webhook',
            type: 'ADD',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Add'
        }
        setDialogProps(dialogProp)
        setShowDialog(true)
    }

    const edit = (webhook) => {
        const dialogProp = {
            title: 'Edit Webhook',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: webhook
        }
        setDialogProps(dialogProp)
        setShowDialog(true)
    }

    const onConfirm = () => {
        setShowDialog(false)
        refresh(currentPage, pageLimit)
    }

    const handleToggle = async (webhook) => {
        try {
            await webhooksApi.toggleWebhook(webhook.id, !webhook.enabled)
            refresh(currentPage, pageLimit)
        } catch (err) {
            if (setError) setError(err)
            enqueueSnackbar({
                message: 'Failed to toggle webhook',
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

    const viewDeliveries = (webhook) => {
        setDeliveryLogWebhook(webhook)
        setShowDeliveryLog(true)
    }

    const [search, setSearch] = useState('')
    const onSearchChange = (event) => {
        setSearch(event.target.value)
    }

    function filterWebhooks(data) {
        return data.name.toLowerCase().indexOf(search.toLowerCase()) > -1 || data.url.toLowerCase().indexOf(search.toLowerCase()) > -1
    }

    const parseEvents = (eventsStr) => {
        try {
            return JSON.parse(eventsStr)
        } catch {
            return []
        }
    }

    useEffect(() => {
        refresh(currentPage, pageLimit)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        setLoading(getAllWebhooksApi.loading)
    }, [getAllWebhooksApi.loading])

    useEffect(() => {
        if (getAllWebhooksApi.data) {
            setTotal(getAllWebhooksApi.data.total)
        }
    }, [getAllWebhooksApi.data])

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
                            searchPlaceholder='Search Webhooks'
                            title='Webhooks'
                            description='Event callbacks for agentflow execution state changes'
                        >
                            <ButtonGroup disableElevation aria-label='outlined primary button group'>
                                <StyledPermissionButton
                                    permissionId={'webhooks:create'}
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
                                                <TableCell>URL</TableCell>
                                                <TableCell>Events</TableCell>
                                                <TableCell>Enabled</TableCell>
                                                <TableCell align='right'>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {getAllWebhooksApi.data?.data?.filter(filterWebhooks).map((webhook) => (
                                                <TableRow key={webhook.id}>
                                                    <TableCell>{webhook.name}</TableCell>
                                                    <TableCell>
                                                        <code style={{ fontSize: '0.85em' }}>{webhook.url}</code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
                                                            {parseEvents(webhook.events).map((evt) => (
                                                                <Chip key={evt} label={evt} size='small' variant='outlined' />
                                                            ))}
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={webhook.enabled}
                                                            onChange={() => handleToggle(webhook)}
                                                            size='small'
                                                        />
                                                    </TableCell>
                                                    <TableCell align='right'>
                                                        <Tooltip title='Delivery Log'>
                                                            <IconButton size='small' onClick={() => viewDeliveries(webhook)}>
                                                                <IconHistory size={18} />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title='Edit'>
                                                            <IconButton size='small' onClick={() => edit(webhook)}>
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
                                        alt='WebhooksEmptySVG'
                                    />
                                </Box>
                                <div>No Webhooks Created Yet</div>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <WebhookDialog
                show={showDialog}
                dialogProps={dialogProps}
                onCancel={() => setShowDialog(false)}
                onConfirm={onConfirm}
                setError={setError}
            />
            <WebhookDeliveryLog show={showDeliveryLog} webhook={deliveryLogWebhook} onClose={() => setShowDeliveryLog(false)} />
        </>
    )
}

export default Webhooks
