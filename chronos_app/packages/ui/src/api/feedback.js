import client from './client'

const getStatsFromAgentflow = (id, params) => client.get(`/stats/${id}`, { params: { ...params } })

export default {
    getStatsFromAgentflow
}
