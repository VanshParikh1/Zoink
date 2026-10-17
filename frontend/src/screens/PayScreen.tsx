import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useStripe } from '@stripe/stripe-react-native'
import { RootStackParamList } from '../navigation'
import { confirmBookingPayment, createBookingPaymentIntent, getBooking } from '../services/bookingsApi'
import { Booking, BookingStatus } from '../types'
import { isStripePublishableKeyConfigured } from '../config/stripe'
import { formatLongDate } from '../utils/formatDate'
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

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'Pay'>

// Mirrors DEPOSIT_HOLD_HOURS in backend/src/config/bookingWindows.ts (released
// by cleanupJob.releaseDueDeposits once a completed booking has no open
// dispute) — keep in sync. Copy only; nothing here schedules the release.
const DEPOSIT_HOLD_HOURS = 24

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

export default function PayScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const loadBooking = useCallback(async () => {
    try {
      const nextBooking = await getBooking(route.params.bookingId)
      setBooking(nextBooking)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this booking.')
      nav.goBack()
    } finally {
      setLoading(false)
    }
  }, [nav, route.params.bookingId])

  useFocusEffect(
    useCallback(() => {
      loadBooking()
    }, [loadBooking])
  )

  async function handlePay() {
    if (!booking || paying) return

    setPaymentError(null)

    if (!isStripePublishableKeyConfigured()) {
      const message = 'The frontend is missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY. Stop Expo, restart it with a cleared cache, then try again.'
      setPaymentError(message)
      Alert.alert('Stripe key missing', message)
      return
    }

    setPaying(true)

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
          setPaymentError(initError.message)
          Alert.alert('Payment Setup Error', initError.message)
          return
        }

        const { error: presentError } = await presentPaymentSheet()
        if (presentError) {
          setPaymentError(presentError.message)
          Alert.alert('Payment Failed or Canceled', presentError.message)
          return
        }
      }

      const confirmed = await confirmBookingPayment(booking.id)
      setBooking(confirmed)
      nav.replace('BookingDetail', { bookingId: confirmed.id })
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.message ?? 'Could not complete payment.'
      setPaymentError(message)
      Alert.alert('Error', message)
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </View>
    )
  }

  if (!booking) return null

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
  const dateRange = `${formatLongDate(booking.startDate)} – ${formatLongDate(booking.endDate)}`
  const payLabel = `Pay ${shortMoney(rentDue)}${hasDeposit ? ` + hold ${shortMoney(booking.depositAmount)}` : ''}`

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
              It's released {DEPOSIT_HOLD_HOURS} hours after you return the item, unless a dispute is open then.
            </Text>
          </InkCard>
        ) : null}

        <View style={styles.methodBlock}>
          <Text style={styles.label}>Pay through Stripe</Text>
          <Pressable
            style={({ pressed }) => [styles.methodRow, pressed ? styles.methodRowPressed : null]}
            onPress={handlePay}
            disabled={paying}
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
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
