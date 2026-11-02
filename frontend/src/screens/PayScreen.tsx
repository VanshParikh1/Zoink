import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { PaymentSheetError, StripeProvider, useStripe } from '@stripe/stripe-react-native'
import { RootStackParamList } from '../navigation'
import { confirmBookingPayment, createBookingPaymentIntent, getBooking } from '../services/bookingsApi'
import { applyBookingUpdate } from '../services/bookingCache'
import { queryKeys } from '../services/queryKeys'
import { useRefreshOnFocus } from '../hooks/usePagedList'
import { userMessage } from '../utils/userMessage'
import { BOOKING_UNAVAILABLE, DetailFallbackScreen, DetailLoadingScreen, isWaitingOffline } from '../components/LoadStates'
import { useQuery } from '@tanstack/react-query'
import { DEPOSIT_HOLD_HOURS, DEPOSIT_PAY_WINDOW_HOURS, formatDateTime, formatRentalDate, paymentOpensAt } from '@zoink/shared'
import { Booking, BookingStatus } from '../types'
import { isStripePublishableKeyConfigured, STRIPE_PUBLISHABLE_KEY } from '../config/stripe'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import Badge from '../components/mockup/Badge'
import Card from '../components/mockup/Card'
import InkCard from '../components/mockup/InkCard'
import PriceTable, { PriceRow } from '../components/mockup/PriceTable'
import { useSubmit } from '../hooks/useSubmit'
import { haptics } from '../utils/haptics'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'Pay'>

// "Pay $X + hold $Y" fits at 17px on a 375pt phone up to about this many
// characters; longer labels drop to 15 instead of wrapping.
const LONG_PAY_LABEL = 24

// The mockup's deposit headline sits between type.section (20) and body.
const DEPOSIT_TITLE_SIZE = 19

type Banner = { tone: 'accepted' | 'pending' | 'closed'; title: string }

// Which statuses can show this screen and how each reads. Pay is only linked
// from ACCEPTED bookings, but a stale link can land on the others.
function bannerFor(status: BookingStatus): Banner | null {
  switch (status) {
    case 'ACCEPTED':
      return { tone: 'accepted', title: 'Owner accepted' }
    case 'PENDING':
      return { tone: 'pending', title: 'Waiting for the owner' }
    case 'DECLINED':
      return { tone: 'closed', title: 'Owner declined this request' }
    case 'CANCELLED':
      return { tone: 'closed', title: 'This request was cancelled' }
    default:
      return null
  }
}

function money(amount: number) {
  return `$${amount.toFixed(2)}`
}

/** Whole dollars when there are no cents, for the button label. */
function shortMoney(amount: number) {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`
}

// Stripe is set up here, the only screen that uses it, instead of for the
// whole app at launch (its SDK no longer loads until someone pays). urlScheme
// brings the user back here from a bank's 3-D Secure page.
export default function PayScreen() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="zoink">
      <PayContent />
    </StripeProvider>
  )
}

function PayContent() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const bookingId = route.params.bookingId
  // Always the latest on (re)focus: the payment step must see the real status.
  const bookingQuery = useQuery({ queryKey: queryKeys.booking(bookingId), queryFn: () => getBooking(bookingId), staleTime: 0 })
  useRefreshOnFocus(queryKeys.booking(bookingId))
  const booking = bookingQuery.data ?? null
  const loading = bookingQuery.isPending
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Guarded: a second tap while the payment runs is dropped.
  const [handlePay, paying] = useSubmit(async () => {
    if (!booking) return

    setPaymentError(null)

    if (!isStripePublishableKeyConfigured()) {
      // A build without EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (restart Expo with
      // a cleared cache after setting it).
      console.log('[stripe] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing from this build')
      const message = "Payments aren't available in this version of the app."
      setPaymentError(message)
      return
    }

    try {
      const withIntent = await createBookingPaymentIntent(booking.id)

      if (withIntent.paymentClientSecret) {
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Zoink',
          paymentIntentClientSecret: withIntent.paymentClientSecret,
          allowsDelayedPaymentMethods: true,
          returnURL: 'zoink://stripe-redirect',
        })

        if (initError) {
          console.log(`[stripe] payment sheet setup: ${initError.code}: ${initError.message}`)
          const message = "Payment couldn't start. Please try again."
          setPaymentError(message)
          return
        }

        const { error: presentError } = await presentPaymentSheet()
        if (presentError) {
          console.log(`[stripe] payment sheet: ${presentError.code}: ${presentError.message}`)
          // Closing the sheet isn't a failure: nothing to say.
          if (presentError.code === PaymentSheetError.Canceled) return
          // Stripe's localized text is written for card holders ("Your card
          // was declined."); its plain message isn't always.
          const message = presentError.localizedMessage ?? "Your payment didn't go through. Please try again."
          setPaymentError(message)
          return
        }
      }

      const confirmed = await confirmBookingPayment(booking.id)
      applyBookingUpdate(confirmed)
      haptics.success()
      nav.replace('BookingDetail', { bookingId: confirmed.id })
    } catch (err: any) {
      setPaymentError(userMessage(err, { action: "Couldn't complete your payment. Please try again." }))
    }
  })

  if (loading && !isWaitingOffline(bookingQuery)) return <DetailLoadingScreen title="Pay for this rental" />

  if (!booking) {
    return <DetailFallbackScreen query={bookingQuery} title="Pay for this rental" what="this booking" unavailable={BOOKING_UNAVAILABLE} />
  }

  // Rent + insurance + HST is what the PaymentIntent authorizes now and
  // captures at pickup (paymentService.getRentalAuthorizationAmount). The
  // deposit is a separate hold, shown in its own card.
  const rentDue = booking.totalPrice + booking.insuranceFee + booking.hstAmount
  const hasDeposit = booking.depositAmount > 0
  const rows: PriceRow[] = [
    { label: 'Rental total', value: money(booking.totalPrice) },
    ...(booking.insuranceOptIn ? [{ label: 'Insurance', value: money(booking.insuranceFee) }] : []),
    { label: 'HST (13%)', value: money(booking.hstAmount) },
  ]
  const banner = bannerFor(booking.status)
  const dateRange = `${formatRentalDate(booking.startDate, 'long')} – ${formatRentalDate(booking.endDate, 'long')}`
  // A booking with a deposit can only be paid from 24 h before it starts (the
  // server refuses earlier), so the deposit hold lasts until the return.
  const opensAt = booking.status === 'ACCEPTED' ? paymentOpensAt(booking) : null
  const payLabel = opensAt
    ? `You can pay from ${formatDateTime(opensAt)}`
    : `Pay ${shortMoney(rentDue)}${hasDeposit ? ` + hold ${shortMoney(booking.depositAmount)}` : ''}`

  return (
    <Screen
      header={<ScreenHeader title="Pay for this rental" back />}
      footer={
        <View style={styles.footer}>
          {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
          <Button
            label={payLabel}
            onPress={handlePay}
            loading={paying}
            disabled={opensAt !== null}
            compactLabel={payLabel.length > LONG_PAY_LABEL}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {banner ? (
          <Card
            shadow={banner.tone === 'closed' ? false : 'md'}
            rotate={banner.tone === 'accepted' ? -1 : undefined}
            padding={space.lg}
            contentStyle={[
              styles.banner,
              banner.tone === 'accepted' ? styles.bannerAccepted : banner.tone === 'closed' ? styles.bannerClosed : null,
            ]}
          >
            <View style={[styles.bannerIcon, banner.tone === 'closed' ? styles.bannerIconClosed : null]}>
              <Feather
                name={banner.tone === 'accepted' ? 'check' : banner.tone === 'pending' ? 'clock' : 'x'}
                size={18}
                color={banner.tone === 'closed' ? colors.danger : colors.green}
              />
            </View>
            <View style={styles.bannerText}>
              <Text style={[styles.bannerTitle, banner.tone === 'closed' ? styles.bannerTitleClosed : null]}>
                {banner.title}
              </Text>
              <Text style={styles.caption} numberOfLines={2}>
                {booking.listing.title} · {dateRange}
              </Text>
            </View>
          </Card>
        ) : null}

        <Card shadow={false}>
          <PriceTable rows={rows} total={{ label: 'Charged at pickup', value: money(rentDue) }} />
        </Card>

        {hasDeposit ? (
          <InkCard>
            <View style={styles.depositTop}>
              <Badge
                label="During the rental"
                variant="inkGreen"
                icon={<Feather name="lock" size={12} color={colors.green} />}
                style={styles.depositBadge}
              />
              <Text style={styles.depositAmount}>{money(booking.depositAmount)}</Text>
            </View>
            <Text style={styles.depositTitle}>The deposit is held, not charged.</Text>
            <Text style={styles.depositBody}>
              It's released {DEPOSIT_HOLD_HOURS} hours after you return the item, unless a dispute is open then. You can
              pay from {DEPOSIT_PAY_WINDOW_HOURS} hours before the rental starts.
            </Text>
          </InkCard>
        ) : null}

        <View style={styles.methodBlock}>
          <Text style={styles.label}>Pay through Stripe</Text>
          <Pressable
            style={({ pressed }) => [styles.methodRow, pressed ? styles.methodRowPressed : null]}
            onPress={handlePay}
            disabled={paying || opensAt !== null}
            accessibilityRole="button"
            accessibilityLabel="Pay with card or phone wallet"
          >
            <Feather name="credit-card" size={18} color={colors.ink} />
            <Text style={styles.methodText}>Card or phone wallet</Text>
            <Feather name="chevron-right" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <Text style={styles.cancelNote}>
          You can cancel this booking any time before the rental starts.
        </Text>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: space.screen,
    paddingTop: space.xs,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  bannerAccepted: {
    backgroundColor: colors.lime,
  },
  bannerClosed: {
    backgroundColor: colors.tan,
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerIconClosed: {
    backgroundColor: colors.surface,
    borderWidth: border.thin,
    borderColor: colors.danger,
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    ...type.body,
    fontFamily: fonts.black,
    lineHeight: 20,
    color: colors.ink,
  },
  bannerTitleClosed: {
    color: colors.danger,
  },
  caption: {
    ...type.caption,
    color: colors.muted,
  },
  depositTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  depositBadge: {
    alignSelf: 'center',
  },
  depositAmount: {
    ...type.section,
    fontFamily: fonts.black,
    letterSpacing: 0,
    color: colors.onInk,
  },
  depositTitle: {
    ...type.section,
    fontSize: DEPOSIT_TITLE_SIZE,
    lineHeight: DEPOSIT_TITLE_SIZE + 4,
    color: colors.onInk,
  },
  depositBody: {
    ...type.label,
    fontFamily: fonts.regular,
    lineHeight: 20,
    color: colors.onInkMuted,
  },
  methodBlock: {
    gap: space.sm,
  },
  label: {
    ...type.labelSm,
    color: colors.ink,
  },
  methodRow: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: border.base,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  methodRowPressed: {
    backgroundColor: colors.tan,
  },
  methodText: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
    flex: 1,
  },
  cancelNote: {
    ...type.caption,
    fontSize: type.labelSm.fontSize,
    color: colors.mutedAlt,
    textAlign: 'center',
  },
  footer: {
    gap: space.sm,
  },
  error: {
    ...type.labelSm,
    color: colors.danger,
  },
})
