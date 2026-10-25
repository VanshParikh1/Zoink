import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getListing } from '../services/listingsApi'
import { useQuery } from '@tanstack/react-query'
import { userMessage } from '../utils/userMessage'
import { createBooking } from '../services/bookingsApi'
import { queryClient } from '../services/queryClient'
import { queryKeys } from '../services/queryKeys'
import { DEPOSIT_HOLD_HOURS, MAX_RENTAL_DAYS, quoteRental } from '@zoink/shared'
import { Listing } from '../types'
import { colors } from '../theme/colors'
import { border, radius, space } from '../theme/tokens'
import { fonts, type } from '../theme/typography'
import { categoryAbbreviation } from '../config/categories'
import { fillImageUrl } from '../utils/cloudinaryImage'
import Screen from '../components/mockup/Screen'
import ScreenHeader from '../components/mockup/ScreenHeader'
import Button from '../components/mockup/Button'
import IconButton from '../components/mockup/IconButton'
import Card from '../components/mockup/Card'
import Thumb from '../components/mockup/Thumb'
import TextField from '../components/mockup/TextField'
import PriceTable from '../components/mockup/PriceTable'
import { listingDisplay } from '../components/mockup/listingFormat'

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

function formatShortDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const SUMMARY_THUMB = 52

export default function BookingRequestScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  // The listing page just loaded this, so it's usually cached already.
  const listingQuery = useQuery({ queryKey: queryKeys.listing(route.params.listingId), queryFn: () => getListing(route.params.listingId) })
  const listing = listingQuery.data ?? null
  const loading = listingQuery.isPending
  const [submitting, setSubmitting] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  // Date validation messages, shown under the date control.
  const [dateError, setDateError] = useState<string | null>(null)
  // Zoink offers no insurance product at launch (terms.md §12) — there was
  // never a UI control wired to this, and the API no longer accepts the
  // field at all. Removed rather than left dead. See legal/OPEN-ITEMS.md B1.
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  // The date trigger shows and hides the calendar; it starts open.
  const [calendarOpen, setCalendarOpen] = useState(true)
  const [startDate, setStartDate] = useState<Date | null>(null)
  const [endDate, setEndDate] = useState<Date | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (listingQuery.isError && !listing) {
      Alert.alert('Error', userMessage(listingQuery.error, { action: 'Could not load this listing.' }))
      nav.goBack()
    }
  }, [listingQuery.isError, listingQuery.error, listing, nav])

  const today = useMemo(() => startOfDay(new Date()), [])
  const visibleMonths = useMemo(
    () => Array.from({ length: MONTH_COUNT }, (_, index) => addMonths(calendarMonth, index)),
    [calendarMonth]
  )
  const rentalDays = useMemo(() => getRentalDays(startDate, endDate), [endDate, startDate])
  // The same quote the server snapshots onto the booking when it's requested.
  const quote = useMemo(
    () => quoteRental(listing && rentalDays > 0 ? Number(listing.dailyPrice) : 0, Math.max(rentalDays, 0), Number(listing?.depositAmount ?? 0)),
    [listing, rentalDays]
  )
  const { totalPrice, hstAmount, depositAmount } = quote

  function handleDayPress(day: Date) {
    if (isBeforeDay(day, today)) return
    setDateError(null)

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

    if (getRentalDays(startDate, day) > MAX_RENTAL_DAYS) {
      setDateError(`Bookings cannot exceed ${MAX_RENTAL_DAYS} days. Pick a closer end date.`)
      return
    }

    setEndDate(day)
  }

  async function handleSubmit() {
    if (submitting) return
    if (!listing) return
    if (!startDate || !endDate || rentalDays <= 0) {
      setDateError('Pick a start and end date from the calendar before sending your request.')
      setCalendarOpen(true)
      return
    }

    setPaymentError(null)
    setSubmitting(true)

    try {
      const booking = await createBooking({
        listingId: listing.id,
        startDate: `${formatApiDate(startDate)}T00:00:00.000Z`,
        endDate: `${formatApiDate(endDate)}T00:00:00.000Z`,
        message,
      })

      queryClient.setQueryData(queryKeys.booking(booking.id), booking)
      queryClient.invalidateQueries({ queryKey: ['bookings', 'list'] })
      // The request opened (or reused) a conversation with its message.
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
      nav.replace('BookingDetail', { bookingId: booking.id })
    } catch (err: any) {
      const message = userMessage(err, { action: 'Could not create booking request.' })
      setPaymentError(message)
      Alert.alert('Error', message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.greenText} />
      </View>
    )
  }

  if (!listing) return null

  const { priceLine, imageUrl } = listingDisplay(listing)
  const rangeLabel = startDate
    ? endDate && !isSameDay(startDate, endDate)
      ? `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`
      : endDate
        ? formatShortDate(startDate)
        : `${formatShortDate(startDate)} – pick an end date`
    : 'Choose your dates'

  return (
    <Screen
      keyboardAvoiding
      header={<ScreenHeader title="Pick your dates" back />}
      footer={
        <View style={styles.footer}>
          {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
          <Button
            label={rentalDays > 0 ? `Request ${rentalDays} ${rentalDays === 1 ? 'day' : 'days'}` : 'Send request'}
            onPress={handleSubmit}
            loading={submitting}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.summaryRow}>
          <Thumb
            size={SUMMARY_THUMB}
            source={imageUrl ? { uri: fillImageUrl(imageUrl, { width: SUMMARY_THUMB, height: SUMMARY_THUMB }) } : undefined}
            initials={categoryAbbreviation(listing.category)}
            initialsSize={15}
          />
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            <Text style={type.price} numberOfLines={1}>
              {priceLine} · {listing.city}
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Your dates (up to {MAX_RENTAL_DAYS} days)</Text>
          <Pressable
            style={({ pressed }) => [styles.dateTrigger, pressed ? styles.dateTriggerPressed : null]}
            onPress={() => setCalendarOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: calendarOpen }}
            accessibilityLabel={`${rangeLabel}${rentalDays > 0 ? `, ${rentalDays} days` : ''}. ${calendarOpen ? 'Hide' : 'Show'} calendar`}
          >
            <Feather name="calendar" size={18} color={colors.ink} />
            <Text style={styles.dateRange} numberOfLines={1}>
              {rangeLabel}
            </Text>
            {rentalDays > 0 ? (
              <Text style={styles.dateDays}>
                {rentalDays} {rentalDays === 1 ? 'day' : 'days'}
              </Text>
            ) : null}
          </Pressable>
          {dateError ? <Text style={styles.error}>{dateError}</Text> : null}
        </View>

        {calendarOpen ? (
          <Card shadow={false} contentStyle={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <IconButton accessibilityLabel="Previous month" onPress={() => setCalendarMonth((current) => addMonths(current, -1))}>
                <Feather name="chevron-left" size={22} color={colors.ink} />
              </IconButton>
              <Text style={styles.calendarHeaderText}>Tap a start date, then an end date</Text>
              <IconButton accessibilityLabel="Next month" onPress={() => setCalendarMonth((current) => addMonths(current, 1))}>
                <Feather name="chevron-right" size={22} color={colors.ink} />
              </IconButton>
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
                      const isToday = isSameDay(day.date, today)
                      const isSelected = isStart || isEnd

                      return (
                        <Pressable
                          key={day.key}
                          style={[styles.dayCell, isPast && styles.dayCellDisabled]}
                          onPress={() => handleDayPress(day.date)}
                          disabled={isPast}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected || isRange, disabled: isPast }}
                          accessibilityLabel={day.date.toDateString()}
                        >
                          <View
                            style={[
                              styles.dayPill,
                              isToday && !isSelected && styles.dayPillToday,
                              isRange && styles.dayPillRange,
                              isSelected && styles.dayPillSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                !day.inCurrentMonth && styles.dayTextMuted,
                                isSelected && styles.dayTextSelected,
                              ]}
                            >
                              {day.label}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              )
            })}

            {startDate || endDate ? (
              <Button
                label="Clear dates"
                variant="link"
                onPress={() => {
                  setStartDate(null)
                  setEndDate(null)
                  setDateError(null)
                }}
              />
            ) : null}
          </Card>
        ) : null}

        <Card shadow={false} contentStyle={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Price breakdown</Text>
          <PriceTable
            rows={[
              { label: 'Daily rate', value: `$${Number(listing.dailyPrice).toFixed(2)}` },
              { label: 'Rental days', value: rentalDays > 0 ? `${rentalDays}` : '—' },
              { label: 'Rental total', value: `$${totalPrice.toFixed(2)}` },
              { label: 'HST (13%)', value: `$${hstAmount.toFixed(2)}` },
            ]}
            // Same split as Checkout: rent + HST is what's captured at pickup;
            // the deposit is a separate hold, never part of this total.
            total={{ label: 'Charged at pickup', value: `$${quote.chargedAtPickup.toFixed(2)}` }}
            highlight="lime"
          />
        </Card>

        {depositAmount > 0 ? (
          <Card shadow={false} padding={space.lg} contentStyle={styles.depositRow}>
            <Feather name="lock" size={18} color={colors.ink} />
            <View style={styles.depositText}>
              <Text style={styles.depositLabel}>Deposit hold</Text>
              <Text style={styles.depositNote}>Released {DEPOSIT_HOLD_HOURS}h after return</Text>
            </View>
            <Text style={styles.depositValue}>${depositAmount.toFixed(2)}</Text>
          </Card>
        ) : null}

        <TextField
          label="Message to owner"
          value={message}
          onChangeText={setMessage}
          placeholder="Add pickup timing, questions, or a quick intro"
          multiline
          maxLength={500}
        />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: {
    gap: space.screen,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  summaryText: {
    flex: 1,
    gap: 2,
  },
  summaryTitle: {
    ...type.body,
    fontFamily: fonts.bold,
    lineHeight: 20,
    color: colors.ink,
  },
  block: {
    gap: space.sm,
  },
  label: {
    ...type.labelSm,
    color: colors.ink,
  },
  dateTrigger: {
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
  dateTriggerPressed: {
    backgroundColor: colors.tan,
  },
  dateRange: {
    ...type.bodySm,
    color: colors.ink,
    flex: 1,
  },
  dateDays: {
    ...type.bodySm,
    fontFamily: fonts.black,
    color: colors.ink,
  },
  error: {
    ...type.labelSm,
    color: colors.danger,
  },
  calendarCard: {
    gap: space.lg,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  calendarHeaderText: {
    ...type.caption,
    color: colors.mutedAlt,
    flex: 1,
    textAlign: 'center',
  },
  monthBlock: {
    gap: space.sm,
  },
  monthTitle: {
    ...type.label,
    color: colors.ink,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    ...type.caption,
    color: colors.mutedAlt,
    width: `${100 / 7}%`,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayCellDisabled: {
    opacity: 0.35,
  },
  dayPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.thin,
    borderColor: 'transparent',
  },
  dayPillToday: {
    borderColor: colors.ink,
  },
  dayPillRange: {
    backgroundColor: colors.lime,
  },
  dayPillSelected: {
    backgroundColor: colors.green,
    borderColor: colors.ink,
  },
  dayText: {
    ...type.labelSm,
    color: colors.ink,
  },
  dayTextMuted: {
    color: colors.mutedAlt,
  },
  dayTextSelected: {
    fontFamily: fonts.black,
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  depositText: {
    flex: 1,
    gap: 2,
  },
  depositLabel: {
    ...type.bodySm,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  depositNote: {
    ...type.caption,
    color: colors.mutedAlt,
  },
  depositValue: {
    ...type.bodySm,
    fontFamily: fonts.black,
    color: colors.ink,
  },
  breakdownCard: {
    gap: space.sm,
  },
  sectionTitle: {
    ...type.section,
    color: colors.ink,
  },
  footer: {
    gap: space.sm,
  },
})
