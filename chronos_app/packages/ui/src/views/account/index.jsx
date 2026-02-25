import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

// utils
import useNotifier from '@/utils/useNotifier'
import { validatePassword } from '@/utils/validation'

// material-ui
import { Box, Button, OutlinedInput, Skeleton, Stack, Typography } from '@mui/material'

// project imports
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import { StyledButton } from '@/ui-component/button/StyledButton'
import MainCard from '@/ui-component/cards/MainCard'
import SettingsSection from '@/ui-component/form/settings'

// Icons
import { IconX } from '@tabler/icons-react'

// API
import accountApi from '@/api/account.api'
import userApi from '@/api/user'

// Hooks
import useApi from '@/hooks/useApi'

// Store
import { store } from '@/store'
import { closeSnackbar as closeSnackbarAction, enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'
import { gridSpacing } from '@/store/constant'
import { logoutSuccess, userProfileUpdated } from '@/store/reducers/authSlice'

// ==============================|| ACCOUNT SETTINGS ||============================== //

const AccountSettings = () => {
    const dispatch = useDispatch()
    useNotifier()

    const currentUser = useSelector((state) => state.auth.user)

    const [isLoading, _setLoading] = useState(false)
    const [profileName, setProfileName] = useState(currentUser?.name || '')
    const [email, setEmail] = useState(currentUser?.email || '')
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const logoutApi = useApi(accountApi.logout)

    useEffect(() => {
        if (currentUser) {
            // Use data from Redux directly instead of making API call
            setProfileName(currentUser.name || '')
            setEmail(currentUser.email || '')
        } else {
            window.location.href = '/login'
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser])

    useEffect(() => {
        try {
            if (logoutApi.data) {
                store.dispatch(logoutSuccess())
                window.location.href = '/login'
            }
        } catch (e) {
            console.error(e)
        }
    }, [logoutApi.data])

    const saveProfileData = async () => {
        try {
            const obj = {
                id: currentUser.id,
                name: profileName,
                email: email
            }
            const saveProfileResp = await userApi.updateUser(obj)
            if (saveProfileResp.data) {
                store.dispatch(userProfileUpdated(saveProfileResp.data))
                enqueueSnackbar({
                    message: 'Profile updated',
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
            }
        } catch (error) {
            enqueueSnackbar({
                message: `Failed to update profile: ${
                    typeof error.response.data === 'object' ? error.response.data.message : error.response.data
                }`,
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
        }
    }

    const savePassword = async () => {
        try {
            const validationErrors = []
            if (!oldPassword) {
                validationErrors.push('Old Password cannot be left blank')
            }
            if (newPassword !== confirmPassword) {
                validationErrors.push('New Password and Confirm Password do not match')
            }
            const passwordErrors = validatePassword(newPassword)
            if (passwordErrors.length > 0) {
                validationErrors.push(...passwordErrors)
            }
            if (validationErrors.length > 0) {
                enqueueSnackbar({
                    message: validationErrors.join(', '),
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
                return
            }

            const obj = {
                id: currentUser.id,
                oldPassword,
                newPassword,
                confirmPassword
            }
            const saveProfileResp = await userApi.updateUser(obj)
            if (saveProfileResp.data) {
                store.dispatch(userProfileUpdated(saveProfileResp.data))
                setOldPassword('')
                setNewPassword('')
                setConfirmPassword('')
                await logoutApi.request()
                enqueueSnackbar({
                    message: 'Password updated',
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
            }
        } catch (error) {
            enqueueSnackbar({
                message: `Failed to update password: ${
                    typeof error.response.data === 'object' ? error.response.data.message : error.response.data
                }`,
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
        }
    }

    return (
        <MainCard maxWidth='md'>
            <Stack flexDirection='column' sx={{ gap: 4 }}>
                <ViewHeader title='Account Settings' />
                {isLoading ? (
                    <Box display='flex' flexDirection='column' gap={gridSpacing}>
                        <Skeleton width='25%' height={32} />
                        <Box display='flex' flexDirection='column' gap={2}>
                            <Skeleton width='20%' />
                            <Skeleton variant='rounded' height={56} />
                        </Box>
                        <Box display='flex' flexDirection='column' gap={2}>
                            <Skeleton width='20%' />
                            <Skeleton variant='rounded' height={56} />
                        </Box>
                        <Box display='flex' flexDirection='column' gap={2}>
                            <Skeleton width='20%' />
                            <Skeleton variant='rounded' height={56} />
                        </Box>
                    </Box>
                ) : (
                    <>
                        <SettingsSection
                            action={
                                <StyledButton onClick={saveProfileData} sx={{ borderRadius: 2, height: 40 }} variant='contained'>
                                    Save
                                </StyledButton>
                            }
                            title='Profile'
                        >
                            <Box
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: gridSpacing,
                                    px: 2.5,
                                    py: 2
                                }}
                            >
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant='body1'>Role</Typography>
                                    <OutlinedInput
                                        id='role'
                                        type='string'
                                        fullWidth
                                        disabled
                                        value={
                                            currentUser?.role ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1) : ''
                                        }
                                    />
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant='body1'>Name</Typography>
                                    <OutlinedInput
                                        id='name'
                                        type='string'
                                        fullWidth
                                        placeholder='Your Name'
                                        name='name'
                                        onChange={(e) => setProfileName(e.target.value)}
                                        value={profileName}
                                    />
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant='body1'>Email Address</Typography>
                                    <OutlinedInput
                                        id='email'
                                        type='string'
                                        fullWidth
                                        placeholder='Email Address'
                                        name='email'
                                        onChange={(e) => setEmail(e.target.value)}
                                        value={email}
                                    />
                                </Box>
                            </Box>
                        </SettingsSection>
                        {!currentUser.isSSO && (
                            <SettingsSection
                                action={
                                    <StyledButton
                                        disabled={!oldPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                                        onClick={savePassword}
                                        sx={{ borderRadius: 2, height: 40 }}
                                        variant='contained'
                                    >
                                        Save
                                    </StyledButton>
                                }
                                title='Security'
                            >
                                <Box
                                    sx={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: gridSpacing,
                                        px: 2.5,
                                        py: 2
                                    }}
                                >
                                    <Box
                                        sx={{
                                            gridColumn: 'span 2 / span 2',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant='body1'>Old Password</Typography>
                                        <OutlinedInput
                                            id='oldPassword'
                                            type='password'
                                            fullWidth
                                            placeholder='Old Password'
                                            name='oldPassword'
                                            onChange={(e) => setOldPassword(e.target.value)}
                                            value={oldPassword}
                                        />
                                    </Box>
                                    <Box
                                        sx={{
                                            gridColumn: 'span 2 / span 2',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant='body1'>New Password</Typography>
                                        <OutlinedInput
                                            id='newPassword'
                                            type='password'
                                            fullWidth
                                            placeholder='New Password'
                                            name='newPassword'
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            value={newPassword}
                                        />
                                        <Typography variant='caption'>
                                            <i>
                                                Password must be at least 8 characters long and contain at least one lowercase letter, one
                                                uppercase letter, one digit, and one special character.
                                            </i>
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            gridColumn: 'span 2 / span 2',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 1
                                        }}
                                    >
                                        <Typography variant='body1'>Confirm New Password</Typography>
                                        <OutlinedInput
                                            id='confirmPassword'
                                            type='password'
                                            fullWidth
                                            placeholder='Confirm New Password'
                                            name='confirmPassword'
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            value={confirmPassword}
                                        />
                                    </Box>
                                </Box>
                            </SettingsSection>
                        )}
                    </>
                )}
            </Stack>
        </MainCard>
    )
}

export default AccountSettings
