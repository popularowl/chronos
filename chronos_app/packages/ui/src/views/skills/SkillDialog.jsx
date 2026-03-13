import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'

import {
    Box,
    Button,
    Typography,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    OutlinedInput,
    MenuItem,
    Select
} from '@mui/material'
import { StyledButton } from '@/ui-component/button/StyledButton'

// Icons
import { IconX } from '@tabler/icons-react'

// API
import skillsApi from '@/api/skills'

// Hooks

// utils
import useNotifier from '@/utils/useNotifier'
import { generateRandomGradient } from '@/utils/genericHelper'
import { HIDE_CANVAS_DIALOG, SHOW_CANVAS_DIALOG } from '@/store/actions'

const CATEGORIES = ['general', 'development', 'analysis', 'writing', 'database']

const SkillDialog = ({ show, dialogProps, onCancel, onConfirm, setError }) => {
    const portalElement = document.getElementById('portal')
    const dispatch = useDispatch()

    useNotifier()

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [skillId, setSkillId] = useState('')
    const [skillName, setSkillName] = useState('')
    const [skillDesc, setSkillDesc] = useState('')
    const [skillCategory, setSkillCategory] = useState('general')
    const [skillColor, setSkillColor] = useState(generateRandomGradient())
    const [skillContent, setSkillContent] = useState('')

    useEffect(() => {
        if (dialogProps.type === 'EDIT' && dialogProps.data) {
            setSkillId(dialogProps.data.id)
            setSkillName(dialogProps.data.name)
            setSkillDesc(dialogProps.data.description)
            setSkillCategory(dialogProps.data.category || 'general')
            setSkillColor(dialogProps.data.color || generateRandomGradient())
            setSkillContent(dialogProps.data.content || '')
        } else if (dialogProps.type === 'ADD') {
            setSkillId('')
            setSkillName('')
            setSkillDesc('')
            setSkillCategory('general')
            setSkillColor(generateRandomGradient())
            setSkillContent('')
        } else if (dialogProps.type === 'IMPORT' && dialogProps.data) {
            setSkillId('')
            setSkillName(dialogProps.data.name || '')
            setSkillDesc(dialogProps.data.description || '')
            setSkillCategory(dialogProps.data.category || 'general')
            setSkillColor(dialogProps.data.color || generateRandomGradient())
            setSkillContent(dialogProps.data.content || '')
        }
    }, [dialogProps])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const saveSkill = async () => {
        try {
            const body = {
                name: skillName,
                description: skillDesc,
                category: skillCategory,
                color: skillColor,
                content: skillContent
            }

            let response
            if (dialogProps.type === 'ADD' || dialogProps.type === 'IMPORT') {
                response = await skillsApi.createSkill(body)
            } else if (dialogProps.type === 'EDIT') {
                response = await skillsApi.updateSkill(skillId, body)
            }

            if (response.data) {
                enqueueSnackbar({
                    message: dialogProps.type === 'EDIT' ? 'Skill updated' : 'Skill created',
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
                onConfirm()
            }
        } catch (error) {
            if (setError) setError(error)
            enqueueSnackbar({
                message: `Failed to ${dialogProps.type === 'EDIT' ? 'update' : 'create'} skill`,
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const deleteSkill = async () => {
        try {
            const response = await skillsApi.deleteSkill(skillId)
            if (response.data) {
                enqueueSnackbar({
                    message: 'Skill deleted',
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
                onConfirm()
            }
        } catch (error) {
            if (setError) setError(error)
            enqueueSnackbar({
                message: 'Failed to delete skill',
                options: {
                    key: new Date().getTime() + Math.random(),
                    variant: 'error',
                    action: (key) => (
                        <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                            <IconX />
                        </Button>
                    )
                }
            })
        }
    }

    const component = show ? (
        <Dialog fullWidth maxWidth='md' open={show} onClose={onCancel} aria-labelledby='skill-dialog-title'>
            <DialogTitle sx={{ fontSize: '1rem' }} id='skill-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Box>
                        <Typography variant='overline'>Name</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            value={skillName}
                            onChange={(e) => setSkillName(e.target.value)}
                            placeholder='e.g. Code Reviewer'
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Description</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            multiline
                            rows={2}
                            value={skillDesc}
                            onChange={(e) => setSkillDesc(e.target.value)}
                            placeholder='What does this skill do?'
                        />
                    </Box>
                    <Box>
                        <Typography variant='overline'>Category</Typography>
                        <Select fullWidth size='small' value={skillCategory} onChange={(e) => setSkillCategory(e.target.value)}>
                            {CATEGORIES.map((cat) => (
                                <MenuItem key={cat} value={cat}>
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                    <Box>
                        <Typography variant='overline'>Content (Markdown)</Typography>
                        <OutlinedInput
                            fullWidth
                            size='small'
                            multiline
                            rows={12}
                            value={skillContent}
                            onChange={(e) => setSkillContent(e.target.value)}
                            placeholder='## Skill Name&#10;&#10;Instructions for the agent...'
                            sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                        />
                    </Box>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                {dialogProps.type === 'EDIT' && (
                    <StyledButton color='error' variant='contained' onClick={deleteSkill}>
                        Delete
                    </StyledButton>
                )}
                <Box sx={{ flexGrow: 1 }} />
                <Button onClick={onCancel}>{dialogProps.cancelButtonName || 'Cancel'}</Button>
                <StyledButton disabled={!skillName || !skillContent} variant='contained' onClick={saveSkill}>
                    {dialogProps.confirmButtonName || 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

SkillDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func,
    setError: PropTypes.func
}

export default SkillDialog
