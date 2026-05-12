import PropTypes from 'prop-types'
import moment from 'moment'
import { useSelector } from 'react-redux'
import ReactJson from 'flowise-react-json-view'

import { Box, Chip, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { IconX } from '@tabler/icons-react'

const DRAWER_WIDTH = 560

/**
 * Default policy values that the gateway falls back to when a section is
 * absent from `MCPServer.policies`. Mirrors the resolver in
 * `services/mcp-gateway/policy.ts` so the drawer renders the *resolved*
 * policy state the gateway will apply, not just whichever sub-keys the
 * Chronos user explicitly persisted. This matches the user's mental model
 * — they see one full policy object per edit, not the partial bag.
 */
const POLICY_DEFAULTS = {
    retry: { maxAttempts: 3, baseDelayMs: 500, jitter: true },
    rateLimit: { rps: 0, burst: 0 },
    circuitBreaker: { failureThreshold: 5, openMs: 30000 }
}

/**
 * Drawer for one `mcp_server_change_log` row narrowed to policy edits.
 * Renders the post-edit `policies` value as a collapsable JSON tree using
 * the same `ReactJson` widget the Agent Executions "Raw" view uses —
 * collapsable, copyable, and consistent with the rest of the product.
 * Defaults to fully expanded so the entire policy bag is visible without
 * an extra click; nested objects can be collapsed individually.
 *
 * Right-anchored peek width (560px) matches `AuditRowDetails` so the
 * inspection experience reads the same whether the Chronos user is looking
 * at a tool invocation or a policy edit.
 */
const MCPServerChangeLogDetails = ({ open, row, onClose }) => {
    const customization = useSelector((state) => state.customization)
    const diff = safeParse(row?.changedFields)
    const policiesAfter = pickPoliciesValue(diff, 'after')
    const policiesBefore = pickPoliciesValue(diff, 'before')
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
                            <Chip size='small' label={(row.changeKind || '').toLowerCase()} variant='outlined' />
                            <Typography variant='h4' sx={{ flexGrow: 1 }}>
                                {row.changeSummary || 'Policy edit'}
                            </Typography>
                            <Tooltip title='Close'>
                                <IconButton onClick={onClose} size='small'>
                                    <IconX size={18} />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                        <Stack direction='row' spacing={2} sx={{ mt: 1, color: 'text.secondary' }}>
                            <Typography variant='body2'>{moment(row.createdDate).format('MMM D, YYYY h:mm A')}</Typography>
                            {(row.userEmail || row.userId) && (
                                <>
                                    <Typography variant='body2'>·</Typography>
                                    <Typography variant='body2' sx={{ fontFamily: 'monospace' }}>
                                        {row.userEmail || row.userId}
                                    </Typography>
                                </>
                            )}
                        </Stack>
                    </Box>

                    <Divider />

                    <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2.5 }}>
                        <Stack spacing={3}>
                            <Box>
                                <Typography variant='overline'>Policies (after)</Typography>
                                <Box
                                    sx={{
                                        mt: 1,
                                        p: 1.25,
                                        borderRadius: 1,
                                        border: 1,
                                        borderColor: 'divider',
                                        overflowX: 'auto'
                                    }}
                                >
                                    <ReactJson
                                        theme={customization.isDarkMode ? 'ocean' : 'rjv-default'}
                                        style={{ padding: 6, borderRadius: 6, background: 'transparent' }}
                                        src={resolveFull(policiesAfter)}
                                        name={null}
                                        quotesOnKeys={false}
                                        enableClipboard={false}
                                        displayDataTypes={false}
                                        collapsed={false}
                                    />
                                </Box>
                            </Box>

                            <Box>
                                <Typography variant='overline'>Policies (before)</Typography>
                                <Box
                                    sx={{
                                        mt: 1,
                                        p: 1.25,
                                        borderRadius: 1,
                                        border: 1,
                                        borderColor: 'divider',
                                        overflowX: 'auto'
                                    }}
                                >
                                    <ReactJson
                                        theme={customization.isDarkMode ? 'ocean' : 'rjv-default'}
                                        style={{ padding: 6, borderRadius: 6, background: 'transparent' }}
                                        src={resolveFull(policiesBefore)}
                                        name={null}
                                        quotesOnKeys={false}
                                        enableClipboard={false}
                                        displayDataTypes={false}
                                        collapsed={false}
                                    />
                                </Box>
                            </Box>

                            {row.userId && (
                                <Box>
                                    <Typography variant='overline'>User ID</Typography>
                                    <Box sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.78rem', color: 'text.secondary' }}>
                                        {row.userId}
                                    </Box>
                                </Box>
                            )}
                        </Stack>
                    </Box>
                </Stack>
            )}
        </Drawer>
    )
}

/**
 * Pulls a side of the `policies` diff out of the parsed `changedFields`
 * payload. Returns `null` when the side wasn't recorded (e.g. the row
 * doesn't actually touch policies, or stores a stringified `null`).
 */
const pickPoliciesValue = (diff, side) => {
    if (!diff || typeof diff !== 'object') return null
    const change = diff.policies
    if (!change || typeof change !== 'object') return null
    const raw = change[side]
    if (raw === null || raw === undefined) return null
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw)
        } catch {
            return raw
        }
    }
    return raw
}

/**
 * Fills missing top-level sections with platform defaults so the JSON tree
 * always shows the full policy bag the gateway will apply. The result is
 * pure data — safe to feed straight into `ReactJson`.
 */
const resolveFull = (partial) => {
    const base = { ...POLICY_DEFAULTS }
    if (partial && typeof partial === 'object' && !Array.isArray(partial)) {
        if (partial.retry && typeof partial.retry === 'object') base.retry = { ...POLICY_DEFAULTS.retry, ...partial.retry }
        if (partial.rateLimit && typeof partial.rateLimit === 'object')
            base.rateLimit = { ...POLICY_DEFAULTS.rateLimit, ...partial.rateLimit }
        if (partial.circuitBreaker && typeof partial.circuitBreaker === 'object') {
            base.circuitBreaker = { ...POLICY_DEFAULTS.circuitBreaker, ...partial.circuitBreaker }
        }
    }
    return base
}

const safeParse = (raw) => {
    if (raw && typeof raw === 'object') return raw
    if (typeof raw !== 'string') return null
    try {
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

MCPServerChangeLogDetails.propTypes = {
    open: PropTypes.bool,
    row: PropTypes.shape({
        id: PropTypes.string,
        mcpServerId: PropTypes.string,
        userId: PropTypes.string,
        userEmail: PropTypes.string,
        changeKind: PropTypes.string,
        changedFields: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
        changeSummary: PropTypes.string,
        createdDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
    }),
    onClose: PropTypes.func
}

export default MCPServerChangeLogDetails
