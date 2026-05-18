import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'

import {
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
    MenuItem,
    OutlinedInput,
    RadioGroup,
    Radio,
    Select,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import { IconRefresh, IconSend, IconX } from '@tabler/icons-react'

import { StyledButton } from '@/ui-component/button/StyledButton'

import mcpServersApi from '@/api/mcp-servers'
import credentialsApi from '@/api/credentials'

import {
    enqueueSnackbar as enqueueSnackbarAction,
    closeSnackbar as closeSnackbarAction,
    HIDE_CANVAS_DIALOG,
    SHOW_CANVAS_DIALOG
} from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

const TRANSPORTS = [
    { value: 'streamable-http', label: 'Streamable HTTP' },
    { value: 'sse', label: 'SSE' },
    { value: 'stdio', label: 'stdio' }
]

/**
 * Env var name regex used to validate keys in the stdio `env` editor.
 * Matches the shell convention — uppercase letters, digits, underscores;
 * may not start with a digit. Case-insensitive at validation time so
 * `path_extra` is accepted (Unix tools accept lowercase env vars).
 */
const ENV_KEY_REGEX = /^[A-Z_][A-Z0-9_]*$/i

const AUTH_TYPES = [
    { value: 'none', label: 'None' },
    { value: 'bearer', label: 'Bearer token' },
    { value: 'header', label: 'Custom header' },
    { value: 'oauth2-refresh', label: 'OAuth2 (refresh-token)' }
]

const slugify = (raw) =>
    (raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)

/**
 * MCP Server registration dialog. Mirrors the Webhooks dialog pattern but
 * branches on transport and outboundAuth shape. Add mode collects creation
 * fields; Edit mode also exposes "Test Connection", "Discover Tools" (live
 * `tools/list`), and Delete.
 */
const MCPServerDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const isEdit = dialogProps?.type === 'EDIT'

    const [serverId, setServerId] = useState('')
    const [name, setName] = useState('')
    const [slug, setSlug] = useState('')
    const [slugDirty, setSlugDirty] = useState(false)
    const [description, setDescription] = useState('')
    const [transport, setTransport] = useState('streamable-http')
    const [url, setUrl] = useState('')
    // stdio fields — only relevant when transport === 'stdio'. `argsList` is
    // a plain string[] rendered one-input-per-row; `envEntries` is an array
    // of `{ key, mode: 'inline'|'credential', value, credentialId, field }`
    // rendered as a key-value grid. The persisted JSON shapes are built in
    // `buildBody()` from these structures.
    const [command, setCommand] = useState('')
    const [argsList, setArgsList] = useState([])
    const [envEntries, setEnvEntries] = useState([])
    const [timeoutMs, setTimeoutMs] = useState(30000)
    const [requestHeadersText, setRequestHeadersText] = useState('')
    const [authType, setAuthType] = useState('none')
    const [authMode, setAuthMode] = useState('inline') // 'inline' | 'credential'
    const [authToken, setAuthToken] = useState('')
    const [authHeaderName, setAuthHeaderName] = useState('')
    const [authCredentialId, setAuthCredentialId] = useState('')
    const [allowedTools, setAllowedTools] = useState([])
    const [discoveredTools, setDiscoveredTools] = useState([])
    const [enabled, setEnabled] = useState(true)

    const [credentials, setCredentials] = useState([])
    const [fieldErrors, setFieldErrors] = useState({})
    const [testLoading, setTestLoading] = useState(false)
    const [discoverLoading, setDiscoverLoading] = useState(false)

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

    // Load credential list once when the dialog opens.
    useEffect(() => {
        if (!show) return
        credentialsApi
            .getAllCredentials()
            .then((res) => setCredentials(Array.isArray(res.data) ? res.data : []))
            .catch(() => setCredentials([]))
    }, [show])

    // Credential picker is auth-type aware: oauth2-refresh only lists
    // credentials of the matching shape so the user cannot accidentally
    // point the refresher at a static-bearer credential.
    const authCredentialOptions =
        authType === 'oauth2-refresh' ? credentials.filter((c) => c.credentialName === 'oauth2-refresh') : credentials

    // The stdio `env` editor picks against the same vault, but excludes
    // `oauth2-refresh` credentials: rotation would surprise an already-
    // spawned child since the env was resolved once at spawn time.
    const stdioCredentialOptions = credentials.filter((c) => c.credentialName !== 'oauth2-refresh')

    // Hydrate fields when transitioning between ADD / EDIT.
    useEffect(() => {
        if (!show) return
        if (isEdit && dialogProps.data) {
            const s = dialogProps.data
            setServerId(s.id || '')
            setName(s.name || '')
            setSlug(s.slug || '')
            setSlugDirty(true)
            setDescription(s.description || '')
            setTransport(s.transport || 'streamable-http')
            setUrl(s.url || '')
            setCommand(s.command || '')
            setArgsList(toStringArray(s.args))
            setEnvEntries(parseStoredEnv(s.env))
            setTimeoutMs(s.timeoutMs ?? 30000)
            setRequestHeadersText(formatJson(s.requestHeaders))

            const auth = parseJson(s.outboundAuth) || {}
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
            } else if (auth.type === 'oauth2-refresh') {
                // OAuth2 refresh has no inline mode — refresh tokens always
                // live in the credential vault so the background refresher
                // can rotate them in place.
                setAuthType('oauth2-refresh')
                setAuthMode('credential')
                setAuthCredentialId(auth.credentialId || '')
                setAuthToken('')
                setAuthHeaderName('')
            } else {
                setAuthType('none')
                setAuthMode('inline')
                setAuthToken('')
                setAuthHeaderName('')
                setAuthCredentialId('')
            }

            setAllowedTools(toStringArray(s.allowedTools))
            setEnabled(Boolean(s.enabled))
            setDiscoveredTools([])
            setFieldErrors({})
        } else {
            // ADD mode reset
            setServerId('')
            setName('')
            setSlug('')
            setSlugDirty(false)
            setDescription('')
            setTransport('streamable-http')
            setUrl('')
            setCommand('')
            setArgsList([])
            setEnvEntries([])
            setTimeoutMs(30000)
            setRequestHeadersText('')
            setAuthType('none')
            setAuthMode('inline')
            setAuthToken('')
            setAuthHeaderName('')
            setAuthCredentialId('')
            setAllowedTools([])
            setDiscoveredTools([])
            setEnabled(true)
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
        if (authType === 'oauth2-refresh') {
            return authCredentialId ? { type: 'oauth2-refresh', credentialId: authCredentialId } : undefined
        }
        return undefined
    }

    const validate = () => {
        const errors = {}
        if (!name.trim()) errors.name = 'Name is required'
        if (!transport) errors.transport = 'Transport is required'
        if (transport !== 'stdio' && !url.trim()) errors.url = 'URL is required for HTTP transports'
        if (transport === 'stdio' && !command.trim()) errors.command = 'Command is required for stdio transport'
        if (transport === 'stdio') {
            const envKeyErrors = []
            const seenKeys = new Set()
            envEntries.forEach((entry, idx) => {
                const trimmedKey = (entry.key || '').trim()
                if (!trimmedKey) {
                    envKeyErrors.push(`Row ${idx + 1}: env var name is required`)
                } else if (!ENV_KEY_REGEX.test(trimmedKey)) {
                    envKeyErrors.push(`Row ${idx + 1}: "${trimmedKey}" is not a valid env var name`)
                } else if (seenKeys.has(trimmedKey)) {
                    envKeyErrors.push(`Row ${idx + 1}: duplicate env var name "${trimmedKey}"`)
                } else {
                    seenKeys.add(trimmedKey)
                }
                if (entry.mode === 'credential') {
                    if (!entry.credentialId) envKeyErrors.push(`Row ${idx + 1}: credential is required`)
                    if (!(entry.field || '').trim()) envKeyErrors.push(`Row ${idx + 1}: credential field name is required`)
                }
            })
            if (envKeyErrors.length > 0) errors.env = envKeyErrors.join(' · ')
        }
        if (requestHeadersText && parseJson(requestHeadersText) === undefined) {
            errors.requestHeaders = 'Headers must be valid JSON object'
        }
        if (authType === 'bearer' && authMode === 'inline' && !authToken) errors.authToken = 'Bearer token is required'
        if (authType === 'bearer' && authMode === 'credential' && !authCredentialId) errors.authCredentialId = 'Credential is required'
        if (authType === 'header' && !authHeaderName) errors.authHeaderName = 'Header name is required'
        if (authType === 'header' && authMode === 'inline' && !authToken) errors.authToken = 'Header value is required'
        if (authType === 'header' && authMode === 'credential' && !authCredentialId) errors.authCredentialId = 'Credential is required'
        if (authType === 'oauth2-refresh' && !authCredentialId) errors.authCredentialId = 'OAuth2 refresh credential is required'
        return errors
    }

    const onSave = async () => {
        const errors = validate()
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            return
        }
        setFieldErrors({})

        const requestHeaders = requestHeadersText ? parseJson(requestHeadersText) : undefined

        const isStdio = transport === 'stdio'
        const argsForBody = isStdio ? argsList.filter((a) => typeof a === 'string' && a.length > 0) : undefined
        const envForBody = isStdio ? buildStdioEnvBody(envEntries) : undefined

        const body = {
            name,
            slug: slug || undefined,
            description: description || undefined,
            transport,
            url: isStdio ? undefined : url || undefined,
            command: isStdio ? command : undefined,
            args: argsForBody && argsForBody.length > 0 ? argsForBody : undefined,
            env: envForBody && Object.keys(envForBody).length > 0 ? envForBody : undefined,
            timeoutMs: Number(timeoutMs) || 30000,
            requestHeaders,
            outboundAuth: buildOutboundAuth(),
            allowedTools,
            enabled
        }

        try {
            if (isEdit) {
                await mcpServersApi.updateMCPServer(serverId, body)
                showSuccess('MCP server updated')
            } else {
                await mcpServersApi.createMCPServer(body)
                showSuccess('MCP server registered')
            }
            onConfirm()
        } catch (err) {
            const message = err?.response?.data?.message || err?.message || 'Save failed'
            const lower = message.toLowerCase()
            if (lower.includes('url')) setFieldErrors((prev) => ({ ...prev, url: message }))
            else if (lower.includes('slug')) setFieldErrors((prev) => ({ ...prev, slug: message }))
            else if (lower.includes('name')) setFieldErrors((prev) => ({ ...prev, name: message }))
            showError(message, true)
        }
    }

    const onDelete = async () => {
        if (!serverId) return
        try {
            await mcpServersApi.deleteMCPServer(serverId)
            showSuccess('MCP server deleted')
            onConfirm()
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to delete MCP server', true)
        }
    }

    const onTestConnection = async () => {
        if (!serverId) return
        setTestLoading(true)
        try {
            const res = await mcpServersApi.testMCPServerConnection(serverId)
            const result = res.data
            if (result?.success) {
                showSuccess(result.message || 'Connection OK')
            } else {
                showError(result?.message || 'Connection failed', true)
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Connection test failed', true)
        } finally {
            setTestLoading(false)
        }
    }

    const onDiscoverTools = async () => {
        const isStdio = transport === 'stdio'
        if (isStdio && !isEdit) {
            showError('Save the server first — stdio preview is not available pre-save', false)
            return
        }
        if (!isStdio && !url.trim()) return
        setDiscoverLoading(true)
        try {
            let res
            if (isEdit && serverId) {
                res = await mcpServersApi.listMCPServerTools(serverId)
            } else {
                const requestHeaders = requestHeadersText ? parseJson(requestHeadersText) : undefined
                res = await mcpServersApi.previewMCPServerTools({
                    transport,
                    url,
                    timeoutMs: Number(timeoutMs) || 30000,
                    requestHeaders,
                    outboundAuth: buildOutboundAuth(),
                    slug: slug || undefined
                })
            }
            const tools = (res.data?.tools || []).map((t) => t?.name).filter((n) => typeof n === 'string')
            setDiscoveredTools(tools)
            if (tools.length === 0) {
                showError('Server returned no tools', false)
            } else {
                // Merge into the active selection so chips render immediately.
                // Chronos users deselect with the chip's X. Manual entries that
                // came before Discover are preserved.
                const previous = allowedTools
                const merged = mergeUnique(previous, tools)
                const added = merged.length - previous.length
                setAllowedTools(merged)
                showSuccess(
                    added > 0
                        ? `Discovered ${tools.length} tool${tools.length === 1 ? '' : 's'} — added ${added} to Allowed Tools.`
                        : `Discovered ${tools.length} tool${tools.length === 1 ? '' : 's'} (already selected).`
                )
            }
        } catch (err) {
            showError(err?.response?.data?.message || 'Failed to discover tools', true)
        } finally {
            setDiscoverLoading(false)
        }
    }

    const allowedToolsOptions = mergeUnique(allowedTools, discoveredTools)

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='mcp-server-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='mcp-server-dialog-title'>
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
                            onChange={(e) => onNameChange(e.target.value)}
                            placeholder='e.g. Postgres MCP'
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
                            Used as the namespace prefix in tool names: <code>{`<slug>.<tool>`}</code>
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
                            placeholder='Optional — what this server exposes'
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Transport</Typography>
                        <RadioGroup row value={transport} onChange={(e) => setTransport(e.target.value)}>
                            {TRANSPORTS.map((t) => (
                                <FormControlLabel
                                    key={t.value}
                                    value={t.value}
                                    control={<Radio size='small' disabled={t.disabled} />}
                                    label={t.label}
                                />
                            ))}
                        </RadioGroup>
                        {fieldErrors.transport && <FormHelperText error>{fieldErrors.transport}</FormHelperText>}
                    </Box>
                    {transport !== 'stdio' && (
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
                                    clearError('url')
                                }}
                                placeholder='https://mcp.example.com'
                                sx={{ fontFamily: 'monospace' }}
                            />
                            {fieldErrors.url && <FormHelperText error>{fieldErrors.url}</FormHelperText>}
                        </Box>
                    )}
                    {transport === 'stdio' && (
                        <>
                            <Box>
                                <Typography variant='overline'>
                                    Command <span style={{ color: 'red' }}>*</span>
                                </Typography>
                                <OutlinedInput
                                    fullWidth
                                    size='small'
                                    value={command}
                                    error={!!fieldErrors.command}
                                    onChange={(e) => {
                                        setCommand(e.target.value)
                                        clearError('command')
                                    }}
                                    placeholder='npx'
                                    sx={{ fontFamily: 'monospace' }}
                                />
                                <FormHelperText>
                                    Executable to spawn. Runs as the same OS user as Chronos — only register binaries you trust.
                                </FormHelperText>
                                {fieldErrors.command && <FormHelperText error>{fieldErrors.command}</FormHelperText>}
                            </Box>
                            <Box>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                                    <Typography variant='overline'>Args</Typography>
                                    <Button size='small' onClick={() => setArgsList([...argsList, ''])}>
                                        + Add arg
                                    </Button>
                                </Stack>
                                <Stack spacing={1}>
                                    {argsList.length === 0 && (
                                        <FormHelperText>
                                            No args. Click <b>+ Add arg</b> to pass one or more strings to the executable.
                                        </FormHelperText>
                                    )}
                                    {argsList.map((arg, idx) => (
                                        <Stack key={`arg-${idx}`} direction='row' spacing={1} alignItems='center'>
                                            <OutlinedInput
                                                fullWidth
                                                size='small'
                                                value={arg}
                                                onChange={(e) => {
                                                    const next = argsList.slice()
                                                    next[idx] = e.target.value
                                                    setArgsList(next)
                                                }}
                                                placeholder={
                                                    idx === 0
                                                        ? '-y'
                                                        : idx === 1
                                                        ? '@modelcontextprotocol/server-postgres'
                                                        : 'postgresql://localhost/db'
                                                }
                                                sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                                            />
                                            <Button
                                                size='small'
                                                color='error'
                                                onClick={() => setArgsList(argsList.filter((_, i) => i !== idx))}
                                            >
                                                Remove
                                            </Button>
                                        </Stack>
                                    ))}
                                </Stack>
                                <FormHelperText>
                                    Argv strings passed verbatim to <code>child_process.spawn</code>. Use{' '}
                                    <code>{`{{credentialId:fieldName}}`}</code> inside a string to interpolate a decrypted credential field
                                    at spawn time (e.g. inside a Postgres connection string).
                                </FormHelperText>
                            </Box>
                            <Box>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 0.5 }}>
                                    <Typography variant='overline'>Env</Typography>
                                    <Button
                                        size='small'
                                        onClick={() =>
                                            setEnvEntries([
                                                ...envEntries,
                                                { key: '', mode: 'inline', value: '', credentialId: '', field: '' }
                                            ])
                                        }
                                    >
                                        + Add env var
                                    </Button>
                                </Stack>
                                <Stack spacing={1}>
                                    {envEntries.length === 0 && (
                                        <FormHelperText>
                                            No env vars. Click <b>+ Add env var</b> to set one or more environment variables on the spawned
                                            child.
                                        </FormHelperText>
                                    )}
                                    {envEntries.map((entry, idx) => (
                                        <Stack key={`env-${idx}`} spacing={0.5}>
                                            <Stack direction='row' spacing={1} alignItems='center'>
                                                <OutlinedInput
                                                    size='small'
                                                    sx={{ minWidth: 220, fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                    value={entry.key}
                                                    onChange={(e) =>
                                                        updateEnvEntry(envEntries, setEnvEntries, idx, { key: e.target.value })
                                                    }
                                                    placeholder='GITHUB_PERSONAL_ACCESS_TOKEN'
                                                />
                                                <Select
                                                    size='small'
                                                    value={entry.mode}
                                                    onChange={(e) =>
                                                        updateEnvEntry(envEntries, setEnvEntries, idx, { mode: e.target.value })
                                                    }
                                                    sx={{ minWidth: 130 }}
                                                >
                                                    <MenuItem value='inline'>Inline value</MenuItem>
                                                    <MenuItem value='credential'>From credential</MenuItem>
                                                </Select>
                                                <Button
                                                    size='small'
                                                    color='error'
                                                    onClick={() => setEnvEntries(envEntries.filter((_, i) => i !== idx))}
                                                >
                                                    Remove
                                                </Button>
                                            </Stack>
                                            {entry.mode === 'inline' ? (
                                                <OutlinedInput
                                                    size='small'
                                                    type='password'
                                                    fullWidth
                                                    value={entry.value}
                                                    onChange={(e) =>
                                                        updateEnvEntry(envEntries, setEnvEntries, idx, { value: e.target.value })
                                                    }
                                                    placeholder='Inline value (visible in change-log diffs — prefer a credential)'
                                                />
                                            ) : (
                                                <Stack direction='row' spacing={1}>
                                                    <Select
                                                        size='small'
                                                        fullWidth
                                                        value={entry.credentialId}
                                                        onChange={(e) =>
                                                            updateEnvEntry(envEntries, setEnvEntries, idx, {
                                                                credentialId: e.target.value
                                                            })
                                                        }
                                                        displayEmpty
                                                    >
                                                        <MenuItem value='' disabled>
                                                            {stdioCredentialOptions.length === 0
                                                                ? 'No credentials available'
                                                                : 'Select a credential'}
                                                        </MenuItem>
                                                        {stdioCredentialOptions.map((c) => (
                                                            <MenuItem key={c.id} value={c.id}>
                                                                {c.name}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                    <OutlinedInput
                                                        size='small'
                                                        sx={{ minWidth: 180, fontFamily: 'monospace', fontSize: '0.85rem' }}
                                                        value={entry.field}
                                                        onChange={(e) =>
                                                            updateEnvEntry(envEntries, setEnvEntries, idx, { field: e.target.value })
                                                        }
                                                        placeholder='field name (e.g. token)'
                                                    />
                                                </Stack>
                                            )}
                                        </Stack>
                                    ))}
                                </Stack>
                                <FormHelperText>
                                    Env vars merged into the spawn-time env. Inline values land plaintext in change-log diffs — use{' '}
                                    <b>From credential</b> for any secret so the value stays in the vault.
                                </FormHelperText>
                                {fieldErrors.env && <FormHelperText error>{fieldErrors.env}</FormHelperText>}
                            </Box>
                        </>
                    )}
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
                        <FormHelperText>JSON object — sent with every request to this server</FormHelperText>
                        {fieldErrors.requestHeaders && <FormHelperText error>{fieldErrors.requestHeaders}</FormHelperText>}
                    </Box>
                    <Box>
                        <Typography variant='overline'>Outbound Auth</Typography>
                        <Stack direction='row' spacing={2} sx={{ alignItems: 'center', mt: 0.5 }}>
                            <Select size='small' value={authType} onChange={(e) => setAuthType(e.target.value)} sx={{ minWidth: 200 }}>
                                {AUTH_TYPES.map((t) => (
                                    <MenuItem key={t.value} value={t.value}>
                                        {t.label}
                                    </MenuItem>
                                ))}
                            </Select>
                            {authType !== 'none' && authType !== 'oauth2-refresh' && (
                                <RadioGroup row value={authMode} onChange={(e) => setAuthMode(e.target.value)}>
                                    <FormControlLabel value='inline' control={<Radio size='small' />} label='Inline' />
                                    <FormControlLabel value='credential' control={<Radio size='small' />} label='From credential vault' />
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
                        {authType !== 'none' && authType !== 'oauth2-refresh' && authMode === 'inline' && (
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
                        {authType !== 'none' && (authMode === 'credential' || authType === 'oauth2-refresh') && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant='caption'>
                                    {authType === 'oauth2-refresh' ? 'OAuth2 Refresh Credential' : 'Credential'}
                                </Typography>
                                <Select
                                    fullWidth
                                    size='small'
                                    value={authCredentialId}
                                    error={!!fieldErrors.authCredentialId}
                                    onChange={(e) => setAuthCredentialId(e.target.value)}
                                    displayEmpty
                                >
                                    <MenuItem value='' disabled>
                                        {authCredentialOptions.length === 0
                                            ? authType === 'oauth2-refresh'
                                                ? 'No oauth2-refresh credentials available — create one in Credentials first'
                                                : 'No credentials available'
                                            : 'Select a credential'}
                                    </MenuItem>
                                    {authCredentialOptions.map((c) => (
                                        <MenuItem key={c.id} value={c.id}>
                                            {c.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                                {fieldErrors.authCredentialId && <FormHelperText error>{fieldErrors.authCredentialId}</FormHelperText>}
                            </Box>
                        )}
                    </Box>
                    <Box>
                        <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 1 }}>
                            <Typography variant='overline'>Allowed Tools</Typography>
                            <Tooltip
                                title={
                                    transport === 'stdio'
                                        ? isEdit
                                            ? 'Spawn the stdio MCP server and call tools/list'
                                            : 'Save the server first — stdio preview is not available pre-save'
                                        : !url.trim()
                                        ? 'Enter a URL first'
                                        : isEdit
                                        ? 'Call tools/list on the live MCP server'
                                        : 'Preview tools/list against the URL above (server is not yet saved)'
                                }
                            >
                                <span>
                                    <StyledButton
                                        size='small'
                                        variant='outlined'
                                        onClick={onDiscoverTools}
                                        disabled={discoverLoading || (transport === 'stdio' ? !isEdit || !command.trim() : !url.trim())}
                                        startIcon={<IconRefresh size={14} />}
                                    >
                                        {discoverLoading ? 'Discovering…' : 'Discover Tools'}
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
                            renderInput={(params) => <TextField {...params} placeholder='Type a bare tool name + Enter (e.g. query)' />}
                        />
                        <FormHelperText>
                            Bare tool names this platform may expose to agents. Empty list means no restriction at the server layer (agents
                            are still gated by their own allowedTools).
                        </FormHelperText>
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
                {isEdit && (
                    <>
                        <StyledButton color='error' variant='contained' onClick={onDelete}>
                            Delete
                        </StyledButton>
                        <Tooltip title='HTTP GET reachability probe'>
                            <span>
                                <StyledButton
                                    variant='outlined'
                                    onClick={onTestConnection}
                                    disabled={testLoading}
                                    startIcon={<IconSend size={16} />}
                                >
                                    {testLoading ? 'Testing…' : 'Test Connection'}
                                </StyledButton>
                            </span>
                        </Tooltip>
                    </>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button onClick={onCancel}>{dialogProps.cancelButtonName || 'Cancel'}</Button>
                <StyledButton variant='contained' onClick={onSave} disabled={!name || (transport === 'stdio' ? !command : !url)}>
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

const mergeUnique = (a, b) => {
    const set = new Set()
    const out = []
    for (const v of [...a, ...b]) {
        if (typeof v !== 'string') continue
        if (set.has(v)) continue
        set.add(v)
        out.push(v)
    }
    return out
}

/**
 * Parses the persisted `MCPServer.env` JSON object into the form's editor
 * shape. Inline string values become `{mode:'inline', value}`; credential
 * refs `{credentialId, field}` become `{mode:'credential', credentialId, field}`.
 * Unrecognised shapes are dropped silently — the server enforces the
 * canonical shape on write, so this is just hydration.
 */
const parseStoredEnv = (raw) => {
    const parsed = parseJson(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    const entries = []
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
            entries.push({ key, mode: 'inline', value, credentialId: '', field: '' })
        } else if (value && typeof value === 'object' && typeof value.credentialId === 'string' && typeof value.field === 'string') {
            entries.push({ key, mode: 'credential', value: '', credentialId: value.credentialId, field: value.field })
        }
    }
    return entries
}

/**
 * Builds the body shape expected by `MCPServer.env` from the editor entries.
 * Empty rows (no key) and rows with empty inline value or empty credential
 * ref are dropped so a stray "+ Add" click without input doesn't persist a
 * useless row.
 */
const buildStdioEnvBody = (entries) => {
    const out = {}
    for (const entry of entries) {
        const key = (entry.key || '').trim()
        if (!key) continue
        if (entry.mode === 'credential') {
            if (!entry.credentialId || !(entry.field || '').trim()) continue
            out[key] = { credentialId: entry.credentialId, field: entry.field.trim() }
        } else {
            if (!entry.value) continue
            out[key] = entry.value
        }
    }
    return out
}

/** Immutable update of a single env-entry row by index. */
const updateEnvEntry = (current, setter, idx, patch) => {
    const next = current.slice()
    next[idx] = { ...next[idx], ...patch }
    setter(next)
}

MCPServerDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default MCPServerDialog
