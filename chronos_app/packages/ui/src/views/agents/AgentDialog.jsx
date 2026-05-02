import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link as RouterLink } from 'react-router-dom'

import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    FormHelperText,
    Link,
    MenuItem,
    OutlinedInput,
    Radio,
    RadioGroup,
    Select,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography
} from '@mui/material'
import { IconRefresh, IconX } from '@tabler/icons-react'

import { StyledButton } from '@/ui-component/button/StyledButton'

import agentsApi from '@/api/agents'
import agentflowsApi from '@/api/agentflows'
import credentialsApi from '@/api/credentials'
import mcpServersApi from '@/api/mcp-servers'

import {
    enqueueSnackbar as enqueueSnackbarAction,
    closeSnackbar as closeSnackbarAction,
    HIDE_CANVAS_DIALOG,
    SHOW_CANVAS_DIALOG
} from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

const AUTH_TYPES = [
    { value: 'none', label: 'None' },
    { value: 'bearer', label: 'Bearer token' },
    { value: 'header', label: 'Custom header' }
]

const slugify = (raw) =>
    (raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)

/**
 * Agent registration dialog. Branches on `runtimeType` (HTTP vs BUILT_IN).
 * HTTP collects serviceEndpoint + outboundAuth + allowedTools (with a
 * "Load from MCP servers" button that aggregates `tools/list` across enabled
 * registered servers, namespacing each as `<slug>.<tool>`). BUILT_IN collects
 * builtinAgentflowId from the canvas registry.
 *
 * Callback-token UX (copy + rotate) lives on the AgentDetail page, not here —
 * the dialog is the same for create and edit and we don't want to leak the
 * token in the edit form by default.
 */
const AgentDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const isEdit = dialogProps?.type === 'EDIT'

    const [agentId, setAgentId] = useState('')
    const [runtimeType, setRuntimeType] = useState('HTTP')
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [slugDirty, setSlugDirty] = useState(false)
    const [description, setDescription] = useState('')
    const [version, setVersion] = useState('1.0.0')
    const [enabled, setEnabled] = useState(true)

    // HTTP runtime fields
    const [serviceEndpoint, setServiceEndpoint] = useState('')
    const [healthEndpoint, setHealthEndpoint] = useState('')
    const [timeoutMs, setTimeoutMs] = useState(60000)
    const [requestHeadersText, setRequestHeadersText] = useState('')
    const [authType, setAuthType] = useState('none')
    const [authMode, setAuthMode] = useState('inline')
    const [authToken, setAuthToken] = useState('')
    const [authHeaderName, setAuthHeaderName] = useState('')
    const [authCredentialId, setAuthCredentialId] = useState('')
    const [allowedTools, setAllowedTools] = useState([])
    const [discoveredTools, setDiscoveredTools] = useState([])

    // BUILT_IN runtime fields
    const [builtinAgentflowId, setBuiltinAgentflowId] = useState('')

    // Loaded reference data
    const [agentflows, setAgentflows] = useState([])
    const [agentflowsLoading, setAgentflowsLoading] = useState(false)
    const [credentials, setCredentials] = useState([])
    const [discoverLoading, setDiscoverLoading] = useState(false)

    const [fieldErrors, setFieldErrors] = useState({})

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

    // Lazy-load reference data when the dialog opens.
    useEffect(() => {
        if (!show) return

        credentialsApi
            .getAllCredentials()
            .then((res) => setCredentials(Array.isArray(res.data) ? res.data : []))
            .catch(() => setCredentials([]))

        setAgentflowsLoading(true)
        agentflowsApi
            .getAllAgentflows('AGENTFLOW')
            .then((res) => setAgentflows(Array.isArray(res.data) ? res.data : []))
            .catch(() => setAgentflows([]))
            .finally(() => setAgentflowsLoading(false))
    }, [show])

    // Hydrate fields when transitioning between ADD / EDIT.
    useEffect(() => {
        if (!show) return
        if (isEdit && dialogProps.data) {
            const a = dialogProps.data
            setAgentId(a.id || '')
            setRuntimeType(a.runtimeType || 'HTTP')
            setName(a.name || '')
            setSlug(a.slug || '')
            setSlugDirty(true)
            setDescription(a.description || '')
            setVersion(a.version || '1.0.0')
            setEnabled(Boolean(a.enabled))

            const cfg = parseJson(a.runtimeConfig) || {}
            setServiceEndpoint(a.serviceEndpoint || '')
            setHealthEndpoint(cfg.healthEndpoint || '')
            setTimeoutMs(typeof cfg.timeoutMs === 'number' ? cfg.timeoutMs : 60000)
            setRequestHeadersText(cfg.requestHeaders ? formatJson(cfg.requestHeaders) : '')

            const auth = parseJson(a.outboundAuth) || {}
            if (auth.type === 'bearer') {
                setAuthType('bearer')
                setAuthMode(auth.credentialId ? 'credential' : 'inline')
                setAuthToken(auth.token || '')
                setAuthCredentialId(auth.credentialId || '')
                setAuthHeaderName('')
            } else if (auth.type === 'header') {
                setAuthType('header')
                setAuthMode(auth.credentialId ? 'credential' : 'inline')
                setAuthHeaderName(auth.name || '')
                setAuthToken(auth.value || '')
                setAuthCredentialId(auth.credentialId || '')
            } else {
                setAuthType('none')
                setAuthMode('inline')
                setAuthToken('')
                setAuthHeaderName('')
                setAuthCredentialId('')
            }

            setAllowedTools(toStringArray(a.allowedTools))
            setBuiltinAgentflowId(a.builtinAgentflowId || '')
            setDiscoveredTools([])
            setFieldErrors({})
        } else {
            setAgentId('')
            setRuntimeType('HTTP')
            setName('')
            setSlug('')
            setSlugDirty(false)
            setDescription('')
            setVersion('1.0.0')
            setEnabled(true)
            setServiceEndpoint('')
            setHealthEndpoint('')
            setTimeoutMs(60000)
            setRequestHeadersText('')
            setAuthType('none')
            setAuthMode('inline')
            setAuthToken('')
            setAuthHeaderName('')
            setAuthCredentialId('')
            setAllowedTools([])
            setDiscoveredTools([])
            setBuiltinAgentflowId('')
            setFieldErrors({})
        }
    }, [show, dialogProps, isEdit])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const onNameChange = (next) => {
        setName(next)
        if (!slugDirty) setSlug(slugify(next))
        clearError('name')
    }

    const onSlugChange = (next) => {
        setSlug(slugify(next))
        setSlugDirty(true)
        clearError('slug')
    }

    const clearError = (field) => setFieldErrors((prev) => ({ ...prev, [field]: null }))

    const buildOutboundAuth = () => {
        if (authType === 'none') return undefined
        if (authType === 'bearer') {
            if (authMode === 'credential') {
                return authCredentialId ? { type: 'bearer', credentialId: authCredentialId } : undefined
            }
            return authToken ? { type: 'bearer', token: authToken } : undefined
        }
        if (authType === 'header') {
            if (!authHeaderName) return undefined
            if (authMode === 'credential') {
                return authCredentialId ? { type: 'header', name: authHeaderName, credentialId: authCredentialId } : undefined
            }
            return authToken ? { type: 'header', name: authHeaderName, value: authToken } : undefined
        }
        return undefined
    }

    const validate = () => {
        const errors = {}
        if (!name.trim()) errors.name = 'Name is required'
        if (runtimeType === 'HTTP') {
            if (!serviceEndpoint.trim()) errors.serviceEndpoint = 'Service endpoint is required for HTTP runtime'
            if (requestHeadersText && parseJson(requestHeadersText) === undefined) {
                errors.requestHeaders = 'Headers must be valid JSON object'
            }
            if (authType === 'bearer' && authMode === 'inline' && !authToken) errors.authToken = 'Bearer token is required'
            if (authType === 'bearer' && authMode === 'credential' && !authCredentialId) errors.authCredentialId = 'Credential is required'
            if (authType === 'header' && !authHeaderName) errors.authHeaderName = 'Header name is required'
            if (authType === 'header' && authMode === 'inline' && !authToken) errors.authToken = 'Header value is required'
            if (authType === 'header' && authMode === 'credential' && !authCredentialId) errors.authCredentialId = 'Credential is required'
        }
        if (runtimeType === 'BUILT_IN' && !builtinAgentflowId) {
            errors.builtinAgentflowId = 'Pick an existing agentflow'
        }
        return errors
    }

    const onSave = async () => {
        const errors = validate()
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
        }
        setFieldErrors({})

        const body = {
            name,
            slug: slug || undefined,
            description: description || undefined,
            version: version || '1.0.0',
            runtimeType,
            enabled
        }

        if (runtimeType === 'HTTP') {
            body.serviceEndpoint = serviceEndpoint
            body.runtimeConfig = {
                ...(healthEndpoint ? { healthEndpoint } : {}),
                timeoutMs: Number(timeoutMs) || 60000,
                ...(requestHeadersText ? { requestHeaders: parseJson(requestHeadersText) } : {})
            }
            body.outboundAuth = buildOutboundAuth()
            body.allowedTools = allowedTools
        } else {
            body.builtinAgentflowId = builtinAgentflowId
        }

        try {
            if (isEdit) {
                await agentsApi.updateAgent(agentId, body)
                showSuccess('Agent updated')
            } else {
                await agentsApi.createAgent(body)
                showSuccess('Agent registered')
            }
            onConfirm()
        } catch (err) {
            const message = err?.response?.data?.message || err?.message || 'Save failed'
            const lower = message.toLowerCase()
            if (lower.includes('serviceendpoint')) setFieldErrors((p) => ({ ...p, serviceEndpoint: message }))
            else if (lower.includes('slug')) setFieldErrors((p) => ({ ...p, slug: message }))
            else if (lower.includes('name')) setFieldErrors((p) => ({ ...p, name: message }))
            else if (lower.includes('agentflow')) setFieldErrors((p) => ({ ...p, builtinAgentflowId: message }))
            showError(message, true)
        }
    }

    const onDelete = async () => {
        if (!agentId) return
        try {
            await agentsApi.deleteAgent(agentId)
            showSuccess('Agent deleted')
            onConfirm()
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to delete agent', true)
        }
    }

    /**
     * Aggregates `tools/list` from every enabled, non-DISABLED MCP server and
     * namespaces each tool as `<slug>.<tool>`. Failures on individual servers
     * are silent — operator just sees the union of what *did* respond, plus a
     * single error toast per failed server.
     */
    const onLoadFromMCPServers = async () => {
        setDiscoverLoading(true)
        try {
            const res = await mcpServersApi.getAllMCPServers(-1, -1)
            const list = res.data?.data || (Array.isArray(res.data) ? res.data : [])
            const eligible = list.filter((s) => s.enabled && s.status !== 'DISABLED')
            if (eligible.length === 0) {
                showError('No enabled MCP servers found', false)
                return
            }
            const collected = []
            const failures = []
            await Promise.all(
                eligible.map(async (s) => {
                    try {
                        const r = await mcpServersApi.listMCPServerTools(s.id)
                        const tools = (r.data?.tools || []).map((t) => t?.name).filter((n) => typeof n === 'string')
                        for (const t of tools) collected.push(`${s.slug}.${t}`)
                    } catch (err) {
                        failures.push(s.slug)
                    }
                })
            )
            const discovered = uniqueStrings(collected)
            setDiscoveredTools(discovered)
            if (discovered.length === 0) {
                showError('No tools discovered (check that MCP gateway is enabled)', false)
            } else {
                // Merge into the active selection so chips render immediately.
                // Existing manual entries are preserved; operators deselect
                // with the chip's X.
                const previous = allowedTools
                const merged = uniqueStrings([...previous, ...discovered])
                const added = merged.length - previous.length
                setAllowedTools(merged)
                showSuccess(
                    added > 0
                        ? `Discovered ${discovered.length} tool${discovered.length === 1 ? '' : 's'} across ${eligible.length} server(s) — added ${added} to Allowed Tools.`
                        : `Discovered ${discovered.length} tool${discovered.length === 1 ? '' : 's'} (already selected).`
                )
            }
            if (failures.length > 0) {
                showError(`Failed to query tools from: ${failures.join(', ')}`, false)
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to load MCP server tools', true)
        } finally {
            setDiscoverLoading(false)
        }
    }

    const allowedToolsOptions = uniqueStrings([...allowedTools, ...discoveredTools])
    const noAgentflows = !agentflowsLoading && agentflows.length === 0

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='agent-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='agent-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                        <Typography variant='overline'>Runtime</Typography>
                        <Box>
                            <ToggleButtonGroup
                                exclusive
                                size='small'
                                value={runtimeType}
                                onChange={(_e, v) => v && setRuntimeType(v)}
                                disabled={isEdit}
                            >
                                <ToggleButton value='HTTP'>HTTP</ToggleButton>
                                <ToggleButton value='BUILT_IN'>Built-in</ToggleButton>
                            </ToggleButtonGroup>
                        </Box>
                        <FormHelperText>
                            {isEdit
                                ? 'Runtime type cannot change after registration'
                                : 'HTTP forwards to an externally hosted OpenAI-compatible agent. Built-in delegates to a canvas-built agentflow.'}
                        </FormHelperText>
                    </Box>
                    <Box>
                        <Typography variant='overline'>
                            Name <span style={{ color: 'red' }}>*</span>
                        </Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={name}
                            error={!!fieldErrors.name}
                            onChange={(e) => onNameChange(e.target.value)}
                            placeholder='e.g. Customer Support Agent'
                        />
                        {fieldErrors.name && <FormHelperText error>{fieldErrors.name}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>Slug</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={slug}
                            error={!!fieldErrors.slug}
                            onChange={(e) => onSlugChange(e.target.value)}
                            placeholder='auto-generated from name'
                            sx={{ fontFamily: 'monospace' }}
                        />
                        <FormHelperText>
                            Used as the OpenAI-compat <code>model</code> identifier and in route paths
                        </FormHelperText>
                        {fieldErrors.slug && <FormHelperText error>{fieldErrors.slug}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>Description</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            multiline
                            minRows={2}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder='Optional — what this agent does'
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Version</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={version}
                            onChange={(e) => setVersion(e.target.value)}
                            placeholder='1.0.0'
                            sx={{ fontFamily: 'monospace' }}
                        />
                    </Box>

                    {runtimeType === 'HTTP' && (
                        <>
                            <Box>
                                <Typography variant='overline'>
                                    Service Endpoint <span style={{ color: 'red' }}>*</span>
                                </Typography>
                                <OutlinedInput
                                    fullWidth
                                    size='small'
                                    value={serviceEndpoint}
                                    error={!!fieldErrors.serviceEndpoint}
                                    onChange={(e) => {
                                        setServiceEndpoint(e.target.value)
                                        clearError('serviceEndpoint')
                                    }}
                                    placeholder='https://upstream.example.com'
                                    sx={{ fontFamily: 'monospace' }}
                                />
                                <FormHelperText>
                                    The platform POSTs to <code>{`<endpoint>/v1/chat/completions`}</code>
                                </FormHelperText>
                                {fieldErrors.serviceEndpoint && <FormHelperText error>{fieldErrors.serviceEndpoint}</FormHelperText>}
                            </Box>
                            <Box>
                                <Typography variant='overline'>Health Endpoint</Typography>
                                <OutlinedInput
                                    fullWidth
                                    size='small'
                                    value={healthEndpoint}
                                    onChange={(e) => setHealthEndpoint(e.target.value)}
                                    placeholder='Optional — defaults to service endpoint base URL'
                                    sx={{ fontFamily: 'monospace' }}
                                />
                            </Box>
                            <Box>
                                <Typography variant='overline'>Timeout (ms)</Typography>
                                <OutlinedInput
                                    fullWidth
                                    size='small'
                                    type='number'
                                    value={timeoutMs}
                                    onChange={(e) => setTimeoutMs(parseInt(e.target.value, 10) || 0)}
                                    inputProps={{ min: 1000, step: 1000 }}
                                />
                            </Box>
                            <Box>
                                <Typography variant='overline'>Request Headers</Typography>
                                <OutlinedInput
                                    fullWidth
                                    size='small'
                                    multiline
                                    minRows={3}
                                    value={requestHeadersText}
                                    error={!!fieldErrors.requestHeaders}
                                    onChange={(e) => {
                                        setRequestHeadersText(e.target.value)
                                        clearError('requestHeaders')
                                    }}
                                    placeholder='{ "X-Tenant": "acme" }'
                                    sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                />
                                <FormHelperText>JSON object — sent on every request to the upstream agent</FormHelperText>
                                {fieldErrors.requestHeaders && <FormHelperText error>{fieldErrors.requestHeaders}</FormHelperText>}
                            </Box>
                            <Box>
                                <Typography variant='overline'>Outbound Auth</Typography>
                                <Stack direction='row' spacing={2} sx={{ alignItems: 'center', mt: 0.5 }}>
                                    <Select
                                        size='small'
                                        value={authType}
                                        onChange={(e) => setAuthType(e.target.value)}
                                        sx={{ minWidth: 200 }}
                                    >
                                        {AUTH_TYPES.map((t) => (
                                            <MenuItem key={t.value} value={t.value}>
                                                {t.label}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    {authType !== 'none' && (
                                        <RadioGroup row value={authMode} onChange={(e) => setAuthMode(e.target.value)}>
                                            <FormControlLabel value='inline' control={<Radio size='small' />} label='Inline' />
                                            <FormControlLabel
                                                value='credential'
                                                control={<Radio size='small' />}
                                                label='From credential vault'
                                            />
                                        </RadioGroup>
                                    )}
                                </Stack>
                                {authType === 'header' && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant='caption'>Header name</Typography>
                                        <OutlinedInput
                                            fullWidth
                                            size='small'
                                            value={authHeaderName}
                                            error={!!fieldErrors.authHeaderName}
                                            onChange={(e) => setAuthHeaderName(e.target.value)}
                                            placeholder='X-API-Key'
                                        />
                                        {fieldErrors.authHeaderName && <FormHelperText error>{fieldErrors.authHeaderName}</FormHelperText>}
                                    </Box>
                                )}
                                {authType !== 'none' && authMode === 'inline' && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant='caption'>{authType === 'bearer' ? 'Token' : 'Value'}</Typography>
                                        <OutlinedInput
                                            fullWidth
                                            size='small'
                                            type='password'
                                            value={authToken}
                                            error={!!fieldErrors.authToken}
                                            onChange={(e) => setAuthToken(e.target.value)}
                                            placeholder='secret value'
                                        />
                                        {fieldErrors.authToken && <FormHelperText error>{fieldErrors.authToken}</FormHelperText>}
                                    </Box>
                                )}
                                {authType !== 'none' && authMode === 'credential' && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant='caption'>Credential</Typography>
                                        <Select
                                            fullWidth
                                            size='small'
                                            value={authCredentialId}
                                            error={!!fieldErrors.authCredentialId}
                                            onChange={(e) => setAuthCredentialId(e.target.value)}
                                            displayEmpty
                                        >
                                            <MenuItem value='' disabled>
                                                {credentials.length === 0 ? 'No credentials available' : 'Select a credential'}
                                            </MenuItem>
                                            {credentials.map((c) => (
                                                <MenuItem key={c.id} value={c.id}>
                                                    {c.name}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                        {fieldErrors.authCredentialId && (
                                            <FormHelperText error>{fieldErrors.authCredentialId}</FormHelperText>
                                        )}
                                    </Box>
                                )}
                            </Box>
                            <Box>
                                <Stack direction='row' justifyContent='space-between' alignItems='center'>
                                    <Typography variant='overline'>Allowed Tools</Typography>
                                    <Tooltip title='Aggregate tools/list across all enabled MCP servers'>
                                        <span>
                                            <StyledButton
                                                size='small'
                                                variant='outlined'
                                                onClick={onLoadFromMCPServers}
                                                disabled={discoverLoading}
                                                startIcon={<IconRefresh size={14} />}
                                            >
                                                {discoverLoading ? 'Loading…' : 'Load from MCP Servers'}
                                            </StyledButton>
                                        </span>
                                    </Tooltip>
                                </Stack>
                                <Autocomplete
                                    multiple
                                    freeSolo
                                    size='small'
                                    options={allowedToolsOptions}
                                    value={allowedTools}
                                    onChange={(_evt, value) => setAllowedTools(value.filter((v) => typeof v === 'string' && v.length > 0))}
                                    renderTags={(value, getTagProps) =>
                                        value.map((option, index) => (
                                            // eslint-disable-next-line react/jsx-key
                                            <Chip variant='outlined' label={option} size='small' {...getTagProps({ index })} />
                                        ))
                                    }
                                    renderInput={(params) => (
                                        <TextField {...params} placeholder='Type a namespaced name + Enter (e.g. postgres.query)' />
                                    )}
                                />
                                <FormHelperText>
                                    Namespaced as <code>{`<server-slug>.<tool>`}</code>. The gateway enforces the intersection with each
                                    server&apos;s own allowedTools.
                                </FormHelperText>
                            </Box>
                        </>
                    )}

                    {runtimeType === 'BUILT_IN' && (
                        <Box>
                            <Typography variant='overline'>
                                Agentflow <span style={{ color: 'red' }}>*</span>
                            </Typography>
                            {noAgentflows ? (
                                <Alert severity='info' sx={{ mt: 0.5 }}>
                                    No agentflows yet.{' '}
                                    <Link component={RouterLink} to='/canvas'>
                                        Create one in the canvas
                                    </Link>{' '}
                                    first, then return here to register it.
                                </Alert>
                            ) : (
                                <Select
                                    fullWidth
                                    size='small'
                                    value={builtinAgentflowId}
                                    error={!!fieldErrors.builtinAgentflowId}
                                    onChange={(e) => {
                                        setBuiltinAgentflowId(e.target.value)
                                        clearError('builtinAgentflowId')
                                    }}
                                    displayEmpty
                                >
                                    <MenuItem value='' disabled>
                                        {agentflowsLoading ? 'Loading agentflows…' : 'Select an agentflow'}
                                    </MenuItem>
                                    {agentflows.map((flow) => (
                                        <MenuItem key={flow.id} value={flow.id}>
                                            {flow.name} ({flow.id.substring(0, 8)}…)
                                        </MenuItem>
                                    ))}
                                </Select>
                            )}
                            {fieldErrors.builtinAgentflowId && <FormHelperText error>{fieldErrors.builtinAgentflowId}</FormHelperText>}
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
                {isEdit && (
                    <StyledButton color='error' variant='contained' onClick={onDelete}>
                        Delete
                    </StyledButton>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button onClick={onCancel}>{dialogProps.cancelButtonName || 'Cancel'}</Button>
                <StyledButton variant='contained' onClick={onSave} disabled={!name}>
                    {dialogProps.confirmButtonName || 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
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

const formatJson = (raw) => {
    const parsed = parseJson(raw)
    if (!parsed) return ''
    try {
        return JSON.stringify(parsed, null, 2)
    } catch {
        return ''
    }
}

const toStringArray = (raw) => {
    const parsed = parseJson(raw)
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
    return []
}

const uniqueStrings = (arr) => {
    const seen = new Set()
    const out = []
    for (const v of arr) {
        if (typeof v !== 'string') continue
        if (seen.has(v)) continue
        seen.add(v)
        out.push(v)
    }
    return out
}

AgentDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default AgentDialog
