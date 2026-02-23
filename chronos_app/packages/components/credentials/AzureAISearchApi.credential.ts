import { INodeParams, INodeCredential } from '../src/Interface'

/**
 * Azure AI Search API credential.
 * Uses Managed Identity by default; API key fields are hidden behind a toggle.
 */
class AzureAISearchApi implements INodeCredential {
    label: string
    name: string
    version: number
    description: string
    inputs: INodeParams[]

    constructor() {
        this.label = 'Azure AI Search API'
        this.name = 'azureAISearchApi'
        this.version = 1.0
        this.description = 'Connect to Azure AI Search with Managed Identity. Optionally provide API keys for non-MI environments.'
        this.inputs = [
            {
                label: 'Azure AI Search Endpoint',
                name: 'azureAISearchEndpoint',
                type: 'string',
                placeholder: 'https://your-search-service.search.windows.net'
            },
            {
                label: 'Managed Identity Client ID',
                name: 'azureClientId',
                type: 'string',
                optional: true,
                description: 'Client ID of a user-assigned Managed Identity. Leave empty for system-assigned MI.'
            },
            {
                label: 'Use API Key',
                name: 'useApiKey',
                type: 'boolean',
                default: false,
                optional: true,
                description: 'Enable to authenticate with API keys instead of Managed Identity.'
            },
            {
                label: 'Admin API Key',
                name: 'azureAISearchAdminKey',
                type: 'password',
                optional: true,
                description: 'Admin key for index management and document operations.',
                show: {
                    useApiKey: [true]
                }
            },
            {
                label: 'Query API Key',
                name: 'azureAISearchQueryKey',
                type: 'password',
                optional: true,
                description: 'Query key for search-only operations.',
                show: {
                    useApiKey: [true]
                }
            }
        ]
    }
}

module.exports = { credClass: AzureAISearchApi }
