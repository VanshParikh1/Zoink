import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireAdmin } from '../middleware/requireAdmin'
import { validate } from '../middleware/validate'
import { AdminListDisputesQuerySchema, DisputeIdParamsSchema, ResolveDisputeSchema } from '../schemas/dispute.schema'
import { AdminListReportsQuerySchema, ReportIdParamsSchema, ResolveReportSchema } from '../schemas/report.schema'
import { BookingIdParamsSchema } from '../schemas/booking.schema'
import * as adminController from '../middleware/controllers/adminController'

const router = Router()

// All admin routes require auth and admin role
router.use(requireAuth, requireAdmin)

router.get('/disputes', validate(AdminListDisputesQuerySchema), adminController.listDisputes)
router.get('/disputes/:id', validate(DisputeIdParamsSchema), adminController.getDisputeDetail)
router.patch('/disputes/:id/resolve', validate(DisputeIdParamsSchema), validate(ResolveDisputeSchema), adminController.resolveDispute)
router.get('/bookings/:id/events', validate(BookingIdParamsSchema), adminController.getBookingEvents)
router.get('/reports', validate(AdminListReportsQuerySchema), adminController.listReports)
router.patch('/reports/:id', validate(ReportIdParamsSchema), validate(ResolveReportSchema), adminController.resolveReport)

export default router
