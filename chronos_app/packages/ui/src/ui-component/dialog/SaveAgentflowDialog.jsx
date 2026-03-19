import { createPortal } from 'react-dom'
import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import { Button, Dialog, DialogActions, DialogContent, OutlinedInput, DialogTitle } from '@mui/material'
import { StyledButton } from '@/ui-component/button/StyledButton'

const SaveAgentflowDialog = ({ show, dialogProps, onCancel, onConfirm }) => {
    const portalElement = document.getElementById('portal')

    const [agentflowName, setAgentflowName] = useState('')
    const [isReadyToSave, setIsReadyToSave] = useState(false)

    useEffect(() => {
        if (agentflowName) setIsReadyToSave(true)
        else setIsReadyToSave(false)
    }, [agentflowName])

    const component = show ? (
        <Dialog
            open={show}
            fullWidth
            maxWidth='xs'
            onClose={onCancel}
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
            disableRestoreFocus // needed due to StrictMode
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='alert-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <OutlinedInput
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    sx={{ mt: 1 }}
                    id='agentflow-name'
                    type='text'
                    fullWidth
                    placeholder='My New Agentflow'
                    value={agentflowName}
                    onChange={(e) => setAgentflowName(e.target.value)}
                    onKeyDown={(e) => {
                        if (isReadyToSave && e.key === 'Enter') onConfirm(e.target.value)
                    }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>{dialogProps.cancelButtonName}</Button>
                <StyledButton disabled={!isReadyToSave} variant='contained' onClick={() => onConfirm(agentflowName)}>
                    {dialogProps.confirmButtonName}
                </StyledButton>
            </DialogActions>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

SaveAgentflowDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

export default SaveAgentflowDialog
