import PropTypes from 'prop-types'

import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { IconRefresh, IconHourglass, IconBolt } from '@tabler/icons-react'

/**
 * Single source of truth for how each `PolicyOutcome` value is rendered
 * across the audit-log.
 * Recent Invocations tab, the global `/audit-log` table, and the
 * `AuditRowDetails` drawer all import from here. Co-locates label, tone,
 * icon, and explanatory copy so a label change doesn't need to be made in
 * four files.
 *
 * Tones map to MUI palette tokens (`success` / `info` / `warning` /
 * `error`). The PASSED case renders as a green check icon to match the
 * `/executions` outcome pattern — no chip text, since the row's existing
 * Outcome column already conveys success/failure.
 */
export const POLICY_OUTCOME_META = {
    PASSED: {
        label: 'passed',
        tone: 'success',
        Icon: CheckCircleIcon,
        description: 'Request ran without retries or policy short-circuit.'
    },
    RETRIED: {
        label: 'retried',
        tone: 'info',
        Icon: IconRefresh,
        description: 'Succeeded after one or more retries. Total duration includes backoff waits.'
    },
    RATE_LIMITED: {
        label: 'rate-limited',
        tone: 'warning',
        Icon: IconHourglass,
        description: 'Rejected by the rate-limit gate before reaching the upstream MCP server.'
    },
    CIRCUIT_OPEN: {
        label: 'circuit-open',
        tone: 'error',
        Icon: IconBolt,
        description: 'Circuit breaker rejected the call to protect against repeated failures.'
    }
}

const toneToColor = {
    success: 'success.dark',
    info: 'info.main',
    warning: 'warning.main',
    error: 'error.main'
}

/**
 * Compact table-cell renderer for a `policyOutcome` value. PASSED (and
 * legacy NULL rows) render as a bare green check icon, matching the
 * Executions list — no chip text, no extra horizontal real estate.
 * Non-PASSED values render as a tinted Chip with an icon + label and a
 * tooltip carrying the descriptive sentence.
 */
export const PolicyOutcomeCell = ({ value }) => {
    const meta = POLICY_OUTCOME_META[value] || POLICY_OUTCOME_META.PASSED
    const Icon = meta.Icon
    if (!value || value === 'PASSED') {
        return (
            <Tooltip title={meta.description}>
                <Box component={Icon} className='labelIcon' color={toneToColor[meta.tone]} />
            </Tooltip>
        )
    }
    return (
        <Tooltip title={meta.description}>
            <Chip
                size='small'
                variant='outlined'
                icon={<Icon size={14} />}
                label={meta.label}
                sx={{
                    borderColor: toneToColor[meta.tone],
                    color: toneToColor[meta.tone],
                    '& .MuiChip-icon': { color: toneToColor[meta.tone], ml: 0.5 }
                }}
            />
        </Tooltip>
    )
}

PolicyOutcomeCell.propTypes = {
    value: PropTypes.oneOf([null, undefined, 'PASSED', 'RETRIED', 'RATE_LIMITED', 'CIRCUIT_OPEN'])
}

/**
 * Drawer-side renderer. Shows the chip variant (including PASSED) plus the
 * always-visible descriptive sentence below it. Used in the
 * `AuditRowDetails` Policy section — when the Chronos user has clicked
 * into a single row they want the full verdict regardless of axis.
 */
export const PolicyOutcomeDetail = ({ value }) => {
    const meta = POLICY_OUTCOME_META[value] || POLICY_OUTCOME_META.PASSED
    const Icon = meta.Icon
    return (
        <Stack spacing={1}>
            <Stack direction='row' spacing={1} alignItems='center'>
                <Chip
                    size='small'
                    variant='outlined'
                    icon={<Icon size={14} />}
                    label={meta.label}
                    sx={{
                        borderColor: toneToColor[meta.tone],
                        color: toneToColor[meta.tone],
                        '& .MuiChip-icon': { color: toneToColor[meta.tone], ml: 0.5 }
                    }}
                />
            </Stack>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {meta.description}
            </Typography>
        </Stack>
    )
}

PolicyOutcomeDetail.propTypes = {
    value: PropTypes.oneOf([null, undefined, 'PASSED', 'RETRIED', 'RATE_LIMITED', 'CIRCUIT_OPEN'])
}
