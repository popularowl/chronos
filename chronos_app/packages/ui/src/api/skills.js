import client from './client'

/**
 * Get all skills
 * @param {number} page
 * @param {number} limit
 */
const getAllSkills = (page, limit) => client.get('/skills', { params: { page, limit } })

/**
 * Get skill by ID
 * @param {string} id
 */
const getSpecificSkill = (id) => client.get(`/skills/${id}`)

/**
 * Create a new skill
 * @param {object} body
 */
const createSkill = (body) => client.post('/skills', body)

/**
 * Update a skill
 * @param {string} id
 * @param {object} body
 */
const updateSkill = (id, body) => client.put(`/skills/${id}`, body)

/**
 * Delete a skill
 * @param {string} id
 */
const deleteSkill = (id) => client.delete(`/skills/${id}`)

export default { getAllSkills, getSpecificSkill, createSkill, updateSkill, deleteSkill }
