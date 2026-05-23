import { useState } from 'react'
import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import moment from 'moment'
import {
    Box,
    Chip,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import { IconUsersGroup } from '@tabler/icons-react'
import FlowListMenu from '../button/FlowListMenu'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

import MoreItemsTooltip from '../tooltip/MoreItemsTooltip'
import { StyledTableCell, StyledTableRow } from './TableStyles'

const getLocalStorageKeyName = (name) => `agentflowcanvas_${name}`

export const FlowListTable = ({
    data,
    images = {},
    icons = {},
    isLoading,
    filterFunction,
    updateFlowsApi,
    setError,
    currentPage,
    pageLimit
}) => {
    const { hasPermission } = useAuth()
    const isActionsAvailable = hasPermission(
        'agentflows:update,agentflows:delete,agentflows:config,agentflows:domains,templates:flowexport,agentflows:export'
    )
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    const localStorageKeyOrder = getLocalStorageKeyName('order')
    const localStorageKeyOrderBy = getLocalStorageKeyName('orderBy')

    const [order, setOrder] = useState(localStorage.getItem(localStorageKeyOrder) || 'desc')
    const [orderBy, setOrderBy] = useState(localStorage.getItem(localStorageKeyOrderBy) || 'updatedDate')

    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc'
        const newOrder = isAsc ? 'desc' : 'asc'
        setOrder(newOrder)
        setOrderBy(property)
        localStorage.setItem(localStorageKeyOrder, newOrder)
        localStorage.setItem(localStorageKeyOrderBy, property)
    }

    const onFlowClick = (row) => `/canvas/${row.id}`

    const sortedData = data
        ? [...data].sort((a, b) => {
              if (orderBy === 'name') {
                  return order === 'asc' ? (a.name || '').localeCompare(b.name || '') : (b.name || '').localeCompare(a.name || '')
              } else if (orderBy === 'updatedDate') {
                  return order === 'asc'
                      ? new Date(a.updatedDate) - new Date(b.updatedDate)
                      : new Date(b.updatedDate) - new Date(a.updatedDate)
              }
              return 0
          })
        : []

    return (
        <>
            <TableContainer sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }} component={Paper}>
                <Table sx={{ minWidth: 650 }} aria-label='a dense table'>
                    <TableHead
                        sx={{
                            backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
                            height: 56
                        }}
                    >
                        <TableRow>
                            <StyledTableCell component='th' scope='row' sx={{ pl: 2.5 }} style={{ width: '25%' }} key='0'>
                                <TableSortLabel active={orderBy === 'name'} direction={order} onClick={() => handleRequestSort('name')}>
                                    Name
                                </TableSortLabel>
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '30%' }} key='2'>
                                Nodes
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '10%' }} key='version'>
                                Deployed
                            </StyledTableCell>
                            <StyledTableCell style={{ width: '25%' }} key='3'>
                                <TableSortLabel
                                    active={orderBy === 'updatedDate'}
                                    direction={order}
                                    onClick={() => handleRequestSort('updatedDate')}
                                >
                                    Last Modified
                                </TableSortLabel>
                            </StyledTableCell>
                            {isActionsAvailable && (
                                <StyledTableCell style={{ width: '10%' }} key='4'>
                                    Actions
                                </StyledTableCell>
                            )}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading ? (
                            <>
                                <StyledTableRow>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    {isActionsAvailable && (
                                        <StyledTableCell>
                                            <Skeleton variant='text' />
                                        </StyledTableCell>
                                    )}
                                </StyledTableRow>
                                <StyledTableRow>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    <StyledTableCell>
                                        <Skeleton variant='text' />
                                    </StyledTableCell>
                                    {isActionsAvailable && (
                                        <StyledTableCell>
                                            <Skeleton variant='text' />
                                        </StyledTableCell>
                                    )}
                                </StyledTableRow>
                            </>
                        ) : (
                            <>
                                {sortedData.filter(filterFunction).map((row, index) => (
                                    <StyledTableRow hover key={index}>
                                        <StyledTableCell scope='row' sx={{ pl: 2.5 }} key='0'>
                                            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2.5 }}>
                                                <Box
                                                    sx={{
                                                        width: 35,
                                                        height: 35,
                                                        borderRadius: '50%',
                                                        backgroundColor: customization.isDarkMode
                                                            ? theme.palette.common.white
                                                            : theme.palette.grey[300] + 75,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    <IconUsersGroup size={20} color={theme.palette.grey[700]} />
                                                </Box>
                                                <Tooltip title={row.templateName || row.name}>
                                                    <Typography
                                                        sx={{
                                                            display: '-webkit-box',
                                                            fontSize: 14,
                                                            fontWeight: 500,
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            textOverflow: 'ellipsis',
                                                            overflow: 'hidden'
                                                        }}
                                                    >
                                                        <Box
                                                            component={Link}
                                                            to={onFlowClick(row)}
                                                            sx={{
                                                                color: theme.palette.primary.main,
                                                                textDecoration: 'none',
                                                                '&:hover': { textDecoration: 'underline' }
                                                            }}
                                                        >
                                                            {row.templateName || row.name}
                                                        </Box>
                                                    </Typography>
                                                </Tooltip>
                                            </Box>
                                        </StyledTableCell>
                                        <StyledTableCell key='2'>
                                            {(images[row.id] || icons[row.id]) && (
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'start',
                                                        gap: 1
                                                    }}
                                                >
                                                    {[
                                                        ...(images[row.id] || []).map((img) => ({
                                                            type: 'image',
                                                            src: img.imageSrc,
                                                            label: img.label
                                                        })),
                                                        ...(icons[row.id] || []).map((ic) => ({
                                                            type: 'icon',
                                                            icon: ic.icon,
                                                            color: ic.color,
                                                            title: ic.name
                                                        }))
                                                    ]
                                                        .slice(0, 5)
                                                        .map((item, index) => (
                                                            <Tooltip key={item.imageSrc || index} title={item.label} placement='top'>
                                                                {item.type === 'image' ? (
                                                                    <Box
                                                                        sx={{
                                                                            width: 30,
                                                                            height: 30,
                                                                            borderRadius: '50%',
                                                                            backgroundColor: customization.isDarkMode
                                                                                ? theme.palette.common.white
                                                                                : theme.palette.grey[300] + 75
                                                                        }}
                                                                    >
                                                                        <img
                                                                            style={{
                                                                                width: '100%',
                                                                                height: '100%',
                                                                                padding: 5,
                                                                                objectFit: 'contain'
                                                                            }}
                                                                            alt=''
                                                                            src={item.src}
                                                                        />
                                                                    </Box>
                                                                ) : (
                                                                    <div
                                                                        style={{
                                                                            width: 30,
                                                                            height: 30,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center'
                                                                        }}
                                                                    >
                                                                        <item.icon size={25} color={item.color} />
                                                                    </div>
                                                                )}
                                                            </Tooltip>
                                                        ))}

                                                    {(images[row.id]?.length || 0) + (icons[row.id]?.length || 0) > 5 && (
                                                        <MoreItemsTooltip
                                                            images={[
                                                                ...(images[row.id]?.slice(5) || []),
                                                                ...(
                                                                    icons[row.id]?.slice(Math.max(0, 5 - (images[row.id]?.length || 0))) ||
                                                                    []
                                                                ).map((ic) => ({ label: ic.name }))
                                                            ]}
                                                        >
                                                            <Typography
                                                                sx={{
                                                                    alignItems: 'center',
                                                                    display: 'flex',
                                                                    fontSize: '.9rem',
                                                                    fontWeight: 200
                                                                }}
                                                            >
                                                                + {(images[row.id]?.length || 0) + (icons[row.id]?.length || 0) - 5} More
                                                            </Typography>
                                                        </MoreItemsTooltip>
                                                    )}
                                                </Box>
                                            )}
                                        </StyledTableCell>
                                        <StyledTableCell key='version'>
                                            {row.publishedVersion ? (
                                                <Tooltip title='Currently deployed version' placement='top'>
                                                    <Chip size='small' color='success' label={`v${row.publishedVersion}`} />
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title='Not yet published' placement='top'>
                                                    <Chip size='small' variant='outlined' label='Draft' />
                                                </Tooltip>
                                            )}
                                        </StyledTableCell>
                                        <StyledTableCell key='3'>
                                            {moment(row.updatedDate).format('MMMM Do, YYYY HH:mm:ss')}
                                        </StyledTableCell>
                                        {isActionsAvailable && (
                                            <StyledTableCell key='4'>
                                                <Stack
                                                    direction={{ xs: 'column', sm: 'row' }}
                                                    spacing={1}
                                                    justifyContent='center'
                                                    alignItems='center'
                                                >
                                                    <FlowListMenu
                                                        agentflow={row}
                                                        setError={setError}
                                                        updateFlowsApi={updateFlowsApi}
                                                        currentPage={currentPage}
                                                        pageLimit={pageLimit}
                                                    />
                                                </Stack>
                                            </StyledTableCell>
                                        )}
                                    </StyledTableRow>
                                ))}
                            </>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    )
}

FlowListTable.propTypes = {
    data: PropTypes.array,
    images: PropTypes.object,
    icons: PropTypes.object,
    isLoading: PropTypes.bool,
    filterFunction: PropTypes.func,
    updateFlowsApi: PropTypes.object,
    setError: PropTypes.func,
    currentPage: PropTypes.number,
    pageLimit: PropTypes.number
}
