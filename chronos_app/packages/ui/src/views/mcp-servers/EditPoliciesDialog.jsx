import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch } from 'react-redux'

import {
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    OutlinedInput,
    Stack,
    Switch,
    Typography
} from '@mui/material'
import { IconX } from '@tabler/icons-react'

import { StyledButton } from '@/ui-component/button/StyledButton'

import mcpServersApi from '@/api/mcp-servers'

import {
    enqueueSnackbar as enqueueSnackbarAction,
    closeSnackbar as closeSnackbarAction,
    HIDE_CANVAS_DIALOG,
    SHOW_CANVAS_DIALOG
} from '@/store/actions'
import useNotifier from '@/utils/useNotifier'

/**
 * Hardcoded fallback values mirror the server-side resolver in
 * `services/mcp-gateway/policy.ts`. Used when a section is set to
 * "use default" so the greyed-out inputs still display the value the
 * gateway will actually apply.
 */
const DEFAULTS = {
    retry: { maxAttempts: 3, baseDelayMs: 500, jitter: true },
    rateLimit: { rps: 0, burst: 0 },
    circuitBreaker: { failureThreshold: 5, openMs: 30000 }
}

/**
 * Reliability-policy editor for one MCP server. Separate from the connection
 * dialog (`MCPServerDialog`) per locked decision #12 — policies are
 * operational tuning surfaced after observing behaviour, not registration
 * fields. Three sections (Retry / Rate Limit / Circuit Breaker), each with
 * a "Use default" checkbox that hides the per-field inputs and falls back
 * to the platform default at invoke time.
 *
 * Submitting writes a single `MCPServer` row update via the existing
 * `updateMCPServer` API; the server emits a matching `MCPServerChangeLog`
 * entry inside `mcpServerService.updateMCPServer`.
 */
const EditPoliciesDialog = ({ show, server, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const initial = useMemo(() => parsePolicies(server?.policies), [server?.policies])

    const [retryDefault, setRetryDefault] = useState(true)
    const [retryMaxAttempts, setRetryMaxAttempts] = useState(DEFAULTS.retry.maxAttempts)
    const [retryBaseDelayMs, setRetryBaseDelayMs] = useState(DEFAULTS.retry.baseDelayMs)
    const [retryJitter, setRetryJitter] = useState(DEFAULTS.retry.jitter)

    const [rateLimitDefault, setRateLimitDefault] = useState(true)
    const [rateLimitRps, setRateLimitRps] = useState(DEFAULTS.rateLimit.rps)
    const [rateLimitBurst, setRateLimitBurst] = useState(DEFAULTS.rateLimit.burst)

    const [circuitDefault, setCircuitDefault] = useState(true)
    const [circuitThreshold, setCircuitThreshold] = useState(DEFAULTS.circuitBreaker.failureThreshold)
    const [circuitOpenMs, setCircuitOpenMs] = useState(DEFAULTS.circuitBreaker.openMs)

    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!show) return
        // Re-hydrate state every time the dialog opens so Cancel doesn't leak
        // half-edited values into the next open.
        if (initial.retry) {
            setRetryDefault(false)
            setRetryMaxAttempts(initial.retry.maxAttempts ?? DEFAULTS.retry.maxAttempts)
            setRetryBaseDelayMs(initial.retry.baseDelayMs ?? DEFAULTS.retry.baseDelayMs)
            setRetryJitter(initial.retry.jitter ?? DEFAULTS.retry.jitter)
        } else {
            setRetryDefault(true)
            setRetryMaxAttempts(DEFAULTS.retry.maxAttempts)
            setRetryBaseDelayMs(DEFAULTS.retry.baseDelayMs)
            setRetryJitter(DEFAULTS.retry.jitter)
        }
        if (initial.rateLimit) {
            setRateLimitDefault(false)
            setRateLimitRps(initial.rateLimit.rps ?? DEFAULTS.rateLimit.rps)
            setRateLimitBurst(initial.rateLimit.burst ?? DEFAULTS.rateLimit.burst)
        } else {
            setRateLimitDefault(true)
            setRateLimitRps(DEFAULTS.rateLimit.rps)
            setRateLimitBurst(DEFAULTS.rateLimit.burst)
        }
        if (initial.circuitBreaker) {
            setCircuitDefault(false)
            setCircuitThreshold(initial.circuitBreaker.failureThreshold ?? DEFAULTS.circuitBreaker.failureThreshold)
            setCircuitOpenMs(initial.circuitBreaker.openMs ?? DEFAULTS.circuitBreaker.openMs)
        } else {
            setCircuitDefault(true)
            setCircuitThreshold(DEFAULTS.circuitBreaker.failureThreshold)
            setCircuitOpenMs(DEFAULTS.circuitBreaker.openMs)
        }
    }, [show, initial])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

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

    const buildPolicies = () => {
        const policies = {}
        if (!retryDefault) {
            policies.retry = {
                maxAttempts: clampInt(retryMaxAttempts, 1, 1),
                baseDelayMs: clampInt(retryBaseDelayMs, 1, 500),
                jitter: Boolean(retryJitter)
            }
        }
        if (!rateLimitDefault) {
            policies.rateLimit = {
                rps: clampInt(rateLimitRps, 0, 0),
                burst: clampInt(rateLimitBurst, 0, 0)
            }
        }
        if (!circuitDefault) {
            policies.circuitBreaker = {
                failureThreshold: clampInt(circuitThreshold, 0, 0),
                openMs: clampInt(circuitOpenMs, 1, 30000)
            }
        }
        // All three set to default → clear the stored policies so the
        // entity row reverts to NULL and the gateway re-resolves from env.
        return Object.keys(policies).length === 0 ? null : policies
    }

    const onSave = async () => {
        if (!server?.id) return
        setSaving(true)
        try {
            await mcpServersApi.updateMCPServer(server.id, { policies: buildPolicies() })
            showSuccess('Policies updated')
            onConfirm?.()
        } catch (err) {
            showError(err?.response?.data?.message || err?.message || 'Failed to update policies', true)
        } finally {
            setSaving(false)
        }
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='mcp-policies-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='mcp-policies-dialog-title'>
                Edit policies: {server?.name || server?.slug || ''}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        Reliability policies wrap every call to this MCP server. Unchanged sections fall back to the platform default at
                        invoke time.
                    </Typography>

                    {/* Retry */}
                    <Box>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                            <Typography variant='overline'>Retry</Typography>
                            <FormControlLabel
                                sx={{ ml: 0 }}
                                control={<Checkbox checked={retryDefault} onChange={(e) => setRetryDefault(e.target.checked)} />}
                                label={<Typography variant='body2'>Use default</Typography>}
                                labelPlacement='start'
                            />
                        </Stack>
                        <Stack direction='row' spacing={2}>
                            <NumberField
                                label='Max attempts'
                                helper='Includes the first try; 1 = no retries.'
                                disabled={retryDefault}
                                value={retryMaxAttempts}
                                onChange={setRetryMaxAttempts}
                                min={1}
                            />
                            <NumberField
                                label='Base delay (ms)'
                                helper='Doubles between attempts.'
                                disabled={retryDefault}
                                value={retryBaseDelayMs}
                                onChange={setRetryBaseDelayMs}
                                min={1}
                            />
                            <Box sx={{ minWidth: 160 }}>
                                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                                    Jitter
                                </Typography>
                                <Stack direction='row' alignItems='center' sx={{ height: 40 }}>
                                    <Switch
                                        size='small'
                                        checked={Boolean(retryJitter)}
                                        disabled={retryDefault}
                                        onChange={(e) => setRetryJitter(e.target.checked)}
                                    />
                                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                        ±50% noise per backoff
                                    </Typography>
                                </Stack>
                            </Box>
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Rate limit */}
                    <Box>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                            <Typography variant='overline'>Rate limit</Typography>
                            <FormControlLabel
                                sx={{ ml: 0 }}
                                control={<Checkbox checked={rateLimitDefault} onChange={(e) => setRateLimitDefault(e.target.checked)} />}
                                label={<Typography variant='body2'>Use default</Typography>}
                                labelPlacement='start'
                            />
                        </Stack>
                        <Stack direction='row' spacing={2}>
                            <NumberField
                                label='Requests/sec'
                                helper='0 = unlimited.'
                                disabled={rateLimitDefault}
                                value={rateLimitRps}
                                onChange={setRateLimitRps}
                                min={0}
                            />
                            <NumberField
                                label='Burst'
                                helper='0 = matches rps (no headroom).'
                                disabled={rateLimitDefault}
                                value={rateLimitBurst}
                                onChange={setRateLimitBurst}
                                min={0}
                            />
                        </Stack>
                    </Box>

                    <Divider />

                    {/* Circuit breaker */}
                    <Box>
                        <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                            <Typography variant='overline'>Circuit breaker</Typography>
                            <FormControlLabel
                                sx={{ ml: 0 }}
                                control={<Checkbox checked={circuitDefault} onChange={(e) => setCircuitDefault(e.target.checked)} />}
                                label={<Typography variant='body2'>Use default</Typography>}
                                labelPlacement='start'
                            />
                        </Stack>
                        <Stack direction='row' spacing={2}>
                            <NumberField
                                label='Failure threshold'
                                helper='Consecutive failures before opening. 0 = disabled.'
                                disabled={circuitDefault}
                                value={circuitThreshold}
                                onChange={setCircuitThreshold}
                                min={0}
                            />
                            <NumberField
                                label='Open duration (ms)'
                                helper='How long the breaker stays open before trialling a half-open call.'
                                disabled={circuitDefault}
                                value={circuitOpenMs}
                                onChange={setCircuitOpenMs}
                                min={1}
                            />
                        </Stack>
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <StyledButton variant='contained' onClick={onSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

const NumberField = ({ label, helper, value, onChange, disabled, min = 0 }) => (
    <Box sx={{ flex: 1, minWidth: 160 }}>
        <Typography variant='caption' sx={{ color: 'text.secondary' }}>
            {label}
        </Typography>
        <OutlinedInput
            fullWidth
            size='small'
            type='number'
            inputProps={{ min }}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        {helper && (
            <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                {helper}
            </Typography>
        )}
    </Box>
)

NumberField.propTypes = {
    label: PropTypes.string.isRequired,
    helper: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    min: PropTypes.number
}

const parsePolicies = (raw) => {
    if (!raw) return {}
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
        return parsed
    } catch {
        return {}
    }
}

const clampInt = (value, min, fallback) => {
    const n = typeof value === 'number' ? value : parseInt(value, 10)
    if (!Number.isFinite(n) || n < min) return fallback
    return Math.floor(n)
}

EditPoliciesDialog.propTypes = {
    show: PropTypes.bool,
    server: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        slug: PropTypes.string,
        policies: PropTypes.oneOfType([PropTypes.string, PropTypes.object])
    }),
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default EditPoliciesDialog
