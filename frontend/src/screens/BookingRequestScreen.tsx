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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getListing } from '../services/listingsApi'
import { createBooking } from '../services/bookingsApi'
import { Listing } from '../types'
import { theme } from '../theme/colors'

type Nav = NativeStackNavigationProp<RootStackParamList>
type ScreenRoute = RouteProp<RootStackParamList, 'BookingRequest'>

function parseDateInput(value: string) {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getRentalDays(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return 0
  const msPerDay = 1000 * 60 * 60 * 24
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
  return diffDays + 1
}

export default function BookingRequestScreen() {
  const nav = useNavigation<Nav>()
  const route = useRoute<ScreenRoute>()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
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

  const parsedStartDate = useMemo(() => parseDateInput(startDate), [startDate])
  const parsedEndDate = useMemo(() => parseDateInput(endDate), [endDate])
  const rentalDays = useMemo(() => getRentalDays(parsedStartDate, parsedEndDate), [parsedEndDate, parsedStartDate])
  const totalPrice = useMemo(
    () => (listing && rentalDays > 0 ? Number((listing.dailyPrice * rentalDays).toFixed(2)) : 0),
    [listing, rentalDays]
  )
  const depositAmount = useMemo(() => Number((totalPrice * 0.3).toFixed(2)), [totalPrice])

  async function handleSubmit() {
    if (!listing) return
    if (!parsedStartDate || !parsedEndDate || rentalDays <= 0) {
      Alert.alert('Invalid dates', 'Enter a valid start and end date in YYYY-MM-DD format.')
      return
    }

    setSubmitting(true)

    try {
      const booking = await createBooking({
        listingId: listing.id,
        startDate: parsedStartDate.toISOString(),
        endDate: parsedEndDate.toISOString(),
        message,
      })

      nav.replace('BookingDetail', { bookingId: booking.id })
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not create booking request.')
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => nav.goBack()}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Request this item</Text>
      <Text style={styles.subtitle}>
        {listing.title} in {listing.city}
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Start date</Text>
        <TextInput
          value={startDate}
          onChangeText={setStartDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textFaint}
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={styles.label}>End date</Text>
        <TextInput
          value={endDate}
          onChangeText={setEndDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textFaint}
          style={styles.input}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Message to owner</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Add pickup timing, questions, or a quick intro"
          placeholderTextColor={theme.textFaint}
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

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={theme.primaryText} /> : <Text style={styles.submitText}>Send request</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.screen },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40, gap: 18 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { fontSize: 28, fontWeight: '900', color: theme.text },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8, marginBottom: 8 },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  label: { color: theme.text, fontSize: 14, fontWeight: '800' },
  input: {
    backgroundColor: theme.screen,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 15,
  },
  textarea: { minHeight: 110 },
  breakdownTitle: { color: theme.text, fontSize: 16, fontWeight: '900', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: theme.textMuted, fontSize: 14 },
  rowValue: { color: theme.text, fontSize: 15, fontWeight: '800' },
  submitButton: {
    backgroundColor: theme.primary,
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: theme.primaryText, fontSize: 16, fontWeight: '900' },
})
