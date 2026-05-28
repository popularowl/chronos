import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'

import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Link,
    Skeleton,
    Stack,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'

import mcpServersApi from '@/api/mcp-servers'

import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

/**
 * Renders the bundled MCP-server preset catalogue as a card grid.
 * Picking a preset closes this dialog and opens `MCPServerDialog` in
 * ADD mode with the preset's data so the registration form is
 * pre-filled. Presets are fetched once per open and never mutate, so
 * we keep them in local state — no Redux integration needed.
 */
const PresetPickerDialog = ({ show, onCancel, onPick, onCustom }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()
    const theme = useTheme()

    const [presets, setPresets] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!show) return
        let cancelled = false
        setLoading(true)
        setError(null)
        mcpServersApi
            .listMCPServerPresets()
            .then((res) => {
                if (cancelled) return
                const list = Array.isArray(res.data?.presets) ? res.data.presets : []
                setPresets(list)
            })
            .catch((err) => {
                if (cancelled) return
                setError(err?.response?.data?.message || err?.message || 'Failed to load presets')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [show])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const renderIcon = (preset) => {
        if (preset.iconSvg) {
            // Inline-rendered SVG, trusted source (bundled with the platform).
            // Force-size any nested `<svg>` to fill the 40px box — third-party
            // SVGs (PostgreSQL elephant) ship with hard-coded width/height
            // attributes that would otherwise blow past the slot. `color` on
            // this wrapper drives any `stroke="currentColor"` / `fill="currentColor"`
            // inside the SVG, so our outline icons follow the theme in
            // light + dark mode without per-icon recolouring.
            return (
                <Box
                    sx={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        color: theme.palette.text.primary,
                        '& svg': { width: '100%', height: '100%', display: 'block' }
                    }}
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: preset.iconSvg }}
                />
            )
        }
        return <Box sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: theme.palette.grey[200], borderRadius: 1 }} />
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='mcp-preset-picker-title'>
            <DialogTitle sx={{ fontSize: '1rem', px: 3.5, pt: 3, pb: 1.5 }} id='mcp-preset-picker-title'>
                Register MCP server. From the preset or custom
            </DialogTitle>
            <DialogContent sx={{ px: 3.5, pb: 3, '&.MuiDialogContent-root': { pt: 1 } }}>
                <Typography variant='body2' sx={{ mb: 2, color: theme.palette.text.secondary }}>
                    <Link
                        component='button'
                        type='button'
                        variant='body2'
                        onClick={onCustom}
                        sx={{ fontWeight: 500, verticalAlign: 'baseline' }}
                    >
                        Register a new MCP Server
                    </Link>
                    . Or choose one of the example MCP servers from the list below. Pick a card to pre-fill the MCP server registration
                    form.
                </Typography>
                {loading && (
                    <Stack spacing={1.5}>
                        <Skeleton variant='rounded' height={84} />
                        <Skeleton variant='rounded' height={84} />
                        <Skeleton variant='rounded' height={84} />
                    </Stack>
                )}
                {!loading && error && (
                    <Typography variant='body2' color='error'>
                        {error}
                    </Typography>
                )}
                {!loading && !error && presets.length === 0 && (
                    <Typography variant='body2'>No presets are bundled with this build.</Typography>
                )}
                {!loading && !error && presets.length > 0 && (
                    <Stack
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                            gap: 2
                        }}
                    >
                        {presets.map((preset) => {
                            // `available === false` (set by the server's PATH probe) means
                            // the preset's spawn command isn't installed on the host.
                            // Render the card visibly disabled with the reason inline so
                            // the Chronos user understands why and can install the
                            // missing binary rather than hitting `ENOENT` at spawn time.
                            const unavailable = preset.available === false
                            const card = (
                                <Box
                                    key={preset.id}
                                    onClick={unavailable ? undefined : () => onPick(preset)}
                                    sx={{
                                        cursor: unavailable ? 'not-allowed' : 'pointer',
                                        // Card itself stays at full opacity so chip + reason text
                                        // render with their declared contrast. The disabled
                                        // affordance comes from the muted icon + chip, not from
                                        // a global opacity wash on the whole card.
                                        border: 1,
                                        borderColor: theme.palette.divider,
                                        borderRadius: 2,
                                        p: 2.5,
                                        display: 'flex',
                                        gap: 1.5,
                                        alignItems: 'flex-start',
                                        ...(unavailable
                                            ? { '& svg': { opacity: 0.5 } }
                                            : {
                                                  '&:hover': {
                                                      borderColor: theme.palette.primary.main,
                                                      bgcolor: theme.palette.action.hover
                                                  }
                                              })
                                    }}
                                >
                                    {renderIcon(preset)}
                                    <Box sx={{ flex: 1 }}>
                                        <Stack direction='row' alignItems='center' spacing={1}>
                                            <Typography variant='subtitle2'>{preset.displayName}</Typography>
                                            {unavailable && (
                                                <Chip
                                                    label='unavailable'
                                                    size='small'
                                                    sx={{
                                                        // Theme's warning palette is a pale yellow
                                                        // that's invisible on white as an outlined
                                                        // chip, so paint a filled chip with the
                                                        // darker warning shade + white text — same
                                                        // pattern used for the HEALTHY status chip.
                                                        backgroundColor: theme.palette.warning.dark,
                                                        color: theme.palette.common.white,
                                                        fontWeight: 500
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                        <Typography variant='caption' sx={{ color: theme.palette.text.secondary, display: 'block' }}>
                                            {preset.description}
                                        </Typography>
                                        {preset.requiredCredentialSchema && (
                                            <Typography
                                                variant='caption'
                                                sx={{ color: theme.palette.text.secondary, display: 'block', mt: 0.5 }}
                                            >
                                                Requires credential: <code>{preset.requiredCredentialSchema}</code>
                                            </Typography>
                                        )}
                                        {unavailable && preset.unavailableReason && (
                                            <Typography
                                                variant='caption'
                                                sx={{ color: theme.palette.text.primary, display: 'block', mt: 0.5, fontWeight: 500 }}
                                            >
                                                {preset.unavailableReason}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            )
                            return unavailable && preset.unavailableReason ? (
                                <Tooltip key={preset.id} title={preset.unavailableReason} placement='top'>
                                    {card}
                                </Tooltip>
                            ) : (
                                card
                            )
                        })}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3.5, py: 2, justifyContent: 'flex-end' }}>
                <Button onClick={onCancel}>Cancel</Button>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

PresetPickerDialog.propTypes = {
    show: PropTypes.bool,
    onCancel: PropTypes.func,
    onPick: PropTypes.func,
    onCustom: PropTypes.func
}

export default PresetPickerDialog
