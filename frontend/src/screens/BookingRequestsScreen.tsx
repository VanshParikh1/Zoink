import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RootStackParamList } from '../navigation'
import { acceptBooking, declineBooking, getIncomingRequests } from '../services/bookingsApi'
import { Booking } from '../types'
import { theme } from '../theme/colors'
import StateCard from '../components/StateCard'
import ScreenBackground from '../components/ScreenBackground'

type Nav = NativeStackNavigationProp<RootStackParamList>

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function statusTone(status: Booking['status']) {
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
    case 'CANCELLED':
      return styles.statusRed
    default:
      return styles.statusGrey
  }
}

export default function BookingRequestsScreen() {
  const nav = useNavigation<Nav>()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadBookings = useCallback(async () => {
    try {
      setError('')
      const nextBookings = await getIncomingRequests()
      setBookings(nextBookings)
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load incoming requests.')
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

  async function handleAction(id: string, action: 'accept' | 'decline') {
    setBusyId(id)

    try {
      const updated = action === 'accept' ? await acceptBooking(id) : await declineBooking(id)
      setBookings((current) => current.map((booking) => (booking.id === id ? updated : booking)))
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not update this request.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={styles.loadingText}>Loading incoming requests...</Text>
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
            <Text style={styles.title}>Incoming requests</Text>
            <Text style={styles.subtitle}>Approve or decline rental requests on your listings.</Text>
            <Text style={styles.summaryText}>
              {bookings.length === 0
                ? 'No pending action right now'
                : `${bookings.filter((booking) => booking.status === 'PENDING').length} request${bookings.filter((booking) => booking.status === 'PENDING').length === 1 ? '' : 's'} waiting on you`}
            </Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <StateCard
              tone="error"
              eyebrow="REQUEST ISSUE"
              title="Incoming requests couldn't load"
              body={error}
              actionLabel="Try again"
              onAction={loadBookings}
            />
          ) : (
            <StateCard
              eyebrow="ALL CLEAR"
              title="No requests have landed yet"
              body="As soon as someone wants one of your items, you'll be able to review dates and respond from here."
              actionLabel="View my listings"
              onAction={() => nav.navigate('MyListings')}
            />
          )
        }
        renderItem={({ item }) => {
          const isPending = item.status === 'PENDING'
          const isBusy = busyId === item.id
          const imageUrl = item.listing.images?.[0]?.url

          return (
            <View style={styles.cardWrap}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.card}
                onPress={() => nav.navigate('BookingDetail', { bookingId: item.id })}
              >
                <View style={styles.cardTop}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumbnail} />
                  ) : (
                    <View style={[styles.thumbnail, styles.thumbnailFallback]}>
                      <Text style={styles.thumbnailEmoji}>{item.listing.category || '📦'}</Text>
                    </View>
                  )}

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{item.listing.title}</Text>
                    <Text style={styles.cardRenter} numberOfLines={1}>{item.renter.firstName} {item.renter.lastName}</Text>
                    <Text style={styles.cardDates}>{formatDateRange(item.startDate, item.endDate)}</Text>
                  </View>

                  <View style={styles.cardTopRight}>
                    <Text style={styles.cardPrice}>${item.totalPrice.toFixed(2)}</Text>
                    <Text style={[styles.pill, statusTone(item.status)]}>{item.status}</Text>
                  </View>
                </View>

                {isPending ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.acceptButton} onPress={() => handleAction(item.id, 'accept')} disabled={isBusy}>
                      <Text style={styles.acceptText}>{isBusy ? 'Saving...' : 'Accept'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.declineButton} onPress={() => handleAction(item.id, 'decline')} disabled={isBusy}>
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
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
  content: { padding: 24, paddingTop: 64, paddingBottom: 32 },
  header: { marginBottom: 8 },
  backText: { color: theme.textMuted, fontSize: 14, fontWeight: '700', marginBottom: 18 },
  title: { ...theme.type.screenTitle },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 8 },
  summaryText: { color: theme.textDisabled, fontSize: 13, marginTop: 10, fontWeight: '700' },
  cardWrap: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.hard.ink,
    marginBottom: 14,
  },
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: theme.radius.sm,
    padding: 16,
    borderWidth: theme.hard.border,
    borderColor: theme.hard.ink,
    marginRight: theme.hard.offset.sm,
    marginBottom: theme.hard.offset.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
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
  cardRenter: { color: theme.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  cardDates: { color: theme.textDisabled, fontSize: 12, fontWeight: '600' },
  cardTopRight: { alignItems: 'flex-end', gap: 6 },
  cardPrice: { color: theme.primaryDeep, fontSize: 15, fontWeight: '900' },
  pill: {
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: '900',
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
  },
  statusYellow: { backgroundColor: '#FFF5D6', color: '#8A5A00' },
  statusBlue: { backgroundColor: '#E1F0FF', color: '#185EA8' },
  statusGrey: { backgroundColor: '#EFEFF1', color: '#6D7175' },
  statusRed: { backgroundColor: '#FFE2DE', color: '#B42318' },
  statusGreen: { backgroundColor: theme.primarySurface, color: theme.primaryDeep },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    paddingVertical: 12,
    alignItems: 'center',
  },
  acceptText: { color: theme.textOnPrimary, fontSize: 14, fontWeight: '800' },
  declineButton: {
    flex: 1,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hard.borderThin,
    borderColor: theme.hard.ink,
    backgroundColor: theme.surface,
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineText: { color: theme.text, fontSize: 14, fontWeight: '800' },
})

