/** Settings service — returns platform config and feature flags */

import { Platform } from '../../Interface'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'

const getSettings = async () => {
    try {
        const appServer = getRunningExpressApp()
        const platformType = appServer.identityManager.getPlatformType()

        const featureFlags = {
            SCHEDULES_ENABLED: process.env.ENABLE_SCHEDULES === 'true',
            EVALUATIONS_ENABLED: process.env.ENABLE_EVALUATIONS === 'true',
            DASHBOARD_ENABLED: process.env.ENABLE_DASHBOARD !== 'false',
            WEBHOOKS_ENABLED: process.env.ENABLE_WEBHOOKS === 'true'
        }

        switch (platformType) {
            case Platform.ENTERPRISE: {
                if (!appServer.identityManager.isLicenseValid()) {
                    return {}
                } else {
                    return { PLATFORM_TYPE: Platform.ENTERPRISE, ...featureFlags }
                }
            }
            case Platform.CLOUD: {
                return { PLATFORM_TYPE: Platform.CLOUD, ...featureFlags }
            }
            default: {
                return { PLATFORM_TYPE: Platform.OPEN_SOURCE, ...featureFlags }
            }
        }
    } catch (error) {
        return {}
    }
}

export default {
    getSettings
}
