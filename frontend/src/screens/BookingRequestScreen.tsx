import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getListing } from '../services/listingsApi'
import { createBooking } from '../services/bookingsApi'
import { Listing } from '../types'
import { theme } from '../theme/colors'
import { useStripe } from '@stripe/stripe-react-native'
import { isStripePublishableKeyConfigured } from '../config/stripe'
import { useAuth } from '../context/AuthContext'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'BookingRequest'>

type CalendarDay = {
  key: string
  label: string
  date: Date
  inCurrentMonth: boolean
}

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_COUNT = 2

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return startOfDay(next)
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function isSameDay(left: Date | null, right: Date | null) {
  if (!left || !right) return false
  return left.getTime() === right.getTime()
}

function isBeforeDay(left: Date, right: Date) {
  return left.getTime() < right.getTime()
}

function isWithinRange(date: Date, startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return false
  return date.getTime() > startDate.getTime() && date.getTime() < endDate.getTime()
}

function formatDateLabel(date: Date | null) {
  if (!date) return 'Select'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatApiDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRentalDays(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return 0
  const msPerDay = 1000 * 60 * 60 * 24
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
  return diffDays + 1
}

function buildMonthDays(monthDate: Date) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const gridStart = addDays(monthStart, -monthStart.getDay())
  const days: CalendarDay[] = []

  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index)
    days.push({
      key: date.toISOString(),
      label: `${date.getDate()}`,
      date,
      inCurrentMonth: date.getMonth() === monthDate.getMonth(),
    })
  }

  return days
}

export default function BookingRequestScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const { user } = useAuth()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [insuranceOptIn, setInsuranceOptIn] = useState(false)
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadListing() {
      try {
        const nextListing = await getListing(route.params.listingId)
        setListing(nextListing)
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error ?? 'Could not load this listing.')
        nav.goBack()
      } finally {
        setLoading(false)
      }
    }

    loadListing()
  }, [nav, route.params.listingId])

  const today = useMemo(() => startOfDay(new Date()), [])
  const visibleMonths = useMemo(
    () => Array.from({ length: MONTH_COUNT }, (_, index) => addMonths(calendarMonth, index)),
    [calendarMonth]
  )
  const rentalDays = useMemo(() => getRentalDays(startDate, endDate), [endDate, startDate])
  const totalPrice = useMemo(
    () => (listing && rentalDays > 0 ? Number((Number(listing.dailyPrice) * rentalDays).toFixed(2)) : 0),
    [listing, rentalDays]
  )
  const depositAmount = useMemo(() => Number((totalPrice * 0.3).toFixed(2)), [totalPrice])

  function handleDayPress(day: Date) {
    if (isBeforeDay(day, today)) return

    if (!startDate || (startDate && endDate)) {
      setStartDate(day)
      setEndDate(null)
      return
    }

    if (isBeforeDay(day, startDate)) {
      setStartDate(day)
      return
    }

    if (isSameDay(day, startDate)) {
      setEndDate(day)
      return
    }

    setEndDate(day)
  }

  async function handleSubmit() {
    if (submitting) return
    if (!listing) return
    if (!startDate || !endDate || rentalDays <= 0) {
      Alert.alert('Choose dates', 'Pick a start and end date from the calendar before sending your request.')
      return
    }

    setPaymentError(null)
    setSubmitting(true)

    try {
      if (!isStripePublishableKeyConfigured()) {
        const message = 'The frontend is missing EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY. Stop Expo, restart it with a cleared cache, then try again.'
        setPaymentError(message)
        Alert.alert(
          'Stripe key missing',
          message
        )
        return
      }

      const booking = await createBooking({
        listingId: listing.id,
        startDate: `${formatApiDate(startDate)}T00:00:00.000Z`,
        endDate: `${formatApiDate(endDate)}T00:00:00.000Z`,
        message,
        insuranceOptIn,
      })

      if (booking.paymentClientSecret) {
        const { error: initError } = await initPaymentSheet({
          merchantDisplayName: 'Zoink',
          paymentIntentClientSecret: booking.paymentClientSecret,
          defaultBillingDetails: { name: user?.firstName },
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

      nav.replace('BookingDetail', { bookingId: booking.id })
    } catch (err: any) {
      const message = err?.response?.data?.error ?? err?.message ?? 'Could not create booking request.'
      setPaymentError(message)
      Alert.alert('Error', message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    )
  }

  if (!listing) return null

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => nav.goBack()}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Request this item</Text>
      <Text style={styles.subtitle}>
        {listing.title} in {listing.city}
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionEyebrow}>YOUR DATES</Text>
        <Text style={styles.sectionTitle}>Pick a rental range</Text>
        <Text style={styles.sectionSubtitle}>
          Tap a start date, then an end date. Your total updates automatically.
        </Text>

        <View style={styles.dateSummaryRow}>
          <View style={styles.dateSummaryCard}>
            <Text style={styles.summaryLabel}>Start</Text>
            <Text style={styles.summaryValue}>{formatDateLabel(startDate)}</Text>
          </View>
          <View style={styles.dateSummaryCard}>
            <Text style={styles.summaryLabel}>End</Text>
            <Text style={styles.summaryValue}>{formatDateLabel(endDate)}</Text>
          </View>
        </View>

        <View style={styles.calendarHeader}>
          <TouchableOpacity
            style={styles.calendarArrow}
            onPress={() => setCalendarMonth((current) => addMonths(current, -1))}
          >
            <Text style={styles.calendarArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.calendarHeaderText}>Choose your dates</Text>
          <TouchableOpacity
            style={styles.calendarArrow}
            onPress={() => setCalendarMonth((current) => addMonths(current, 1))}
          >
            <Text style={styles.calendarArrowText}>›</Text>
          </TouchableOpacity>
        </View>

        {visibleMonths.map((monthDate) => {
          const days = buildMonthDays(monthDate)
          return (
            <View key={monthDate.toISOString()} style={styles.monthBlock}>
              <Text style={styles.monthTitle}>
                {monthDate.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>

              <View style={styles.weekdayRow}>
                {DAY_LABELS.map((label) => (
                  <Text key={label} style={styles.weekdayLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {days.map((day) => {
                  const isPast = isBeforeDay(day.date, today)
                  const isStart = isSameDay(day.date, startDate)
                  const isEnd = isSameDay(day.date, endDate)
                  const isRange = isWithinRange(day.date, startDate, endDate)

                  return (
                    <TouchableOpacity
                      key={day.key}
                      style={styles.dayCell}
                      onPress={() => handleDayPress(day.date)}
                      disabled={isPast}
                    >
                      <View
                        style={[
                          styles.dayPill,
                          isRange && styles.dayPillRange,
                          (isStart || isEnd) && styles.dayPillSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            !day.inCurrentMonth && styles.dayTextMuted,
                            isPast && styles.dayTextDisabled,
                            isRange && styles.dayTextRange,
                            (isStart || isEnd) && styles.dayTextSelected,
                          ]}
                        >
                          {day.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          )
        })}

        {(startDate || endDate) ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setStartDate(null)
              setEndDate(null)
            }}
          >
            <Text style={styles.clearButtonText}>Clear dates</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.label}>Message to owner</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Add pickup timing, questions, or a quick intro"
          placeholderTextColor={theme.textDisabled}
          style={[styles.input, styles.textarea]}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.breakdownTitle}>Price breakdown</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Daily rate</Text>
          <Text style={styles.rowValue}>${Number(listing.dailyPrice).toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Rental days</Text>
          <Text style={styles.rowValue}>{rentalDays > 0 ? rentalDays : '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Rental total</Text>
          <Text style={styles.rowValue}>${totalPrice.toFixed(2)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Deposit hold</Text>
          <Text style={styles.rowValue}>${depositAmount.toFixed(2)}</Text>
        </View>
      </View>

      {paymentError ? <Text style={styles.errorText}>{paymentError}</Text> : null}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={theme.textOnPrimary} /> : <Text style={styles.submitText}>Send request</Text>}
      </TouchableOpacity>
      </ScrollView>
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 120, gap: 18 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { fontSize: 32, fontWeight: '900', color: theme.text },
  subtitle: { color: theme.textMuted, fontSize: 16, marginTop: 4, marginBottom: 12 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 32,
    padding: 24,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 6,
    gap: 16,
  },
  sectionEyebrow: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 22,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  dateSummaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dateSummaryCard: {
    flex: 1,
    backgroundColor: theme.screen,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  calendarArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.screen,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarArrowText: {
    color: theme.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  calendarHeaderText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  monthBlock: {
    marginTop: 8,
  },
  monthTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    paddingVertical: 4,
    alignItems: 'center',
  },
  dayPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillSelected: {
    backgroundColor: theme.primary,
  },
  dayPillRange: {
    backgroundColor: 'rgba(0, 239, 32, 0.16)',
  },
  dayText: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dayTextMuted: {
    color: theme.textDisabled,
  },
  dayTextDisabled: {
    color: 'rgba(4, 15, 15, 0.22)',
  },
  dayTextRange: {
    color: theme.primary,
  },
  dayTextSelected: {
    color: theme.textOnPrimary,
  },
  clearButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  clearButtonText: {
    color: theme.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  label: { color: theme.text, fontSize: 14, fontWeight: '800', marginTop: 4 },
  input: {
    backgroundColor: theme.screen,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 15,
  },
  textarea: { minHeight: 110 },
  breakdownTitle: { color: theme.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: theme.textMuted, fontSize: 14 },
  rowValue: { color: theme.text, fontSize: 15, fontWeight: '800' },
  errorText: { color: theme.danger, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  submitButton: {
    backgroundColor: theme.primary,
    borderRadius: 99,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  submitText: { color: theme.textOnPrimary, fontSize: 16, fontWeight: '800' },
})
