import React, { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { getMyBookings } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function isActiveRental(status: Booking['status']) {
  return status === 'CONFIRMED' || status === 'ACTIVE' || status === 'PICKUP_PENDING' || status === 'RETURN_PENDING'
}

function statusTone(status: Booking['status'] | 'DENIED') {
  switch (status) {
    case 'PENDING':
      return styles.statusYellow
    case 'ACCEPTED':
      return styles.statusBlue
    case 'CONFIRMED':
    case 'COMPLETED':
    case 'PICKUP_PENDING':
    case 'RETURN_PENDING':
    case 'ACTIVE':
      return styles.statusGreen
    case 'DECLINED':
    case 'DENIED':
    case 'CANCELLED':
      return styles.statusRed
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
            <Text style={styles.subtitle}>Every request you've sent, with live status updates.</Text>
            <Text style={styles.summaryText}>
              {bookings.length === 0
                ? 'Nothing booked yet'
                : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} tracked here`}
            </Text>
            {activeRentals.map((item) => {
              const imageUrl = item.listing.images[0]?.url
              return (
                <View key={item.id} style={styles.activeCardWrap}>
                  <TouchableOpacity
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
                </View>
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
              title="Your bookings couldn't load"
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
        renderItem={({ item }) => {
          const imageUrl = item.listing.images[0]?.url
          return (
            <View style={styles.cardWrap}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.card}
                onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
              >
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
                ) : (
                  <View style={[styles.thumbnail, styles.thumbnailFallback]}>
                    <Text style={styles.thumbnailEmoji}>{item.listing.category || '📦'}</Text>
                  </View>
                )}

                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
                  <Text style={styles.cardOwner} numberOfLines={1}>{item.owner.firstName} {item.owner.lastName}</Text>
                  <Text style={styles.cardDates}>{formatDateRange(item.startDate, item.endDate)}</Text>
                </View>

                <View style={styles.cardTopRight}>
                  <Text style={styles.cardPrice}>${item.totalPrice.toFixed(2)}</Text>
                  <Text style={[styles.pill, statusTone(item.status)]}>{item.status === 'DECLINED' ? 'DENIED' : item.status}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )
        }}
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
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  summaryText: { color: theme.textDisabled, fontSize: 13, marginTop: 10, fontWeight: '700' },
  activeCardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
    marginTop: 18,
  },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    padding: 12,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  activeImage: { width: 76, height: 76, borderRadius: theme.radius.sm, backgroundColor: theme.primarySurface, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  activeImageFallback: { width: 76, height: 76, borderRadius: theme.radius.sm, backgroundColor: theme.primarySurface, borderWidth: theme.hard.borderThin, borderColor: theme.hard.ink },
  activeContent: { flex: 1, marginLeft: 14 },
  activeTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  activeMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  activePrice: { color: theme.primaryDeep, fontSize: 15, fontWeight: '900' },
  activeRight: { marginLeft: 8, alignItems: 'flex-end' },
  cardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    padding: 16,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  thumbnailFallback: {
    backgroundColor: theme.surfaceSubdued,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 26 },
  cardInfo: { flex: 1, marginLeft: 14, marginRight: 10 },
  cardTitle: { color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 3 },
  cardOwner: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  cardDates: { color: theme.textDisabled, fontSize: 12, fontWeight: '600' },
  cardTopRight: { alignItems: 'flex-end', gap: 6 },
  cardPrice: { color: theme.primaryDeep, fontSize: 15, fontWeight: '900' },
  pill: {
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '900',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  statusYellow: { backgroundColor: '#FFF5D6', color: '#8A5A00' },
  statusBlue: { backgroundColor: '#E1F0FF', color: '#185EA8' },
  statusGrey: { backgroundColor: '#EFEFF1', color: '#6D7175' },
  statusRed: { backgroundColor: '#FFE2DE', color: '#B42318' },
  statusGreen: { backgroundColor: theme.primarySurface, color: theme.primaryDeep },
})

