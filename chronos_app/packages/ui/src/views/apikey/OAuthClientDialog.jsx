import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import {
    Box,
    Typography,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    IconButton,
    OutlinedInput,
    Popover,
    Checkbox,
    FormControlLabel,
    FormGroup,
    Alert
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { StyledButton } from '@/ui-component/button/StyledButton'

// Icons
import { IconX, IconCopy } from '@tabler/icons-react'

// API
import oauthClientApi from '@/api/oauthclient'

// utils
import useNotifier from '@/utils/useNotifier'

const ALL_SCOPES = [
    { value: 'admin:full', label: 'Full Admin Access' },
    { value: 'agentflows:read', label: 'Agentflows - Read' },
    { value: 'agentflows:write', label: 'Agentflows - Write' },
    { value: 'credentials:read', label: 'Credentials - Read' },
    { value: 'credentials:write', label: 'Credentials - Write' },
    { value: 'apikeys:read', label: 'API Keys - Read' },
    { value: 'apikeys:write', label: 'API Keys - Write' }
]

const OAuthClientDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')

    const theme = useTheme()
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [clientName, setClientName] = useState('')
    const [selectedScopes, setSelectedScopes] = useState(['admin:full'])
    const [createdCredentials, setCreatedCredentials] = useState(null)
    const [anchorEl, setAnchorEl] = useState(null)
    const openPopOver = Boolean(anchorEl)

    useEffect(() => {
        if (dialogProps.type === 'EDIT' && dialogProps.client) {
            setClientName(dialogProps.client.clientName)
            const scopes = dialogProps.client.scopes ? JSON.parse(dialogProps.client.scopes) : []
            setSelectedScopes(scopes)
            setCreatedCredentials(null)
        } else if (dialogProps.type === 'ADD') {
            setClientName('')
            setSelectedScopes(['admin:full'])
            setCreatedCredentials(null)
        }
    }, [dialogProps])

    const handleClosePopOver = () => {
        setAnchorEl(null)
    }

    const handleScopeChange = (scopeValue) => {
        setSelectedScopes((prev) => {
            if (prev.includes(scopeValue)) {
                return prev.filter((s) => s !== scopeValue)
            }
            return [...prev, scopeValue]
        })
    }

    const copyToClipboard = (text, event) => {
        navigator.clipboard.writeText(text)
        setAnchorEl(event.currentTarget)
        setTimeout(() => handleClosePopOver(), 1500)
    }

    const addNewClient = async () => {
        try {
            const createResp = await oauthClientApi.createOAuthClient({
                clientName,
                scopes: selectedScopes
            })
            if (createResp.data) {
                setCreatedCredentials(createResp.data)
                enqueueSnackbar({
                    message: 'Client credentials created',
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
        } catch (error) {
            enqueueSnackbar({
                message: `Failed to create credentials: ${
                    typeof error.response?.data === 'object'
                        ? error.response.data.error || error.response.data.message
                        : error.response?.data
                }`,
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

    const saveClient = async () => {
        try {
            const saveResp = await oauthClientApi.updateOAuthClient(dialogProps.client.id, {
                clientName,
                scopes: selectedScopes
            })
            if (saveResp.data) {
                enqueueSnackbar({
                    message: 'Client credentials updated',
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
            enqueueSnackbar({
                message: `Failed to update credentials: ${
                    typeof error.response?.data === 'object'
                        ? error.response.data.error || error.response.data.message
                        : error.response?.data
                }`,
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

    const handleClose = () => {
        if (createdCredentials) {
            onConfirm()
        } else {
            onCancel()
        }
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='sm' open={show} onClose={handleClose} aria-labelledby='oauth-client-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='oauth-client-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                {createdCredentials ? (
                    <Box sx={{ p: 2 }}>
                        <Alert
                            icon={false}
                            severity='warning'
                            variant='filled'
                            sx={{
                                mb: 2,
                                backgroundColor: theme.palette.warning.dark,
                                color: '#1a1a1a'
                            }}
                        >
                            Save these credentials now. The Client Secret will not be shown again.
                        </Alert>

                        <Typography variant='overline'>Client ID</Typography>
                        <Stack direction='row' sx={{ mb: 2, alignItems: 'center' }}>
                            <Typography
                                sx={{
                                    px: 2,
                                    py: 1,
                                    borderRadius: 10,
                                    backgroundColor: theme.palette.codeEditor.main,
                                    color: theme.palette.grey[900],
                                    width: 'max-content',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem',
                                    wordBreak: 'break-all'
                                }}
                                variant='body2'
                            >
                                {createdCredentials.clientId}
                            </Typography>
                            <IconButton
                                title='Copy Client ID'
                                color='success'
                                onClick={(e) => copyToClipboard(createdCredentials.clientId, e)}
                            >
                                <IconCopy />
                            </IconButton>
                        </Stack>

                        <Typography variant='overline'>Client Secret</Typography>
                        <Stack direction='row' sx={{ mb: 1, alignItems: 'center' }}>
                            <Typography
                                sx={{
                                    px: 2,
                                    py: 1,
                                    borderRadius: 10,
                                    backgroundColor: theme.palette.codeEditor.main,
                                    color: theme.palette.grey[900],
                                    width: 'max-content',
                                    fontFamily: 'monospace',
                                    fontSize: '0.85rem',
                                    wordBreak: 'break-all'
                                }}
                                variant='body2'
                            >
                                {createdCredentials.clientSecret}
                            </Typography>
                            <IconButton
                                title='Copy Client Secret'
                                color='success'
                                onClick={(e) => copyToClipboard(createdCredentials.clientSecret, e)}
                            >
                                <IconCopy />
                            </IconButton>
                        </Stack>

                        <Popover
                            open={openPopOver}
                            anchorEl={anchorEl}
                            onClose={handleClosePopOver}
                            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                        >
                            <Typography variant='h6' sx={{ pl: 1, pr: 1, color: 'white', background: theme.palette.success.dark }}>
                                Copied!
                            </Typography>
                        </Popover>
                    </Box>
                ) : (
                    <>
                        <Box sx={{ p: 2 }}>
                            <Typography variant='overline'>Client Name</Typography>
                            <OutlinedInput
                                id='clientName'
                                type='string'
                                fullWidth
                                placeholder='My Admin Client'
                                value={clientName}
                                name='clientName'
                                onChange={(e) => setClientName(e.target.value)}
                            />
                        </Box>

                        <Box sx={{ p: 2 }}>
                            <Typography variant='overline'>Scopes</Typography>
                            <FormGroup>
                                {ALL_SCOPES.map((scope) => (
                                    <FormControlLabel
                                        key={scope.value}
                                        control={
                                            <Checkbox
                                                checked={selectedScopes.includes(scope.value)}
                                                onChange={() => handleScopeChange(scope.value)}
                                                size='small'
                                            />
                                        }
                                        label={scope.label}
                                    />
                                ))}
                            </FormGroup>
                        </Box>

                        {dialogProps.type === 'EDIT' && dialogProps.client && (
                            <Box sx={{ p: 2 }}>
                                <Typography variant='overline'>Client ID</Typography>
                                <Stack direction='row' sx={{ alignItems: 'center' }}>
                                    <Typography
                                        sx={{
                                            px: 2,
                                            py: 1,
                                            borderRadius: 10,
                                            backgroundColor: theme.palette.codeEditor.main,
                                            color: theme.palette.grey[900],
                                            fontFamily: 'monospace',
                                            fontSize: '0.85rem'
                                        }}
                                        variant='body2'
                                    >
                                        {dialogProps.client.clientId}
                                    </Typography>
                                    <IconButton
                                        title='Copy Client ID'
                                        color='success'
                                        onClick={(e) => copyToClipboard(dialogProps.client.clientId, e)}
                                    >
                                        <IconCopy />
                                    </IconButton>
                                </Stack>
                                <Popover
                                    open={openPopOver}
                                    anchorEl={anchorEl}
                                    onClose={handleClosePopOver}
                                    anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                                    transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                                >
                                    <Typography variant='h6' sx={{ pl: 1, pr: 1, color: 'white', background: theme.palette.success.dark }}>
                                        Copied!
                                    </Typography>
                                </Popover>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                {createdCredentials ? (
                    <StyledButton variant='contained' onClick={handleClose}>
                        Done
                    </StyledButton>
                ) : (
                    <StyledButton
                        variant='contained'
                        onClick={() => (dialogProps.type === 'ADD' ? addNewClient() : saveClient())}
                        disabled={!clientName || selectedScopes.length === 0}
                    >
                        {dialogProps.confirmButtonName}
                    </StyledButton>
                )}
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

OAuthClientDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default OAuthClientDialog
