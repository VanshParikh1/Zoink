-- D-1: audit-trail event written when a rental is flagged overdue.
ALTER TYPE "BookingEventType" ADD VALUE 'RENTAL_OVERDUE';
