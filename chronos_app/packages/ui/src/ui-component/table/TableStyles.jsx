import { styled } from '@mui/material/styles'
import { TableCell, TableRow } from '@mui/material'
import { tableCellClasses } from '@mui/material/TableCell'

export const StyledTableCell = styled(TableCell)(({ theme }) => ({
    borderColor: theme.palette.grey[900] + 25,
    padding: '6px 16px',

    // Explicit padding above wins over MUI's `size='small'` density, so
    // checkbox columns lose MUI's tight default. Restore it for any cell
    // that opts in via `padding='checkbox'`.
    '&.MuiTableCell-paddingCheckbox': { padding: '0 0 0 4px' },

    [`&.${tableCellClasses.head}`]: {
        color: theme.palette.grey[900]
    },
    [`&.${tableCellClasses.body}`]: {
        fontSize: 14,
        height: 64
    }
}))

export const StyledTableRow = styled(TableRow)(() => ({
    // Hide the bottom border on the last body row only. The `tbody &` ancestor
    // selector skips head rows (which live in `<thead>`), so wrapping a head
    // row in StyledTableRow no longer strips its divider.
    'tbody &:last-child td, tbody &:last-child th': {
        border: 0
    }
}))
