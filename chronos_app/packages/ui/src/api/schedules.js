import client from './client'

const getAllSchedules = (page, limit, agentflowId) =>
    client.get('/schedules', { params: { page, limit, ...(agentflowId ? { agentflowId } : {}) } })

const getScheduleById = (id) => client.get(`/schedules/${id}`)

const createSchedule = (body) => client.post('/schedules', body)

const updateSchedule = (id, body) => client.put(`/schedules/${id}`, body)

const deleteSchedule = (id) => client.delete(`/schedules/${id}`)

const toggleSchedule = (id, enabled) => client.patch(`/schedules/${id}/toggle`, { enabled })

const getScheduleExecutions = (id, page, limit) => client.get(`/schedules/${id}/executions`, { params: { page, limit } })

export default { getAllSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule, toggleSchedule, getScheduleExecutions }
