import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import HardBlock from '../components/HardBlock'
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { confirmBookingPayment, createBookingPaymentIntent, getBooking } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'
import { useStripe } from '@stripe/stripe-react-native'
import { isStripePublishableKeyConfigured } from '../config/stripe'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'Pay'>

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
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!booking) return null

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => nav.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Pay for this rental</Text>
        <Text style={styles.subtitle}>
          {booking.listing.title} — {new Date(booking.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' })} to{' '}
          {new Date(booking.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
        </Text>

        <HardBlock radius={theme.radius.lg} offset={theme.hard.offset.md} style={styles.cardWrap} contentStyle={styles.card}>
          <Text style={styles.breakdownTitle}>Price breakdown</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rental total</Text>
            <Text style={styles.rowValue}>${booking.totalPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Deposit hold</Text>
            <Text style={styles.rowValue}>${booking.depositAmount.toFixed(2)}</Text>
          </View>
          {booking.insuranceOptIn ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Insurance</Text>
              <Text style={styles.rowValue}>${booking.insuranceFee.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>Charged today</Text>
            <Text style={styles.totalValue}>
              ${(booking.totalPrice + booking.depositAmount + booking.insuranceFee).toFixed(2)}
            </Text>
          </View>
        </HardBlock>

        {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}

        <View style={styles.submitButtonWrap}>
          <TouchableOpacity style={styles.submitButton} onPress={handlePay} disabled={paying}>
            {paying ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Pay now</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 64, paddingBottom: 120, gap: 18 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 4, marginBottom: 12 },
  cardWrap: { marginBottom: 0 },
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.lg,
    padding: 24,
    gap: 16,
  },
  breakdownTitle: { color: theme.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: theme.textMuted, fontSize: 14 },
  rowValue: { color: theme.text, fontSize: 15, fontWeight: '800' },
  totalRow: { marginTop: 4, paddingTop: 12, borderTopWidth: theme.hard.borderThin, borderTopColor: theme.hard.ink },
  totalLabel: { color: theme.text, fontSize: 15, fontWeight: '900' },
  totalValue: { color: theme.primaryDeep, fontSize: 18, fontWeight: '900' },
  errorText: { color: theme.danger, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  submitButtonWrap: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.hard.ink,
  },
  submitButton: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.pill,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.hard.offset.md,
    marginBottom: theme.hard.offset.md,
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '900' },
})
