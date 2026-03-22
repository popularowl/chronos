import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'

import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Skeleton
} from '@mui/material'
import TablePagination, { DEFAULT_ITEMS_PER_PAGE } from '@/ui-component/pagination/TablePagination'

import webhooksApi from '@/api/webhooks'

const WebhookDeliveryLog = ({ show, webhook, onClose }) => {
    const portalElement = document.getElementById('portal')

    const [deliveries, setDeliveries] = useState([])
    const [total, setTotal] = useState(0)
    const [isLoading, setLoading] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageLimit, setPageLimit] = useState(DEFAULT_ITEMS_PER_PAGE)

    const fetchDeliveries = async (page, limit) => {
        if (!webhook?.id) return
        setLoading(true)
        try {
            const response = await webhooksApi.getWebhookDeliveries(webhook.id, page || currentPage, limit || pageLimit)
            if (response.data) {
                if (response.data.data) {
                    setDeliveries(response.data.data)
                    setTotal(response.data.total)
                } else if (Array.isArray(response.data)) {
                    setDeliveries(response.data)
                    setTotal(response.data.length)
                }
            }
        } catch {
            setDeliveries([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }

    const onChange = (page, limit) => {
        setCurrentPage(page)
        setPageLimit(limit)
        fetchDeliveries(page, limit)
    }

    useEffect(() => {
        if (show && webhook?.id) {
            setCurrentPage(1)
            fetchDeliveries(1, pageLimit)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, webhook?.id])

    const formatDate = (dateStr) => {
        if (!dateStr) return '-'
        return new Date(dateStr).toLocaleString()
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='lg' open={show} onClose={onClose} aria-labelledby='delivery-log-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='delivery-log-title'>
                Delivery Log — {webhook?.name}
            </DialogTitle>
            <DialogContent>
                {isLoading ? (
                    <Box>
                        <Skeleton variant='rounded' height={200} />
                    </Box>
                ) : deliveries.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No deliveries recorded yet</Box>
                ) : (
                    <>
                        <TableContainer component={Paper} variant='outlined'>
                            <Table size='small'>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Timestamp</TableCell>
                                        <TableCell>Event</TableCell>
                                        <TableCell>Status Code</TableCell>
                                        <TableCell>Attempt</TableCell>
                                        <TableCell>Result</TableCell>
                                        <TableCell>Error</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {deliveries.map((d) => (
                                        <TableRow key={d.id}>
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                                {formatDate(d.deliveredAt || d.createdDate)}
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={d.event} size='small' variant='outlined' />
                                            </TableCell>
                                            <TableCell>{d.statusCode ?? '-'}</TableCell>
                                            <TableCell>{d.attempt}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={d.success ? 'Success' : 'Failed'}
                                                    size='small'
                                                    color={d.success ? 'success' : 'error'}
                                                />
                                            </TableCell>
                                            <TableCell
                                                sx={{
                                                    maxWidth: 300,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {d.errorMessage || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Box sx={{ mt: 2 }}>
                            <TablePagination currentPage={currentPage} limit={pageLimit} total={total} onChange={onChange} />
                        </Box>
                    </>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

WebhookDeliveryLog.propTypes = {
    show: PropTypes.bool,
    webhook: PropTypes.object,
    onClose: PropTypes.func
}

export default WebhookDeliveryLog
