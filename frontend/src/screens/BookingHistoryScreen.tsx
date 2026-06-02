import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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

function isActiveRental(status: Booking['status']) {
  return status === 'ACTIVE' || status === 'PICKUP_PENDING' || status === 'RETURN_PENDING'
}

function statusTone(status: Booking['status'] | 'DENIED') {
  switch (status) {
    case 'PENDING':
      return styles.statusYellow
    case 'ACCEPTED':
      return styles.statusBlue
    case 'COMPLETED':
      return styles.statusGrey
    case 'DECLINED':
    case 'DENIED':
      return styles.statusRed
    case 'PICKUP_PENDING':
    case 'RETURN_PENDING':
    case 'ACTIVE':
      return styles.statusGreen
    default:
      return styles.statusGrey
  }
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

  const activeRentals = bookings.filter((booking) => isActiveRental(booking.status))
  const otherBookings = bookings
    .filter((booking) => !isActiveRental(booking.status))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  return (
    <ScreenBackground>
      <FlatList
        data={otherBookings}
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
            <Text style={styles.subtitle}>Every request youâ€™ve sent, with live status updates.</Text>
            <Text style={styles.summaryText}>
              {bookings.length === 0
                ? 'Nothing booked yet'
                : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} tracked here`}
            </Text>
            {activeRentals.map((item) => {
              const imageUrl = item.listing.images[0]?.url
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.activeCard}
                  onPress={() => nav.navigate('ActiveRental', { bookingId: item.id })}
                >
                  {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.activeImage} /> : <View style={styles.activeImageFallback} />}
                  <View style={styles.activeContent}>
                    <Text style={styles.activeTitle} numberOfLines={1}>{item.listing.title}</Text>
                    <Text style={styles.activeMeta}>{formatDateRange(item.startDate, item.endDate)}</Text>
                    <Text style={styles.activePrice}>${item.totalPrice.toFixed(2)}</Text>
                  </View>
                  <View style={styles.activeRight}>
                    <Text style={[styles.pill, styles.statusGreen]}>Active</Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        }
        ListEmptyComponent={
          bookings.length === 0 ? (
            error ? (
            <StateCard
              tone="error"
              eyebrow="BOOKING ISSUE"
              title="Your bookings couldnâ€™t load"
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
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}>
            <Text style={styles.cardTitle}>{item.listing.title}</Text>
            <Text style={styles.cardMeta}>{formatDateRange(item.startDate, item.endDate)}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.cardPrice}>${item.totalPrice.toFixed(2)}</Text>
              <Text style={[styles.pill, statusTone(item.status)]}>{item.status === 'DECLINED' ? 'DENIED' : item.status}</Text>
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
  summaryText: { color: theme.textDisabled, fontSize: 13, marginTop: 10, fontWeight: '700' },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.primarySurface,
    borderLeftWidth: 5,
    borderLeftColor: theme.primary,
    padding: 14,
    marginTop: 18,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
  activeImage: { width: 76, height: 76, borderRadius: 8, backgroundColor: theme.primarySurface },
  activeImageFallback: { width: 76, height: 76, borderRadius: 8, backgroundColor: theme.primarySurface },
  activeContent: { flex: 1, marginLeft: 14 },
  activeTitle: { color: theme.text, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  activeMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  activePrice: { color: theme.primary, fontSize: 15, fontWeight: '900' },
  activeRight: { marginLeft: 8, alignItems: 'flex-end' },
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.cardBorder,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 14, marginBottom: 14 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice: { color: theme.primary, fontSize: 16, fontWeight: '900' },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '900',
  },
  statusYellow: { backgroundColor: '#FFF5D6', color: '#8A5A00' },
  statusBlue: { backgroundColor: '#E1F0FF', color: '#185EA8' },
  statusGrey: { backgroundColor: '#EFEFF1', color: '#6D7175' },
  statusRed: { backgroundColor: '#FFE2DE', color: '#B42318' },
  statusGreen: { backgroundColor: theme.primarySurface, color: theme.primaryDeep },
})

