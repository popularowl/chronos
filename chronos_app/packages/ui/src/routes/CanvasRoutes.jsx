import { lazy } from 'react'

// project imports
import Loadable from '@/ui-component/loading/Loadable'
import MinimalLayout from '@/layout/MinimalLayout'
import { RequireAuth } from '@/routes/RequireAuth'

// canvas routing
const CanvasV2 = Loadable(lazy(() => import('@/views/agentflowsv2/Canvas')))
const MarketplaceCanvasV2 = Loadable(lazy(() => import('@/views/agentflowsv2/MarketplaceCanvas')))

// ==============================|| CANVAS ROUTING ||============================== //

const CanvasRoutes = {
    path: '/',
    element: <MinimalLayout />,
    children: [
        {
            path: '/v2/agentcanvas',
            element: (
                <RequireAuth permission={'agentflows:view'}>
                    <CanvasV2 />
                </RequireAuth>
            )
        },
        {
            path: '/v2/agentcanvas/:id',
            element: (
                <RequireAuth permission={'agentflows:view'}>
                    <CanvasV2 />
                </RequireAuth>
            )
        },
        {
            path: '/v2/marketplace/:id',
            element: (
                <RequireAuth permission={'templates:marketplace,templates:custom'}>
                    <MarketplaceCanvasV2 />
                </RequireAuth>
            )
        }
    ]
}

export default CanvasRoutes
