import PropTypes from 'prop-types'
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography, IconButton } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { IconAlertTriangle, IconClock, IconCopy, IconExternalLink, IconShieldCheck, IconTool, IconX } from '@tabler/icons-react'
import ReactJson from 'flowise-react-json-view'

import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import { PolicyOutcomeDetail } from './PolicyOutcome'

const KIND_ICON = {
    invocation: IconTool,
    policy: IconShieldCheck,
    error: IconAlertTriangle
}

const KIND_COLOR = {
    invocation: '#7986CB',
    policy: '#4DB6AC',
    error: '#E57373'
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
    const kindColor = KIND_COLOR[node.data.kind] || theme.palette.primary.main
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
    return (
        <Stack spacing={3}>
            <Box>
                <Typography variant='overline'>Agent</Typography>
                <Box sx={{ mt: 0.5 }}>
                    {row.agentId ? (
                        <Chip
                            sx={{ pl: 1 }}
                            icon={<IconExternalLink size={15} />}
                            variant='outlined'
                            label={row.agentSlug || 'Go to Agent'}
                            className='button'
                            onClick={() => window.open(`/agents/${row.agentId}`, '_blank')}
                        />
                    ) : (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {row.agentSlug || '—'}
                        </Typography>
                    )}
                </Box>
                <IdRow value={row.agentId} label='Agent ID' onCopy={() => copy(row.agentId, 'Agent ID')} />
            </Box>

            <Box>
                <Typography variant='overline'>MCP Server</Typography>
                <Box sx={{ mt: 0.5 }}>
                    {row.mcpServerId ? (
                        <Chip
                            sx={{ pl: 1 }}
                            icon={<IconExternalLink size={15} />}
                            variant='outlined'
                            label={row.mcpServerSlug || 'Go to MCP Server'}
                            className='button'
                            onClick={() => window.open(`/mcp-servers/${row.mcpServerId}`, '_blank')}
                        />
                    ) : (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {row.mcpServerSlug || '—'}
                        </Typography>
                    )}
                </Box>
                <IdRow value={row.mcpServerId} label='MCP Server ID' onCopy={() => copy(row.mcpServerId, 'MCP Server ID')} />
            </Box>

            <Box>
                <Typography variant='overline'>Tool</Typography>
                <Box sx={{ mt: 0.5 }}>
                    <Chip sx={{ pl: 1, fontFamily: 'monospace' }} variant='outlined' label={row.namespacedTool || '—'} />
                </Box>
                <Typography variant='body2' sx={{ mt: 0.5, color: 'text.secondary' }}>
                    Bare:{' '}
                    <Box component='span' sx={{ fontFamily: 'monospace' }}>
                        {row.toolName || '—'}
                    </Box>
                </Typography>
            </Box>

            <Box>
                <Typography variant='overline'>Call ID</Typography>
                <Box sx={{ mt: 0.5 }}>
                    {row.callId ? (
                        <Chip sx={{ pl: 1, fontFamily: 'monospace' }} variant='outlined' label={row.callId} />
                    ) : (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            —
                        </Typography>
                    )}
                </Box>
            </Box>
        </Stack>
    )
}

InvocationRendered.propTypes = {
    row: PropTypes.object,
    copy: PropTypes.func
}

const PolicyRendered = ({ row }) => (
    <Box>
        <Typography variant='overline'>Policy outcome</Typography>
        <Box sx={{ mt: 0.5 }}>
            <PolicyOutcomeDetail value={row?.policyOutcome} />
        </Box>
    </Box>
)

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

const IdRow = ({ value, label, onCopy }) => {
    if (!value) return null
    return (
        <Stack direction='row' spacing={1} alignItems='center' sx={{ mt: 0.5, color: 'text.secondary' }}>
            <Box
                component='span'
                sx={{
                    flexGrow: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}
            >
                {value}
            </Box>
            <Tooltip title={`Copy ${label}`}>
                <IconButton size='small' onClick={onCopy}>
                    <IconCopy size={14} />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}

IdRow.propTypes = {
    value: PropTypes.string,
    label: PropTypes.string,
    onCopy: PropTypes.func
}

export default AuditNodeDetails
