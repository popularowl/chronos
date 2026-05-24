import { forwardRef, useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import moment from 'moment'

import { Box, Button, Chip, Drawer, Tooltip, Typography } from '@mui/material'
import { alpha, styled, useTheme } from '@mui/material/styles'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DragHandleIcon from '@mui/icons-material/DragHandle'
import ErrorIcon from '@mui/icons-material/Error'
import { RichTreeView } from '@mui/x-tree-view/RichTreeView'
import { useTreeItem2 } from '@mui/x-tree-view/useTreeItem2'
import {
    TreeItem2Checkbox,
    TreeItem2Content,
    TreeItem2GroupTransition,
    TreeItem2IconContainer,
    TreeItem2Label,
    TreeItem2Root
} from '@mui/x-tree-view/TreeItem2'
import { TreeItem2Icon } from '@mui/x-tree-view/TreeItem2Icon'
import { TreeItem2Provider } from '@mui/x-tree-view/TreeItem2Provider'
import { IconAlertTriangle, IconCopy, IconExternalLink, IconInbox, IconSend, IconShieldCheck, IconTool, IconX } from '@tabler/icons-react'

import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import { AuditNodeDetails } from './AuditNodeDetails'

const MIN_DRAWER_WIDTH = 400
const DEFAULT_DRAWER_WIDTH = window.innerWidth - 400
const MAX_DRAWER_WIDTH = window.innerWidth

const KIND_ICON = {
    invocation: IconTool,
    request: IconSend,
    response: IconInbox,
    policy: IconShieldCheck,
    error: IconAlertTriangle
}

// Tree-kind accent color resolved from the MUI theme palette so the tree
// shares the same color language as the executions drawer and status icons.
// Kept inline (not extracted to a shared util) since the two audit-drawer
// files are the only consumers.
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

const getStatusIcon = (status) => {
    switch (status) {
        case 'FINISHED':
            return CheckCircleIcon
        case 'ERROR':
            return ErrorIcon
        default:
            return null
    }
}

const getStatusColor = (status) => {
    switch (status) {
        case 'FINISHED':
            return 'success.dark'
        case 'ERROR':
            return 'error.main'
        default:
            return undefined
    }
}

const StyledTreeItemRoot = styled(TreeItem2Root)(({ theme }) => ({
    color: theme.palette.grey[400]
}))

const CustomTreeItemContent = styled(TreeItem2Content)(({ theme }) => ({
    flexDirection: 'row-reverse',
    borderRadius: theme.spacing(0.7),
    marginBottom: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
    padding: theme.spacing(0.5),
    paddingRight: theme.spacing(1),
    fontWeight: 500,
    '&:hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.1),
        color: 'white',
        ...theme.applyStyles('light', { color: theme.palette.primary.main })
    },
    [`&.Mui-focused, &.Mui-selected, &.Mui-selected.Mui-focused`]: {
        backgroundColor: theme.palette.primary.dark,
        color: theme.palette.primary.contrastText,
        ...theme.applyStyles('light', { backgroundColor: theme.palette.primary.main })
    }
}))

const StyledTreeItemLabelText = styled(Typography)(({ theme }) => ({
    color: theme.palette.text.primary
}))

const CustomLabel = ({ kind, statusIcon: StatusIcon, statusColor, children, ...other }) => {
    const theme = useTheme()
    const KindIcon = KIND_ICON[kind] || IconTool
    const kindColor = getKindColor(theme, kind)
    return (
        <TreeItem2Label {...other} sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ mr: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <KindIcon size={18} color={kindColor} />
            </Box>
            <StyledTreeItemLabelText sx={{ flex: 1 }}>{children}</StyledTreeItemLabelText>
            {StatusIcon && <Box component={StatusIcon} sx={{ ml: 1, fontSize: '1.2rem', color: statusColor }} />}
        </TreeItem2Label>
    )
}

CustomLabel.propTypes = {
    kind: PropTypes.string,
    statusIcon: PropTypes.elementType,
    statusColor: PropTypes.string,
    children: PropTypes.node
}

const CustomTreeItem = forwardRef(function CustomTreeItem(props, ref) {
    const { id, itemId, label, disabled, children, ...other } = props
    const theme = useTheme()
    const {
        getRootProps,
        getContentProps,
        getIconContainerProps,
        getCheckboxProps,
        getLabelProps,
        getGroupTransitionProps,
        status,
        publicAPI
    } = useTreeItem2({ id, itemId, children, label, disabled, rootRef: ref })

    const item = publicAPI.getItem(itemId)
    const statusIcon = getStatusIcon(item?.status)
    const statusColor = getStatusColor(item?.status)
    const connectorColor = getKindColor(theme, item?.data?.kind)

    return (
        <TreeItem2Provider itemId={itemId}>
            <StyledTreeItemRoot {...getRootProps(other)}>
                <CustomTreeItemContent {...getContentProps()}>
                    <TreeItem2IconContainer {...getIconContainerProps()}>
                        <TreeItem2Icon status={status} />
                    </TreeItem2IconContainer>
                    <TreeItem2Checkbox {...getCheckboxProps()} />
                    <CustomLabel
                        {...getLabelProps({
                            kind: item?.data?.kind,
                            statusIcon,
                            statusColor
                        })}
                    />
                </CustomTreeItemContent>
                {children && (
                    <TreeItem2GroupTransition
                        {...getGroupTransitionProps()}
                        style={{
                            borderLeft: `1px dashed ${connectorColor}`,
                            marginLeft: '13px',
                            paddingLeft: '8px'
                        }}
                    />
                )}
            </StyledTreeItemRoot>
        </TreeItem2Provider>
    )
})

CustomTreeItem.propTypes = {
    id: PropTypes.string,
    itemId: PropTypes.string,
    label: PropTypes.string,
    disabled: PropTypes.bool,
    children: PropTypes.node
}

const buildAuditTree = (row) => {
    if (!row) return []
    const invocationStatus = row.success ? 'FINISHED' : 'ERROR'
    const children = []
    if (row.requestPayload != null) {
        children.push({
            id: 'request',
            label: 'Request',
            status: 'FINISHED',
            data: { kind: 'request', raw: row.requestPayload },
            children: []
        })
    }
    if (row.responsePayload != null) {
        children.push({
            id: 'response',
            label: 'Response',
            status: row.success ? 'FINISHED' : 'ERROR',
            data: { kind: 'response', raw: row.responsePayload },
            children: []
        })
    }
    children.push({
        id: 'policy',
        label: 'Policy',
        status: undefined,
        data: { kind: 'policy', raw: { policyOutcome: row.policyOutcome ?? null } },
        children: []
    })
    if (!row.success && row.errorMessage) {
        children.push({
            id: 'error',
            label: 'Error',
            status: 'ERROR',
            data: { kind: 'error', raw: { errorMessage: row.errorMessage } },
            children: []
        })
    }
    return [
        {
            id: 'invocation',
            label: row.namespacedTool || 'Tool invocation',
            status: invocationStatus,
            data: { kind: 'invocation', raw: row },
            children
        }
    ]
}

const collectAllIds = (nodes) => {
    const ids = []
    const walk = (list) => {
        list.forEach((node) => {
            ids.push(node.id)
            if (node.children?.length) walk(node.children)
        })
    }
    walk(nodes)
    return ids
}

const findNode = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) return node
        if (node.children) {
            const found = findNode(node.children, id)
            if (found) return found
        }
    }
    return null
}

/**
 * Sliding drawer detail view for a single `tool_invocation_audit` row.
 * Mirrors the Agent Executions drawer for visual + interaction parity: resizable
 * width, two-pane tree + detail body, header chip toolbar with timestamp row.
 * Audit rows are atomic events with no nested execution, so the tree is
 * synthesised from facets of the row (invocation / policy / [error]).
 */
const AuditRowDetails = ({ open, row, onClose }) => {
    const dispatch = useDispatch()
    const customization = useSelector((state) => state.customization)
    const [drawerWidth, setDrawerWidth] = useState(Math.min(DEFAULT_DRAWER_WIDTH, MAX_DRAWER_WIDTH))
    const [tree, setTree] = useState([])
    const [expandedItems, setExpandedItems] = useState([])
    const [selectedItem, setSelectedItem] = useState(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const newTree = buildAuditTree(row)
        setTree(newTree)
        setExpandedItems(collectAllIds(newTree))
        setSelectedItem(newTree[0] || null)
    }, [row])

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

    const copyAuditId = () => {
        if (!row?.id) return
        navigator.clipboard.writeText(row.id)
        setCopied(true)
        showCopied('Audit ID')
        setTimeout(() => setCopied(false), 2000)
    }

    const handleMouseMove = useCallback((e) => {
        const newWidth = document.body.offsetWidth - e.clientX
        if (newWidth >= MIN_DRAWER_WIDTH && newWidth <= MAX_DRAWER_WIDTH) {
            setDrawerWidth(newWidth)
        }
    }, [])

    const handleMouseUp = useCallback(() => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
    }, [handleMouseMove])

    const handleMouseDown = useCallback(() => {
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [handleMouseMove, handleMouseUp])

    const handleNodeSelect = (_event, itemId) => {
        const node = findNode(tree, itemId)
        if (node) setSelectedItem(node)
    }

    const resizeHandle = (
        <button
            aria-label='Resize drawer'
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '8px',
                cursor: 'ew-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'transparent'
            }}
            onMouseDown={handleMouseDown}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleMouseDown()
                }
            }}
        >
            <DragHandleIcon
                sx={{
                    transform: 'rotate(90deg)',
                    fontSize: '20px',
                    color: customization.isDarkMode ? 'white' : 'action.disabled'
                }}
            />
        </button>
    )

    return (
        <Drawer
            variant='temporary'
            anchor='right'
            open={open}
            onClose={onClose}
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                '& .MuiDrawer-paper': { width: drawerWidth, height: '100%' }
            }}
        >
            {resizeHandle}
            {row && (
                <Box sx={{ display: 'flex', height: '100%', flexDirection: 'row' }}>
                    <Box
                        sx={{
                            flex: '1 1 35%',
                            padding: 2,
                            borderRight: 1,
                            borderColor: 'divider',
                            overflow: 'auto'
                        }}
                    >
                        <Box
                            sx={{
                                pb: 1,
                                mb: 2,
                                backgroundColor: (theme) => theme.palette.background.paper,
                                borderBottom: 1,
                                borderColor: 'divider'
                            }}
                        >
                            <Box>
                                {row.agentId && (
                                    <Chip
                                        sx={{ pl: 1 }}
                                        icon={<IconExternalLink size={15} />}
                                        variant='outlined'
                                        label={row.agentSlug || 'Go to Agent'}
                                        className='button'
                                        onClick={() => window.open(`/agents/${row.agentId}`, '_blank')}
                                    />
                                )}
                                {row.mcpServerId && (
                                    <Chip
                                        sx={{ ml: 1, pl: 1 }}
                                        icon={<IconExternalLink size={15} />}
                                        variant='outlined'
                                        label={row.mcpServerSlug || 'Go to MCP Server'}
                                        className='button'
                                        onClick={() => window.open(`/mcp-servers/${row.mcpServerId}`, '_blank')}
                                    />
                                )}
                                {row.id && (
                                    <Tooltip title={`Audit ID: ${row.id}`} placement='top'>
                                        <Chip
                                            sx={{ ml: 1, pl: 1 }}
                                            icon={<IconCopy size={15} />}
                                            variant='outlined'
                                            label={copied ? 'Copied!' : 'Copy ID'}
                                            className='button'
                                            onClick={copyAuditId}
                                        />
                                    </Tooltip>
                                )}

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                    <Typography sx={{ flex: 1 }} color='text.primary'>
                                        {row.createdDate ? moment(row.createdDate).format('MMM D, YYYY h:mm A') : 'N/A'}
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>

                        <RichTreeView
                            expandedItems={expandedItems}
                            onExpandedItemsChange={(_event, ids) => setExpandedItems(ids)}
                            selectedItems={selectedItem ? [selectedItem.id] : []}
                            onSelectedItemsChange={handleNodeSelect}
                            items={tree}
                            slots={{ item: CustomTreeItem }}
                        />
                    </Box>

                    <Box sx={{ flex: '1 1 65%', padding: 2, overflow: 'auto' }}>
                        <AuditNodeDetails node={selectedItem} row={row} />
                    </Box>
                </Box>
            )}
        </Drawer>
    )
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
        policyOutcome: PropTypes.oneOf([null, undefined, 'PASSED', 'RETRIED', 'RATE_LIMITED', 'CIRCUIT_OPEN']),
        requestPayload: PropTypes.any,
        responsePayload: PropTypes.any,
        createdDate: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
    }),
    onClose: PropTypes.func
}

export default AuditRowDetails
