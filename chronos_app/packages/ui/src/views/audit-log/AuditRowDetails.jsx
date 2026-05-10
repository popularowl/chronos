import PropTypes from 'prop-types'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import moment from 'moment'

import { Box, Button, Chip, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import { IconCopy, IconExternalLink, IconX } from '@tabler/icons-react'

import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

const DRAWER_WIDTH = 560

/**
 * Sliding drawer detail view for a single `tool_invocation_audit` row.
 * Mirrors the Agent Executions drawer pattern — atomic events (one execution,
 * one audit row) get a right-anchored peek surface; aggregating entities
 * (agents, MCP servers) keep their full-page detail routes. Width is static
 * (audit content is concise — ~10 fields) rather than the resizable shape
 * the heavier Executions drawer needs.
 *
 * Agent and MCP server rows surface as outlined "Go to" chips matching the
 * Agent Executions detail pattern (window.open into a new tab so the drawer
 * stays in place for ongoing inspection).
 */
const AuditRowDetails = ({ open, row, onClose }) => {
    const dispatch = useDispatch()
    const navigate = useNavigate()

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

    const goToRelatedByCallId = () => {
        if (!row?.callId) return
        onClose?.()
        navigate(`/audit-log?callId=${encodeURIComponent(row.callId)}`)
    }

    return (
        <Drawer
            variant='temporary'
            anchor='right'
            open={open}
            onClose={onClose}
            sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, height: '100%' } }}
        >
            {row && (
                <Stack sx={{ height: '100%' }}>
                    <Box sx={{ p: 2.5, pb: 2 }}>
                        <Stack direction='row' alignItems='center' spacing={1}>
                            {row.success ? (
                                <Box component={CheckCircleIcon} sx={{ color: 'success.dark', fontSize: 28 }} />
                            ) : (
                                <Box component={ErrorIcon} sx={{ color: 'error.main', fontSize: 28 }} />
                            )}
                            <Typography variant='h4' sx={{ flexGrow: 1, fontFamily: 'monospace' }}>
                                {row.namespacedTool}
                            </Typography>
                            <Tooltip title='Close'>
                                <IconButton onClick={onClose} size='small'>
                                    <IconX size={18} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                        <Stack direction='row' spacing={2} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Typography variant='body2'>{row.success ? 'Success' : 'Failure'}</Typography>
                            <Typography variant='body2'>·</Typography>
                            <Typography variant='body2'>{row.durationMs}ms</Typography>
                            <Typography variant='body2'>·</Typography>
                            <Typography variant='body2'>{moment(row.createdDate).format('MMM D, YYYY h:mm A')}</Typography>
                        </Stack>
                    </Box>

                    <Divider />

                    <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2.5 }}>
                        <Stack spacing={3}>
                            {!row.success && row.errorMessage && (
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
                                        {row.errorMessage}
                                    </Box>
                                </Box>
                            )}

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
                                <IdRow
                                    value={row.mcpServerId}
                                    label='MCP Server ID'
                                    onCopy={() => copy(row.mcpServerId, 'MCP Server ID')}
                                />
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
                                        <Chip
                                            sx={{ pl: 1, fontFamily: 'monospace' }}
                                            icon={<IconExternalLink size={15} />}
                                            variant='outlined'
                                            label={row.callId}
                                            className='button'
                                            onClick={goToRelatedByCallId}
                                        />
                                    ) : (
                                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                            —
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
            )}
        </Drawer>
    )
}

/**
 * Single-line ID row with a copy-to-clipboard button. Used for raw UUID
 * fields that the Chronos user occasionally needs to paste into a CLI / SQL
 * console but doesn't want shouting at them in the layout.
 */
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

AuditRowDetails.propTypes = {
    open: PropTypes.bool,
    row: PropTypes.shape({
        id: PropTypes.string,
        agentId: PropTypes.string,
        agentSlug: PropTypes.string,
        mcpServerId: PropTypes.string,
        mcpServerSlug: PropTypes.string,
        toolName: PropTypes.string,
        namespacedTool: PropTypes.string,
        success: PropTypes.bool,
        durationMs: PropTypes.number,
        errorMessage: PropTypes.string,
        callId: PropTypes.string,
        userId: PropTypes.string,
        createdDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
    }),
    onClose: PropTypes.func
}

export default AuditRowDetails
