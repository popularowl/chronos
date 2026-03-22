import platformsettingsApi from '@/api/platformsettings'
import PropTypes from 'prop-types'
import { createContext, useContext, useEffect, useState } from 'react'

const ConfigContext = createContext()

export const ConfigProvider = ({ children }) => {
    const [config, setConfig] = useState({})
    const [loading, setLoading] = useState(true)
    const [isEnterpriseLicensed, setEnterpriseLicensed] = useState(false)
    const [isCloud, setCloudLicensed] = useState(false)
    const [isOpenSource, setOpenSource] = useState(false)
    const [schedulesEnabled, setSchedulesEnabled] = useState(false)
    const [evaluationsEnabled, setEvaluationsEnabled] = useState(false)
    const [dashboardEnabled, setDashboardEnabled] = useState(false)
    const [webhooksEnabled, setWebhooksEnabled] = useState(false)

    useEffect(() => {
        const userSettings = platformsettingsApi.getSettings()
        Promise.all([userSettings])
            .then(([currentSettingsData]) => {
                const finalData = {
                    ...currentSettingsData.data
                }
                setConfig(finalData)
                if (finalData.PLATFORM_TYPE) {
                    if (finalData.PLATFORM_TYPE === 'enterprise') {
                        setEnterpriseLicensed(true)
                        setCloudLicensed(false)
                        setOpenSource(false)
                    } else if (finalData.PLATFORM_TYPE === 'cloud') {
                        setCloudLicensed(true)
                        setEnterpriseLicensed(false)
                        setOpenSource(false)
                    } else {
                        setOpenSource(true)
                        setEnterpriseLicensed(false)
                        setCloudLicensed(false)
                    }
                }

                setSchedulesEnabled(!!finalData.SCHEDULES_ENABLED)
                setEvaluationsEnabled(!!finalData.EVALUATIONS_ENABLED)
                setDashboardEnabled(!!finalData.DASHBOARD_ENABLED)
                setWebhooksEnabled(!!finalData.WEBHOOKS_ENABLED)
                setLoading(false)
            })
            .catch((error) => {
                console.error('Error fetching data:', error)
                setLoading(false)
            })
    }, [])

    return (
        <ConfigContext.Provider
            value={{
                config,
                loading,
                isEnterpriseLicensed,
                isCloud,
                isOpenSource,
                schedulesEnabled,
                evaluationsEnabled,
                dashboardEnabled,
                webhooksEnabled
            }}
        >
            {children}
        </ConfigContext.Provider>
    )
}

export const useConfig = () => useContext(ConfigContext)

ConfigProvider.propTypes = {
    children: PropTypes.any
}
