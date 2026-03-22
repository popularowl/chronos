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
    FormHelperText,
    Checkbox,
    ListItemText,
    IconButton,
    Tooltip,
    InputAdornment
} from '@mui/material'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { IconX, IconCopy, IconRefresh, IconSend } from '@tabler/icons-react'

import webhooksApi from '@/api/webhooks'
import agentflowsApi from '@/api/agentflows'
import useNotifier from '@/utils/useNotifier'
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

const WEBHOOK_EVENTS = [
    { value: 'execution.completed', label: 'Execution Completed' },
    { value: 'execution.failed', label: 'Execution Failed' },
    { value: 'execution.timeout', label: 'Execution Timeout' }
]

const WebhookDialog = ({ show, dialogProps, onCancel, onConfirm, setError: _setError }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [webhookId, setWebhookId] = useState('')
    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [agentflowId, setAgentflowId] = useState('')
    const [selectedEvents, setSelectedEvents] = useState([])
    const [maxRetries, setMaxRetries] = useState(3)
    const [timeoutMs, setTimeoutMs] = useState(10000)
    const [enabled, setEnabled] = useState(true)
    const [secret, setSecret] = useState('')

    const [agentflows, setAgentflows] = useState([])
    const [agentflowsLoading, setAgentflowsLoading] = useState(false)

    const [fieldErrors, setFieldErrors] = useState({})
    const [testLoading, setTestLoading] = useState(false)

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
            setWebhookId(dialogProps.data.id)
            setName(dialogProps.data.name)
            setUrl(dialogProps.data.url)
            setAgentflowId(dialogProps.data.agentflowId)
            setMaxRetries(dialogProps.data.maxRetries ?? 3)
            setTimeoutMs(dialogProps.data.timeoutMs ?? 10000)
            setEnabled(dialogProps.data.enabled)
            setSecret(dialogProps.data.secret || '')

            try {
                setSelectedEvents(JSON.parse(dialogProps.data.events))
            } catch {
                setSelectedEvents([])
            }
        } else if (dialogProps.type === 'ADD') {
            setWebhookId('')
            setName('')
            setUrl('')
            setAgentflowId('')
            setSelectedEvents(['execution.completed', 'execution.failed', 'execution.timeout'])
            setMaxRetries(3)
            setTimeoutMs(10000)
            setEnabled(true)
            setSecret('')
            setFieldErrors({})
        }
    }, [dialogProps])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const clearFieldError = (field) => {
        setFieldErrors((prev) => ({ ...prev, [field]: null }))
    }

    const handleCopySecret = () => {
        navigator.clipboard.writeText(secret)
        enqueueSnackbar({
            message: 'Secret copied to clipboard',
            options: {
                key: new Date().getTime() + Math.random(),
                variant: 'success',
                autoHideDuration: 2000,
                action: (key) => (
                    <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                        <IconX />
                    </Button>
                )
            }
        })
    }

    const handleRegenerateSecret = async () => {
        if (!webhookId) return
        try {
            const response = await webhooksApi.regenerateSecret(webhookId)
            if (response.data) {
                setSecret(response.data.secret)
                enqueueSnackbar({
                    message: 'Secret regenerated',
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
            }
        } catch {
            enqueueSnackbar({
                message: 'Failed to regenerate secret',
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

    const handleTestWebhook = async () => {
        if (!webhookId) return
        setTestLoading(true)
        try {
            const response = await webhooksApi.testWebhook(webhookId)
            const result = response.data
            enqueueSnackbar({
                message: result.success ? 'Test webhook delivered successfully' : `Test failed: ${result.message}`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: result.success ? 'success' : 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        } catch {
            enqueueSnackbar({
                message: 'Failed to send test webhook',
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
        } finally {
            setTestLoading(false)
        }
    }

    const saveWebhook = async () => {
        const errors = {}
        if (!name.trim()) errors.name = 'Name is required'
        if (!url.trim()) errors.url = 'URL is required'
        if (!agentflowId) errors.agentflowId = 'Agentflow is required'
        if (selectedEvents.length === 0) errors.events = 'At least one event is required'

        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
        }

        setFieldErrors({})

        try {
            const body = {
                name,
                url,
                agentflowId,
                events: selectedEvents,
                maxRetries,
                timeoutMs,
                enabled
            }

            let response
            if (dialogProps.type === 'ADD') {
                response = await webhooksApi.createWebhook(body)
            } else if (dialogProps.type === 'EDIT') {
                response = await webhooksApi.updateWebhook(webhookId, body)
            }

            if (response.data) {
                enqueueSnackbar({
                    message: dialogProps.type === 'EDIT' ? 'Webhook updated' : 'Webhook created',
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

            if (serverMessageLower.includes('url')) {
                setFieldErrors((prev) => ({ ...prev, url: serverMessage }))
            } else if (serverMessageLower.includes('agentflow') && serverMessageLower.includes('not found')) {
                setFieldErrors((prev) => ({ ...prev, agentflowId: serverMessage }))
            }

            const action = dialogProps.type === 'EDIT' ? 'update' : 'create'
            enqueueSnackbar({
                message: serverMessage || `Failed to ${action} webhook`,
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

    const deleteWebhook = async () => {
        try {
            const response = await webhooksApi.deleteWebhook(webhookId)
            if (response.data) {
                enqueueSnackbar({
                    message: 'Webhook deleted',
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
                message: serverMessage || 'Failed to delete webhook',
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
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='webhook-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='webhook-dialog-title'>
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
                            placeholder='e.g. Slack Notification'
                        />
                        {fieldErrors.name && <FormHelperText error>{fieldErrors.name}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>
                            URL <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={url}
                            error={!!fieldErrors.url}
                            onChange={(e) => {
                                setUrl(e.target.value)
                                clearFieldError('url')
                            }}
                            placeholder='https://example.com/webhook'
                            sx={{ fontFamily: 'monospace' }}
                        />
                        {fieldErrors.url && <FormHelperText error>{fieldErrors.url}</FormHelperText>}
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
                    </Box>
                    <Box>
                        <Typography variant='overline'>
                            Events <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <Select
                            fullWidth
                            size='small'
                            multiple
                            value={selectedEvents}
                            error={!!fieldErrors.events}
                            onChange={(e) => {
                                setSelectedEvents(e.target.value)
                                clearFieldError('events')
                            }}
                            renderValue={(selected) => selected.join(', ')}
                        >
                            {WEBHOOK_EVENTS.map((evt) => (
                                <MenuItem key={evt.value} value={evt.value}>
                                    <Checkbox checked={selectedEvents.indexOf(evt.value) > -1} />
                                    <ListItemText primary={evt.label} secondary={evt.value} />
                                </MenuItem>
                            ))}
                        </Select>
                        {fieldErrors.events && <FormHelperText error>{fieldErrors.events}</FormHelperText>}
                    </Box>
                    <Stack direction='row' spacing={2}>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant='overline'>Max Retries</Typography>
                            <OutlinedInput
                                fullWidth
                                size='small'
                                type='number'
                                value={maxRetries}
                                onChange={(e) => setMaxRetries(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                                inputProps={{ min: 0, max: 10 }}
                            />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant='overline'>Timeout (ms)</Typography>
                            <OutlinedInput
                                fullWidth
                                size='small'
                                type='number'
                                value={timeoutMs}
                                onChange={(e) => setTimeoutMs(Math.max(1000, Math.min(60000, parseInt(e.target.value) || 10000)))}
                                inputProps={{ min: 1000, max: 60000, step: 1000 }}
                            />
                        </Box>
                    </Stack>
                    {dialogProps.type === 'EDIT' && secret && (
                        <Box>
                            <Typography variant='overline'>Signing Secret</Typography>
                            <OutlinedInput
                                fullWidth
                                size='small'
                                value={secret}
                                readOnly
                                sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                endAdornment={
                                    <InputAdornment position='end'>
                                        <Tooltip title='Copy secret'>
                                            <IconButton size='small' onClick={handleCopySecret}>
                                                <IconCopy size={16} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title='Regenerate secret'>
                                            <IconButton size='small' onClick={handleRegenerateSecret}>
                                                <IconRefresh size={16} />
                                            </IconButton>
                                        </Tooltip>
                                    </InputAdornment>
                                }
                            />
                            <FormHelperText>Used to verify webhook payloads via HMAC-SHA256 signature</FormHelperText>
                        </Box>
                    )}
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
                    <>
                        <StyledButton color='error' variant='contained' onClick={deleteWebhook}>
                            Delete
                        </StyledButton>
                        <Tooltip title='Send test payload'>
                            <StyledButton
                                variant='outlined'
                                onClick={handleTestWebhook}
                                disabled={testLoading}
                                startIcon={<IconSend size={16} />}
                            >
                                {testLoading ? 'Sending...' : 'Test'}
                            </StyledButton>
                        </Tooltip>
                    </>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button onClick={onCancel}>{dialogProps.cancelButtonName || 'Cancel'}</Button>
                <StyledButton
                    disabled={!name || !url || !agentflowId || selectedEvents.length === 0}
                    variant='contained'
                    onClick={saveWebhook}
                >
                    {dialogProps.confirmButtonName || 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

WebhookDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func,
    setError: PropTypes.func
}

export default WebhookDialog
