import express from 'express'
import { requireScope } from '../../middlewares/adminAuth'
import { AdminScope } from '../../Interface'
import adminSchedulesController from '../../controllers/admin/schedules'

const router = express.Router()

router.get('/', requireScope(AdminScope.SCHEDULES_READ), adminSchedulesController.getAllSchedules)
router.get('/:id', requireScope(AdminScope.SCHEDULES_READ), adminSchedulesController.getScheduleById)
router.post('/', requireScope(AdminScope.SCHEDULES_WRITE), adminSchedulesController.createSchedule)
router.put('/:id', requireScope(AdminScope.SCHEDULES_WRITE), adminSchedulesController.updateSchedule)
router.delete('/:id', requireScope(AdminScope.SCHEDULES_WRITE), adminSchedulesController.deleteSchedule)
router.patch('/:id/toggle', requireScope(AdminScope.SCHEDULES_WRITE), adminSchedulesController.toggleSchedule)
router.get('/:id/executions', requireScope(AdminScope.SCHEDULES_READ), adminSchedulesController.getScheduleExecutions)

export default router
