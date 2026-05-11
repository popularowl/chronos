import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import {
    Alert,
    Box,
    Chip,
    Collapse,
    IconButton,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableContainer,
    TableHead,
    Tooltip,
    Typography,
    useTheme
} from '@mui/material'
import { useSelector } from 'react-redux'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { CopyBlock, atomOneDark } from 'react-code-blocks'

import { StyledTableCell, StyledTableRow } from '@/ui-component/table/TableStyles'

import mcpServersApi from '@/api/mcp-servers'
import useApi from '@/hooks/useApi'

/**
 * Live `tools/list` browser for an MCP server. Calls the Chronos user endpoint
 * `GET /api/v1/mcp-servers/:id/tools` (which goes through the same pooled
 * client agents use, so what's shown is what agents will see). Each row
 * expands to reveal the upstream `inputSchema` JSON.
 *
 * Tools are tagged "exposed" or "blocked" based on `MCPServer.allowedTools`
 * — the Chronos user sees at a glance which tools the server publishes
 * versus which the platform restricts. An empty `allowedTools` list means
 * "no restriction"; in that case every discovered tool is exposed.
 */
const MCPServerCatalogTab = ({ server, refreshKey }) => {
    const theme = useTheme()
    const customization = useSelector((state) => state.customization)

    const listApi = useApi(mcpServersApi.listMCPServerTools)
    const [tools, setTools] = useState([])
    const [errorMessage, setErrorMessage] = useState(null)
    const [expanded, setExpanded] = useState({})

    const allowedSet = useMemo(() => new Set(toStringArray(server?.allowedTools)), [server?.allowedTools])
    const allowedRestricted = allowedSet.size > 0

    const refresh = () => {
        if (!server?.id) return
        setErrorMessage(null)
        listApi.request(server.id)
    }

    useEffect(() => {
        refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [server?.id, refreshKey])

    useEffect(() => {
        if (listApi.data) {
            setTools(Array.isArray(listApi.data.tools) ? listApi.data.tools : [])
            setErrorMessage(null)
        }
    }, [listApi.data])

    useEffect(() => {
        if (listApi.error) {
            setErrorMessage(listApi.error?.response?.data?.message || listApi.error?.message || 'Failed to list tools')
            setTools([])
        }
    }, [listApi.error])

    const toggleExpanded = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }))

    const isLoading = listApi.loading

    return (
        <Stack spacing={2}>
            {errorMessage && (
                <Alert severity='error' onClose={() => setErrorMessage(null)}>
                    {errorMessage}
                </Alert>
            )}

            {isLoading && tools.length === 0 ? (
                <Skeleton variant='rounded' height={160} />
            ) : tools.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>
                    {errorMessage ? 'tools/list failed — see error above.' : 'No tools published by this server.'}
                </Box>
            ) : (
                <TableContainer sx={{ border: 1, borderColor: theme.palette.grey[900] + 25, borderRadius: 2 }} component={Paper}>
                    <Table sx={{ minWidth: 650 }} size='small' aria-label='mcp tool catalog'>
                        <TableHead
                            sx={{
                                backgroundColor: customization.isDarkMode ? theme.palette.common.black : theme.palette.grey[100],
                                height: 56
                            }}
                        >
                            <StyledTableRow>
                                <StyledTableCell sx={{ width: 40 }} />
                                <StyledTableCell>Name</StyledTableCell>
                                <StyledTableCell>Description</StyledTableCell>
                                <StyledTableCell>Status</StyledTableCell>
                            </StyledTableRow>
                        </TableHead>
                        <TableBody>
                            {tools.map((tool) => {
                                const name = String(tool?.name ?? '')
                                const exposed = !allowedRestricted || allowedSet.has(name)
                                const isOpen = Boolean(expanded[name])
                                return (
                                    <RowGroup
                                        key={name || Math.random()}
                                        tool={tool}
                                        name={name}
                                        exposed={exposed}
                                        isOpen={isOpen}
                                        onToggle={() => toggleExpanded(name)}
                                        namespacedPrefix={server?.slug ? `${server.slug}.` : ''}
                                    />
                                )
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Stack>
    )
}

MCPServerCatalogTab.propTypes = {
    server: PropTypes.shape({
        id: PropTypes.string,
        slug: PropTypes.string,
        allowedTools: PropTypes.oneOfType([PropTypes.string, PropTypes.array])
    }),
    refreshKey: PropTypes.number
}

const RowGroup = ({ tool, name, exposed, isOpen, onToggle, namespacedPrefix }) => {
    // Same colour treatment as the curl examples on AgentDetail (CopyBlock +
    // atomOneDark) — keeps revealed code consistent across the product so
    // Chronos users read MCP tool schemas with the same mental model as
    // agent gateway snippets.
    const schemaText = tool?.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '{}'
    return (
        <>
            <StyledTableRow hover sx={{ cursor: 'pointer', '& > *': { borderBottom: isOpen ? 'none' : undefined } }} onClick={onToggle}>
                <StyledTableCell sx={{ width: 40 }}>
                    <IconButton
                        size='small'
                        onClick={(e) => {
                            e.stopPropagation()
                            onToggle()
                        }}
                    >
                        {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                    </IconButton>
                </StyledTableCell>
                <StyledTableCell sx={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                    {namespacedPrefix}
                    <strong>{name}</strong>
                </StyledTableCell>
                <StyledTableCell sx={{ color: 'text.secondary' }}>{tool?.description || '—'}</StyledTableCell>
                <StyledTableCell>
                    {/* Match the Status column chip in MCPServerDetail's identity table:
                        dark background + white text. exposed mirrors healthy (success.dark);
                        blocked mirrors a negative state (error.dark). */}
                    {exposed ? (
                        <Chip
                            size='small'
                            label='exposed'
                            sx={(theme) => ({
                                backgroundColor: theme.palette.success.dark,
                                color: theme.palette.common.white
                            })}
                        />
                    ) : (
                        <Tooltip title='Server publishes this tool but MCPServer.allowedTools restricts it — agents cannot invoke it.'>
                            <Chip
                                size='small'
                                label='blocked'
                                sx={(theme) => ({
                                    backgroundColor: theme.palette.error.dark,
                                    color: theme.palette.common.white
                                })}
                            />
                        </Tooltip>
                    )}
                </StyledTableCell>
            </StyledTableRow>
            <StyledTableRow>
                <StyledTableCell colSpan={4} sx={{ py: 0, height: 'auto !important', borderBottom: isOpen ? undefined : 'none' }}>
                    <Collapse in={isOpen} unmountOnExit>
                        <Box sx={{ py: 2, px: 1 }}>
                            <Typography variant='caption' sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
                                inputSchema
                            </Typography>
                            {tool?.inputSchema ? (
                                <CopyBlock
                                    theme={atomOneDark}
                                    text={schemaText}
                                    language='json'
                                    showLineNumbers={false}
                                    wrapLines
                                    customStyle={{ padding: '16px 18px', borderRadius: 6, maxHeight: 320, overflow: 'auto' }}
                                />
                            ) : (
                                <Typography variant='body2' sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                    (no inputSchema published)
                                </Typography>
                            )}
                        </Box>
                    </Collapse>
                </StyledTableCell>
            </StyledTableRow>
        </>
    )
}

RowGroup.propTypes = {
    tool: PropTypes.object,
    name: PropTypes.string,
    exposed: PropTypes.bool,
    isOpen: PropTypes.bool,
    onToggle: PropTypes.func,
    namespacedPrefix: PropTypes.string
}

const parseJson = (raw) => {
    if (raw === undefined || raw === null || raw === '') return undefined
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return parsed && typeof parsed === 'object' ? parsed : undefined
    } catch {
        return undefined
    }
}

const toStringArray = (raw) => {
    const parsed = parseJson(raw)
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string')
    return []
}

export default MCPServerCatalogTab
