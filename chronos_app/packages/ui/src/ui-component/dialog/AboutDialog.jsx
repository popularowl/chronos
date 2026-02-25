import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { Dialog, DialogContent, DialogTitle, TableContainer, Table, TableRow, TableCell, TableBody, Paper } from '@mui/material'
import axios from 'axios'
import { baseURL } from '@/store/constant'

const AboutDialog = ({ show, onCancel }) => {
    const portalElement = document.getElementById('portal')

    const [data, setData] = useState({})

    useEffect(() => {
        if (show) {
            axios
                .get(`${baseURL}/api/v1/version`, {
                    withCredentials: true,
                    headers: { 'Content-type': 'application/json', 'x-request-from': 'internal' }
                })
                .then((response) => {
                    setData({
                        currentVersion: response.data.version,
                        releaseDate: response.data.releaseDate
                    })
                })
                .catch((error) => {
                    console.error('Error fetching version:', error)
                })
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show])

    const component = show ? (
        <Dialog
            onClose={onCancel}
            open={show}
            fullWidth
            maxWidth='sm'
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='alert-dialog-title'>
                Chronos Version
            </DialogTitle>
            <DialogContent>
                {data && (
                    <TableContainer component={Paper}>
                        <Table aria-label='version table'>
                            <TableBody>
                                <TableRow>
                                    <TableCell component='th' scope='row' sx={{ fontWeight: 600 }}>
                                        Current Version
                                    </TableCell>
                                    <TableCell>{data.currentVersion}</TableCell>
                                </TableRow>
                                <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                    <TableCell component='th' scope='row' sx={{ fontWeight: 600 }}>
                                        Release Date
                                    </TableCell>
                                    <TableCell>{data.releaseDate || '-'}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

AboutDialog.propTypes = {
    show: PropTypes.bool,
    onCancel: PropTypes.func
}

export default AboutDialog
