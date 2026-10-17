import { DisputeStatus, ReportStatus } from '../../types'
import { BadgeVariant } from './Badge'

/** Same scheme as bookingStatusBadge: surface = waiting, lime = resolved, tan = closed without action. */
export function disputeStatusBadge(status: DisputeStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', variant: 'surface' }
    case 'UNDER_REVIEW':
      return { label: 'Under review', variant: 'surface' }
    case 'RESOLVED_REFUND':
      return { label: 'Refunded', variant: 'lime' }
    case 'RESOLVED_NO_ACTION':
      return { label: 'No action', variant: 'lime' }
    case 'DISMISSED':
    default:
      return { label: 'Dismissed', variant: 'tan' }
  }
}

export function reportStatusBadge(status: ReportStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', variant: 'surface' }
    case 'REVIEWED':
      return { label: 'Reviewed', variant: 'lime' }
    case 'DISMISSED':
    default:
      return { label: 'Dismissed', variant: 'tan' }
  }
}
