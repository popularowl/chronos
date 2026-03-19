import express from 'express'
import schedulesController from '../../controllers/schedules'
import { checkPermission } from '../../utils/openSourceStubs'

const router = express.Router()

// CREATE
router.post('/', checkPermission('schedules:create'), schedulesController.createSchedule)

// READ
router.get('/', checkPermission('schedules:view'), schedulesController.getAllSchedules)
router.get('/:id', checkPermission('schedules:view'), schedulesController.getScheduleById)

// UPDATE
router.put('/:id', checkPermission('schedules:update'), schedulesController.updateSchedule)

// TOGGLE
router.patch('/:id/toggle', checkPermission('schedules:update'), schedulesController.toggleSchedule)

// DELETE
router.delete('/:id', checkPermission('schedules:delete'), schedulesController.deleteSchedule)

// EXECUTIONS
router.get('/:id/executions', checkPermission('schedules:view'), schedulesController.getScheduleExecutions)

export default router
