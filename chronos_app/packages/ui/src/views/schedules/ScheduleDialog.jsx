import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import {
    Box,
    Button,
    Typography,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    OutlinedInput,
    Switch,
    FormControlLabel,
    Select,
    MenuItem,
    FormHelperText
} from '@mui/material'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { IconX } from '@tabler/icons-react'

import schedulesApi from '@/api/schedules'
import agentflowsApi from '@/api/agentflows'
import useNotifier from '@/utils/useNotifier'
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

const CRON_PRESETS = [
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every 15 minutes', value: '*/15 * * * *' },
    { label: 'Every 30 minutes', value: '*/30 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every 6 hours', value: '0 */6 * * *' },
    { label: 'Every 12 hours', value: '0 */12 * * *' },
    { label: 'Every day at midnight', value: '0 0 * * *' },
    { label: 'Every day at 9am', value: '0 9 * * *' },
    { label: 'Every 1st of the month', value: '0 0 1 * *' },
    { label: 'Custom', value: '__custom__' }
]

const ScheduleDialog = ({ show, dialogProps, onCancel, onConfirm, setError: _setError }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [scheduleId, setScheduleId] = useState('')
    const [name, setName] = useState('')
    const [agentflowId, setAgentflowId] = useState('')
    const [cronPreset, setCronPreset] = useState('')
    const [cronExpression, setCronExpression] = useState('')
    const [timezone, setTimezone] = useState('UTC')
    const [inputPayload, setInputPayload] = useState('')
    const [enabled, setEnabled] = useState(true)

    const [agentflows, setAgentflows] = useState([])
    const [agentflowsLoading, setAgentflowsLoading] = useState(false)

    const [fieldErrors, setFieldErrors] = useState({})

    const isCustomCron = cronPreset === '__custom__'

    // Load agentflows when dialog opens
    useEffect(() => {
        if (show) {
            setAgentflowsLoading(true)
            agentflowsApi
                .getAllAgentflows('AGENTFLOW')
                .then((res) => {
                    setAgentflows(Array.isArray(res.data) ? res.data : [])
                })
                .catch(() => {
                    setAgentflows([])
                })
                .finally(() => {
                    setAgentflowsLoading(false)
                })
        }
    }, [show])

    useEffect(() => {
        if (dialogProps.type === 'EDIT' && dialogProps.data) {
            setScheduleId(dialogProps.data.id)
            setName(dialogProps.data.name)
            setAgentflowId(dialogProps.data.agentflowId)
            setCronExpression(dialogProps.data.cronExpression)
            setTimezone(dialogProps.data.timezone || 'UTC')
            setInputPayload(dialogProps.data.inputPayload || '')
            setEnabled(dialogProps.data.enabled)

            // Match to preset or set custom
            const matched = CRON_PRESETS.find((p) => p.value === dialogProps.data.cronExpression)
            setCronPreset(matched ? matched.value : '__custom__')
        } else if (dialogProps.type === 'ADD') {
            setScheduleId('')
            setName('')
            setAgentflowId(dialogProps.agentflowId || '')
            setCronPreset('')
            setCronExpression('')
            setTimezone('UTC')
            setInputPayload('')
            setEnabled(true)
            setFieldErrors({})
        }
    }, [dialogProps])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const handleCronPresetChange = (e) => {
        const value = e.target.value
        setCronPreset(value)
        if (value !== '__custom__') {
            setCronExpression(value)
            setFieldErrors((prev) => ({ ...prev, cronExpression: null }))
        } else {
            setCronExpression('')
        }
    }

    const clearFieldError = (field) => {
        setFieldErrors((prev) => ({ ...prev, [field]: null }))
    }

    const saveSchedule = async () => {
        // Client-side validation
        const errors = {}
        if (!name.trim()) errors.name = 'Name is required'
        if (!agentflowId) errors.agentflowId = 'Agentflow is required'
        if (!cronExpression.trim()) errors.cronExpression = 'Cron expression is required'

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
        }

        setFieldErrors({})

        try {
            const body = {
                name,
                agentflowId,
                cronExpression,
                timezone,
                inputPayload: inputPayload || null,
                enabled
            }

            let response
            if (dialogProps.type === 'ADD') {
                response = await schedulesApi.createSchedule(body)
            } else if (dialogProps.type === 'EDIT') {
                response = await schedulesApi.updateSchedule(scheduleId, body)
            }

            if (response.data) {
                enqueueSnackbar({
                    message: dialogProps.type === 'EDIT' ? 'Schedule updated' : 'Schedule created',
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
                onConfirm()
            }
        } catch (error) {
            const serverMessage = error?.response?.data?.message || error?.message || ''
            const serverMessageLower = serverMessage.toLowerCase()

            // Map server error to specific field
            if (serverMessageLower.includes('cron')) {
                setFieldErrors((prev) => ({ ...prev, cronExpression: serverMessage }))
            } else if (serverMessageLower.includes('agentflow') && serverMessageLower.includes('not found')) {
                setFieldErrors((prev) => ({ ...prev, agentflowId: serverMessage }))
            } else if (serverMessageLower.includes('inputpayload') || serverMessageLower.includes('json')) {
                setFieldErrors((prev) => ({ ...prev, inputPayload: serverMessage }))
            }

            const action = dialogProps.type === 'EDIT' ? 'update' : 'create'
            enqueueSnackbar({
                message: serverMessage || `Failed to ${action} schedule`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    persist: true,
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const deleteSchedule = async () => {
        try {
            const response = await schedulesApi.deleteSchedule(scheduleId)
            if (response.data) {
                enqueueSnackbar({
                    message: 'Schedule deleted',
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
                onConfirm()
            }
        } catch (error) {
            const serverMessage = error?.response?.data?.message || error?.message
            enqueueSnackbar({
                message: serverMessage || 'Failed to delete schedule',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    persist: true,
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='schedule-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='schedule-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                        <Typography variant='overline'>
                            Name <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={name}
                            error={!!fieldErrors.name}
                            onChange={(e) => {
                                setName(e.target.value)
                                clearFieldError('name')
                            }}
                            placeholder='e.g. Daily Report'
                        />
                        {fieldErrors.name && <FormHelperText error>{fieldErrors.name}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>
                            Agentflow <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <Select
                            fullWidth
                            size='small'
                            value={agentflowId}
                            error={!!fieldErrors.agentflowId}
                            onChange={(e) => {
                                setAgentflowId(e.target.value)
                                clearFieldError('agentflowId')
                            }}
                            displayEmpty
                        >
                            <MenuItem value='' disabled>
                                {agentflowsLoading
                                    ? 'Loading agentflows...'
                                    : agentflows.length === 0
                                    ? 'No agentflows available'
                                    : 'Select an agentflow'}
                            </MenuItem>
                            {agentflows.map((flow) => (
                                <MenuItem key={flow.id} value={flow.id}>
                                    {flow.name} ({flow.id.substring(0, 8)}...)
                                </MenuItem>
                            ))}
                        </Select>
                        {fieldErrors.agentflowId && <FormHelperText error>{fieldErrors.agentflowId}</FormHelperText>}
                        {!agentflowsLoading && agentflows.length === 0 && (
                            <FormHelperText>No agentflows found. Create an agentflow first.</FormHelperText>
                        )}
                    </Box>
                    <Box>
                        <Typography variant='overline'>
                            Schedule <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <Select
                            fullWidth
                            size='small'
                            value={cronPreset}
                            error={!!fieldErrors.cronExpression}
                            onChange={handleCronPresetChange}
                            displayEmpty
                        >
                            <MenuItem value='' disabled>
                                Select a schedule
                            </MenuItem>
                            {CRON_PRESETS.map((preset) => (
                                <MenuItem key={preset.value} value={preset.value}>
                                    {preset.label}
                                    {preset.value !== '__custom__' && (
                                        <Typography variant='caption' sx={{ ml: 1, color: 'text.secondary' }}>
                                            ({preset.value})
                                        </Typography>
                                    )}
                                </MenuItem>
                            ))}
                        </Select>
                        {isCustomCron && (
                            <OutlinedInput
                                fullWidth
                                size='small'
                                value={cronExpression}
                                error={!!fieldErrors.cronExpression}
                                onChange={(e) => {
                                    setCronExpression(e.target.value)
                                    clearFieldError('cronExpression')
                                }}
                                placeholder='e.g. */5 * * * * (every 5 minutes)'
                                sx={{ mt: 1, fontFamily: 'monospace' }}
                            />
                        )}
                        {fieldErrors.cronExpression && <FormHelperText error>{fieldErrors.cronExpression}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>Timezone</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            placeholder='e.g. UTC, America/New_York'
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Input Payload (JSON, optional)</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            multiline
                            rows={4}
                            value={inputPayload}
                            error={!!fieldErrors.inputPayload}
                            onChange={(e) => {
                                setInputPayload(e.target.value)
                                clearFieldError('inputPayload')
                            }}
                            placeholder='{"question": "Generate daily report"}'
                            sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                        />
                        {fieldErrors.inputPayload && <FormHelperText error>{fieldErrors.inputPayload}</FormHelperText>}
                    </Box>
                    <Box>
                        <FormControlLabel
                            control={<Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />}
                            label='Enabled'
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                {dialogProps.type === 'EDIT' && (
                    <StyledButton color='error' variant='contained' onClick={deleteSchedule}>
                        Delete
                    </StyledButton>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button onClick={onCancel}>{dialogProps.cancelButtonName || 'Cancel'}</Button>
                <StyledButton disabled={!name || !agentflowId || !cronExpression} variant='contained' onClick={saveSchedule}>
                    {dialogProps.confirmButtonName || 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

ScheduleDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func,
    setError: PropTypes.func
}

export default ScheduleDialog
