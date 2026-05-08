import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'

import {
    Box,
    Button,
    Chip,
    Divider,
    Grid,
    IconButton,
    InputAdornment,
    OutlinedInput,
    Skeleton,
    Stack,
    Tab,
    Tabs,
    Tooltip,
    Typography
} from '@mui/material'
import { IconArrowLeft, IconCopy, IconEdit, IconEye, IconEyeOff, IconRefresh, IconSend, IconX } from '@tabler/icons-react'

import MainCard from '@/ui-component/cards/MainCard'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { StyledPermissionButton } from '@/ui-component/button/RBACButtons'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'

import AgentDialog from './AgentDialog'

import agentsApi from '@/api/agents'
import useApi from '@/hooks/useApi'
import useConfirm from '@/hooks/useConfirm'
import { useError } from '@/store/context/ErrorContext'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

const STATUS_CHIP_COLOR = {
    HEALTHY: 'success',
    UNHEALTHY: 'error',
    UNKNOWN: 'default',
    DISABLED: 'default'
}

const RUNTIME_LABEL = {
    HTTP: 'HTTP',
    BUILT_IN: 'Built-in'
}

/**
 * Agent detail page (`/agents/:id`). Single Overview tab in v1.6 — Executions
 * and Metrics tabs are scaffolded as `disabled` placeholders. The Overview
 * surfaces:
 *   - identity (name, slug, runtime, status, version)
 *   - HTTP runtime config (read-only) and "Test connection"
 *   - callback token with show/hide + copy + rotate-with-confirm
 */
const AgentDetail = () => {
    const { id } = useParams()
    const navigate = useNavigate()
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const { error, setError } = useError()
    const { confirm } = useConfirm()
    const getApi = useApi(agentsApi.getAgentById)

    const [agent, setAgent] = useState(null)
    const [tab, setTab] = useState(0)
    const [showDialog, setShowDialog] = useState(false)
    const [dialogProps, setDialogProps] = useState({})
    const [tokenVisible, setTokenVisible] = useState(false)
    const [testLoading, setTestLoading] = useState(false)
    const [rotateLoading, setRotateLoading] = useState(false)

    const showSuccess = (message) =>
        enqueueSnackbar({
            message,
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

    const showError = (message, persist = false) =>
        enqueueSnackbar({
            message,
            options: {
                key: new Date().getTime() + Math.random(),
                variant: 'error',
                persist,
                action: (key) => (
                    <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                        <IconX />
                    </Button>
                )
            }
        })

    useEffect(() => {
        if (id) getApi.request(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id])

    useEffect(() => {
        if (getApi.data) setAgent(getApi.data)
    }, [getApi.data])

    useEffect(() => {
        if (getApi.error && setError) setError(getApi.error)
    }, [getApi.error, setError])

    const refresh = () => id && getApi.request(id)

    const onEdit = () => {
        setDialogProps({
            title: 'Edit Agent',
            type: 'EDIT',
            cancelButtonName: 'Cancel',
            confirmButtonName: 'Save',
            data: agent
        })
        setShowDialog(true)
    }

    const onCopyToken = () => {
        if (!agent?.callbackToken) return
        navigator.clipboard.writeText(agent.callbackToken)
        showSuccess('Callback token copied to clipboard')
    }

    const onRotateToken = async () => {
        if (!agent?.id) return
        const confirmed = await confirm({
            title: 'Rotate callback token',
            description:
                'Rotating revokes the existing token immediately. Any agent process still using the old value will start failing with 401 until updated.',
            confirmButtonName: 'Rotate',
            cancelButtonName: 'Cancel'
        })
        if (!confirmed) return
        setRotateLoading(true)
        try {
            const res = await agentsApi.regenerateCallbackToken(agent.id)
            if (res.data) {
                setAgent(res.data)
                setTokenVisible(true)
                showSuccess('Callback token rotated — copy the new value now')
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to rotate callback token', true)
        } finally {
            setRotateLoading(false)
        }
    }

    const onTestConnection = async () => {
        if (!agent?.id) return
        setTestLoading(true)
        try {
            const res = await agentsApi.testAgentConnection(agent.id)
            const result = res.data
            if (result?.success) showSuccess(result.message || 'Connection OK')
            else showError(result?.message || 'Connection failed', true)
        } catch (err) {
            showError(err?.response?.data?.message || 'Connection test failed', true)
        } finally {
            setTestLoading(false)
        }
    }

    if (!agent && !error) {
        return (
            <MainCard>
                <Skeleton variant='rounded' height={300} />
            </MainCard>
        )
    }

    if (error) {
        return (
            <MainCard>
                <ErrorBoundary error={error} />
            </MainCard>
        )
    }

    const runtimeConfig = parseJson(agent.runtimeConfig) || {}
    const allowedTools = toStringArray(agent.allowedTools)

    return (
        <>
            <MainCard>
                <Stack direction='row' alignItems='center' spacing={1} sx={{ mb: 2 }}>
                    <Tooltip title='Back to agents'>
                        <IconButton onClick={() => navigate('/agents')}>
                            <IconArrowLeft size={20} />
                        </IconButton>
                    </Tooltip>
                    <Typography variant='h3' sx={{ flexGrow: 1 }}>
                        {agent.name}
                    </Typography>
                    <Chip size='small' label={RUNTIME_LABEL[agent.runtimeType] || agent.runtimeType} variant='outlined' />
                    <Chip
                        size='small'
                        label={agent.status}
                        color={STATUS_CHIP_COLOR[agent.status] || 'default'}
                        sx={agent.status === 'DISABLED' ? { opacity: 0.6 } : undefined}
                    />
                    <StyledPermissionButton
                        permissionId={'agents:update'}
                        variant='outlined'
                        startIcon={<IconEdit size={16} />}
                        onClick={onEdit}
                    >
                        Edit
                    </StyledPermissionButton>
                </Stack>

                <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
                    <Tab label='Overview' />
                    <Tab label='Executions' disabled />
                    <Tab label='Metrics' disabled />
                </Tabs>

                {tab === 0 && (
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant='overline'>Identity</Typography>
                            <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                <Grid item xs={12} sm={6}>
                                    <ReadOnlyField label='Slug' value={agent.slug} mono />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <ReadOnlyField label='Version' value={agent.version} mono />
                                </Grid>
                                <Grid item xs={12}>
                                    <ReadOnlyField label='Description' value={agent.description || '—'} multiline />
                                </Grid>
                            </Grid>
                        </Box>

                        <Divider />

                        {agent.runtimeType === 'HTTP' && (
                            <>
                                <Box>
                                    <Stack direction='row' justifyContent='space-between' alignItems='center'>
                                        <Typography variant='overline'>HTTP Runtime</Typography>
                                        <Tooltip title='HTTP GET reachability probe'>
                                            <span>
                                                <StyledButton
                                                    size='small'
                                                    variant='outlined'
                                                    onClick={onTestConnection}
                                                    disabled={testLoading}
                                                    startIcon={<IconSend size={14} />}
                                                >
                                                    {testLoading ? 'Testing…' : 'Test Connection'}
                                                </StyledButton>
                                            </span>
                                        </Tooltip>
                                    </Stack>
                                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                        <Grid item xs={12} sm={6}>
                                            <ReadOnlyField label='Service Endpoint' value={agent.serviceEndpoint || '—'} mono />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <ReadOnlyField label='Health Endpoint' value={runtimeConfig.healthEndpoint || '—'} mono />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <ReadOnlyField label='Timeout (ms)' value={String(runtimeConfig.timeoutMs ?? 60000)} mono />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <ReadOnlyField
                                                label='Last Health Check'
                                                value={agent.lastHealthCheckAt ? new Date(agent.lastHealthCheckAt).toLocaleString() : '—'}
                                            />
                                        </Grid>
                                        {agent.lastHealthError && (
                                            <Grid item xs={12}>
                                                <ReadOnlyField label='Last Health Error' value={agent.lastHealthError} multiline />
                                            </Grid>
                                        )}
                                    </Grid>
                                </Box>

                                <Divider />

                                <Box>
                                    <Typography variant='overline'>Allowed MCP Tools</Typography>
                                    {allowedTools.length === 0 ? (
                                        <Typography variant='body2' sx={{ mt: 0.5, color: 'text.secondary' }}>
                                            No tools configured. The agent will receive 403 from the gateway on any tool call.
                                        </Typography>
                                    ) : (
                                        <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap sx={{ mt: 0.5 }}>
                                            {allowedTools.map((t) => (
                                                <Chip key={t} label={t} size='small' variant='outlined' />
                                            ))}
                                        </Stack>
                                    )}
                                </Box>

                                <Divider />

                                <Box>
                                    <Typography variant='overline'>Callback Token</Typography>
                                    <Typography variant='body2' sx={{ mb: 1, color: 'text.secondary' }}>
                                        Bearer this token to call <code>{`POST /api/v1/agent-callbacks/${agent.id}/tools/invoke`}</code>{' '}
                                        from your agent process.
                                    </Typography>
                                    <OutlinedInput
                                        fullWidth
                                        size='small'
                                        type={tokenVisible ? 'text' : 'password'}
                                        value={agent.callbackToken || ''}
                                        readOnly
                                        sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                        endAdornment={
                                            <InputAdornment position='end'>
                                                <Tooltip title={tokenVisible ? 'Hide' : 'Show'}>
                                                    <IconButton size='small' onClick={() => setTokenVisible((v) => !v)}>
                                                        {tokenVisible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title='Copy'>
                                                    <IconButton size='small' onClick={onCopyToken}>
                                                        <IconCopy size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title='Rotate (invalidates the current token)'>
                                                    <span>
                                                        <IconButton size='small' onClick={onRotateToken} disabled={rotateLoading}>
                                                            <IconRefresh size={16} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </InputAdornment>
                                        }
                                    />
                                </Box>
                            </>
                        )}

                        {agent.runtimeType === 'BUILT_IN' && (
                            <Box>
                                <Typography variant='overline'>Built-in Runtime</Typography>
                                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                    <Grid item xs={12}>
                                        <ReadOnlyField label='Backing AgentFlow ID' value={agent.builtinAgentflowId || '—'} mono />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Button
                                            variant='outlined'
                                            size='small'
                                            disabled={!agent.builtinAgentflowId}
                                            onClick={() => navigate(`/canvas/${agent.builtinAgentflowId}`)}
                                        >
                                            Open in canvas
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Box>
                        )}
                    </Stack>
                )}
            </MainCard>
            <AgentDialog
                show={showDialog}
                dialogProps={dialogProps}
                onCancel={() => setShowDialog(false)}
                onConfirm={() => {
                    setShowDialog(false)
                    refresh()
                }}
            />
            <ConfirmDialog />
        </>
    )
}

const ReadOnlyField = ({ label, value, mono, multiline }) => (
    <Box>
        <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary' }}>
            {label}
        </Typography>
        <Box
            sx={{
                fontFamily: mono ? 'monospace' : undefined,
                fontSize: '0.9rem',
                whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }}
        >
            {value}
        </Box>
    </Box>
)

ReadOnlyField.propTypes = {
    label: PropTypes.string.isRequired,
    value: PropTypes.node,
    mono: PropTypes.bool,
    multiline: PropTypes.bool
}

const parseJson = (raw) => {
    if (raw === undefined || raw === null || raw === '') return undefined
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
        return undefined
    }
}

const toStringArray = (raw) => {
    const parsed = parseJson(raw)
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
    return []
}

export default AgentDetail
