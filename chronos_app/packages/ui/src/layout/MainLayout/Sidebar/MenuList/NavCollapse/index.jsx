import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useLocation } from 'react-router-dom'

// material-ui
import { useTheme } from '@mui/material/styles'
import { Collapse, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material'

// project imports
import NavItem from '../NavItem'

// assets
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'

// ==============================|| SIDEBAR MENU LIST COLLAPSE ITEMS ||============================== //

const NavCollapse = ({ menu, level }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)
    const location = useLocation()

    // Flat list of every descendant route this collapse owns, so we can
    // auto-open when the user lands on any of them directly.
    const descendantUrls = useMemo(() => {
        const urls = []
        const collect = (item) => {
            if (item.url) urls.push(item.url)
            if (item.children) item.children.forEach(collect)
        }
        if (menu.children) menu.children.forEach(collect)
        return urls
    }, [menu])

    const hasActiveDescendant = useMemo(
        () => descendantUrls.some((url) => location.pathname === url || location.pathname.startsWith(url + '/')),
        [descendantUrls, location.pathname]
    )

    const [open, setOpen] = useState(hasActiveDescendant)

    // Sync open state to the active route on every navigation: open when
    // we own the new route, close when we don't. Manual expand/collapse
    // by the user is preserved while they stay on the same route (this
    // effect only fires on actual path changes).
    useEffect(() => {
        setOpen(hasActiveDescendant)
    }, [location.pathname, hasActiveDescendant])

    const handleClick = () => {
        setOpen(!open)
    }

    // The parent row highlights when (and only when) the active route is
    // one of its descendants. Prevents the "two items selected" bug where
    // local click state would keep the parent purple after a child took
    // over the active highlight.
    const selected = hasActiveDescendant

    // menu collapse & item
    const menus = menu.children?.map((item) => {
        switch (item.type) {
            case 'collapse':
                return <NavCollapse key={item.id} menu={item} level={level + 1} />
            case 'item':
                return <NavItem key={item.id} item={item} level={level + 1} />
            default:
                return (
                    <Typography key={item.id} variant='h6' color='error' align='center'>
                        Menu Items Error
                    </Typography>
                )
        }
    })

    const Icon = menu.icon
    const menuIcon = menu.icon ? (
        <Icon strokeWidth={1.5} size='1.3rem' style={{ marginTop: 'auto', marginBottom: 'auto' }} />
    ) : (
        <FiberManualRecordIcon
            sx={{
                width: selected ? 8 : 6,
                height: selected ? 8 : 6
            }}
            fontSize={level > 0 ? 'inherit' : 'medium'}
        />
    )

    return (
        <>
            <ListItemButton
                sx={{
                    borderRadius: `${customization.borderRadius}px`,
                    mb: 0.5,
                    alignItems: 'flex-start',
                    backgroundColor: level > 1 ? 'transparent !important' : 'inherit',
                    py: level > 1 ? 1 : 1.25,
                    pl: `${level * 24}px`
                }}
                selected={selected}
                onClick={handleClick}
            >
                <ListItemIcon sx={{ my: 'auto', minWidth: !menu.icon ? 18 : 36 }}>{menuIcon}</ListItemIcon>
                <ListItemText
                    primary={
                        <Typography variant={selected ? 'h5' : 'body1'} color='inherit' sx={{ my: 'auto' }}>
                            {menu.title}
                        </Typography>
                    }
                    secondary={
                        menu.caption && (
                            <Typography variant='caption' sx={{ ...theme.typography.subMenuCaption }} display='block' gutterBottom>
                                {menu.caption}
                            </Typography>
                        )
                    }
                />
                {open ? (
                    <IconChevronUp stroke={1.5} size='1rem' style={{ marginTop: 'auto', marginBottom: 'auto' }} />
                ) : (
                    <IconChevronDown stroke={1.5} size='1rem' style={{ marginTop: 'auto', marginBottom: 'auto' }} />
                )}
            </ListItemButton>
            <Collapse in={open} timeout='auto' unmountOnExit>
                <List
                    component='div'
                    disablePadding
                    sx={{
                        position: 'relative',
                        '&:after': {
                            content: "''",
                            position: 'absolute',
                            left: '32px',
                            top: 0,
                            height: '100%',
                            width: '1px',
                            opacity: 1,
                            background: theme.palette.primary.light
                        }
                    }}
                >
                    {menus}
                </List>
            </Collapse>
        </>
    )
}

NavCollapse.propTypes = {
    menu: PropTypes.object,
    level: PropTypes.number
}

export default NavCollapse
