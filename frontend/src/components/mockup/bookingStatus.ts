import { BookingStatus } from '../../types'
import { BadgeVariant } from './Badge'

/** Badge per status: lime = live, green = done, surface = waiting, tan = closed. */
export function bookingStatusBadge(status: BookingStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'surface' }
    case 'ACCEPTED':
      return { label: 'Accepted', variant: 'surface' }
    case 'CONFIRMED':
    case 'PICKUP_PENDING':
    case 'ACTIVE':
    case 'RETURN_PENDING':
      return { label: 'Active', variant: 'lime' }
    case 'COMPLETED':
      return { label: 'Completed', variant: 'green' }
    case 'DECLINED':
      return { label: 'Denied', variant: 'tan' }
    case 'CANCELLED':
    default:
      return { label: 'Cancelled', variant: 'tan' }
  }
}
