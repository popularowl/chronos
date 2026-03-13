import express from 'express'
import skillsController from '../../controllers/skills'
import { checkAnyPermission, checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

// CREATE
router.post('/', checkPermission('skills:create'), skillsController.createSkill)

// READ
router.get('/', checkPermission('skills:view'), skillsController.getAllSkills)
router.get('/:id', checkPermission('skills:view'), skillsController.getSkillById)

// UPDATE
router.put('/:id', checkAnyPermission('skills:update,skills:create'), skillsController.updateSkill)

// DELETE
router.delete('/:id', checkPermission('skills:delete'), skillsController.deleteSkill)

export default router
