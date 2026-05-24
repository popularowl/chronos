import PropTypes from 'prop-types'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography, IconButton } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import {
    IconAlertTriangle,
    IconClock,
    IconCopy,
    IconExternalLink,
    IconInbox,
    IconSend,
    IconShieldCheck,
    IconTool,
    IconX
} from '@tabler/icons-react'
import ReactJson from 'flowise-react-json-view'

import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import { JSONViewer } from '@/ui-component/json/JsonViewer'
import { PolicyOutcomeDetail } from './PolicyOutcome'

const KIND_ICON = {
    invocation: IconTool,
    request: IconSend,
    response: IconInbox,
    policy: IconShieldCheck,
    error: IconAlertTriangle
}

// Tree-kind accent color resolved from the MUI theme palette so dark mode
// works and the audit drawer shares the same color language as the rest of
// the app (executions drawer, status icons, chips).
const getKindColor = (theme, kind) => {
    switch (kind) {
        case 'request':
            return theme.palette.warning.main
        case 'response':
            return theme.palette.info.main
        case 'policy':
            return theme.palette.success.dark
        case 'error':
            return theme.palette.error.main
        case 'invocation':
        default:
            return theme.palette.primary.main
    }
}

// MCP tool calls often complete in <1s; render those in ms so the chip
// doesn't read "0.01 seconds". Match Executions' format for longer calls.
const formatDuration = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)} seconds`)

export const AuditNodeDetails = ({ node, row }) => {
    const [dataView, setDataView] = useState('rendered')
    const customization = useSelector((state) => state.customization)
    const theme = useTheme()
    const dispatch = useDispatch()

    const handleDataViewChange = (event, nextView) => {
        event.stopPropagation()
        if (nextView === null) return
        setDataView(nextView)
    }

    const showCopied = (label) =>
        dispatch(
            enqueueSnackbarAction({
                message: `${label} copied to clipboard`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'success',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => dispatch(closeSnackbarAction(key))}>
                            <IconX />
                        </Button>
                    )
                }
            })
        )

    const copy = (value, label) => {
        if (!value) return
        navigator.clipboard.writeText(value)
        showCopied(label)
    }

    if (!node || !node.data) {
        return <Typography color='text.secondary'>No data available for this item</Typography>
    }

    const KindIcon = KIND_ICON[node.data.kind] || IconTool
    const kindColor = getKindColor(theme, node.data.kind)
    const rawSrc = node.data.raw ?? row

    return (
        <Box sx={{ position: 'relative' }}>
            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                <Box sx={{ width: 50 }}>
                    <Box
                        sx={{
                            ...theme.typography.commonAvatar,
                            ...theme.typography.mediumAvatar,
                            borderRadius: '15px',
                            backgroundColor: kindColor,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'default'
                        }}
                    >
                        <KindIcon size={20} color='white' />
                    </Box>
                </Box>
                <Typography variant='h5' gutterBottom>
                    {node.label}
                </Typography>
                <Box sx={{ flex: 1 }} />
                {node.data.kind === 'invocation' && typeof row?.durationMs === 'number' && (
                    <Chip
                        icon={<IconClock size={17} />}
                        label={formatDuration(row.durationMs)}
                        variant='contained'
                        color='secondary'
                        size='small'
                        sx={{ ml: 1, '& .MuiChip-icon': { mr: 0.2, ml: 1 } }}
                    />
                )}
                {node.status === 'FINISHED' && <Box component={CheckCircleIcon} sx={{ ml: 1, color: 'success.dark', fontSize: 22 }} />}
                {node.status === 'ERROR' && <Box component={ErrorIcon} sx={{ ml: 1, color: 'error.main', fontSize: 22 }} />}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                <ToggleButtonGroup
                    sx={{ borderRadius: 2, maxHeight: 40 }}
                    value={dataView}
                    color='primary'
                    exclusive
                    onChange={handleDataViewChange}
                >
                    <ToggleButton
                        sx={{
                            borderColor: theme.palette.grey[900] + 25,
                            borderRadius: 2,
                            color: customization.isDarkMode ? 'white' : 'inherit'
                        }}
                        variant='contained'
                        value='rendered'
                        title='Rendered'
                    >
                        Rendered
                    </ToggleButton>
                    <ToggleButton
                        sx={{
                            borderColor: theme.palette.grey[900] + 25,
                            borderRadius: 2,
                            color: customization.isDarkMode ? 'white' : 'inherit'
                        }}
                        variant='contained'
                        value='raw'
                        title='Raw'
                    >
                        Raw
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {dataView === 'rendered' && (
                <Box sx={{ mt: 2 }}>
                    {node.data.kind === 'invocation' && <InvocationRendered row={row} copy={copy} />}
                    {node.data.kind === 'request' && <PayloadRendered payload={row?.requestPayload} label='Request' tone='warning' />}
                    {node.data.kind === 'response' && <PayloadRendered payload={row?.responsePayload} label='Response' tone='success' />}
                    {node.data.kind === 'policy' && <PolicyRendered row={row} />}
                    {node.data.kind === 'error' && <ErrorRendered row={row} />}
                </Box>
            )}

            {dataView === 'raw' && (
                <Box sx={{ mt: 2, border: 1, borderColor: 'divider' }} onClick={(e) => e.stopPropagation()}>
                    <ReactJson
                        theme={customization.isDarkMode ? 'ocean' : 'rjv-default'}
                        style={{ padding: 10, borderRadius: 10 }}
                        src={rawSrc || {}}
                        name={null}
                        quotesOnKeys={false}
                        displayDataTypes={false}
                        collapsed={1}
                    />
                </Box>
            )}
        </Box>
    )
}

AuditNodeDetails.propTypes = {
    node: PropTypes.shape({
        id: PropTypes.string,
        label: PropTypes.string,
        status: PropTypes.string,
        data: PropTypes.shape({
            kind: PropTypes.oneOf(['invocation', 'policy', 'error']),
            raw: PropTypes.any
        })
    }),
    row: PropTypes.object
}

const InvocationRendered = ({ row, copy }) => {
    if (!row) return null
    const boxSx = { p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }
    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant='h5' gutterBottom>
                    Agent
                </Typography>
                <Box sx={boxSx}>
                    <IdentityRow
                        name={row.agentSlug}
                        id={row.agentId}
                        goToHref={row.agentId ? `/agents/${row.agentId}` : null}
                        goToLabel='Go to Agent'
                        idLabel='Agent ID'
                        copy={copy}
                    />
                </Box>
            </Box>

            <Box>
                <Typography variant='h5' gutterBottom>
                    MCP Server & Tool
                </Typography>
                <Box sx={boxSx}>
                    <Stack spacing={2}>
                        <IdentityRow
                            name={row.mcpServerSlug}
                            id={row.mcpServerId}
                            goToHref={row.mcpServerId ? `/mcp-servers/${row.mcpServerId}` : null}
                            goToLabel='Go to MCP Server'
                            idLabel='MCP Server ID'
                            copy={copy}
                        />
                        <Chip
                            sx={{ pl: 1, fontFamily: 'monospace', alignSelf: 'flex-start' }}
                            variant='outlined'
                            label={row.namespacedTool || '—'}
                        />
                    </Stack>
                </Box>
            </Box>

            {row.callId && (
                <Box>
                    <Typography variant='h5' gutterBottom>
                        Call ID
                    </Typography>
                    <Box sx={boxSx}>
                        <Chip sx={{ pl: 1, fontFamily: 'monospace' }} variant='outlined' label={row.callId} />
                    </Box>
                </Box>
            )}

            <Box>
                <Typography variant='h5' gutterBottom>
                    Policy Result
                </Typography>
                <Box sx={boxSx}>
                    <PolicyOutcomeDetail value={row.policyOutcome ?? 'PASSED'} />
                </Box>
            </Box>
        </Stack>
    )
}

InvocationRendered.propTypes = {
    row: PropTypes.object,
    copy: PropTypes.func
}

/**
 * Slug as primary heading, raw UUID with a copy affordance below it, and
 * a "Go to" button on the right. Used unwrapped so callers control the
 * outer container (the audit-detail invocation view wraps several of these
 * in bordered boxes under their own h5 labels).
 */
const IdentityRow = ({ name, id, goToHref, goToLabel, idLabel, copy }) => (
    <Stack direction='row' alignItems='center' spacing={2}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant='subtitle1' sx={{ fontWeight: 500 }}>
                {name || '—'}
            </Typography>
            {id && (
                <Stack direction='row' alignItems='center' spacing={0.5} sx={{ mt: 0.5 }}>
                    <Box
                        component='span'
                        sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {id}
                    </Box>
                    <IconButton title={`Copy ${idLabel}`} color='success' onClick={() => copy(id, idLabel)}>
                        <IconCopy />
                    </IconButton>
                </Stack>
            )}
        </Box>
        {goToHref && (
            <Button
                size='small'
                variant='outlined'
                startIcon={<IconExternalLink size={14} />}
                onClick={() => window.open(goToHref, '_blank')}
            >
                {goToLabel}
            </Button>
        )}
    </Stack>
)

IdentityRow.propTypes = {
    name: PropTypes.string,
    id: PropTypes.string,
    goToHref: PropTypes.string,
    goToLabel: PropTypes.string,
    idLabel: PropTypes.string,
    copy: PropTypes.func
}

/**
 * Renders a captured MCP payload (request `arguments` or response `result`)
 * inside a tinted bordered box, matching the executions-drawer pattern for
 * tool calls (warning-tinted for outgoing request) and tool results
 * (success-tinted for incoming response). Inner JSON sits on the paper
 * background so the structured content reads cleanly against the tint.
 * Surfaces the truncation marker as a warning chip when the payload was
 * size-capped at write time.
 */
const PayloadRendered = ({ payload, label, tone }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const isDark = customization.isDarkMode
    const headerIcon = tone === 'warning' ? IconSend : IconInbox
    const HeaderIcon = headerIcon
    const tintColor = tone === 'success' ? theme.palette.success.main : theme.palette.warning.main
    const tintBg = isDark ? `${theme.palette[tone].dark}22` : `${theme.palette[tone].light}44`

    if (payload == null) {
        return (
            <Typography color='text.secondary'>
                No {label.toLowerCase()} captured. Enable payload capture in server config to populate this view.
            </Typography>
        )
    }
    const isTruncated = typeof payload === 'object' && payload !== null && payload._truncated === true
    return (
        <Box sx={{ border: 1, borderColor: tintColor, borderRadius: 1, backgroundColor: tintBg, overflow: 'hidden' }}>
            <Stack direction='row' alignItems='center' spacing={1} sx={{ p: 1.5 }}>
                <HeaderIcon size={18} color={tintColor} />
                <Typography sx={{ flexGrow: 1, fontWeight: 500 }}>{label} body</Typography>
                {isTruncated && (
                    <Chip
                        icon={<IconAlertTriangle size={14} />}
                        color='warning'
                        variant='outlined'
                        size='small'
                        sx={{ pl: 1 }}
                        label={`Truncated · ${payload._originalBytes} bytes captured, ${payload._maxBytes} max`}
                    />
                )}
            </Stack>
            <Box sx={{ px: 1.5, pb: 1.5 }}>
                <JSONViewer data={payload} maxHeight='600px' />
            </Box>
        </Box>
    )
}

PayloadRendered.propTypes = {
    payload: PropTypes.any,
    label: PropTypes.string,
    tone: PropTypes.oneOf(['warning', 'success'])
}

const PolicyRendered = ({ row }) => {
    if (!row) return null
    const outcome = row.policyOutcome ?? 'PASSED'
    const boxSx = { p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }
    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant='h5' gutterBottom>
                    Policy Result
                </Typography>
                <Box sx={boxSx}>
                    <PolicyOutcomeDetail value={outcome} />
                    {outcome === 'RETRIED' && (
                        <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                            The total time shown in the header includes time waited between retry attempts, not just the successful call.
                        </Typography>
                    )}
                    {(outcome === 'RATE_LIMITED' || outcome === 'CIRCUIT_OPEN') && (
                        <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                            The call was rejected by the policy before reaching the MCP server. The time shown in the header reflects
                            rejection time.
                        </Typography>
                    )}
                </Box>
            </Box>

            <Box>
                <Typography variant='h5' gutterBottom>
                    Configuration
                </Typography>
                <Box sx={boxSx}>
                    <Typography variant='body2' sx={{ color: 'text.secondary', mb: row.mcpServerId ? 1.5 : 0 }}>
                        Policy settings (retry attempts, rate limit, circuit breaker thresholds, timeout) are configured individually for
                        each MCP server.
                    </Typography>
                    {row.mcpServerId && (
                        <Button
                            size='small'
                            variant='outlined'
                            startIcon={<IconExternalLink size={14} />}
                            onClick={() => window.open(`/mcp-servers/${row.mcpServerId}`, '_blank')}
                        >
                            View policy for this MCP Server
                        </Button>
                    )}
                </Box>
            </Box>
        </Stack>
    )
}

PolicyRendered.propTypes = { row: PropTypes.object }

const ErrorRendered = ({ row }) => (
    <Box>
        <Typography variant='overline'>Error</Typography>
        <Box
            sx={{
                mt: 0.5,
                p: 1.5,
                borderRadius: 1,
                backgroundColor: 'error.lighter',
                color: 'error.dark',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
            }}
        >
            {row?.errorMessage || '—'}
        </Box>
    </Box>
)

ErrorRendered.propTypes = { row: PropTypes.object }

export default AuditNodeDetails
