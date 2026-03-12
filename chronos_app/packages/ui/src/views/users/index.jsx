import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { useDispatch, useSelector } from 'react-redux'
import moment from 'moment'

// material-ui
import {
    Button,
    Box,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    useTheme,
    Chip,
    Typography,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField
} from '@mui/material'

// project imports
import MainCard from '@/ui-component/cards/MainCard'
import ConfirmDialog from '@/ui-component/dialog/ConfirmDialog'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import ErrorBoundary from '@/ErrorBoundary'
import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'
import { StyledButton } from '@/ui-component/button/StyledButton'
import { Dropdown } from '@/ui-component/dropdown/Dropdown'

// API
import usersApi from '@/api/users'

// Hooks
import useConfirm from '@/hooks/useConfirm'

// utils
import useNotifier from '@/utils/useNotifier'

// Icons
import { IconTrash, IconEdit, IconX, IconUser, IconShieldCheck, IconUserPlus } from '@tabler/icons-react'
import users_emptySVG from '@/assets/images/users_empty.svg'

// store
import {
    enqueueSnackbar as enqueueSnackbarAction,
    closeSnackbar as closeSnackbarAction,
    SHOW_CANVAS_DIALOG,
    HIDE_CANVAS_DIALOG
} from '@/store/actions'

/** @type {{label: string, name: string}[]} */
const roleOptions = [
    { label: 'Admin', name: 'admin' },
    { label: 'User', name: 'user' }
]

/**
 * Dialog for changing a user's role
 */
const ChangeRoleDialog = ({ show, user, onCancel, onConfirm }) => {
    const [selectedRole, setSelectedRole] = useState(user?.role || 'user')
    const [saving, setSaving] = useState(false)
    const dispatch = useDispatch()

    useEffect(() => {
        if (user) setSelectedRole(user.role || 'user')
    }, [user])

    useEffect(() => {
        if (show) dispatch({ type: SHOW_CANVAS_DIALOG })
        else dispatch({ type: HIDE_CANVAS_DIALOG })
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    const handleSave = async () => {
        setSaving(true)
        try {
            await usersApi.updateUserRole(user.id, selectedRole)
            onConfirm()
        } catch {
            onCancel()
        } finally {
            setSaving(false)
        }
    }

    if (!show || !user) return null

    return (
        <Dialog fullWidth maxWidth='xs' open={show} onClose={onCancel}>
            <DialogTitle sx={{ fontSize: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <IconEdit style={{ marginRight: '10px' }} />
                    Change Role
                </div>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ pt: 1 }}>
                    <Typography sx={{ mb: 1 }}>
                        User: <strong>{user.name || user.email}</strong>
                    </Typography>
                    <Typography sx={{ mb: 1 }}>Role</Typography>
                    <Dropdown
                        name='role'
                        options={roleOptions}
                        onSelect={(newValue) => setSelectedRole(newValue)}
                        value={selectedRole}
                        disableClearable
                    />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onCancel}>Cancel</Button>
                <StyledButton variant='contained' onClick={handleSave} disabled={saving || selectedRole === user.role}>
                    {saving ? <CircularProgress size={20} /> : 'Save'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    )
}

ChangeRoleDialog.propTypes = {
    show: PropTypes.bool,
    user: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        email: PropTypes.string,
        role: PropTypes.string
    }),
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

/**
 * Dialog for creating a new user (admin only)
 */
const AddUserDialog = ({ show, onCancel, onConfirm }) => {
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [password, setPassword] = useState('')
    const [selectedRole, setSelectedRole] = useState('user')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const dispatch = useDispatch()

    useEffect(() => {
        if (show) {
            dispatch({ type: SHOW_CANVAS_DIALOG })
            setEmail('')
            setName('')
            setPassword('')
            setSelectedRole('user')
            setError('')
        } else {
            dispatch({ type: HIDE_CANVAS_DIALOG })
        }
        return () => dispatch({ type: HIDE_CANVAS_DIALOG })
    }, [show, dispatch])

    /** @returns {void} */
    const handleSave = async () => {
        setError('')
        if (!email || !password) {
            setError('Email and password are required')
            return
        }
        if (password.length < 8) {
            setError('Password must be at least 8 characters long')
            return
        }
        setSaving(true)
        try {
            await usersApi.createUser({ email, password, name, role: selectedRole })
            onConfirm()
        } catch (err) {
            setError(err?.response?.data?.error || err.message || 'Failed to create user')
        } finally {
            setSaving(false)
        }
    }

    if (!show) return null

    return (
        <Dialog fullWidth maxWidth='xs' open={show} onClose={onCancel}>
            <DialogTitle sx={{ fontSize: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <IconUserPlus style={{ marginRight: '10px' }} />
                    Add User
                </div>
            </DialogTitle>
            <DialogContent>
                <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                        label='Email'
                        type='email'
                        required
                        fullWidth
                        size='small'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <TextField label='Name' fullWidth size='small' value={name} onChange={(e) => setName(e.target.value)} />
                    <TextField
                        label='Password'
                        type='password'
                        required
                        fullWidth
                        size='small'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        helperText='Minimum 8 characters'
                    />
                    <Box>
                        <Typography sx={{ mb: 1 }}>Role</Typography>
                        <Dropdown
                            name='role'
                            options={roleOptions}
                            onSelect={(newValue) => setSelectedRole(newValue)}
                            value={selectedRole}
                            disableClearable
                        />
                    </Box>
                    {error && (
                        <Typography color='error' variant='body2'>
                            {error}
                        </Typography>
                    )}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onCancel}>Cancel</Button>
                <StyledButton variant='contained' onClick={handleSave} disabled={saving}>
                    {saving ? <CircularProgress size={20} /> : 'Create'}
                </StyledButton>
            </DialogActions>
        </Dialog>
    )
}

AddUserDialog.propTypes = {
    show: PropTypes.bool,
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func
}

// ==============================|| Users Page ||============================== //

const Users = () => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const dispatch = useDispatch()
    useNotifier()

    const currentUser = useSelector((state) => state.auth.user)

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [isLoading, setLoading] = useState(true)
    const [users, setUsers] = useState([])
    const [search, setSearch] = useState('')
    const [deletingUserId, setDeletingUserId] = useState(null)
    const [error, setError] = useState(null)
    const [roleDialogUser, setRoleDialogUser] = useState(null)
    const [showAddUserDialog, setShowAddUserDialog] = useState(false)

    const { confirm } = useConfirm()

    /** Fetch all users from the API */
    const fetchUsers = async () => {
        setLoading(true)
        try {
            const response = await usersApi.getAllUsers()
            setUsers(response.data || [])
        } catch (err) {
            setError(err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    const onSearchChange = (event) => {
        setSearch(event.target.value)
    }

    /** @param {object} user */
    const filterUsers = (user) => {
        if (!search) return true
        const q = search.toLowerCase()
        return (user.name || '').toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
    }

    /** @param {object} user */
    const deleteUser = async (user) => {
        const isConfirmed = await confirm({
            title: 'Deactivate User',
            description: `Are you sure you want to deactivate ${user.name || user.email}?`,
            confirmButtonName: 'Deactivate',
            cancelButtonName: 'Cancel'
        })

        if (isConfirmed) {
            try {
                setDeletingUserId(user.id)
                await usersApi.deactivateUser(user.id)
                enqueueSnackbar({
                    message: 'User deactivated successfully',
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
                fetchUsers()
            } catch (err) {
                enqueueSnackbar({
                    message: `Failed to deactivate user: ${err?.response?.data?.error || err.message}`,
                    options: {
                        key: new Date().getTime() + Math.random(),
                        variant: 'error',
                        persist: true,
                        action: (key) => (
                            <Button style={{ color: 'white' }} onClick={() => closeSnackbar(key)}>
                                <IconX />
                            </Button>
                        )
                    }
                })
            } finally {
                setDeletingUserId(null)
            }
        }
    }

    const onAddUserConfirm = () => {
        setShowAddUserDialog(false)
        enqueueSnackbar({
            message: 'User created successfully',
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
        fetchUsers()
    }

    const onRoleChangeConfirm = () => {
        setRoleDialogUser(null)
        enqueueSnackbar({
            message: 'User role updated successfully',
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
        fetchUsers()
    }

    /** @param {string} role */
    const getRoleChipColor = (role) => {
        if (role === 'admin') return 'primary'
        return 'default'
    }

    /** @param {string} status */
    const getStatusChipColor = (status) => {
        if (status === 'active') return 'success'
        if (status === 'unverified') return 'warning'
        return 'error'
    }

    return (
        <>
            <MainCard>
                {error ? (
                    <ErrorBoundary error={error} />
                ) : (
                    <Stack flexDirection='column' sx={{ gap: 3 }}>
                        <ViewHeader onSearchChange={onSearchChange} search={true} searchPlaceholder='Search Users' title='User Management'>
                            <StyledButton variant='contained' startIcon={<IconUserPlus />} onClick={() => setShowAddUserDialog(true)}>
                                Add User
                            </StyledButton>
                        </ViewHeader>
                        {!isLoading && users.length === 0 ? (
                            <Stack sx={{ alignItems: 'center', justifyContent: 'center' }} flexDirection='column'>
                                <Box sx={{ p: 2, height: 'auto' }}>
                                    <img
                                        style={{ objectFit: 'cover', height: '20vh', width: 'auto' }}
                                        src={users_emptySVG}
                                        alt='users_emptySVG'
                                    />
                                </Box>
                                <div>No Users Yet</div>
                            </Stack>
                        ) : (
                            <Stack flexDirection='row'>
                                <Box sx={{ py: 2, height: 'auto', width: '100%' }}>
                                    <TableContainer
                                        style={{ display: 'flex', flexDirection: 'row' }}
                                        sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }}
                                        component={Paper}
                                    >
                                        <Table sx={{ minWidth: 650 }} aria-label='users table'>
                                            <TableHead
                                                sx={{
                                                    backgroundColor: customization.isDarkMode
                                                        ? theme.palette.common.black
                                                        : theme.palette.grey[100],
                                                    height: 56
                                                }}
                                            >
                                                <TableRow>
                                                    <StyledTableCell sx={{ width: 50 }}>&nbsp;</StyledTableCell>
                                                    <StyledTableCell>Name</StyledTableCell>
                                                    <StyledTableCell>Email</StyledTableCell>
                                                    <StyledTableCell>Role</StyledTableCell>
                                                    <StyledTableCell>Status</StyledTableCell>
                                                    <StyledTableCell>Created</StyledTableCell>
                                                    <StyledTableCell sx={{ width: 100 }}> </StyledTableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {isLoading ? (
                                                    <>
                                                        {[1, 2, 3].map((i) => (
                                                            <StyledTableRow key={i}>
                                                                {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                                                                    <StyledTableCell key={j}>
                                                                        <Skeleton variant='text' />
                                                                    </StyledTableCell>
                                                                ))}
                                                            </StyledTableRow>
                                                        ))}
                                                    </>
                                                ) : (
                                                    users.filter(filterUsers).map((user) => (
                                                        <StyledTableRow
                                                            hover
                                                            key={user.id}
                                                            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                                                        >
                                                            <StyledTableCell>
                                                                {user.role === 'admin' ? (
                                                                    <IconShieldCheck size={22} />
                                                                ) : (
                                                                    <IconUser size={22} />
                                                                )}
                                                            </StyledTableCell>
                                                            <StyledTableCell>{user.name || '-'}</StyledTableCell>
                                                            <StyledTableCell>{user.email}</StyledTableCell>
                                                            <StyledTableCell>
                                                                <Chip
                                                                    size='small'
                                                                    label={user.role?.toUpperCase() || 'USER'}
                                                                    color={getRoleChipColor(user.role)}
                                                                />
                                                            </StyledTableCell>
                                                            <StyledTableCell>
                                                                <Chip
                                                                    size='small'
                                                                    label={user.status?.toUpperCase()}
                                                                    color={getStatusChipColor(user.status)}
                                                                />
                                                            </StyledTableCell>
                                                            <StyledTableCell>
                                                                {user.createdDate
                                                                    ? moment(user.createdDate).format('DD/MM/YYYY HH:mm')
                                                                    : '-'}
                                                            </StyledTableCell>
                                                            <StyledTableCell>
                                                                <Stack direction='row' spacing={1}>
                                                                    {user.id !== currentUser?.id && (
                                                                        <IconEdit
                                                                            size={20}
                                                                            style={{ cursor: 'pointer' }}
                                                                            color={theme.palette.primary.main}
                                                                            onClick={() => setRoleDialogUser(user)}
                                                                        />
                                                                    )}
                                                                    {user.id !== currentUser?.id &&
                                                                        user.status !== 'deleted' &&
                                                                        (deletingUserId === user.id ? (
                                                                            <CircularProgress size={20} color='error' />
                                                                        ) : (
                                                                            <IconTrash
                                                                                size={20}
                                                                                style={{ cursor: 'pointer' }}
                                                                                color={theme.palette.error.main}
                                                                                onClick={() => deleteUser(user)}
                                                                            />
                                                                        ))}
                                                                </Stack>
                                                            </StyledTableCell>
                                                        </StyledTableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Box>
                            </Stack>
                        )}
                    </Stack>
                )}
            </MainCard>
            <ChangeRoleDialog
                show={!!roleDialogUser}
                user={roleDialogUser}
                onCancel={() => setRoleDialogUser(null)}
                onConfirm={onRoleChangeConfirm}
            />
            <AddUserDialog show={showAddUserDialog} onCancel={() => setShowAddUserDialog(false)} onConfirm={onAddUserConfirm} />
            <ConfirmDialog />
        </>
    )
}

export default Users
