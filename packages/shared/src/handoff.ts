// Whether a booking's money is actually in place for the pickup handoff.
// Shared so the app hides "Start Handoff" in exactly the cases the backend
// refuses it (backend handoffService.assertPickupPaymentReady, which also
// checks the Stripe PaymentIntent ids the app doesn't see).

type PickupPaymentFields = {
  paymentStatus: string
  depositAmount: number | string
  depositStatus: string | null
}

/** The rent is authorized (or, on a retried capture, already captured) and,
 *  when the booking has a deposit, the deposit hold is authorized. */
export function isPickupPaymentReady(booking: PickupPaymentFields) {
  const rentHeld = booking.paymentStatus === 'AUTHORIZED' || booking.paymentStatus === 'CAPTURED'
  const depositHeld = Number(booking.depositAmount) <= 0 || booking.depositStatus === 'AUTHORIZED'
  return rentHeld && depositHeld
}
