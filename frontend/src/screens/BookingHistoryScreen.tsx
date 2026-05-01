import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import ScreenBackground from '../components/ScreenBackground'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyBookings } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'

type Nav = NativeStackNavigationProp<RootStackParamList>

function formatDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate).toLocaleDateString()
  const end = new Date(endDate).toLocaleDateString()
  return `${start} - ${end}`
}

export default function BookingHistoryScreen() {
  const nav = useNavigation<Nav>()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const loadBookings = useCallback(async () => {
    try {
      setError('')
      const nextBookings = await getMyBookings()
      setBookings(nextBookings)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your bookings.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadBookings()
    }, [loadBookings])
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading your booking timeline...</Text>
      </View>
    )
  }

  return (
    <ScreenBackground>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true)
          loadBookings()
        }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TouchableOpacity onPress={() => nav.goBack()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>My bookings</Text>
            <Text style={styles.subtitle}>Every request you’ve sent, with live status updates.</Text>
            <Text style={styles.summaryText}>
              {bookings.length === 0
                ? 'Nothing booked yet'
                : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} tracked here`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StateCard
              tone="error"
              eyebrow="BOOKING ISSUE"
              title="Your bookings couldn’t load"
              body={error}
              actionLabel="Try again"
              onAction={loadBookings}
            />
          ) : (
            <StateCard
              eyebrow="READY WHEN YOU ARE"
              title="No booking requests yet"
              body="Once you request a rental, the full timeline from pending to completed will show up here."
              actionLabel="Browse rentals"
              onAction={() => nav.navigate('MainApp', { tab: 'Search' })}
            />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}>
            <Text style={styles.cardTitle}>{item.listing.title}</Text>
            <Text style={styles.cardMeta}>{formatDateRange(item.startDate, item.endDate)}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardPrice}>${item.totalPrice.toFixed(2)}</Text>
              <Text style={styles.cardStatus}>{item.status}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </ScreenBackground>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.screen },
  loadingText: { marginTop: 12, color: theme.textMuted, fontSize: 15 },
  content: { padding: 24, paddingTop: 64, paddingBottom: 32, gap: 14 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { color: theme.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  summaryText: { color: theme.textFaint, fontSize: 13, marginTop: 10, fontWeight: '700' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 14,
  },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 14, marginBottom: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { color: theme.primary, fontSize: 16, fontWeight: '900' },
  cardStatus: { color: theme.text, fontSize: 13, fontWeight: '800' },
})
