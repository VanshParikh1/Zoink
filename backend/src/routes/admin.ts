import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireAdmin } from '../middleware/requireAdmin'
import { validate } from '../middleware/validate'
import { AdminListDisputesQuerySchema, DisputeIdParamsSchema, ResolveDisputeSchema } from '../schemas/dispute.schema'
import { AdminListReportsQuerySchema, ReportIdParamsSchema, ResolveReportSchema } from '../schemas/report.schema'
import { BookingEventsQuerySchema, BookingIdParamsSchema, CloseOutBookingSchema } from '../schemas/booking.schema'
import { UserIdParamsSchema } from '../schemas/user.schema'
import * as adminController from '../middleware/controllers/adminController'

const router = Router()

// All admin routes require auth and admin role
router.use(requireAuth, requireAdmin)

router.get('/disputes', validate(AdminListDisputesQuerySchema), adminController.listDisputes)
router.get('/disputes/:id', validate(DisputeIdParamsSchema), adminController.getDisputeDetail)
router.patch('/disputes/:id/resolve', validate(DisputeIdParamsSchema), validate(ResolveDisputeSchema), adminController.resolveDispute)
router.get('/bookings/overdue', adminController.listOverdueBookings)
router.post('/bookings/:id/close-out', validate(CloseOutBookingSchema), adminController.closeOutBooking)
router.get('/payouts/blocked', adminController.listBlockedPayouts)
router.post('/bookings/:id/payout/unblock', validate(BookingIdParamsSchema), adminController.unblockPayout)
router.get('/bookings/:id/events', validate(BookingEventsQuerySchema), adminController.getBookingEvents)
router.get('/reports', validate(AdminListReportsQuerySchema), adminController.listReports)
router.patch('/reports/:id', validate(ReportIdParamsSchema), validate(ResolveReportSchema), adminController.resolveReport)
router.post('/users/:id/suspend', validate(UserIdParamsSchema), adminController.suspendUser)
router.post('/users/:id/unsuspend', validate(UserIdParamsSchema), adminController.unsuspendUser)

export default router
