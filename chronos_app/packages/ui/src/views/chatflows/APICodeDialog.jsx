import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import PropTypes from 'prop-types'

import { Tabs, Tab, Dialog, DialogContent, DialogTitle, Box } from '@mui/material'
import { CopyBlock, atomOneDark } from 'react-code-blocks'
import { useAuth } from '@/hooks/useAuth'

// Project import
import { Dropdown } from '@/ui-component/dropdown/Dropdown'
import { Available } from '@/ui-component/rbac/available'

// Const
import { baseURL } from '@/store/constant'
import { SET_CHATFLOW } from '@/store/actions'

// Images
import pythonSVG from '@/assets/images/python.svg'
import javascriptSVG from '@/assets/images/javascript.svg'
import cURLSVG from '@/assets/images/cURL.svg'
// API
import apiKeyApi from '@/api/apikey'
import chatflowsApi from '@/api/chatflows'

// Hooks
import useApi from '@/hooks/useApi'

function TabPanel(props) {
    const { children, value, index, ...other } = props
    return (
        <div
            role='tabpanel'
            hidden={value !== index}
            id={`attachment-tabpanel-${index}`}
            aria-labelledby={`attachment-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ p: 1 }}>{children}</Box>}
        </div>
    )
}

TabPanel.propTypes = {
    children: PropTypes.node,
    index: PropTypes.number.isRequired,
    value: PropTypes.number.isRequired
}

function a11yProps(index) {
    return {
        id: `attachment-tab-${index}`,
        'aria-controls': `attachment-tabpanel-${index}`
    }
}

const APICodeDialog = ({ show, dialogProps, onCancel }) => {
    const portalElement = document.getElementById('portal')
    const navigate = useNavigate()
    const dispatch = useDispatch()
    const codes = ['Python', 'JavaScript', 'cURL']
    const [value, setValue] = useState(0)
    const [apiKeys, setAPIKeys] = useState([])
    const [chatflowApiKeyId, setChatflowApiKeyId] = useState('')
    const [selectedApiKey, setSelectedApiKey] = useState({})

    const getAllAPIKeysApi = useApi(apiKeyApi.getAllAPIKeys)
    const updateChatflowApi = useApi(chatflowsApi.updateChatflow)
    const getIsChatflowStreamingApi = useApi(chatflowsApi.getIsChatflowStreaming)
    const isGlobal = useSelector((state) => state.auth.isGlobal)
    const { hasPermission } = useAuth()

    // Memoize keyOptions to prevent recreation on hover
    const keyOptions = useMemo(() => {
        if (!getAllAPIKeysApi.data) return []

        const options = [
            {
                label: 'No Authorization',
                name: ''
            }
        ]

        for (const key of getAllAPIKeysApi.data) {
            options.push({
                label: key.keyName,
                name: key.id
            })
        }

        if (isGlobal || hasPermission('apikeys:create')) {
            options.push({
                label: '- Add New Key -',
                name: 'addnewkey'
            })
        }

        return options
    }, [getAllAPIKeysApi.data, isGlobal, hasPermission])

    const onApiKeySelected = (keyValue) => {
        if (keyValue === 'addnewkey') {
            navigate('/apikey')
            return
        }
        setChatflowApiKeyId(keyValue)
        const selectedKey = apiKeys.find((key) => key.id === keyValue)
        setSelectedApiKey(selectedKey || {})
        const updateBody = {
            apikeyid: keyValue
        }
        updateChatflowApi.request(dialogProps.chatflowid, updateBody)
    }

    useEffect(() => {
        if (updateChatflowApi.data) {
            dispatch({ type: SET_CHATFLOW, chatflow: updateChatflowApi.data })
        }
    }, [updateChatflowApi.data, dispatch])

    const handleChange = (event, newValue) => {
        setValue(newValue)
    }

    const getCode = (codeLang) => {
        if (codeLang === 'Python') {
            return `from openai import OpenAI

client = OpenAI(
    base_url="${baseURL}/api/v1/openai",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="${dialogProps.chatflowid}",
    messages=[
        {"role": "user", "content": "Hey, how are you?"}
    ]
)
print(response.choices[0].message.content)
`
        } else if (codeLang === 'JavaScript') {
            return `import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "${baseURL}/api/v1/openai",
    apiKey: "not-needed"
});

const response = await client.chat.completions.create({
    model: "${dialogProps.chatflowid}",
    messages: [
        { role: "user", content: "Hey, how are you?" }
    ]
});
console.log(response.choices[0].message.content);
`
        } else if (codeLang === 'cURL') {
            return `curl ${baseURL}/api/v1/openai/chat/completions \\
     -X POST \\
     -H "Content-Type: application/json" \\
     -d '{
       "model": "${dialogProps.chatflowid}",
       "messages": [
         {"role": "user", "content": "Hey, how are you?"}
       ]
     }'`
        }
        return ''
    }

    const getCodeWithAuthorization = (codeLang) => {
        if (codeLang === 'Python') {
            return `from openai import OpenAI

client = OpenAI(
    base_url="${baseURL}/api/v1/openai",
    api_key="${selectedApiKey?.apiKey}"
)

response = client.chat.completions.create(
    model="${dialogProps.chatflowid}",
    messages=[
        {"role": "user", "content": "Hey, how are you?"}
    ]
)
print(response.choices[0].message.content)
`
        } else if (codeLang === 'JavaScript') {
            return `import OpenAI from "openai";

const client = new OpenAI({
    baseURL: "${baseURL}/api/v1/openai",
    apiKey: "${selectedApiKey?.apiKey}"
});

const response = await client.chat.completions.create({
    model: "${dialogProps.chatflowid}",
    messages: [
        { role: "user", content: "Hey, how are you?" }
    ]
});
console.log(response.choices[0].message.content);
`
        } else if (codeLang === 'cURL') {
            return `curl ${baseURL}/api/v1/openai/chat/completions \\
     -X POST \\
     -H "Content-Type: application/json" \\
     -H "Authorization: Bearer ${selectedApiKey?.apiKey}" \\
     -d '{
       "model": "${dialogProps.chatflowid}",
       "messages": [
         {"role": "user", "content": "Hey, how are you?"}
       ]
     }'`
        }
        return ''
    }

    const getLang = (codeLang) => {
        if (codeLang === 'Python') {
            return 'python'
        } else if (codeLang === 'JavaScript') {
            return 'javascript'
        } else if (codeLang === 'cURL') {
            return 'bash'
        }
        return 'python'
    }

    const getSVG = (codeLang) => {
        if (codeLang === 'Python') {
            return pythonSVG
        } else if (codeLang === 'JavaScript') {
            return javascriptSVG
        } else if (codeLang === 'cURL') {
            return cURLSVG
        } else if (codeLang === 'Configuration') {
            return settingsSVG
        }
        return pythonSVG
    }

    useEffect(() => {
        if (getAllAPIKeysApi.data) {
            setAPIKeys(getAllAPIKeysApi.data)

            if (dialogProps.chatflowApiKeyId) {
                setChatflowApiKeyId(dialogProps.chatflowApiKeyId)
                setSelectedApiKey(getAllAPIKeysApi.data.find((key) => key.id === dialogProps.chatflowApiKeyId))
            }
        }
    }, [dialogProps, getAllAPIKeysApi.data])

    useEffect(() => {
        if (show) {
            getAllAPIKeysApi.request()
            getIsChatflowStreamingApi.request(dialogProps.chatflowid)
        }

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show])

    const component = show ? (
        <Dialog
            open={show}
            fullWidth
            maxWidth='md'
            onClose={onCancel}
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogTitle sx={{ fontSize: '1rem' }} id='alert-dialog-title'>
                {dialogProps.title}
            </DialogTitle>
            <DialogContent>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                    <div style={{ flex: 80 }}>
                        <Tabs value={value} onChange={handleChange} aria-label='tabs'>
                            {codes.map((codeLang, index) => (
                                <Tab
                                    icon={
                                        <img style={{ objectFit: 'cover', height: 15, width: 'auto' }} src={getSVG(codeLang)} alt='code' />
                                    }
                                    iconPosition='start'
                                    key={index}
                                    label={codeLang}
                                    {...a11yProps(index)}
                                ></Tab>
                            ))}
                        </Tabs>
                    </div>
                    <div style={{ flex: 20 }}>
                        <Available permission={'chatflows:update,agentflows:update'}>
                            <Dropdown
                                name='SelectKey'
                                disableClearable={true}
                                options={keyOptions}
                                onSelect={(newValue) => onApiKeySelected(newValue)}
                                value={dialogProps.chatflowApiKeyId ?? chatflowApiKeyId ?? 'Choose an API key'}
                            />
                        </Available>
                    </div>
                </div>
                <div style={{ marginTop: 10 }}></div>
                {codes.map((codeLang, index) => (
                    <TabPanel key={index} value={value} index={index}>
                        <CopyBlock
                            theme={atomOneDark}
                            text={chatflowApiKeyId ? getCodeWithAuthorization(codeLang) : getCode(codeLang)}
                            language={getLang(codeLang)}
                            showLineNumbers={false}
                            wrapLines
                        />
                        {getIsChatflowStreamingApi.data?.isStreaming && (
                            <p>
                                Read&nbsp;
                                <a rel='noreferrer' target='_blank' href='https://intelligex.com/using-chronos/streaming'>
                                    here
                                </a>
                                &nbsp;on how to stream response back to application
                            </p>
                        )}
                    </TabPanel>
                ))}
            </DialogContent>
        </Dialog>
    ) : null

    return createPortal(component, portalElement)
}

APICodeDialog.propTypes = {
    show: PropTypes.bool,
    dialogProps: PropTypes.object,
    onCancel: PropTypes.func
}

export default APICodeDialog
