# Azure AI Foundry Node

This node provides integration with Azure AI Foundry using Managed Identity authentication. It's designed to work with private endpoints in Azure landing zones.

## Features

- **Managed Identity Support**: Uses Azure DefaultAzureCredential for secure, keyless authentication
- **Private Endpoint Compatible**: Works with Azure AI Foundry deployed behind private endpoints
- **Full LLM Support**: Compatible with GPT-4, GPT-4o, and other models which are provided on Azure AI Foundry

## Prerequisites

1. **Azure AI Foundry Project** deployed in your Azure subscription
2. **Private Endpoint** configured in your landing zone
3. **Managed Identity** (System-Assigned or User-Assigned) assigned to your Chronos container/app service with:
   - Role: `Cognitive Services User` or `Cognitive Services Contributor`
   - Scope: Azure AI Foundry resource
4. **Network Access**: Ensure Chronos can reach the private endpoint
5. **For User-Assigned Managed Identity**: Set `AZURE_CLIENT_ID` environment variable

## Configuration

### Credential Setup

1. Navigate to **Credentials** in Chronos
2. Create a new **Azure AI Foundry API** credential
3. Configure the following fields:

- **Azure AI Foundry Endpoint**: Your project endpoint (e.g., `https://my-project.cognitiveservices.azure.com/` or `https://ai-foundry-nesoai-hub-dev-uks-01.cognitiveservices.azure.com/`)
- **Deployment Name**: Your model deployment name
- **API Version**: Set API version - defaults to `2024-10-21`

### Node Usage

1. Add the **Azure AI Foundry** node to your flow
2. Select your configured credential
3. Choose your model from the dropdown
4. Configure temperature and other parameters as needed

## Environment Variables

### For System-Assigned Managed Identity
No environment variables needed - uses `DefaultAzureCredential` automatically.

### For User-Assigned Managed Identity (Docker/ACI/AKS)

```bash
# Required for User-Assigned Managed Identity
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Troubleshooting

### Testing Managed Identity

You can test Managed Identity from your Chronos container:

```bash
# Install Azure CLI in container (if not present)
curl -sL https://aka.ms/InstallAzureCLIDeb | bash

# Test managed identity token acquisition
az account get-access-token --resource https://cognitiveservices.azure.com
```
