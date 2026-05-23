import PropTypes from 'prop-types'
import { useSelector } from 'react-redux'
import { Button, Paper, Skeleton, Table, TableBody, TableContainer, TableHead, TableRow, Typography, useTheme } from '@mui/material'
import { StyledTableCell, StyledTableRow } from './TableStyles'

export const ToolsTable = ({ data, isLoading, onSelect }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

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
                            <StyledTableCell component='th' scope='row' key='0'>
                                Name
                            </StyledTableCell>
                            <StyledTableCell key='1'>Description</StyledTableCell>
                            <StyledTableCell component='th' scope='row' key='3'>
                                &nbsp;
                            </StyledTableCell>
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
                                </StyledTableRow>
                            </>
                        ) : (
                            <>
                                {data?.map((row, index) => (
                                    <StyledTableRow key={index}>
                                        <StyledTableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }} key='0'>
                                            <div
                                                style={{
                                                    width: 35,
                                                    height: 35,
                                                    display: 'flex',
                                                    flexShrink: 0,
                                                    marginRight: 10,
                                                    borderRadius: '50%',
                                                    backgroundImage: `url(${row.iconSrc})`,
                                                    backgroundSize: 'contain',
                                                    backgroundRepeat: 'no-repeat',
                                                    backgroundPosition: 'center center'
                                                }}
                                            ></div>
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
                                                <Button onClick={() => onSelect(row)} sx={{ textAlign: 'left' }}>
                                                    {row.templateName || row.name}
                                                </Button>
                                            </Typography>
                                        </StyledTableCell>
                                        <StyledTableCell key='1'>
                                            <Typography sx={{ overflowWrap: 'break-word', whiteSpace: 'pre-line' }}>
                                                {row.description || ''}
                                            </Typography>
                                        </StyledTableCell>
                                        <StyledTableCell key='3'></StyledTableCell>
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

ToolsTable.propTypes = {
    data: PropTypes.array,
    isLoading: PropTypes.bool,
    onSelect: PropTypes.func
}
